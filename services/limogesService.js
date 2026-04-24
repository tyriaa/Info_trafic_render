/**
 * Service pour récupérer les données spécifiques à Limoges
 * Sources : OpenAgenda (événements via scraping public), Vigicrues v1.1 (crues), Actualités RSS
 */

const axios = require('axios');
const cheerio = require('cheerio');

// ============================================================
// 1. OpenAgenda - Événements de Limoges (scraping page publique)
// ============================================================

/**
 * Récupère les événements depuis la page publique OpenAgenda Limoges
 * L'API v2 requiert une clé, on passe par le scraping de la page publique
 * @returns {Promise<Array>} - Liste des événements formatés
 */
async function getOpenAgendaEvents() {
  try {
    const url = 'https://openagenda.com/fr/limoges?lang=fr';
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Cache-Control': 'no-cache'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const events = [];

    // Chercher les données JSON embarquées dans la page (Next.js / React data)
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const jsonData = JSON.parse($(el).html());
        if (jsonData['@type'] === 'Event' || (Array.isArray(jsonData) && jsonData[0]?.['@type'] === 'Event')) {
          const items = Array.isArray(jsonData) ? jsonData : [jsonData];
          items.forEach(item => {
            events.push({
              title: item.name || 'Événement',
              description: item.description || '',
              location: item.location?.name || '',
              address: item.location?.address?.streetAddress || '',
              city: item.location?.address?.addressLocality || 'Limoges',
              dateStart: item.startDate ? new Date(item.startDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '',
              timeStart: item.startDate ? new Date(item.startDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '',
              dateEnd: item.endDate ? new Date(item.endDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '',
              image: item.image || null,
              tags: [],
              link: item.url || '',
              source: 'OpenAgenda'
            });
          });
        }
      } catch (e) { /* ignore parse errors */ }
    });

    // Fallback: scraper les cartes d'événements depuis le HTML
    if (events.length === 0) {
      $('[class*="event"], [class*="Event"], .listing-event, article, .card').each((i, el) => {
        const title = $(el).find('h2, h3, [class*="title"], [class*="Title"]').first().text().trim();
        const dateText = $(el).find('[class*="date"], [class*="Date"], time').first().text().trim();
        const location = $(el).find('[class*="location"], [class*="Location"], [class*="place"], [class*="venue"]').first().text().trim();
        const link = $(el).find('a').first().attr('href') || '';

        if (title && title.length > 3) {
          events.push({
            title: title.substring(0, 200),
            description: '',
            location: location || '',
            address: '',
            city: 'Limoges',
            dateStart: dateText || '',
            timeStart: '',
            dateEnd: '',
            image: null,
            tags: [],
            link: link.startsWith('http') ? link : `https://openagenda.com${link}`,
            source: 'OpenAgenda'
          });
        }
      });
    }

    // Dédupliquer par titre normalisé
    const seen = new Set();
    const unique = events.filter(e => {
      const key = e.title.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Fallback 2: si toujours rien, essayer sortir.limoges.fr
    if (unique.length === 0) {
      return await getSortirLimogesEvents();
    }

    return unique.slice(0, 30);
  } catch (error) {
    console.error('❌ Erreur OpenAgenda Limoges:', error.message);
    // Fallback vers sortir.limoges.fr
    try {
      return await getSortirLimogesEvents();
    } catch (e) {
      console.error('❌ Erreur fallback sortir.limoges.fr:', e.message);
      return [];
    }
  }
}

/**
 * Fallback: scrape sortir.limoges.fr pour les événements
 */
async function getSortirLimogesEvents() {
  const url = 'https://sortir.limoges.fr';
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'fr-FR,fr;q=0.9'
    },
    timeout: 15000
  });

  const $ = cheerio.load(response.data);
  const events = [];

  $('article, [class*="event"], [class*="Event"], .card, .views-row').each((i, el) => {
    const title = $(el).find('h2, h3, h4, [class*="title"]').first().text().trim();
    const dateText = $(el).find('[class*="date"], time').first().text().trim();
    const location = $(el).find('[class*="lieu"], [class*="location"], [class*="place"]').first().text().trim();
    const link = $(el).find('a').first().attr('href') || '';
    const desc = $(el).find('p, [class*="desc"], [class*="summary"]').first().text().trim();

    if (title && title.length > 3) {
      events.push({
        title: title.substring(0, 200),
        description: desc ? desc.substring(0, 300) : '',
        location: location || '',
        address: '',
        city: 'Limoges',
        dateStart: dateText || '',
        timeStart: '',
        dateEnd: '',
        image: null,
        tags: [],
        link: link.startsWith('http') ? link : `https://sortir.limoges.fr${link}`,
        source: 'sortir.limoges.fr'
      });
    }
  });

  // Dédupliquer par titre normalisé
  const seen = new Set();
  const unique = events.filter(e => {
    const key = e.title.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, 30);
}

