/**
 * Service pour récupérer les données spécifiques à Rouen
 * Sources : OpenAgenda (événements), Vigicrues (Seine), Opendatasoft Métropole Rouen (travaux),
 * RSS actualités Normandie, OpenWeatherMap (air), vide-greniers.org, Ordre pharmaciens
 */

const axios = require('axios');
const cheerio = require('cheerio');
const xml2js = require('xml2js');

// ============================================================
// 1. OpenAgenda - Événements de Rouen
// ============================================================

async function getOpenAgendaEvents() {
  try {
    // Utiliser le dataset Opendatasoft structuré 'agenda-metropole-rouen-normandie'
    const nowIso = new Date().toISOString();
    const url = 'https://data.metropole-rouen-normandie.fr/api/explore/v2.1/catalog/datasets/agenda-metropole-rouen-normandie/records';
    const response = await axios.get(url, {
      params: {
        limit: 50,
        order_by: 'firstdate_begin asc',
        where: `firstdate_begin >= date'${nowIso}'`
      },
      headers: { 'Accept': 'application/json' },
      timeout: 15000
    });

    const records = response.data?.results || [];
    const events = records.map(r => {
      const startDate = r.firstdate_begin ? new Date(r.firstdate_begin) : null;
      return {
        title: r.title_fr || 'Événement',
        description: r.description_fr || '',
        location: r.location_name || '',
        address: r.location_address || '',
        city: r.location_city || 'Rouen',
        dateStart: startDate ? startDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : (r.daterange_fr || ''),
        timeStart: startDate ? startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '',
        image: r.thumbnail || r.image || null,
        tags: [],
        link: r.canonicalurl || '',
        source: 'Métropole Rouen / OpenAgenda'
      };
    });

    // Dédupliquer par titre
    const seen = new Set();
    const unique = events.filter(e => {
      const key = e.title.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique.slice(0, 30);
  } catch (error) {
    console.error('❌ Erreur événements Rouen:', error.message);
    return [];
  }
}

// ============================================================
// 2. Vigicrues - Vigilance crues Seine (Rouen)
// ============================================================

async function getVigicruesData() {
  try {
    const url = 'https://www.vigicrues.gouv.fr/services/v1.1/TronEntVigiCru.json';
    const response = await axios.get(url, { timeout: 15000 });

    const data = response.data;
    const vigilance = [];

    const niveauLabels = {
      '1': { label: 'Pas de vigilance', couleur: '#00CC00' },
      '2': { label: 'Jaune - Risque de crue', couleur: '#FFCC00' },
      '3': { label: 'Orange - Crue importante', couleur: '#FF9900' },
      '4': { label: 'Rouge - Crue majeure', couleur: '#FF0000' }
    };

    // Filtrer pour les cours d'eau passant par Rouen / Seine-Maritime
    const rouenKeywords = ['seine', 'eaulne', 'bethune', 'arques', 'bresle', 'saâne', 'scie', 'dun', 'austreberthe', 'cailly', 'clérette', 'eure'];

    if (data && data.TronEntVigiCru) {
      data.TronEntVigiCru.forEach(tr => {
        const nom = (tr.nom_CdE || '').toLowerCase();
        const troncon = (tr.vsion || tr.lb_tronc || '').toLowerCase();
        const isRouenArea = rouenKeywords.some(kw => nom.includes(kw) || troncon.includes(kw));

        if (isRouenArea) {
          const niveau = String(tr.niv_InfoVigiCru || tr.niveau || '1');
          const info = niveauLabels[niveau] || niveauLabels['1'];
          vigilance.push({
            cours_eau: tr.nom_CdE || tr.lb_tronc || 'Inconnu',
            troncon: tr.lb_tronc || '',
            niveau: niveau,
            niveauLabel: info.label,
            couleur: info.couleur
          });
        }
      });
    }

    return {
      vigilance: vigilance.slice(0, 10),
      timestamp: new Date().toISOString(),
      source: 'Vigicrues'
    };
  } catch (error) {
    console.error('❌ Erreur Vigicrues Rouen:', error.message);
    return { vigilance: [], source: 'Vigicrues', error: error.message };
  }
}

// ============================================================
// 3. Travaux - API Opendatasoft Métropole Rouen
// ============================================================

async function getTravauxRouen() {
  try {
    // API Opendatasoft Explore v2 pour le dataset travaux-json
    const url = 'https://data.metropole-rouen-normandie.fr/api/explore/v2.1/catalog/datasets/travaux-json/records';
    const response = await axios.get(url, {
      params: {
        limit: 30,
        order_by: 'field_date_debut_1 desc'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      },
      timeout: 15000
    });

    const records = response.data?.results || [];

    const travaux = records.map(r => ({
      title: r.title || 'Travaux',
      description: (r.field_resume || r.body || '').replace(/<[^>]*>/g, '').substring(0, 300),
      location: r.field_commune || 'Métropole Rouen',
      address: r.field_zone_d_impact || '',
      startDate: r.field_date_debut_1 || '',
      endDate: r.field_date_fin_1 || '',
      dateRange: r.field_date_debut || '',
      type: '',
      impact: r.field_zone_d_impact || '',
      link: r.view_node || r.field_lien || '',
      numero: r.nid || '',
      source: 'Métropole Rouen Normandie'
    }));

    return {
      travaux: travaux,
      total: response.data?.total_count || travaux.length,
      timestamp: new Date().toISOString(),
      source: 'Opendatasoft - Métropole Rouen Normandie'
    };
  } catch (error) {
    console.error('❌ Erreur travaux Rouen:', error.message);
    return { travaux: [], source: 'Opendatasoft', error: error.message };
  }
}

// ============================================================
// 4. Actualités - France Bleu Normandie + France 3 Normandie RSS
// ============================================================

async function getActualitesRouen() {
  const actualites = [];

  // ICI / France Bleu Normandie (Rouen)
  try {
    const rssUrl = 'https://www.francebleu.fr/rss/normandie-rouen';
    const response = await axios.get(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      },
      timeout: 15000
    });
    await parseRSS(response.data, actualites, 'ICI Normandie (Rouen)');
  } catch (error) {
    console.error('❌ Erreur RSS ICI Normandie:', error.message);
  }

  // Fallback: France 3 Normandie
  if (actualites.length < 5) {
    try {
      const rssUrl = 'https://france3-regions.francetvinfo.fr/normandie/rss';
      const response = await axios.get(rssUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000
      });
      await parseRSS(response.data, actualites, 'France 3 Normandie');
    } catch (error) {
      console.error('❌ Erreur RSS France 3 Normandie:', error.message);
    }
  }

  // Dédupliquer par titre
  const seen = new Set();
  const unique = actualites.filter(a => {
    const key = a.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, 15);
}

