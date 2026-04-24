const express = require('express');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const PerturbationScraper = require('./scrapers/lille_scraper');
const SNCFScraper = require('./scrapers/sncf_scraper');
const NormandieRSSScraper = require('./scrapers/normandie_scraper');
const app = express();
const PORT = process.env.PORT || 3001;

// Initialisation des services IA et API externes
const tomTomService = require('./utils/tomTomService');
const anthropicService = require('./utils/anthropicService');
const openaiService = require('./utils/openaiService');
const mistralService = require('./utils/mistralService');
const weatherService = require('./utils/weatherService');
const { formatFullFrenchDate } = require('./utils/dateUtils');
const databaseService = require('./services/databaseService');
const parisIdeasService = require('./services/parisIdeasService');
const brocantesService = require('./services/brocantesService');
const museesService = require('./services/museesService');
const solidariteService = require('./services/solidariteService');
const marchesService = require('./services/marchesService');
const limogesService = require('./services/limogesService');
const rouenService = require('./services/rouenService');
const iciExpressService = require('./services/iciExpressService');

// Configuration automatique via variables d'environnement (ANTHROPIC_API_KEY)
// TomTom API configurée directement dans le service

// Middleware pour parser le JSON
app.use(express.json());

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));

// Configuration de l'API
const API_KEY = process.env.IDFM_API_KEY;
const SNCF_API_KEY = process.env.SNCF_API_KEY;
const BASE_URL_API = "https://prim.iledefrance-mobilites.fr/marketplace/v2/navitia/line_reports/physical_modes/physical_mode%3A";

const CATEGORIES = {
    "Métro": "Metro",
    "RER": "RapidTransit",
    "Bus": "Bus",
    "Transilien": "LocalTrain",
    "Tram": "Tramway"
};

// Fonction pour récupérer les perturbations
async function fetchDisruptions(category, apiValue) {
    const url = `${BASE_URL_API}${apiValue}/line_reports?`;
    const headers = { "accept": "application/json", "apiKey": API_KEY };

    try {
        const response = await axios.get(url, { headers, timeout: 5000 });
        return response.data.disruptions || [];
    } catch (error) {
        console.error(`Erreur API pour ${category}: ${error}`);
        return [];
    }
}

// Fonction pour normaliser le nom de la ligne
function normalizeLineName(lineName) {
    if (!lineName) return '';
    
    // Supprimer les préfixes inutiles
    lineName = lineName
        .replace(/Ratp métro/i, 'Métro')
        .replace(/Transilien train transilien/i, 'Transilien')
        .replace(/Batp bus/i, 'Bus');
    
    // Mettre en majuscule les lettres des lignes RER et Transilien
    lineName = lineName.replace(/(RER|Transilien)\s+([a-z])/i, (match, type, letter) => {
        return `${type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()} ${letter.toUpperCase()}`;
    });
    
    return lineName;
}

// Fonction getPostalCode() supprimée car non utilisée

