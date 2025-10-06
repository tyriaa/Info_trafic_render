/* eslint-disable no-undef */
/**
 * Service pour interagir avec l'API TomTom Traffic
 * Récupère les incidents de trafic pour les différentes villes
 */

const axios = require('axios');

// Configuration de base pour TomTom
const TOMTOM_API_KEY = 'PVt4NaZSKKtziZi9DaqNAUzN4flNJnSo';
const TOMTOM_API_URL = 'https://api.tomtom.com/traffic/services/5/incidentDetails';

// Coordonnées des zones urbaines (bounding boxes) pour chaque ville
const CITY_BOUNDING_BOXES = {
  paris: {
    name: 'Paris',
    bbox: '2.0,48.6,2.8,49.1' // Bounding box élargie pour couvrir toute l'Île-de-France
  }
  // Villes supprimées car non utilisées : lille, marseille, normandie
};

/**
 * Récupère les incidents de trafic pour une ville spécifique
 * @param {string} city - Code de la ville ('paris', 'lille', etc.)
 * @param {string} language - Code de la langue (fr-FR par défaut)
 * @returns {Promise<Object>} - Les données d'incidents formatées
 */
async function getTrafficIncidents(city, language = 'fr-FR') {
  try {
    // Vérifier que la ville est valide
    if (!CITY_BOUNDING_BOXES[city.toLowerCase()]) {
      throw new Error(`Ville non supportée: ${city}`);
    }

    const cityData = CITY_BOUNDING_BOXES[city.toLowerCase()];
    
    // Paramètres de la requête
    const params = {
      key: TOMTOM_API_KEY,
      bbox: cityData.bbox,
      fields: '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity}}}',
      language: language
      // timeValidityFilter: 'present' - SUPPRIMÉ car il élimine tous les incidents
    };

    // Appel à l'API TomTom
    const response = await axios.get(TOMTOM_API_URL, { params });

    // Extraction et formatage des données pertinentes
    return formatTrafficData(response.data, cityData.name);
  } catch (error) {
    console.error(`Erreur lors de la récupération des incidents de trafic pour ${city}:`, error);
    return {
      cityName: CITY_BOUNDING_BOXES[city.toLowerCase()]?.name || city,
      incidents: [],
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Formate les données d'incidents de trafic pour le modèle Claude
 * @param {Object} rawData - Données brutes de l'API TomTom
 * @param {string} cityName - Nom de la ville
 * @returns {Object} - Données formatées
 */
function formatTrafficData(rawData, cityName) {
  if (!rawData.incidents || !Array.isArray(rawData.incidents)) {
    return {
      cityName,
      incidents: [],
      timestamp: new Date().toISOString()
    };
  }

  // Catégories d'incidents pour l'affichage
  const ICON_CATEGORIES = {
    0: 'Inconnu',
    1: 'Accident',
    2: 'Brouillard',
    3: 'Conditions dangereuses',
    4: 'Pluie',
    5: 'Verglas',
    6: 'Embouteillage',
    7: 'Voie fermée',
    8: 'Route fermée',
    9: 'Travaux',
    10: 'Vent fort',
    11: 'Inondation',
    14: 'Véhicule en panne'
  };

  // Magnitudes de délai
  const DELAY_MAGNITUDES = {
    0: 'Inconnu',
    1: 'Mineur',
    2: 'Modéré',
    3: 'Majeur',
    4: 'Indéfini'
  };

  // Filtrer et formatter les incidents prioritaires
  const formattedIncidents = rawData.incidents
    .filter(incident => incident && incident.properties)
    .map(incident => {
      const props = incident.properties;
      
      // Extraire les descriptions d'événements
      const eventDescriptions = props.events 
        ? props.events.map(event => event.description).join('; ')
        : 'Pas de description disponible';
      
      // Calculer le délai en minutes et l'arrondir
      const delayMinutes = props.delay ? Math.round(props.delay / 60) : 0;

      // Formatter l'heure de début si disponible
      const startTime = props.startTime 
        ? new Date(props.startTime).toLocaleString('fr-FR')
        : 'Non spécifié';
      
      // Formatter l'heure de fin si disponible
      const endTime = props.endTime 
        ? new Date(props.endTime).toLocaleString('fr-FR')
        : 'Non spécifié';

      return {
        id: props.id,
        type: ICON_CATEGORIES[props.iconCategory] || 'Incident',
        iconCategory: props.iconCategory,
        description: eventDescriptions,
        location: {
          from: props.from || 'Non spécifié',
          to: props.to || 'Non spécifié'
        },
        roads: props.roadNumbers || [],
        delay: {
          seconds: props.delay || 0,
          minutes: delayMinutes,
          magnitude: DELAY_MAGNITUDES[props.magnitudeOfDelay] || 'Inconnu'
        },
        timing: {
          start: startTime,
          end: endTime
        },
        priority: calculateIncidentPriority(props.iconCategory, delayMinutes, props.magnitudeOfDelay)
      };
    })
    .filter(incident => isHighPriorityIncident(incident))
    .sort((a, b) => b.priority - a.priority) // Trier par priorité décroissante
    .slice(0, 30); // Limiter aux 30 incidents les plus importants

  return {
    cityName,
    incidents: formattedIncidents,
    count: formattedIncidents.length,
    timestamp: new Date().toISOString()
  };
}

/**
 * Calcule la priorité d'un incident basée sur son type et sa sévérité
 * @param {number} iconCategory - Catégorie de l'incident
 * @param {number} delayMinutes - Délai en minutes
 * @param {number} magnitudeOfDelay - Magnitude du délai (0-4)
 * @returns {number} - Score de priorité (plus élevé = plus prioritaire)
 */
function calculateIncidentPriority(iconCategory, delayMinutes, magnitudeOfDelay) {
  let priority = 0;
  
  // Priorité basée sur le type d'incident
  switch (iconCategory) {
    case 1: // Accident
      priority += 100;
      break;
    case 14: // Véhicule en panne
      priority += 80;
      break;
    case 8: // Route fermée
      priority += 70;
      break;
    case 7: // Voie fermée
      priority += 60;
      break;
    case 6: // Embouteillage
      priority += 40;
      break;
    case 9: // Travaux
      priority += 30;
      break;
    case 3: // Conditions dangereuses
      priority += 50;
      break;
    case 5: // Verglas
      priority += 45;
      break;
    default:
      priority += 10;
  }
  
  // Bonus basé sur le délai
  if (delayMinutes >= 30) {
    priority += 50;
  } else if (delayMinutes >= 15) {
    priority += 30;
  } else if (delayMinutes >= 5) {
    priority += 15;
  }
  
  // Bonus basé sur la magnitude du délai
  switch (magnitudeOfDelay) {
    case 4: // Indéfini
      priority += 40;
      break;
    case 3: // Majeur
      priority += 30;
      break;
    case 2: // Modéré
      priority += 15;
      break;
    case 1: // Mineur
      priority += 5;
      break;
  }
  
  return priority;
}

/**
 * Détermine si un incident est de haute priorité
 * @param {Object} incident - L'incident formaté
 * @returns {boolean} - True si l'incident est prioritaire
 */
function isHighPriorityIncident(incident) {
  const { iconCategory, delay, location, description } = incident;
  
  // PRIORITÉ MAXIMALE: Toujours inclure les accidents et véhicules en panne
  // Même si les données sont incomplètes (N/A)
  if (iconCategory === 1 || iconCategory === 14) {
    return true;
  }
  
  // PRIORITÉ HAUTE: Conditions dangereuses et verglas
  if (iconCategory === 3 || iconCategory === 5) {
    return true;
  }
  
  // PRIORITÉ MOYENNE: Embouteillages avec délai significatif (>= 10 minutes)
  if (iconCategory === 6 && delay.minutes >= 10) {
    return true;
  }
  
  // PRIORITÉ MOYENNE: Routes fermées sur axes majeurs uniquement
  if (iconCategory === 8 || iconCategory === 7) {
    const text = `${location.from} ${location.to} ${description}`.toLowerCase();
    // Filtrer uniquement les fermetures sur axes majeurs
    if (text.includes('périphérique') || text.includes('autoroute') || 
        text.includes('nationale') || text.includes('a1') || text.includes('a4') ||
        text.includes('a6') || text.includes('a10') || text.includes('a13') ||
        text.includes('a86') || text.includes('n1') || text.includes('n2') ||
        text.includes('n3') || text.includes('n4') || text.includes('n6') ||
        text.includes('n7') || text.includes('n10') || text.includes('n13') ||
        text.includes('n20') || text.includes('n104') || text.includes('n118') ||
        delay.minutes >= 15) {
      return true;
    }
    return false; // Ignorer les petites routes fermées
  }
  
  // PRIORITÉ FAIBLE: Travaux avec délai très important (>= 20 minutes)
  if (iconCategory === 9 && delay.minutes >= 20) {
    return true;
  }
  
  return false;
}

/**
 * Récupère un résumé des incidents de trafic pour toutes les villes configurées
 * @param {string} language - Code de la langue (fr-FR par défaut)
 * @returns {Promise<Object>} - Résumé des incidents pour toutes les villes
 */
async function getAllCitiesTrafficSummary(language = 'fr-FR') {
  const cities = Object.keys(CITY_BOUNDING_BOXES);
  const results = {};
  
  // Récupérer les données pour chaque ville en parallèle
  const promises = cities.map(city => getTrafficIncidents(city, language));
  const citiesData = await Promise.all(promises);
  
  // Organiser les résultats par ville
  cities.forEach((city, index) => {
    results[city] = citiesData[index];
  });
  
  return {
    summary: {
      totalIncidents: Object.values(results).reduce((sum, cityData) => sum + cityData.incidents.length, 0),
      citiesCovered: cities.length,
      timestamp: new Date().toISOString()
    },
    cities: results
  };
}

module.exports = {
  getTrafficIncidents,
  getAllCitiesTrafficSummary
};
