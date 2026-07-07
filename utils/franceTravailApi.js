/**
 * Utilitaire partagé pour l'API France Travail (ex Pôle Emploi)
 * OAuth2 client_credentials + recherche d'offres par commune INSEE
 */

const axios = require('axios');

const TOKEN_URL = 'https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire';
const SEARCH_URL = 'https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search';

// Cache du token en mémoire (expire toutes les ~20 min)
let tokenCache = { value: null, expiresAt: 0 };

async function getToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) {
    return tokenCache.value;
  }

  const clientId     = process.env.FRANCE_TRAVAIL_CLIENT_ID;
  const clientSecret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('FRANCE_TRAVAIL_CLIENT_ID / FRANCE_TRAVAIL_CLIENT_SECRET manquants dans .env');
  }

  const params = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     clientId,
    client_secret: clientSecret,
    scope:         'api_offresdemploiv2 o2dsoffre'
  });

  const response = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000
  });

  const token     = response.data.access_token;
  const expiresIn = response.data.expires_in || 1200; // secondes
  tokenCache = { value: token, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
  return token;
}

/**
 * Recherche d'offres d'emploi par code INSEE de commune
 * @param {string} codeInsee - ex: '76540' (Rouen), '87085' (Limoges)
 * @param {number} distance  - rayon en km (défaut: 10)
 * @param {number} maxOffres - nombre max de résultats (défaut: 20)
 */
async function searchOffres(codeInsee, distance = 10, maxOffres = 20) {
  const token = await getToken();
  const rangeEnd = Math.min(maxOffres - 1, 149); // API limite à 150

  const response = await axios.get(SEARCH_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        'application/json'
    },
    params: {
      commune:  codeInsee,
      distance: distance,
      range:    `0-${rangeEnd}`,
      sort:     1   // tri par date décroissante
    },
    timeout: 15000
  });

  const resultats = response.data.resultats || [];
  return resultats.map(o => ({
    title:    o.intitule || '',
    company:  (o.entreprise && o.entreprise.nom) || '',
    location: (o.lieuTravail && o.lieuTravail.libelle) || '',
    contract: o.typeContratLibelle || '',
    date:     (o.dateCreation || '').substring(0, 10),
    link:     o.id ? `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}` : '',
    source:   'France Travail'
  }));
}

module.exports = { searchOffres };