// Route pour récupérer les perturbations
app.get('/api/transport-disruptions', async (req, res) => {
    try {
        const allDisruptions = {};
        
        // Récupérer les perturbations pour chaque catégorie
        for (const [category, apiValue] of Object.entries(CATEGORIES)) {
            const disruptions = await fetchDisruptions(category, apiValue);
            const activeDisruptions = disruptions
                .filter(disruption => disruption.status === 'active')
                .map(disruption => ({
                    id: disruption.id || '',
                    cause: disruption.cause || 'Inconnue',
                    severity: disruption.severity?.name || 'N/A',
                    message: disruption.messages?.[0]?.text || 'Pas de message',
                    impacted_lines: (disruption.impacted_objects || [])
                        .filter(obj => obj.pt_object?.embedded_type === 'line')
                        .map(obj => obj.pt_object?.name || 'Ligne inconnue')
                }));
            allDisruptions[category] = activeDisruptions;
        }

        // Récapitulatif des lignes impactées
        const summaryData = [];
        const seenLines = new Set();

        for (const [category, disruptions] of Object.entries(allDisruptions)) {
            for (const d of disruptions) {
                for (const line of d.impacted_lines) {
                    const normLine = normalizeLineName(line);
                    if (!seenLines.has(normLine)) {
                        summaryData.push({
                            category,
                            line: normLine,
                            cause: d.cause,
                            severity: d.severity,
                            message: d.message
                        });
                        seenLines.add(normLine);
                    }
                }
            }
        }

        res.json({ status: 'success', data: summaryData });
    } catch (error) {
        console.error('Erreur générale:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Endpoint pour les perturbations de Lille
app.get('/api/lille/disruptions', async (req, res) => {
    try {
        const scraper = new PerturbationScraper();
        const disruptions = await scraper.getPerturbations();
        res.json({
            status: 'success',
            data: disruptions
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des perturbations de Lille:', error);
        res.status(500).json({
            status: 'error',
            message: 'Erreur lors de la récupération des perturbations'
        });
    }
});

// Route pour récupérer les départs des trains SNCF à Lille
app.get('/api/lille/trains', async (req, res) => {
    try {
        // Initialiser le scraper SNCF pour Lille si ce n'est pas déjà fait
        if (!SNCF_API_KEY) {
            throw new Error('SNCF API key not available');
        }
        
        const lilleScraper = new SNCFScraper(SNCF_API_KEY);
        const allSchedules = await lilleScraper.getSchedules();
        
        // Filtrer uniquement les gares de Lille
        const lilleSchedules = {};
        if (allSchedules['Lille Europe']) {
            lilleSchedules['Lille Europe'] = allSchedules['Lille Europe'];
        }
        if (allSchedules['Lille Flandres']) {
            lilleSchedules['Lille Flandres'] = allSchedules['Lille Flandres'];
        }
        
        res.json(lilleSchedules);
    } catch (error) {
        console.error('Error fetching train schedules for Lille:', error);
        res.status(500).json({ error: 'Failed to fetch train schedules for Lille' });
    }
});

// Endpoint pour les perturbations de Normandie (Rouen)
app.get('/api/normandie/disruptions', async (req, res) => {
    try {
        const scraper = new NormandieRSSScraper();
        const disruptions = await scraper.getPerturbations();
        res.json({
            status: 'success',
            data: disruptions
        });
    } catch (error) {
        console.error('Erreur lors de la récupération des perturbations de Normandie:', error);
        res.status(500).json({
            status: 'error',
            message: 'Erreur lors de la récupération des perturbations'
        });
    }
});

// Endpoint pour les horaires des trains à Rouen

// Initialisation du scraper avec l'API key pour Normandie
let normandieScraper = null;
try {
    const sncfApiKey = process.env.SNCF_API_KEY || 'basic ' + Buffer.from(process.env.SNCF_API_USER + ':').toString('base64');
    normandieScraper = new SNCFScraper(sncfApiKey);
} catch (error) {
    console.error('Failed to initialize SNCF scraper for Normandie:', error);
}

app.get('/api/normandie/trains', async (req, res) => {
    try {
        if (!normandieScraper) {
            throw new Error('SNCF scraper for Normandie not initialized');
        }
        
        // Récupération des horaires en temps réel via le scraper SNCF
        const allSchedules = await normandieScraper.getSchedules();
        
        // Filtrer uniquement la gare de Rouen pour la page Normandie
        const rouenSchedules = {};
        if (allSchedules['Gare de Rouen-Rive-Droite']) {
            rouenSchedules['Gare de Rouen-Rive-Droite'] = allSchedules['Gare de Rouen-Rive-Droite'];
        } else {
            console.warn('No schedules available for Rouen, using mock data');
            rouenSchedules['Gare de Rouen-Rive-Droite'] = {
                arrivals: [
                    { time: '11:42', direction: 'Paris Saint-Lazare', type: 'TER', train_number: '19123' },
                    { time: '12:15', direction: 'Le Havre', type: 'Intercités', train_number: '3115' },
                    { time: '12:45', direction: 'Amiens', type: 'TER', train_number: '18456' }
                ],
                departures: [
                    { time: '11:55', direction: 'Dieppe', type: 'TER', train_number: '19220' },
                    { time: '12:30', direction: 'Paris Saint-Lazare', type: 'Intercités', train_number: '3122' },
                    { time: '13:05', direction: 'Caen', type: 'TER', train_number: '17845' }
                ]
            };
        }
        
        res.json(rouenSchedules);
    } catch (error) {
        console.error('Error fetching train schedules for Normandie:', error);
        res.status(500).json({ error: 'Failed to fetch train schedules for Normandie' });
    }
});

app.get('/api/marseille/ferries', async (req, res) => {
    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
        };
        
        const response = await axios.get('https://pcs.marseille-port.fr/webix/public/escales/ferries', { headers });
        const $ = cheerio.load(response.data);
        
        const ships_data = [];
        
        $('table.table tr').slice(1).each((i, row) => {
            const cells = $(row).find('td');
            if (cells.length >= 6) {
                const navire = $(cells[1]).text().trim();
                const eta = $(cells[2]).text().trim();
                const quai = $(cells[3]).text().trim();
                const etd = $(cells[4]).text().trim();
                const destination = $(cells[5]).text().trim();
                
                if (eta !== "-" && etd !== "-") {
                    // Convertir la date au format français en objet Date
                    const [day, month, year, hour, minute] = eta.split(/[\/\s:]/).map(Number);
                    const dateObj = new Date(year, month - 1, day, hour, minute);
                    
                    ships_data.push({
                        name: navire,
                        location: quai,
                        arrival: eta,
                        departure: etd,
                        destination: destination,
                        dateObj: dateObj
                    });
                }
            }
        });
        
        // Trier par date d'arrivée la plus proche
        // Trier par date et ne garder que les 5 premiers
        ships_data.sort((a, b) => a.dateObj - b.dateObj);
        
        // Ne garder que les 5 premiers et supprimer la propriété dateObj utilisée uniquement pour le tri
        const limitedData = ships_data.slice(0, 5).map(({ dateObj, ...shipData }) => {
            return shipData; // On retourne l'objet sans dateObj
        });
        
        res.json(limitedData);
    } catch (error) {
        console.error('Erreur lors de la récupération des ferries:', error);
        res.status(500).json({ error: 'Erreur lors de la récupération des ferries' });
    }
});

app.get('/api/velib/unavailable', async (req, res) => {
    try {
        const [statusResponse, infoResponse] = await Promise.all([
            axios.get('https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json'),
            axios.get('https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_information.json')
        ]);

        const stationInfoMap = {};
        infoResponse.data.data.stations.forEach(station => {
            stationInfoMap[station.station_id] = {
                name: station.name,
                lat: station.lat,
                lon: station.lon
            };
        });

        const unavailableStations = statusResponse.data.data.stations
            .filter(station => station.is_installed === 0)
            .map(station => {
                const info = stationInfoMap[station.station_id];
                return info ? {
                    name: info.name,
                    lat: info.lat,
                    lon: info.lon
                } : null;
            })
            .filter(station => station !== null);

        res.json(unavailableStations);
    } catch (error) {
        console.error('Erreur lors de la récupération des stations Vélib:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Routes de configuration/test supprimées car non utilisées

// Route pour récupérer les incidents de trafic TomTom pour une ville
app.get('/api/tomtom/incidents/:city', async (req, res) => {
  const { city } = req.params;
  const language = req.query.language || 'fr-FR';
  
  try {
    const trafficData = await tomTomService.getTrafficIncidents(city, language);
    res.json(trafficData);
  } catch (error) {
    console.error(`Erreur lors de la récupération des incidents TomTom pour ${city}:`, error);
    res.status(500).json({ 
      status: 'error',
      message: `Erreur lors de la récupération des incidents TomTom: ${error.message}`,
      city: city
    });
  }
});

// Route pour récupérer un résumé des incidents de trafic pour toutes les villes
app.get('/api/tomtom/incidents', async (req, res) => {
  const language = req.query.language || 'fr-FR';
  
  try {
    const allCitiesData = await tomTomService.getAllCitiesTrafficSummary(language);
    res.json(allCitiesData);
  } catch (error) {
    console.error('Erreur lors de la récupération du résumé des incidents TomTom:', error);
    res.status(500).json({ 
      status: 'error',
      message: `Erreur lors de la récupération du résumé des incidents TomTom: ${error.message}`
    });
  }
});

// Route pour récupérer les données météo
app.get('/api/weather/:city', async (req, res) => {
  const { city } = req.params;
  
  try {
    const weatherData = await weatherService.getWeatherData(city);
    res.json(weatherData);
  } catch (error) {
    console.error(`Erreur lors de la récupération météo pour ${city}:`, error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données météo' });
  }
});

// Route pour récupérer un résumé météo court
app.get('/api/weather/:city/summary', async (req, res) => {
  const { city } = req.params;
  
  try {
    const summary = await weatherService.getWeatherSummary(city);
    res.json({ summary });
  } catch (error) {
    console.error(`Erreur lors de la récupération du résumé météo pour ${city}:`, error);
    res.status(500).json({ error: 'Erreur lors de la récupération du résumé météo' });
  }
});

// Route pour récupérer les prévisions météo 5 jours
app.get('/api/weather/:city/forecast', async (req, res) => {
  const { city } = req.params;
  
  try {
    const forecast = await weatherService.getWeatherForecast(city);
    res.json(forecast);
  } catch (error) {
    console.error(`Erreur lors de la récupération des prévisions pour ${city}:`, error);
    res.status(500).json({ error: 'Erreur lors de la récupération des prévisions météo' });
  }
});

// Route pour récupérer uniquement les accidents TomTom pour Paris
app.get('/api/tomtom/accidents/paris', async (req, res) => {
  try {
    const trafficData = await tomTomService.getTrafficIncidents('Paris', 'fr-FR');
    
    // Filtrer uniquement les accidents et véhicules en panne (iconCategory === 1 ou 14)
    const accidents = trafficData.incidents
      .filter(incident => isAccidentOrBreakdown(incident))
      .map(incident => {
        const geometry = incident.geometry;
        let coordinates = null;
        
        // Gérer les différents types de géométrie
        if (geometry && geometry.coordinates) {
          if (geometry.type === 'Point') {
            // Pour un point, prendre les coordonnées directement [lon, lat] -> [lat, lon]
            coordinates = [geometry.coordinates[1], geometry.coordinates[0]];
          } else if (geometry.type === 'LineString' && geometry.coordinates.length > 0) {
            // Pour une ligne, prendre le point central [lon, lat] -> [lat, lon]
            const midIndex = Math.floor(geometry.coordinates.length / 2);
            coordinates = [geometry.coordinates[midIndex][1], geometry.coordinates[midIndex][0]];
          }
        }
        
        return {
          id: incident.id || Math.random().toString(36).substr(2, 9),
          description: incident.description || 'Accident signalé',
          severity: incident.severity || 'unknown',
          delay: incident.delay ? incident.delay.minutes : 0,
          coordinates: coordinates,
          from: incident.location?.from || '',
          to: incident.location?.to || '',
          roadNumbers: incident.roads || [],
          startTime: incident.timing?.start || 'Non spécifié'
        };
      })
      .filter(accident => accident.coordinates); // Garder seulement ceux avec coordonnées
    
    res.json({
      status: 'success',
      accidents: accidents,
      count: accidents.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des accidents TomTom:', error);
    res.status(500).json({ 
      status: 'error',
      message: `Erreur lors de la récupération des accidents TomTom: ${error.message}`
    });
  }
});

// Route pour récupérer uniquement les accidents TomTom pour Lille
app.get('/api/tomtom/accidents/lille', async (req, res) => {
  try {
    const trafficData = await tomTomService.getTrafficIncidents('Lille', 'fr-FR');
    
    // Filtrer uniquement les accidents et véhicules en panne (iconCategory === 1 ou 14)
    const accidents = trafficData.incidents
      .filter(incident => isAccidentOrBreakdown(incident))
      .map(incident => {
        const geometry = incident.geometry;
        let coordinates = null;
        
        // Gérer les différents types de géométrie
        if (geometry && geometry.coordinates) {
          if (geometry.type === 'Point') {
            // Pour un point, prendre les coordonnées directement [lon, lat] -> [lat, lon]
            coordinates = [geometry.coordinates[1], geometry.coordinates[0]];
          } else if (geometry.type === 'LineString' && geometry.coordinates.length > 0) {
            // Pour une ligne, prendre le point central [lon, lat] -> [lat, lon]
            const midIndex = Math.floor(geometry.coordinates.length / 2);
            coordinates = [geometry.coordinates[midIndex][1], geometry.coordinates[midIndex][0]];
          }
        }
        
        return {
          id: incident.id || Math.random().toString(36).substr(2, 9),
          description: incident.description || 'Accident signalé',
          severity: incident.severity || 'unknown',
          delay: incident.delay ? incident.delay.minutes : 0,
          coordinates: coordinates,
          from: incident.location?.from || '',
          to: incident.location?.to || '',
          roadNumbers: incident.roads || [],
          startTime: incident.timing?.start || 'Non spécifié'
        };
      })
      .filter(accident => accident.coordinates); // Garder seulement ceux avec coordonnées
    
    res.json({
      status: 'success',
      accidents: accidents,
      count: accidents.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des accidents TomTom pour Lille:', error);
    res.status(500).json({ 
      status: 'error',
      message: `Erreur lors de la récupération des accidents TomTom: ${error.message}`
    });
  }
});

// Route pour récupérer uniquement les accidents TomTom pour Marseille
app.get('/api/tomtom/accidents/marseille', async (req, res) => {
  try {
    const trafficData = await tomTomService.getTrafficIncidents('Marseille', 'fr-FR');
    
    // Filtrer uniquement les accidents et véhicules en panne (iconCategory === 1 ou 14)
    const accidents = trafficData.incidents
      .filter(incident => isAccidentOrBreakdown(incident))
      .map(incident => {
        const geometry = incident.geometry;
        let coordinates = null;
        
        // Gérer les différents types de géométrie
        if (geometry && geometry.coordinates) {
          if (geometry.type === 'Point') {
            // Pour un point, prendre les coordonnées directement [lon, lat] -> [lat, lon]
            coordinates = [geometry.coordinates[1], geometry.coordinates[0]];
          } else if (geometry.type === 'LineString' && geometry.coordinates.length > 0) {
            // Pour une ligne, prendre le point central [lon, lat] -> [lat, lon]
            const midIndex = Math.floor(geometry.coordinates.length / 2);
            coordinates = [geometry.coordinates[midIndex][1], geometry.coordinates[midIndex][0]];
          }
        }
        
        return {
          id: incident.id || Math.random().toString(36).substr(2, 9),
          description: incident.description || 'Accident signalé',
          severity: incident.severity || 'unknown',
          delay: incident.delay ? incident.delay.minutes : 0,
          coordinates: coordinates,
          from: incident.location?.from || '',
          to: incident.location?.to || '',
          roadNumbers: incident.roads || [],
          startTime: incident.timing?.start || 'Non spécifié'
        };
      })
      .filter(accident => accident.coordinates); // Garder seulement ceux avec coordonnées
    
    res.json({
      status: 'success',
      accidents: accidents,
      count: accidents.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des accidents TomTom pour Marseille:', error);
    res.status(500).json({ 
      status: 'error',
      message: `Erreur lors de la récupération des accidents TomTom: ${error.message}`
    });
  }
});

// Route pour récupérer uniquement les accidents TomTom pour Normandie
app.get('/api/tomtom/accidents/normandie', async (req, res) => {
  try {
    const trafficData = await tomTomService.getTrafficIncidents('Normandie', 'fr-FR');
    
    // Filtrer uniquement les accidents et véhicules en panne (iconCategory === 1 ou 14)
    const accidents = trafficData.incidents
      .filter(incident => isAccidentOrBreakdown(incident))
      .map(incident => {
        const geometry = incident.geometry;
        let coordinates = null;
        
        // Gérer les différents types de géométrie
        if (geometry && geometry.coordinates) {
          if (geometry.type === 'Point') {
            // Pour un point, prendre les coordonnées directement [lon, lat] -> [lat, lon]
            coordinates = [geometry.coordinates[1], geometry.coordinates[0]];
          } else if (geometry.type === 'LineString' && geometry.coordinates.length > 0) {
            // Pour une ligne, prendre le point central [lon, lat] -> [lat, lon]
            const midIndex = Math.floor(geometry.coordinates.length / 2);
            coordinates = [geometry.coordinates[midIndex][1], geometry.coordinates[midIndex][0]];
          }
        }
        
        return {
          id: incident.id || Math.random().toString(36).substr(2, 9),
          description: incident.description || 'Accident signalé',
          severity: incident.severity || 'unknown',
          delay: incident.delay ? incident.delay.minutes : 0,
          coordinates: coordinates,
          from: incident.location?.from || '',
          to: incident.location?.to || '',
          roadNumbers: incident.roads || [],
          startTime: incident.timing?.start || 'Non spécifié'
        };
      })
      .filter(accident => accident.coordinates); // Garder seulement ceux avec coordonnées
    
    res.json({
      status: 'success',
      accidents: accidents,
      count: accidents.length
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des accidents TomTom pour Normandie:', error);
    res.status(500).json({ 
      status: 'error',
      message: `Erreur lors de la récupération des accidents TomTom: ${error.message}`
    });
  }
});

// Fonction utilitaire pour filtrer les accidents et véhicules en panne
function isAccidentOrBreakdown(props) {
  if (!props) return false;
  if (props.iconCategory === 1 || props.iconCategory === 14) return true;
  return Array.isArray(props.events) && props.events.some(e => e.iconCategory === 1 || e.iconCategory === 14);
}

// Fonction pour formater le texte (même logique que testratp.js)
function formatText(text) {
    return text
        .replace(/&#233;/g, 'é')
        .replace(/&#160;/g, '')
        .replace(/&#224;/g, 'à')
        .replace(/&#232;/g, 'è')
        .replace(/&#234;/g, 'ê')
        .replace(/&#238;/g, 'î')
        .replace(/&#239;/g, 'ï')
        .replace(/&#244;/g, 'ô')
        .replace(/&#249;/g, 'ù')
        .replace(/&#8217;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/<p>/g, '')
        .replace(/<\/p>/g, '\n\n')
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/\n\s+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/<b><u>/g, '')
        .replace(/<\/u><\/b>/g, '')
        .replace(/<b>/g, '')
        .replace(/<\/b>/g, '')
        .trim();
}

// Fonction pour normaliser le nom de la ligne (même logique que testratp.js)
function normalizeLineNameForFlash(lineName) {
    if (!lineName) return '';
    
    lineName = lineName
        .replace(/Ratp métro/i, 'Métro')
        .replace(/Transilien train transilien/i, 'Transilien')
        .replace(/Batp bus/i, 'Bus');
    
    lineName = lineName.replace(/(RER|Transilien)\s+([a-z])/i, (match, type, letter) => {
        return `${type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()} ${letter.toUpperCase()}`;
    });
    
    return lineName;
}

// Route pour générer le flash trafic avec différents modèles IA
app.post('/api/generate-flash-traffic', async (req, res) => {
  try {
    // 1. Récupérer les données TomTom pour Paris (déjà filtrées et priorisées)
    const tomtomData = await tomTomService.getTrafficIncidents('Paris', 'fr-FR');
    
    // Les données sont déjà filtrées par le service amélioré
    const processedTomTom = {
      accidents: tomtomData.incidents.filter(i => i.iconCategory === 1),
      vehicleBreakdowns: tomtomData.incidents.filter(i => i.iconCategory === 14),
      majorTraffic: tomtomData.incidents.filter(i => i.iconCategory === 6 && i.delay.minutes >= 10),
      roadClosures: tomtomData.incidents.filter(i => (i.iconCategory === 8 || i.iconCategory === 7)),
      allIncidents: tomtomData.incidents
    };

    // 2. Récupérer les données RATP (même logique que testratp.js)
    const allDisruptions = {};
    const summaryData = [];
    const seenLines = new Set();
    const MAX_INCIDENTS_PER_CATEGORY = 10;
    const MAX_SUMMARY_ITEMS = 20;
    
    for (const [category, apiValue] of Object.entries(CATEGORIES)) {
        const disruptions = await fetchDisruptions(category, apiValue);
        const activeDisruptions = disruptions
            .filter(disruption => disruption.status === 'active')
            .map(disruption => ({
                id: disruption.id || '',
                cause: disruption.cause || 'Inconnue',
                severity: disruption.severity?.name || 'N/A',
                message: disruption.messages?.[0]?.text || 'Pas de message',
                impacted_lines: (disruption.impacted_objects || [])
                    .filter(obj => obj.pt_object?.embedded_type === 'line')
                    .map(obj => obj.pt_object?.name || 'Ligne inconnue')
            }))
            .filter(disruption => disruption.impacted_lines.length > 0)
            .slice(0, MAX_INCIDENTS_PER_CATEGORY);
        
        allDisruptions[category] = activeDisruptions;
    }

    for (const [category, disruptions] of Object.entries(allDisruptions)) {
        for (const d of disruptions) {
            for (const line of d.impacted_lines) {
                const normLine = normalizeLineNameForFlash(line);
                if (!seenLines.has(normLine) && summaryData.length < MAX_SUMMARY_ITEMS) {
                    summaryData.push({
                        category,
                        line: normLine,
                        cause: d.cause,
                        severity: d.severity,
                        message: formatText(d.message)
                            .split('\n')
                            .map(line => line.trim())
                            .filter(line => line.length > 0)
                            .join('\n')
                    });
                    seenLines.add(normLine);
                }
            }
        }
    }

    const ratpData = {
        metadata: {
            timestamp: new Date().toISOString(),
            source: 'API Île-de-France Mobilités',
            total_disruptions: summaryData.length
        },
        summary: summaryData,
        detailed: allDisruptions
    };

    // 3. Récupérer les paramètres de configuration depuis la requête
    const {
      model = 'claude',
      temperature = 0.7,
      top_p = 0.9,
      max_tokens = 400,
      custom_prompt = null
    } = req.body;
    
    console.log('📊 Config reçue:', { model, temp: temperature, topP: top_p, maxTokens: max_tokens, promptLength: custom_prompt?.length || 0 });

    // 4. Générer le flash trafic avec le modèle sélectionné
    const formatted = formatFullFrenchDate();

    // Construire le prompt avec remplacement des variables
    const dataString = `Incidents routiers TomTom : ${JSON.stringify(processedTomTom).slice(0, 8000)}\nPerturbations transports IDFM : ${JSON.stringify(ratpData).slice(0, 4000)}`;
    
    // Utiliser le prompt fourni, sinon un prompt par défaut minimal
    const promptTemplate = custom_prompt || `Voici les données de trafic en Île-de-France : {{data}}\nGénère un flash radio professionnel pour le {{date}}.`;
    
    console.log('🔍 Template utilisé:', custom_prompt ? 'PERSONNALISÉ' : 'PAR DÉFAUT');
    console.log('🔍 Template (50 premiers chars):', promptTemplate.substring(0, 50));
    
    const prompt = promptTemplate
      .replace(/\{\{data\}\}/g, dataString)
      .replace(/\{\{date\}\}/g, formatted);
      
    console.log('✅ Prompt final prêt, longueur:', prompt.length, 'caractères');
    console.log('🔍 Prompt final (100 premiers chars):', prompt.substring(0, 100));

    const options = {
      temperature,
      top_p,
      max_tokens
    };

    let flashText;
    let modelUsed;

    switch (model) {
      case 'claude':
        flashText = await anthropicService.generateFlashTraffic(prompt, options);
        modelUsed = 'Claude 3.7 Sonnet';
        break;
      case 'gpt4o':
        flashText = await openaiService.generateFlashTraffic(prompt, options);
        modelUsed = 'GPT-4o';
        break;
      case 'pixtral':
        flashText = await mistralService.generateFlashTraffic(prompt, options);
        modelUsed = 'Pixtral';
        break;
      default:
        throw new Error(`Modèle non supporté: ${model}`);
    }
    
    console.log('✅ Flash généré:', flashText.length, 'caractères avec', modelUsed);
    
    res.json({
      status: 'success',
      flash_traffic: flashText,
      model_used: modelUsed,
      data_sources: {
        tomtom: processedTomTom,
        ratp: ratpData
      }
    });

  } catch (error) {
    console.error('Erreur lors de la génération du flash trafic:', error);
    res.status(500).json({
      status: 'error',
      message: `Erreur lors de la génération du flash trafic: ${error.message}`
    });
  }
});

// Route de compatibilité GET pour l'ancien système (utilise Claude par défaut)
app.get('/api/generate-flash-traffic', async (req, res) => {
  try {
    // Simuler une requête POST avec les paramètres par défaut
    req.body = {
      model: 'claude',
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 400,
      api_key: null
    };
    
    // Rediriger vers le handler POST (on réutilise la même logique)
    return app._router.handle(Object.assign(req, { method: 'POST' }), res);
    
  } catch (error) {
    console.error('Erreur lors de la génération du flash trafic (route GET):', error);
    res.status(500).json({
      status: 'error',
      message: `Erreur lors de la génération du flash trafic: ${error.message}`
    });
  }
});

// Route pour générer le flash trafic Normandie (RSS MyAstuce + TomTom Rouen)
app.post('/api/generate-flash-traffic-normandie', async (req, res) => {
  try {
    // 1. Récupérer les données TomTom pour Rouen
    const tomtomData = await tomTomService.getTrafficIncidents('Rouen', 'fr-FR');
    
    const processedTomTom = {
      accidents: tomtomData.incidents.filter(i => i.iconCategory === 1),
      vehicleBreakdowns: tomtomData.incidents.filter(i => i.iconCategory === 14),
      majorTraffic: tomtomData.incidents.filter(i => i.iconCategory === 6 && i.delay.minutes >= 10),
      roadClosures: tomtomData.incidents.filter(i => (i.iconCategory === 8 || i.iconCategory === 7)),
      allIncidents: tomtomData.incidents
    };

    // 2. Récupérer les données RSS MyAstuce (perturbations transports Normandie)
    const normandieScraper = new NormandieRSSScraper();
    const normandieData = await normandieScraper.getPerturbations();

    // 3. Récupérer les paramètres de configuration
    const {
      model = 'claude',
      temperature = 0.7,
      top_p = 0.9,
      max_tokens = 400,
      custom_prompt = null
    } = req.body;
    
    console.log('📊 Config Normandie reçue:', { model, temp: temperature, topP: top_p, maxTokens: max_tokens });

    // 4. Construire le prompt avec les données Normandie
    const formatted = formatFullFrenchDate();
    const dataString = `Incidents routiers TomTom Rouen : ${JSON.stringify(processedTomTom).slice(0, 8000)}\nPerturbations transports MyAstuce : ${JSON.stringify(normandieData).slice(0, 4000)}`;
    
    const promptTemplate = custom_prompt || `Voici les données de trafic en Normandie (Rouen) : {{data}}\nGénère un flash radio professionnel pour le {{date}}.`;
    
    const prompt = promptTemplate
      .replace(/\{\{data\}\}/g, dataString)
      .replace(/\{\{date\}\}/g, formatted);

    console.log('✅ Prompt final prêt, longueur:', prompt.length, 'caractères');

    // 5. Générer avec le modèle IA sélectionné
    let flashTraffic;
    
    if (model === 'gpt4o') {
      flashTraffic = await openaiService.generateFlashTraffic(prompt, temperature, top_p, max_tokens);
    } else if (model === 'pixtral') {
      flashTraffic = await mistralService.generateFlashTraffic(prompt, temperature, top_p, max_tokens);
    } else {
      flashTraffic = await anthropicService.generateFlashTraffic(prompt, temperature, top_p, max_tokens);
    }

    console.log('✅ Flash Normandie généré:', flashTraffic.length, 'caractères avec', model);

    res.json({
      status: 'success',
      flash_traffic: flashTraffic,
      model_used: model,
      data_sources: {
        tomtom_incidents: processedTomTom.allIncidents.length,
        normandie_disruptions: normandieData.data ? Object.values(normandieData.data).flat().length : 0
      }
    });

  } catch (error) {
    console.error('❌ Erreur génération flash Normandie:', error);
    res.status(500).json({
      status: 'error',
      message: `Erreur lors de la génération du flash trafic Normandie: ${error.message}`
    });
  }
});

// Route pour générer le flash trafic Marseille (API RTM + TomTom Marseille)
app.post('/api/generate-flash-traffic-marseille', async (req, res) => {
  try {
    // 1. Récupérer les données TomTom pour Marseille
    const tomtomData = await tomTomService.getTrafficIncidents('Marseille', 'fr-FR');
    
    const processedTomTom = {
      accidents: tomtomData.incidents.filter(i => i.iconCategory === 1),
      vehicleBreakdowns: tomtomData.incidents.filter(i => i.iconCategory === 14),
      majorTraffic: tomtomData.incidents.filter(i => i.iconCategory === 6 && i.delay.minutes >= 10),
      roadClosures: tomtomData.incidents.filter(i => (i.iconCategory === 8 || i.iconCategory === 7)),
      allIncidents: tomtomData.incidents
    };

    // 2. Récupérer les données RTM (perturbations transports Marseille)
    let rtmData = { alertsToday: [], alertsComing: [] };
    try {
      const rtmResponse = await axios.get('https://api.rtm.fr/front/getAlertes/FR/All');
      if (rtmResponse.data && rtmResponse.data.data) {
        rtmData = {
          alertsToday: rtmResponse.data.data.AlertesToday || [],
          alertsComing: rtmResponse.data.data.AlertesComing || []
        };
      }
    } catch (rtmError) {
      console.warn('⚠️ Erreur RTM API:', rtmError.message);
    }

    // 3. Récupérer les paramètres de configuration
    const {
      model = 'claude',
      temperature = 0.7,
      top_p = 0.9,
      max_tokens = 400,
      custom_prompt = null
    } = req.body;
    
    console.log('📊 Config Marseille reçue:', { model, temp: temperature, topP: top_p, maxTokens: max_tokens });

    // 4. Construire le prompt avec les données Marseille
    const formatted = formatFullFrenchDate();
    const dataString = `Incidents routiers TomTom Marseille : ${JSON.stringify(processedTomTom).slice(0, 8000)}\nPerturbations transports RTM : ${JSON.stringify(rtmData).slice(0, 4000)}`;
    
    const promptTemplate = custom_prompt || `Voici les données de trafic à Marseille : {{data}}\nGénère un flash radio professionnel pour le {{date}}.`;
    
    const prompt = promptTemplate
      .replace(/\{\{data\}\}/g, dataString)
      .replace(/\{\{date\}\}/g, formatted);

    console.log('✅ Prompt final prêt, longueur:', prompt.length, 'caractères');

    // 5. Générer avec le modèle IA sélectionné
    let flashTraffic;
    
    if (model === 'gpt4o') {
      flashTraffic = await openaiService.generateFlashTraffic(prompt, temperature, top_p, max_tokens);
    } else if (model === 'pixtral') {
      flashTraffic = await mistralService.generateFlashTraffic(prompt, temperature, top_p, max_tokens);
    } else {
      flashTraffic = await anthropicService.generateFlashTraffic(prompt, temperature, top_p, max_tokens);
    }

    console.log('✅ Flash Marseille généré:', flashTraffic.length, 'caractères avec', model);

    res.json({
      status: 'success',
      flash_traffic: flashTraffic,
      model_used: model,
      data_sources: {
        tomtom_incidents: processedTomTom.allIncidents.length,
        rtm_alerts: rtmData.alertsToday.length + rtmData.alertsComing.length
      }
    });

  } catch (error) {
    console.error('❌ Erreur génération flash Marseille:', error);
    res.status(500).json({
      status: 'error',
      message: `Erreur lors de la génération du flash trafic Marseille: ${error.message}`
    });
  }
});

// Route POST pour enregistrer le feedback dans la base de données
app.post('/api/feedback', async (req, res) => {
  try {
    console.log('📥 Réception d\'un feedback');
    
    // Récupérer les données du feedback
    const feedbackData = req.body;
    
    // Ajouter les métadonnées de la requête
    feedbackData.ip_address = req.ip || req.connection.remoteAddress;
    feedbackData.user_agent = req.get('user-agent');
    
    // Validation basique
    if (!feedbackData.rating || feedbackData.rating < 1 || feedbackData.rating > 5) {
      return res.status(400).json({
        status: 'error',
        message: 'La note (rating) est obligatoire et doit être entre 1 et 5'
      });
    }
    
    // Insérer dans la base de données
    const result = await databaseService.insertFeedback(feedbackData);
    
    console.log(`✅ Feedback enregistré avec succès (ID: ${result.id})`);
    
    res.json({
      status: 'success',
      message: 'Feedback enregistré avec succès',
      id: result.id
    });
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement du feedback:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de l\'enregistrement du feedback',
      error: error.message
    });
  }
});

// Route GET pour récupérer les statistiques de feedback (optionnel)
app.get('/api/feedback/stats', async (req, res) => {
  try {
    const stats = await databaseService.getFeedbackStats();
    res.json({
      status: 'success',
      stats: stats
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des statistiques:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des statistiques',
      error: error.message
    });
  }
});

// Route pour récupérer les idées sorties à Paris
app.get('/api/paris/ideas', async (req, res) => {
  try {
    const ideas = await parisIdeasService.getParisIdeas();
    res.json({
      status: 'success',
      data: ideas
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des idées Paris:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des idées sorties',
      error: error.message
    });
  }
});

// Route pour récupérer les brocantes
app.get('/api/paris/brocantes', async (req, res) => {
  try {
    const brocantes = await brocantesService.getBrocantes();
    res.json({
      status: 'success',
      data: brocantes
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des brocantes:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des brocantes',
      error: error.message
    });
  }
});

// Route pour récupérer les musées
app.get('/api/paris/musees', async (req, res) => {
  try {
    const musees = await museesService.getMusees();
    res.json({
      status: 'success',
      data: musees
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des musées:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des musées',
      error: error.message
    });
  }
});

// Route pour récupérer les événements solidarité
app.get('/api/paris/solidarite', async (req, res) => {
  try {
    const solidarite = await solidariteService.getSolidarite();
    res.json({
      status: 'success',
      data: solidarite
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des événements solidarité:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des événements solidarité',
      error: error.message
    });
  }
});

// Route pour récupérer les marchés
app.get('/api/paris/marches', async (req, res) => {
  try {
    const marches = await marchesService.getMarches();
    res.json({
      status: 'success',
      data: marches
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des marchés:', error);
    res.status(500).json({
      status: 'error',
      message: 'Erreur lors de la récupération des marchés',
      error: error.message
    });
  }
});

// ============================================================
// Routes API Limoges
// ============================================================

// Route pour récupérer les événements OpenAgenda Limoges
app.get('/api/limoges/evenements', async (req, res) => {
  try {
    const events = await limogesService.getOpenAgendaEvents();
    res.json({ status: 'success', data: events });
  } catch (error) {
    console.error('❌ Erreur événements Limoges:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Route pour récupérer la météo de Limoges
app.get('/api/limoges/meteo', async (req, res) => {
  try {
    const meteo = await weatherService.getWeatherData('limoges');
    res.json({ status: 'success', data: meteo });
  } catch (error) {
    console.error('❌ Erreur météo Limoges:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Route pour récupérer le trafic TomTom pour Limoges
app.get('/api/limoges/trafic', async (req, res) => {
  try {
    const trafic = await tomTomService.getTrafficIncidents('limoges', 'fr-FR');
    res.json({ status: 'success', data: trafic });
  } catch (error) {
    console.error('❌ Erreur trafic Limoges:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Route pour récupérer la vigilance crues (Vigicrues)
app.get('/api/limoges/vigicrues', async (req, res) => {
  try {
    const vigicrues = await limogesService.getVigicruesData();
    res.json({ status: 'success', data: vigicrues });
  } catch (error) {
    console.error('❌ Erreur Vigicrues Limoges:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Route pour récupérer les travaux en cours à Limoges
app.get('/api/limoges/travaux', async (req, res) => {
  try {
    const travaux = await limogesService.getTravauxLimoges();
    res.json({ status: 'success', data: travaux });
  } catch (error) {
    console.error('❌ Erreur travaux Limoges:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Route pour récupérer les actualités de Limoges
app.get('/api/limoges/actualites', async (req, res) => {
  try {
    const actualites = await limogesService.getActualitesLimoges();
    res.json({ status: 'success', data: actualites });
  } catch (error) {
    console.error('❌ Erreur actualités Limoges:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Route pour récupérer la qualité de l'air à Limoges
app.get('/api/limoges/qualite-air', async (req, res) => {
  try {
    const airData = await limogesService.getQualiteAir();
    res.json({ status: 'success', data: airData });
  } catch (error) {
    console.error('❌ Erreur qualité air Limoges:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Route pour récupérer les trains SNCF à Limoges-Bénédictins
app.get('/api/limoges/trains', async (req, res) => {
  try {
    const trains = await limogesService.getTrainsLimoges();
    res.json({ status: 'success', data: trains });
  } catch (error) {
    console.error('❌ Erreur trains Limoges:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Route pour récupérer les brocantes/vide-greniers en Haute-Vienne
app.get('/api/limoges/brocantes', async (req, res) => {
  try {
    const brocantes = await limogesService.getBrocantesLimoges();
    res.json({ status: 'success', data: brocantes });
  } catch (error) {
    console.error('❌ Erreur brocantes Limoges:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Route pour récupérer les pharmacies de garde à Limoges
app.get('/api/limoges/pharmacies', async (req, res) => {
  try {
    const pharmacies = await limogesService.getPharmaciesGarde();
    res.json({ status: 'success', data: pharmacies });
  } catch (error) {
    console.error('❌ Erreur pharmacies Limoges:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Route pour récupérer les offres d'emploi de la Mairie de Limoges
app.get('/api/limoges/emploi', async (req, res) => {
  try {
    const emploi = await limogesService.getEmploiLimoges();
    res.json({ status: 'success', data: emploi });
  } catch (error) {
    console.error('❌ Erreur emploi Limoges:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/limoges/conseil-municipal', async (req, res) => {
  try {
    const data = await limogesService.getConseilMunicipalLimoges();
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================================
// ROUTES ICI EXPRESS (génération IA)
// ============================================================

app.get('/api/ici-express/formats', (req, res) => {
  const list = Object.entries(iciExpressService.FORMATS).map(([key, f]) => ({
    key,
    category: f.category,
    formatLetter: f.formatLetter || '',
    label: f.label,
    emoji: f.emoji,
    description: f.description,
    habillage: f.habillage
  }));
  res.json({ status: 'success', data: list });
});

app.get('/api/:city/ici-express/preview', async (req, res) => {
  try {
    const { city } = req.params;
    const { format } = req.query;
    if (!format) return res.status(400).json({ status: 'error', message: 'format requis' });
    const result = await iciExpressService.prepareIciExpress({ city, format });
    res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('❌ Erreur ici-express preview:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.post('/api/:city/ici-express', async (req, res) => {
  try {
    const { city } = req.params;
    const { format, model, customPrompt } = req.body || {};
    if (!format) return res.status(400).json({ status: 'error', message: 'format requis' });
    const result = await iciExpressService.generateIciExpress({
      city, format, model: model || 'claude', customPrompt: customPrompt || null
    });
    res.json({ status: 'success', data: result });
  } catch (error) {
    console.error('❌ Erreur ici-express:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ============================================================
// ROUTES API ROUEN
// ============================================================

app.get('/api/rouen/meteo', async (req, res) => {
  try {
    const meteo = await weatherService.getWeatherData('rouen');
    res.json({ status: 'success', data: meteo });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rouen/trafic', async (req, res) => {
  try {
    const trafic = await tomTomService.getTrafficIncidents('rouen', 'fr-FR');
    res.json({ status: 'success', data: trafic });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rouen/evenements', async (req, res) => {
  try {
    const events = await rouenService.getOpenAgendaEvents();
    res.json({ status: 'success', data: events });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rouen/vigicrues', async (req, res) => {
  try {
    const data = await rouenService.getVigicruesData();
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rouen/travaux', async (req, res) => {
  try {
    const data = await rouenService.getTravauxRouen();
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rouen/actualites', async (req, res) => {
  try {
    const actus = await rouenService.getActualitesRouen();
    res.json({ status: 'success', data: actus });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rouen/qualite-air', async (req, res) => {
  try {
    const data = await rouenService.getQualiteAir();
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rouen/trains', async (req, res) => {
  try {
    const data = await rouenService.getTrainsRouen();
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rouen/brocantes', async (req, res) => {
  try {
    const data = await rouenService.getBrocantesRouen();
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rouen/pharmacies', async (req, res) => {
  try {
    const data = await rouenService.getPharmaciesGarde();
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rouen/emploi', async (req, res) => {
  try {
    const data = await rouenService.getEmploiRouen();
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rouen/conseil-municipal', async (req, res) => {
  try {
    const data = await rouenService.getConseilMunicipalRouen();
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rouen/sorties', async (req, res) => {
  try {
    const data = await rouenService.getSortiesSeinoscope();
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rouen/france-travail', async (req, res) => {
  try {
    const data = await rouenService.getFranceTravailRouen();
    res.json({ status: 'success', data });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