// ============================================================
// 2. Vigicrues v1.1 - Vigilance crues pour Limoges (Vienne)
// ============================================================

/**
 * Récupère les données de vigilance crues depuis l'API Vigicrues v1.1
 * Limoges est traversée par la Vienne
 * @returns {Promise<Object>} - Données de vigilance crues
 */
async function getVigicruesData() {
  try {
    // API Vigicrues v1.1 - tous les tronçons de vigilance crues
    const vigilanceUrl = 'https://www.vigicrues.gouv.fr/services/v1.1/TronEntVigiCru.json';
    
    const response = await axios.get(vigilanceUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 15000
    });

    if (!response.data || !response.data.VigiCruEntVigiCru) {
      return { vigilance: [], source: 'Vigicrues' };
    }

    const allTroncons = response.data.VigiCruEntVigiCru;

    // Filtrer pour les cours d'eau du Limousin
    const limousin_keywords = ['vienne', 'isle', 'corrèze', 'creuse', 'dordogne', 'gartempe', 'taurion'];
    const relevantTroncons = allTroncons.filter(t => {
      const name = (t.LbEntVigiCru || t.NomEntVigiCru || '').toLowerCase();
      return limousin_keywords.some(k => name.includes(k));
    });

    const troncons = relevantTroncons.length > 0 ? relevantTroncons : [];

    const vigilanceData = troncons.slice(0, 10).map(t => {
      const niveau = t.NivSituVigiCruEntVigiCru || 0;
      return {
        cours_eau: t.LbEntVigiCru || t.NomEntVigiCru || 'Inconnu',
        troncon: t.LbEntVigiCru || '',
        niveau: niveau,
        niveauLabel: getNiveauLabel(niveau),
        couleur: getNiveauCouleur(niveau)
      };
    });

    return {
      vigilance: vigilanceData,
      timestamp: new Date().toISOString(),
      source: 'Vigicrues'
    };
  } catch (error) {
    console.error('❌ Erreur Vigicrues:', error.message);
    // Fallback: essayer le GeoJSON
    try {
      return await getVigicruesGeoJSON();
    } catch (e) {
      console.error('❌ Erreur Vigicrues GeoJSON fallback:', e.message);
      return { vigilance: [], source: 'Vigicrues', error: error.message };
    }
  }
}

/**
 * Fallback Vigicrues via GeoJSON
 */
async function getVigicruesGeoJSON() {
  const url = 'https://www.vigicrues.gouv.fr/services/1/InfoVigiCru.geojson';
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json, application/geo+json'
    },
    timeout: 15000
  });

  if (!response.data || !response.data.features) {
    return { vigilance: [], source: 'Vigicrues' };
  }

  const limousin_keywords = ['vienne', 'isle', 'corrèze', 'creuse', 'dordogne', 'gartempe'];
  const relevantFeatures = response.data.features.filter(f => {
    const props = f.properties || {};
    const name = (props.LbEntVigiCru || props.NomEntVigiCru || props.LbCoursEau || JSON.stringify(props)).toLowerCase();
    return limousin_keywords.some(k => name.includes(k));
  });

  const vigilanceData = relevantFeatures.slice(0, 10).map(f => {
    const props = f.properties || {};
    const niveau = props.NivSituVigiCruEntVigiCru || 0;
    return {
      cours_eau: props.LbEntVigiCru || props.NomEntVigiCru || 'Cours d\'eau',
      troncon: props.LbEntVigiCru || '',
      niveau: niveau,
      niveauLabel: getNiveauLabel(niveau),
      couleur: getNiveauCouleur(niveau)
    };
  });

  return {
    vigilance: vigilanceData,
    timestamp: new Date().toISOString(),
    source: 'Vigicrues'
  };
}