async function parseRSS(xmlData, actualites, sourceName) {
  const parser = new xml2js.Parser({ explicitArray: false, trim: true });
  const result = await parser.parseStringPromise(xmlData);

  if (!result.rss?.channel?.item) return;

  const items = Array.isArray(result.rss.channel.item)
    ? result.rss.channel.item
    : [result.rss.channel.item];

  items.forEach(item => {
    const title = item.title || '';
    const link = typeof item.link === 'string' ? item.link : (item.link?._ || '');
    const pubDate = item.pubDate || '';
    const desc = item.description || '';

    // Nettoyer le HTML de la description
    const cleanDesc = typeof desc === 'string' ? desc.replace(/<[^>]*>/g, '').substring(0, 300) : '';

    let dateFormatted = '';
    try {
      if (pubDate) {
        const d = new Date(pubDate);
        if (!isNaN(d.getTime())) {
          dateFormatted = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        }
      }
    } catch (e) { /* ignore */ }

    if (title) {
      actualites.push({
        title: title,
        summary: cleanDesc,
        date: dateFormatted,
        link: link || '',
        source: sourceName
      });
    }
  });
}

// ============================================================
// 5. Qualité de l'air - OpenWeatherMap Air Pollution API
// ============================================================

async function getQualiteAir() {
  try {
    const API_KEY = process.env.OPENWEATHER_API_KEY;
    if (!API_KEY) {
      return { aqi: null, source: 'OpenWeatherMap', error: 'Clé API manquante' };
    }

    const lat = 49.4432;
    const lon = 1.0993;
    const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`;

    const response = await axios.get(url, { timeout: 10000 });

    if (!response.data?.list?.[0]) {
      return { aqi: null, source: 'OpenWeatherMap' };
    }

    const data = response.data.list[0];
    const aqi = data.main.aqi;
    const components = data.components || {};

    const aqiLabels = {
      1: { label: 'Bon', color: '#4CAF50', emoji: '🟢' },
      2: { label: 'Correct', color: '#8BC34A', emoji: '🟡' },
      3: { label: 'Modéré', color: '#FF9800', emoji: '🟠' },
      4: { label: 'Mauvais', color: '#F44336', emoji: '🔴' },
      5: { label: 'Très mauvais', color: '#9C27B0', emoji: '🟣' }
    };

    const aqiInfo = aqiLabels[aqi] || { label: 'Inconnu', color: '#808080', emoji: '⚪' };

    return {
      aqi: aqi,
      label: aqiInfo.label,
      color: aqiInfo.color,
      emoji: aqiInfo.emoji,
      polluants: {
        pm25: { value: components.pm2_5, unit: 'µg/m³', label: 'PM2.5' },
        pm10: { value: components.pm10, unit: 'µg/m³', label: 'PM10' },
        no2: { value: components.no2, unit: 'µg/m³', label: 'NO₂' },
        o3: { value: components.o3, unit: 'µg/m³', label: 'O₃' },
        so2: { value: components.so2, unit: 'µg/m³', label: 'SO₂' },
        co: { value: components.co, unit: 'µg/m³', label: 'CO' }
      },
      timestamp: new Date().toISOString(),
      source: 'OpenWeatherMap / Atmo Normandie'
    };
  } catch (error) {
    console.error('❌ Erreur qualité air Rouen:', error.message);
    return { aqi: null, source: 'OpenWeatherMap', error: error.message };
  }
}

// ============================================================
// 6. SNCF - Trains Gare de Rouen-Rive-Droite
// ============================================================

async function getTrainsRouen() {
  try {
    const SNCF_API_KEY = process.env.SNCF_API_KEY;
    if (!SNCF_API_KEY) {
      return { departures: [], arrivals: [], source: 'SNCF', error: 'Clé API manquante' };
    }

    const stationId = 'stop_point:SNCF:87411017:Train'; // Rouen-Rive-Droite
    const baseUrl = 'https://api.sncf.com/v1/coverage/sncf/stop_points';

    const [depResp, arrResp] = await Promise.allSettled([
      axios.get(`${baseUrl}/${stationId}/departures?count=15`, {
        headers: { 'Authorization': SNCF_API_KEY },
        timeout: 15000
      }),
      axios.get(`${baseUrl}/${stationId}/arrivals?count=15`, {
        headers: { 'Authorization': SNCF_API_KEY },
        timeout: 15000
      })
    ]);

    const departures = depResp.status === 'fulfilled' && depResp.value.data.departures
      ? depResp.value.data.departures.map(formatSchedule('departure'))
      : [];

    const arrivals = arrResp.status === 'fulfilled' && arrResp.value.data.arrivals
      ? arrResp.value.data.arrivals.map(formatSchedule('arrival'))
      : [];

    return {
      station: 'Rouen-Rive-Droite',
      departures: departures,
      arrivals: arrivals,
      timestamp: new Date().toISOString(),
      source: 'SNCF'
    };
  } catch (error) {
    console.error('❌ Erreur SNCF Rouen:', error.message);
    return { departures: [], arrivals: [], source: 'SNCF', error: error.message };
  }
}

function formatSchedule(type) {
  return (s) => {
    const field = type === 'departure' ? 'departure_date_time' : 'arrival_date_time';
    const t = s.stop_date_time[field] || '';
    const info = s.display_informations || {};
    const time = t.length >= 13 ? t.substring(9, 11) + ':' + t.substring(11, 13) : '';

    return {
      time: time,
      direction: info.direction || '',
      line: info.code || '',
      type: info.commercial_mode || 'Train',
      trainNumber: info.headsign || '',
      network: info.network || ''
    };
  };
}

// ============================================================
// 7. Brocantes / Vide-greniers - Seine-Maritime (76)
// ============================================================

async function getBrocantesRouen() {
  try {
    const url = 'https://vide-greniers.org/76-Seine-Maritime';
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const brocantes = [];

    $('article, .vg-card, .list-group-item, tr, .event-item, [class*="brocante"], [class*="vide"]').each((i, el) => {
      const title = $(el).find('h2, h3, h4, a[class*="title"], strong, .title').first().text().trim();
      const dateText = $(el).find('[class*="date"], time, .badge, small').first().text().trim();
      const location = $(el).find('[class*="lieu"], [class*="city"], [class*="location"], .text-muted').first().text().trim();
      const link = $(el).find('a').first().attr('href') || '';

      if (title && title.length > 3 && title.length < 200) {
        brocantes.push({
          title: title,
          date: dateText || '',
          location: location || '',
          link: link.startsWith('http') ? link : `https://vide-greniers.org${link}`,
          source: 'vide-greniers.org'
        });
      }
    });

    // Dédupliquer
    const seen = new Set();
    const unique = brocantes.filter(b => {
      const key = b.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique.slice(0, 20);
  } catch (error) {
    console.error('❌ Erreur brocantes Rouen:', error.message);
    return [];
  }
}

