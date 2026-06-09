const axios = require('axios');

const RAYON_KM = 100;
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 heures
const BATCH_SIZE = 30;

const VILLES = {
  Limoges: { lat: 45.8336, lon: 1.2611 },
  Rouen:   { lat: 49.4431, lon: 1.0993 }
};

// Cache global : toutes les pages + résultats par ville
let globalCache = null;       // { animaux: [], etabs: [], ts: number }
let fetchPromise = null;      // Promise en cours si fetch actif

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchToutesLesPages() {
  console.log('🐾 SPA : début du chargement de toutes les pages...');

  // 1. Établissements
  const resEtabs = await axios.get('https://www.la-spa.fr/app/wp-json/spa/v1/establishments', { timeout: 20000 });
  const etabs = resEtabs.data.items || [];

  // 2. Page 1 pour connaître le nombre total
  const resP1 = await axios.get('https://www.la-spa.fr/app/wp-json/spa/v1/animals/search', {
    params: { page: 1 }, timeout: 20000
  });
  const nbPages = resP1.data.nb_pages || 1;
  const animaux = [...(resP1.data.results || [])];

  console.log(`🐾 SPA : ${nbPages} pages à récupérer (${resP1.data.total} animaux au total)`);

  // 3. Reste des pages en lots
  for (let start = 2; start <= nbPages; start += BATCH_SIZE) {
    const lot = Array.from(
      { length: Math.min(BATCH_SIZE, nbPages - start + 1) },
      (_, i) => start + i
    );
    const resultats = await Promise.allSettled(
      lot.map(page => axios.get('https://www.la-spa.fr/app/wp-json/spa/v1/animals/search', {
        params: { page }, timeout: 20000
      }))
    );
    for (const r of resultats) {
      if (r.status === 'fulfilled') animaux.push(...(r.value.data.results || []));
    }
  }

  console.log(`🐾 SPA : ${animaux.length} animaux chargés`);
  return { animaux, etabs, ts: Date.now() };
}

function lancerFetch() {
  fetchPromise = fetchToutesLesPages()
    .then(data => { globalCache = data; fetchPromise = null; })
    .catch(err => { console.error('❌ SPA fetch échoué:', err.message); fetchPromise = null; });
  return fetchPromise;
}

// Pré-fetch au démarrage du module (en arrière-plan)
lancerFetch();

// Rafraîchissement automatique toutes les 6h
setInterval(lancerFetch, CACHE_TTL);

async function getAnimauxProches(villeNom) {
  const ville = VILLES[villeNom];
  if (!ville) throw new Error(`Ville inconnue : ${villeNom}`);

  // Attendre le fetch initial si le cache n'est pas encore prêt
  if (!globalCache) {
    if (fetchPromise) await fetchPromise;
    else await lancerFetch();
  }

  // Rafraîchissement en arrière-plan si le cache est expiré
  if (globalCache && Date.now() - globalCache.ts > CACHE_TTL && !fetchPromise) {
    lancerFetch();
  }

  const { animaux, etabs } = globalCache;

  // Refuges dans le rayon
  const refugesProches = {};
  for (const e of etabs) {
    if (!e.latitude || !e.longitude) continue;
    const dist = distanceKm(ville.lat, ville.lon, parseFloat(e.latitude), parseFloat(e.longitude));
    if (dist <= RAYON_KM) {
      refugesProches[e.name] = Math.round(dist * 10) / 10;
    }
  }

  // Filtrer et transformer
  const seen = new Set();
  const resultats = animaux
    .filter(a => {
      const refuge = a.establishment?.name;
      if (!refuge || !refugesProches[refuge]) return false;
      if (seen.has(a.full_url)) return false;
      seen.add(a.full_url);
      return true;
    })
    .map(a => ({
      nom:      a.name || '',
      espece:   a.species_label || '',
      sexe:     a.sex_label || '',
      age:      a.age_label || '',
      race:     a.races_label || '',
      refuge:   a.establishment?.name || '',
      distance: refugesProches[a.establishment?.name] || null,
      url:      a.full_url || '',
      photo:    a.image || ''
    }))
    .sort((a, b) => (a.distance || 99) - (b.distance || 99));

  return {
    animaux: resultats,
    total: resultats.length,
    ville: villeNom,
    refuges: Object.keys(refugesProches).length,
    timestamp: new Date(globalCache.ts).toISOString(),
    source: 'La SPA France'
  };
}

module.exports = { getAnimauxProches };