function getNiveauLabel(niveau) {
  const labels = {
    0: 'Pas de vigilance',
    1: 'Vigilance verte',
    2: 'Vigilance jaune',
    3: 'Vigilance orange',
    4: 'Vigilance rouge'
  };
  return labels[niveau] || 'Inconnu';
}

function getNiveauCouleur(niveau) {
  const couleurs = {
    0: '#808080',
    1: '#00CC00',
    2: '#FFFF00',
    3: '#FF8C00',
    4: '#FF0000'
  };
  return couleurs[niveau] || '#808080';
}

// ============================================================
// 3. Scraping travaux en cours à Limoges
// ============================================================

/**
 * Scrape la page des travaux en cours sur limoges.fr
 * @returns {Promise<Array>} - Liste des travaux
 */
async function getTravauxLimoges() {
  try {
    const url = 'https://www.limoges.fr/travaux-en-cours';
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const travaux = [];

    $('article, .node--type-travaux, .views-row, .field-content').each((i, el) => {
      const title = $(el).find('h2, h3, .field--name-title, .node__title').first().text().trim();
      const description = $(el).find('p, .field--name-body, .field--name-field-description').first().text().trim();
      const date = $(el).find('.date, .field--name-field-date, time').first().text().trim();
      const location = $(el).find('.location, .field--name-field-lieu, .field--name-field-localisation').first().text().trim();

      if (title && title.length > 3) {
        travaux.push({
          title: title.substring(0, 200),
          description: description ? description.substring(0, 300) : '',
          date: date || '',
          location: location || '',
          source: 'limoges.fr'
        });
      }
    });

    return travaux;
  } catch (error) {
    console.error('❌ Erreur scraping travaux Limoges:', error.message);
    return [];
  }
}

// ============================================================
// 4. Actualités Limoges via RSS France Bleu Limousin
// ============================================================

/**
 * Récupère les actualités locales via le RSS de France Bleu Limousin
 * (limoges.fr bloque le scraping avec 403, on utilise un flux RSS public)
 * @returns {Promise<Array>} - Liste des actualités
 */
async function getActualitesLimoges() {
  try {
    // France Bleu Limousin RSS
    const url = 'https://www.francebleu.fr/rss/limousin/infos.xml';
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data, { xmlMode: true });
    const actualites = [];

    $('item').each((i, el) => {
      const title = $(el).find('title').first().text().trim();
      const description = $(el).find('description').first().text().trim();
      const link = $(el).find('link').first().text().trim();
      const pubDate = $(el).find('pubDate').first().text().trim();

      if (title) {
        // Nettoyer le HTML de la description
        const cleanDesc = description.replace(/<[^>]*>/g, '').trim();
        
        let dateFormatted = '';
        if (pubDate) {
          try {
            dateFormatted = new Date(pubDate).toLocaleDateString('fr-FR', {
              weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
            });
          } catch (e) {
            dateFormatted = pubDate;
          }
        }

        actualites.push({
          title: title.substring(0, 200),
          summary: cleanDesc ? cleanDesc.substring(0, 300) : '',
          date: dateFormatted,
          link: link || '',
          source: 'France Bleu Limousin'
        });
      }
    });

    // Si France Bleu échoue, essayer France 3 Nouvelle-Aquitaine
    if (actualites.length === 0) {
      return await getActualitesFrance3();
    }

    return actualites.slice(0, 15);
  } catch (error) {
    console.error('❌ Erreur RSS France Bleu Limousin:', error.message);
    // Fallback France 3
    try {
      return await getActualitesFrance3();
    } catch (e) {
      console.error('❌ Erreur fallback France 3:', e.message);
      return [];
    }
  }
}

/**
 * Fallback: actualités via France 3 Nouvelle-Aquitaine RSS
 */