// ============================================================
// 8. Pharmacies de garde
// ============================================================

async function getPharmaciesGarde() {
  return {
    pharmacies: [],
    info: 'Appelez le 3237 (0,35€/min) pour connaître la pharmacie de garde à Rouen',
    liens: [
      { label: 'Annuaire des pharmaciens', url: 'https://www.ordre.pharmacien.fr/je-suis/patient-grand-public/l-annuaire-des-pharmaciens-etablissements?firstname=ANNE&lastname=ARRESTIER#vue-liste' },
      { label: 'Numéro national : 3237', url: 'tel:3237' }
    ],
    timestamp: new Date().toISOString(),
    source: 'Ordre des pharmaciens / 3237'
  };
}

// ============================================================
// 9. Emploi - Métropole Rouen Normandie
// ============================================================

async function getEmploiRouen() {
  const lienDirect = 'https://recrutement.metropole-rouen-normandie.fr/';
  try {
    // Portail recrutement officiel de la Métropole Rouen
    const response = await axios.get(lienDirect, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const offres = [];

    // Les offres sont des liens vers front-jobs-detail.html?id_job=X
    $('a[href*="front-jobs-detail.html"]').each((i, el) => {
      const title = $(el).text().trim();
      let link = $(el).attr('href') || '';
      if (link && !link.startsWith('http')) {
        link = `https://recrutement.metropole-rouen-normandie.fr/${link.replace(/^\//, '')}`;
      }

      if (title && title.length > 3 && title.length < 300) {
        offres.push({
          title: title,
          category: '',
          location: 'Métropole Rouen Normandie',
          date: '',
          contract: '',
          link: link,
          source: 'Métropole Rouen Normandie'
        });
      }
    });

    // Dédupliquer
    const seen = new Set();
    const unique = offres.filter(o => {
      const key = o.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      offres: unique.slice(0, 30),
      lienDirect: lienDirect,
      timestamp: new Date().toISOString(),
      source: 'Métropole Rouen Normandie'
    };
  } catch (error) {
    console.error('❌ Erreur emploi Rouen:', error.message);
    return {
      offres: [],
      lienDirect: lienDirect,
      source: 'Métropole Rouen Normandie',
      error: error.message
    };
  }
}

// ============================================================
// 10. Conseil municipal Rouen - séances et délibérations
// ============================================================

async function getConseilMunicipalRouen() {
  const lienDirect = 'https://rouen.fr/seances-conseil-municipal';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'fr-FR,fr;q=0.9'
  };

  try {
    // 1. Récupérer la page listant les séances
    const response = await axios.get(lienDirect, { headers, timeout: 15000 });
    const $ = cheerio.load(response.data);

    // 2. Identifier les liens vers les pages de séance (/deliberation/YYYY-MM-DD)
    const seanceLinks = new Map(); // url -> {date, label}
    $('a[href*="/deliberation/"]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const label = $(el).text().trim();
      // On ne garde que les URLs "racines" de séance (pas les sous-délibérations /X-Y)
      const match = href.match(/\/deliberation\/(\d{4}-\d{2}-\d{2})(?:\/|$|\?|#)/);
      if (match) {
        const fullUrl = href.startsWith('http') ? href : `https://rouen.fr${href}`;
        const cleanUrl = fullUrl.replace(/\/deliberation\/(\d{4}-\d{2}-\d{2}).*$/, '/deliberation/$1');
        if (!seanceLinks.has(cleanUrl) && label && label.length > 3) {
          seanceLinks.set(cleanUrl, { date: match[1], label: label });
        }
      }
    });

    // 3. Prendre les 3 séances les plus récentes (tri par date desc)
    const sortedSeances = Array.from(seanceLinks.entries())
      .sort((a, b) => b[1].date.localeCompare(a[1].date))
      .slice(0, 3);

    // 4. Pour chaque séance, scraper son contenu détaillé
    const seancesDetaillees = await Promise.all(sortedSeances.map(async ([url, info]) => {
      try {
        const seanceResp = await axios.get(url, { headers, timeout: 15000 });
        const $$ = cheerio.load(seanceResp.data);

        // Récupérer titre de séance (h1)
        const titreSeance = $$('h1').first().text().trim() || info.label;

        // Récupérer liens de téléchargement (ZIP et PV)
        let zipUrl = null;
        let pvUrl = null;
        $$('a').each((i, el) => {
          const h = $$(el).attr('href') || '';
          const t = $$(el).text().toLowerCase();
          if (h.endsWith('.zip') && (t.includes('délibér') || t.includes('deliber'))) {
            zipUrl = h.startsWith('http') ? h : `https://rouen.fr${h}`;
          }
          if (h.endsWith('.pdf') && (t.includes('procès') || t.includes('proces') || t.includes('verbal'))) {
            pvUrl = h.startsWith('http') ? h : `https://rouen.fr${h}`;
          }
        });

        // Récupérer toutes les délibérations (paires numéro + titre)
        // Structure type : liens /deliberation/YYYY-MM-DD/X-Y
        const delibMap = new Map(); // url → {numero, titre}
        $$('a[href*="/deliberation/"]').each((i, el) => {
          const href = $$(el).attr('href') || '';
          const label = $$(el).text().trim();
          const sousMatch = href.match(/\/deliberation\/\d{4}-\d{2}-\d{2}\/([\w-]+)/);
          if (sousMatch && label) {
            const fullUrl = href.startsWith('http') ? href : `https://rouen.fr${href}`;
            const num = sousMatch[1];
            if (!delibMap.has(fullUrl)) {
              delibMap.set(fullUrl, { numero: '', titre: '', url: fullUrl, num: num });
            }
            const entry = delibMap.get(fullUrl);
            // Le label peut être soit le numéro (ex: "0-1") soit le titre
            if (/^[\w-]+$/.test(label) && label.length < 10) {
              entry.numero = label;
            } else {
              entry.titre = label;
            }
          }
        });

        // Consolider les délibérations (numéro + titre) et trier
        const delibs = Array.from(delibMap.values())
          .filter(d => d.titre && d.titre.length > 3)
          .map(d => ({
            numero: d.numero || d.num,
            titre: d.titre,
            url: d.url
          }));

        // Tri naturel par numéro (0-1, 0-2, ..., 1-1, 1-2, ...)
        delibs.sort((a, b) => {
          const pa = a.numero.split('-').map(n => parseInt(n, 10) || 0);
          const pb = b.numero.split('-').map(n => parseInt(n, 10) || 0);
          for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const diff = (pa[i] || 0) - (pb[i] || 0);
            if (diff !== 0) return diff;
          }
          return 0;
        });

        // Formater la date
        const dateObj = new Date(info.date);
        const dateFormatted = !isNaN(dateObj.getTime())
          ? dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : info.date;

        return {
          titre: titreSeance,
          date: info.date,
          dateFormatted: dateFormatted,
          url: url,
          zipUrl: zipUrl,
          pvUrl: pvUrl,
          nombreDelibs: delibs.length,
          deliberations: delibs
        };
      } catch (err) {
        console.error(`⚠️ Erreur séance ${url}:`, err.message);
        return {
          titre: info.label,
          date: info.date,
          url: url,
          deliberations: [],
          nombreDelibs: 0,
          error: err.message
        };
      }
    }));

    return {
      seances: seancesDetaillees.filter(s => s.deliberations.length > 0 || s.zipUrl),
      lienDirect: lienDirect,
      timestamp: new Date().toISOString(),
      source: 'Ville de Rouen'
    };
  } catch (error) {
    console.error('❌ Erreur Conseil municipal Rouen:', error.message);
    return {
      seances: [],
      lienDirect: lienDirect,
      source: 'Ville de Rouen',
      error: error.message
    };
  }
}

// ============================================================
// 11. Seinoscope - Agenda sorties Seine-Maritime
// ============================================================

async function getSortiesSeinoscope() {
  const lienDirect = 'https://www.seinoscope.fr/';
  try {
    const response = await axios.get(lienDirect, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const sorties = [];

    $('article, .event, .sortie, [class*="event"], [class*="sortie"], .card, .teaser').each((i, el) => {
      const title = $(el).find('h2, h3, h4, a[class*="title"], .title').first().text().trim();
      const dateText = $(el).find('time, [class*="date"]').first().text().trim();
      const location = $(el).find('[class*="lieu"], [class*="place"], [class*="location"], [class*="city"]').first().text().trim();
      const category = $(el).find('[class*="categorie"], [class*="type"], .tag, .badge').first().text().trim();
      let link = $(el).find('a').first().attr('href') || '';
      if (link && !link.startsWith('http')) {
        link = `https://www.seinoscope.fr${link.startsWith('/') ? '' : '/'}${link}`;
      }

      if (title && title.length > 3 && title.length < 300) {
        sorties.push({
          title: title,
          date: dateText || '',
          location: location || 'Seine-Maritime',
          category: category || '',
          link: link,
          source: 'Seinoscope'
        });
      }
    });

    // Dédupliquer
    const seen = new Set();
    const unique = sorties.filter(s => {
      const key = s.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      sorties: unique.slice(0, 20),
      lienDirect: lienDirect,
      timestamp: new Date().toISOString(),
      source: 'Seinoscope'
    };
  } catch (error) {
    console.error('❌ Erreur Seinoscope:', error.message);
    return {
      sorties: [],
      lienDirect: lienDirect,
      source: 'Seinoscope',
      error: error.message
    };
  }
}

// ============================================================
// 12. France Travail - Offres d'emploi Rouen
// ============================================================

async function getFranceTravailRouen() {
  const lienDirect = 'https://candidat.francetravail.fr/offres/emploi/rouen/v36';
  try {
    const response = await axios.get(lienDirect, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const offres = [];

    $('li.result, article.result, .media-body, [class*="offre"], [class*="result"]').each((i, el) => {
      const title = $(el).find('h2, h3, h4, a[class*="title"], .title').first().text().trim();
      const company = $(el).find('[class*="entreprise"], [class*="company"], [class*="subtitle"]').first().text().trim();
      const location = $(el).find('[class*="lieu"], [class*="location"]').first().text().trim();
      const contract = $(el).find('[class*="contrat"], [class*="contract"], [class*="type"]').first().text().trim();
      const dateText = $(el).find('[class*="date"], time').first().text().trim();
      let link = $(el).find('a').first().attr('href') || '';
      if (link && !link.startsWith('http')) {
        link = `https://candidat.francetravail.fr${link.startsWith('/') ? '' : '/'}${link}`;
      }

      if (title && title.length > 3 && title.length < 300) {
        offres.push({
          title: title,
          company: company || '',
          location: location || 'Rouen',
          contract: contract || '',
          date: dateText || '',
          link: link || lienDirect,
          source: 'France Travail'
        });
      }
    });

    // Dédupliquer
    const seen = new Set();
    const unique = offres.filter(o => {
      const key = o.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      offres: unique.slice(0, 25),
      lienDirect: lienDirect,
      timestamp: new Date().toISOString(),
      source: 'France Travail'
    };
  } catch (error) {
    console.error('❌ Erreur France Travail Rouen:', error.message);
    return {
      offres: [],
      lienDirect: lienDirect,
      source: 'France Travail',
      error: error.message
    };
  }
}

module.exports = {
  getOpenAgendaEvents,
  getVigicruesData,
  getTravauxRouen,
  getActualitesRouen,
  getQualiteAir,
  getTrainsRouen,
  getBrocantesRouen,
  getPharmaciesGarde,
  getEmploiRouen,
  getConseilMunicipalRouen,
  getSortiesSeinoscope,
  getFranceTravailRouen
};
