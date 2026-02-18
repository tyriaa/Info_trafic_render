/* eslint-disable no-undef */
/**
 * Service pour interagir avec l'API TomTom Traffic
 * Récupère les incidents de trafic pour les différentes villes
 */

const axios = require('axios');
const { formatShortFrenchDate } = require('./dateUtils');

// Configuration de base pour TomTom
const TOMTOM_API_KEY = 'PVt4NaZSKKtziZi9DaqNAUzN4flNJnSo';
const TOMTOM_API_URL = 'https://api.tomtom.com/traffic/services/5/incidentDetails';

// Coordonnées des zones urbaines (bounding boxes) pour chaque ville
const CITY_BOUNDING_BOXES = {
  paris: {
    name: 'Paris',
    bbox: '2.0,48.6,2.8,49.1' // Bounding box élargie pour couvrir toute l'Île-de-France
  },
  lille: {
    name: 'Lille',
    bbox: '2.9,50.5,3.4,50.8' // Bounding box pour la métropole lilloise
  },
  marseille: {
    name: 'Marseille',
    bbox: '5.2,43.1,5.6,43.4' // Bounding box pour la métropole marseillaise
  },
  normandie: {
    name: 'Normandie',
    bbox: '-1.2,48.8,1.8,50.1' // Bounding box pour la région Normandie
  }
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
      language: language
      // fields: retiré car cause erreur 400 (encodage des accolades)
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

      // Formatter l'heure de début si disponible (avec fuseau horaire français)
      const startTime = props.startTime 
        ? formatShortFrenchDate(props.startTime)
        : 'Non spécifié';
      
      // Formatter l'heure de fin si disponible (avec fuseau horaire français)
      const endTime = props.endTime 
        ? formatShortFrenchDate(props.endTime)
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
        geometry: incident.geometry || null, // Conserver la géométrie originale
        priority: calculateIncidentPriority(props.iconCategory, delayMinutes, props.magnitudeOfDelay)
      };
    })
    .filter(incident => isRelevantIncident(incident))
    .sort((a, b) => b.priority - a.priority) // Trier par priorité décroissante (accidents/pannes en premier)
    .slice(0, 50); // Limiter aux 50 incidents les plus importants (augmenté pour plus de diversité)

  return {
    cityName,
    incidents: formattedIncidents,
    count: formattedIncidents.length,
    timestamp: new Date().toISOString()
  };
}

/**
 * Calcule la priorité d'un incident avec priorité absolue pour accidents et pannes
 * @param {number} iconCategory - Catégorie de l'incident
 * @param {number} delayMinutes - Délai en minutes
 * @param {number} magnitudeOfDelay - Magnitude du délai (0-4)
 * @returns {number} - Score de priorité (plus élevé = plus prioritaire)
 */
function calculateIncidentPriority(iconCategory, delayMinutes, magnitudeOfDelay) {
  let priority = 0;
  
  // PRIORITÉ ABSOLUE pour accidents et véhicules en panne
  if (iconCategory === 1 || iconCategory === 14) {
    priority = 1000; // Priorité absolue
  } else {
    // Priorité normale pour les autres types
    switch (iconCategory) {
      case 3: // Conditions dangereuses
        priority += 80;
        break;
      case 5: // Verglas
        priority += 70;
        break;
      case 8: // Route fermée
        priority += 60;
        break;
      case 6: // Embouteillage
        priority += 50;
        break;
      case 7: // Voie fermée
        priority += 40;
        break;
      case 9: // Travaux
        priority += 25;
        break;
      default:
        priority += 10;
    }
  }
  
  // Bonus basé sur le délai (sauf pour les priorités absolues)
  if (iconCategory !== 1 && iconCategory !== 14) {
    if (delayMinutes >= 25) {
      priority += 50;
    } else if (delayMinutes >= 12) {
      priority += 30;
    } else if (delayMinutes >= 4) {
      priority += 15;
    }
  }
  
  // Bonus basé sur la magnitude du délai (sauf pour les priorités absolues)
  if (iconCategory !== 1 && iconCategory !== 14) {
    switch (magnitudeOfDelay) {
      case 4: // Indéfini
        priority += 45;
        break;
      case 3: // Majeur
        priority += 35;
        break;
      case 2: // Modéré
        priority += 18;
        break;
      case 1: // Mineur
        priority += 5;
        break;
    }
  }
  
  return priority;
}

/**
 * Détermine si un incident est pertinent pour l'affichage
 * Système plus inclusif basé sur la priorité absolue
 * @param {Object} incident - L'incident formaté
 * @returns {boolean} - True si l'incident est pertinent
 */
function isRelevantIncident(incident) {
  const { iconCategory, delay, location, description } = incident;
  
  // PRIORITÉ ABSOLUE: Toujours inclure les accidents et véhicules en panne
  if (iconCategory === 1 || iconCategory === 14) {
    return true;
  }
  
  // PRIORITÉ HAUTE: Conditions dangereuses et verglas
  if (iconCategory === 3 || iconCategory === 5) {
    return true;
  }
  
  // EMBOUTEILLAGES: Inclure ceux avec délai >= 5 minutes (plus inclusif)
  if (iconCategory === 6 && delay.minutes >= 5) {
    return true;
  }
  
  // ROUTES ET VOIES FERMÉES: Système plus inclusif
  if (iconCategory === 8 || iconCategory === 7) {
    const text = `${location.from} ${location.to} ${description}`.toLowerCase();
    
    // Toujours inclure les axes majeurs
    if (text.includes('périphérique') || text.includes('autoroute') || 
        text.includes('nationale') || text.includes('a1') || text.includes('a4') ||
        text.includes('a6') || text.includes('a10') || text.includes('a13') ||
        text.includes('a86') || text.includes('n1') || text.includes('n2') ||
        text.includes('n3') || text.includes('n4') || text.includes('n6') ||
        text.includes('n7') || text.includes('n10') || text.includes('n13') ||
        text.includes('n20') || text.includes('n104') || text.includes('n118')) {
      return true;
    }
    
    // Inclure les fermetures avec délai significatif (>= 10 minutes)
    if (delay.minutes >= 10) {
      return true;
    }
    
    // Inclure les fermetures de routes importantes (même sans délai spécifié)
    if (text.includes('route') || text.includes('boulevard') || text.includes('avenue')) {
      return true;
    }
    
    return false;
  }
  
  // TRAVAUX: Inclure ceux avec délai >= 15 minutes (plus inclusif)
  if (iconCategory === 9 && delay.minutes >= 15) {
    return true;
  }
  
  // AUTRES CONDITIONS MÉTÉO: Inclure brouillard, pluie, etc.
  if (iconCategory === 2 || iconCategory === 4 || iconCategory === 10 || iconCategory === 11) {
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