async function getActualitesFrance3() {
  const url = 'https://france3-regions.francetvinfo.fr/nouvelle-aquitaine/haute-vienne/limoges/rss';
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    },
    timeout: 15000
  });

  const $ = cheerio.load(response.data, { xmlMode: true });
  const actualites = [];

  $('item').each((i, el) => {
    const title = $(el).find('title').first().text().trim();
    const description = $(el).find('description').first().text().trim();
    const link = $(el).find('link').first().text().trim();
    const pubDate = $(el).find('pubDate').first().text().trim();

    if (title) {
      const cleanDesc = description.replace(/<[^>]*>/g, '').trim();
      let dateFormatted = '';
      if (pubDate) {
        try {
          dateFormatted = new Date(pubDate).toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
          });
        } catch (e) { dateFormatted = pubDate; }
      }

      actualites.push({
        title: title.substring(0, 200),
        summary: cleanDesc ? cleanDesc.substring(0, 300) : '',
        date: dateFormatted,
        link: link || '',
        source: 'France 3 Nouvelle-Aquitaine'
      });
    }
  });

  return actualites.slice(0, 15);
}

// ============================================================
// 5. Qualité de l'air - OpenWeatherMap Air Pollution API
// ============================================================

/**
 * Récupère l'indice de qualité de l'air pour Limoges
 * Utilise l'API Air Pollution d'OpenWeatherMap (même clé que météo)
 * @returns {Promise<Object>} - Données de qualité de l'air
 */
async function getQualiteAir() {
  try {
    const API_KEY = process.env.OPENWEATHER_API_KEY;
    if (!API_KEY) {
      console.warn('⚠️ OPENWEATHER_API_KEY non définie');
      return { aqi: null, source: 'OpenWeatherMap', error: 'Clé API manquante' };
    }

    const lat = 45.8336;
    const lon = 1.2611;
    const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`;

    const response = await axios.get(url, { timeout: 10000 });

    if (!response.data || !response.data.list || response.data.list.length === 0) {
      return { aqi: null, source: 'OpenWeatherMap' };
    }

    const data = response.data.list[0];
    const aqi = data.main.aqi; // 1=Bon, 2=Correct, 3=Modéré, 4=Mauvais, 5=Très Mauvais
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
      source: 'OpenWeatherMap / Atmo'
    };
  } catch (error) {
    console.error('❌ Erreur qualité air Limoges:', error.message);
    return { aqi: null, source: 'OpenWeatherMap', error: error.message };
  }
}

// ============================================================
// 6. SNCF - Trains Limoges-Bénédictins
// ============================================================

/**
 * Récupère les prochains départs/arrivées de la gare de Limoges-Bénédictins
 * Utilise l'API SNCF (même clé que le scraper existant)
 * @returns {Promise<Object>} - Horaires des trains
 */
async function getTrainsLimoges() {
  try {
    const SNCF_API_KEY = process.env.SNCF_API_KEY;
    if (!SNCF_API_KEY) {
      console.warn('⚠️ SNCF_API_KEY non définie');
      return { departures: [], arrivals: [], source: 'SNCF', error: 'Clé API manquante' };
    }

    // Gare de Limoges-Bénédictins
    const stationId = 'stop_point:SNCF:87592006:Train';
    const baseUrl = 'https://api.sncf.com/v1/coverage/sncf/stop_points';

    // Récupérer départs et arrivées en parallèle
    const [depResponse, arrResponse] = await Promise.allSettled([
      axios.get(`${baseUrl}/${stationId}/departures?count=15`, {
        headers: { 'Authorization': SNCF_API_KEY },
        timeout: 15000
      }),
      axios.get(`${baseUrl}/${stationId}/arrivals?count=15`, {
        headers: { 'Authorization': SNCF_API_KEY },
        timeout: 15000
      })
    ]);

    const departures = depResponse.status === 'fulfilled' && depResponse.value.data.departures
      ? depResponse.value.data.departures.map(formatSNCFSchedule('departure'))
      : [];

    const arrivals = arrResponse.status === 'fulfilled' && arrResponse.value.data.arrivals
      ? arrResponse.value.data.arrivals.map(formatSNCFSchedule('arrival'))
      : [];

    return {
      station: 'Limoges-Bénédictins',
      departures: departures,
      arrivals: arrivals,
      timestamp: new Date().toISOString(),
      source: 'SNCF'
    };
  } catch (error) {
    console.error('❌ Erreur SNCF Limoges:', error.message);
    return { departures: [], arrivals: [], source: 'SNCF', error: error.message };
  }
}

function formatSNCFSchedule(type) {
  return (schedule) => {
    const timeField = type === 'departure' ? 'departure_date_time' : 'arrival_date_time';
    const scheduleTime = schedule.stop_date_time[timeField] || '';
    const info = schedule.display_informations || {};

    // Convertir "YYYYMMDDTHHmmss" en "HH:mm"
    const time = scheduleTime.length >= 13
      ? scheduleTime.substring(9, 11) + ':' + scheduleTime.substring(11, 13)
      : '';

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
// 7. Brocantes / Vide-greniers - Haute-Vienne (87)
// ============================================================

/**
 * Récupère les prochaines brocantes et vide-greniers en Haute-Vienne
 * @returns {Promise<Array>} - Liste des brocantes
 */
async function getBrocantesLimoges() {
  try {
    const url = 'https://vide-greniers.org/87-Haute-Vienne';
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

    // Fallback: essayer brocabrac.fr
    if (brocantes.length === 0) {
      return await getBrocabracLimoges();
    }

    return brocantes.slice(0, 20);
  } catch (error) {
    console.error('❌ Erreur brocantes Limoges:', error.message);
    try {
      return await getBrocabracLimoges();
    } catch (e) {
      return [];
    }
  }
}

/**
 * Fallback brocantes via brocabrac.fr
 */
async function getBrocabracLimoges() {
  const url = 'https://brocabrac.fr/brocante/haute-vienne-87';
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

  $('article, .card, [class*="event"], [class*="brocante"]').each((i, el) => {
    const title = $(el).find('h2, h3, h4, [class*="title"], strong').first().text().trim();
    const dateText = $(el).find('[class*="date"], time, .badge').first().text().trim();
    const location = $(el).find('[class*="lieu"], [class*="city"], [class*="location"]').first().text().trim();
    const link = $(el).find('a').first().attr('href') || '';

    if (title && title.length > 3 && title.length < 200) {
      brocantes.push({
        title: title,
        date: dateText || '',
        location: location || '',
        link: link.startsWith('http') ? link : `https://brocabrac.fr${link}`,
        source: 'brocabrac.fr'
      });
    }
  });

  return brocantes.slice(0, 20);
}

// ============================================================
// 8. Pharmacies de garde - Limoges
// ============================================================

/**
 * Récupère les pharmacies de garde à Limoges
 * @returns {Promise<Object>} - Infos pharmacies de garde
 */
async function getPharmaciesGarde() {
  try {
    // Tenter de scraper la page pharmacie de garde du département 87
    const url = 'https://www.ars.sante.fr/pharmacies-de-garde';
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const pharmacies = [];

    $('[class*="pharma"], [class*="result"], .card, article').each((i, el) => {
      const name = $(el).find('h2, h3, h4, strong, [class*="name"]').first().text().trim();
      const address = $(el).find('[class*="address"], [class*="adresse"], p').first().text().trim();
      const phone = $(el).find('a[href^="tel"]').first().text().trim();

      if (name && name.length > 3 && name.length < 150) {
        pharmacies.push({ name, address: address || '', phone: phone || '' });
      }
    });

    return {
      pharmacies: pharmacies.slice(0, 10),
      info: 'Appelez le 3237 (0,35€/min) pour connaître la pharmacie de garde à Limoges',
      liens: [
        { label: 'Annuaire des pharmaciens', url: 'https://www.ordre.pharmacien.fr/je-suis/patient-grand-public/l-annuaire-des-pharmaciens-etablissements?firstname=ANNE&lastname=ARRESTIER#vue-liste' },
        { label: 'Numéro national : 3237', url: 'tel:3237' }
      ],
      timestamp: new Date().toISOString(),
      source: 'Ordre des pharmaciens / 3237'
    };
  } catch (error) {
    // En cas d'erreur, retourner les infos statiques utiles
    return {
      pharmacies: [],
      info: 'Appelez le 3237 (0,35€/min) pour connaître la pharmacie de garde à Limoges',
      liens: [
        { label: 'Annuaire des pharmaciens', url: 'https://www.ordre.pharmacien.fr/je-suis/patient-grand-public/l-annuaire-des-pharmaciens-etablissements?firstname=ANNE&lastname=ARRESTIER#vue-liste' },
        { label: 'Numéro national : 3237', url: 'tel:3237' }
      ],
      timestamp: new Date().toISOString(),
      source: 'Ordre des pharmaciens / 3237'
    };
  }
}

// ============================================================
// 9. Emploi - Offres de la Mairie de Limoges (Gestmax)
// ============================================================

/**
 * Récupère les offres d'emploi de la Mairie de Limoges
 * @returns {Promise<Object>} - Liste des offres d'emploi
 */
async function getEmploiLimoges() {
  try {
    const url = 'https://mairie-limoges.gestmax.fr/search';
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const offres = [];

    // Chercher les offres d'emploi dans la page
    $('article, .offer, .job, [class*="offer"], [class*="job"], [class*="annonce"], .card, tr, .list-group-item, .search-result, [class*="result"]').each((i, el) => {
      const title = $(el).find('h2, h3, h4, a[class*="title"], [class*="title"], [class*="intitule"], strong').first().text().trim();
      const category = $(el).find('[class*="category"], [class*="categorie"], [class*="type"], [class*="filiere"], .badge').first().text().trim();
      const location = $(el).find('[class*="lieu"], [class*="location"], [class*="localisation"]').first().text().trim();
      const dateText = $(el).find('[class*="date"], time, [class*="publication"]').first().text().trim();
      const contract = $(el).find('[class*="contrat"], [class*="contract"], [class*="type-contrat"]').first().text().trim();
      const link = $(el).find('a').first().attr('href') || '';

      if (title && title.length > 3 && title.length < 300) {
        offres.push({
          title: title,
          category: category || '',
          location: location || 'Limoges',
          date: dateText || '',
          contract: contract || '',
          link: link.startsWith('http') ? link : `https://mairie-limoges.gestmax.fr${link}`,
          source: 'Mairie de Limoges'
        });
      }
    });

    // Dédupliquer par titre
    const seen = new Set();
    const unique = offres.filter(o => {
      const key = o.title.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return {
      offres: unique.slice(0, 20),
      totalCount: unique.length,
      lienDirect: 'https://mairie-limoges.gestmax.fr/search',
      timestamp: new Date().toISOString(),
      source: 'Mairie de Limoges (Gestmax)'
    };
  } catch (error) {
    console.error('❌ Erreur emploi Limoges:', error.message);
    return {
      offres: [],
      totalCount: 0,
      lienDirect: 'https://mairie-limoges.gestmax.fr/search',
      timestamp: new Date().toISOString(),
      source: 'Mairie de Limoges (Gestmax)',
      error: error.message
    };
  }
}

// ============================================================
// 10. Conseil municipal Limoges - WebDélib+
// ============================================================

async function getConseilMunicipalLimoges() {
  const lienDirect = 'https://conseilmunicipal.limoges.fr/webdelibplus/jsp/seances.jsp?role=usager';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'fr-FR,fr;q=0.9'
  };

  try {
    const response = await axios.get(lienDirect, { headers, timeout: 20000 });
    const $ = cheerio.load(response.data);

    // Parcourir les liens vers seance_agenda.jsp (une séance = 1 lien "Délibérations")
    // + les liens openfile.jsp "Ordre du jour" associés à chaque date
    const seancesByDate = new Map(); // "DD-MM-YYYY" -> { agendaUrl, ordreJourUrl }

    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const label = $(el).text().trim();
      const fullHref = href.startsWith('http') ? href : `https://conseilmunicipal.limoges.fr${href.startsWith('/') ? '' : '/webdelibplus/jsp/'}${href}`;

      // Lien vers l'agenda d'une séance : seance_agenda.jsp?date=DD-MM-YYYY
      const agendaMatch = href.match(/seance_agenda\.jsp\?date=(\d{2}-\d{2}-\d{4})/);
      if (agendaMatch) {
        const dateKey = agendaMatch[1];
        if (!seancesByDate.has(dateKey)) seancesByDate.set(dateKey, {});
        seancesByDate.get(dateKey).agendaUrl = fullHref;
        seancesByDate.get(dateKey).date = dateKey;
      }

      // Lien vers l'ordre du jour PDF : openfile.jsp?...&name=Ordre du jour du DD/MM/YYYY
      const ordreMatch = label.match(/Ordre du jour/i) && href.match(/name=Ordre du jour du (\d{2}\/\d{2}\/\d{4})/);
      if (ordreMatch) {
        const dateKey = ordreMatch[1].replace(/\//g, '-');
        if (!seancesByDate.has(dateKey)) seancesByDate.set(dateKey, { date: dateKey });
        seancesByDate.get(dateKey).ordreJourUrl = fullHref;
      }
    });

    // Trier par date desc et garder les 3 plus récentes
    const parseDate = (s) => {
      const [d, m, y] = s.split('-').map(n => parseInt(n, 10));
      return new Date(y, m - 1, d);
    };
    const sortedSeances = Array.from(seancesByDate.values())
      .filter(s => s.agendaUrl || s.ordreJourUrl)
      .sort((a, b) => parseDate(b.date) - parseDate(a.date))
      .slice(0, 3);

    // Pour chaque séance, récupérer la liste des délibérations (PDFs)
    const seancesDetaillees = await Promise.all(sortedSeances.map(async (s) => {
      const result = {
        date: s.date,
        dateFormatted: parseDate(s.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        titre: `Conseil Municipal du ${parseDate(s.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
        agendaUrl: s.agendaUrl || null,
        ordreJourUrl: s.ordreJourUrl || null,
        deliberations: []
      };

      if (s.agendaUrl) {
        try {
          const agendaResp = await axios.get(s.agendaUrl, { headers, timeout: 20000 });
          const $$ = cheerio.load(agendaResp.data);

          // Chaque délibération a un lien vers openfile.jsp avec un name "Acte n° YYYY-MM-DD-N"
          const delibMap = new Map();
          $$('a').each((i, el) => {
            const href = $$(el).attr('href') || '';
            if (!href.includes('openfile.jsp')) return;

            // Extraire le nom de l'acte depuis le paramètre name=
            const nameMatch = href.match(/name=([^&]+)/);
            if (!nameMatch) return;
            const acteName = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));

            // Ne garder que les "Acte n°" (éviter les "Ordre du jour" qui apparaissent aussi)
            if (!acteName.toLowerCase().includes('acte')) return;

            const fullHref = href.startsWith('http') ? href : `https://conseilmunicipal.limoges.fr${href.startsWith('/') ? '' : '/webdelibplus/jsp/'}${href}`;

            if (!delibMap.has(acteName)) {
              // Extraire le numéro (ex: "Acte n° 2026-03-27-3" -> "3")
              const numMatch = acteName.match(/-(\d+)\s*$/);
              const numero = numMatch ? `n°${numMatch[1]}` : acteName;
              delibMap.set(acteName, {
                numero: numero,
                titre: acteName,
                url: fullHref
              });
            }
          });

          result.deliberations = Array.from(delibMap.values()).sort((a, b) => {
            const na = parseInt((a.numero.match(/\d+/) || [0])[0], 10);
            const nb = parseInt((b.numero.match(/\d+/) || [0])[0], 10);
            return na - nb;
          });
          result.nombreDelibs = result.deliberations.length;
        } catch (err) {
          console.error(`⚠️ Erreur séance Limoges ${s.date}:`, err.message);
          result.error = err.message;
        }
      }

      return result;
    }));

    return {
      seances: seancesDetaillees,
      lienDirect: lienDirect,
      timestamp: new Date().toISOString(),
      source: 'Ville de Limoges - WebDélib+'
    };
  } catch (error) {
    console.error('❌ Erreur Conseil municipal Limoges:', error.message);
    return {
      seances: [],
      lienDirect: lienDirect,
      source: 'Ville de Limoges - WebDélib+',
      error: error.message
    };
  }
}

module.exports = {
  getOpenAgendaEvents,
  getVigicruesData,
  getTravauxLimoges,
  getActualitesLimoges,
  getQualiteAir,
  getTrainsLimoges,
  getBrocantesLimoges,
  getPharmaciesGarde,
  getEmploiLimoges,
  getConseilMunicipalLimoges
};
