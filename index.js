const express = require('express');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const PerturbationScraper = require('./scrapers/lille_scraper');
const SNCFScraper = require('./scrapers/sncf_scraper');

const app = express();
const PORT = process.env.PORT || 3001;

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

// Fonction pour récupérer le code postal à partir des coordonnées
async function getPostalCode(lat, lon) {
    try {
        const response = await axios.get(`https://nominatim.openstreetmap.org/reverse`, {
            params: {
                format: 'json',
                lat: lat,
                lon: lon,
                zoom: 18
            },
            headers: {
                'User-Agent': 'Windsurf-Project/1.0'
            }
        });
        
        // Attendre 1 seconde pour respecter les limites de l'API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const address = response.data.address;
        return address.postcode || '';
    } catch (error) {
        console.error('Erreur lors de la récupération du code postal:', error);
        return '';
    }
}

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
        const sncfScraper = new SNCFScraper(SNCF_API_KEY);
        const schedules = await sncfScraper.getSchedules();
        res.json(schedules);
    } catch (error) {
        console.error('Error fetching train schedules:', error);
        res.status(500).json({ error: 'Failed to fetch train schedules' });
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
        ships_data.sort((a, b) => a.dateObj - b.dateObj);
        
        // Ne garder que les 5 premiers
        const limitedData = ships_data.slice(0, 5).map(ship => {
            const { dateObj, ...shipData } = ship; // Enlever dateObj avant d'envoyer
            return shipData;
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
        for (const station of infoResponse.data.data.stations) {
            stationInfoMap[station.station_id] = {
                name: station.name,
                lat: station.lat,
                lon: station.lon
            };
        }

        const unavailableStations = statusResponse.data.data.stations
            .filter(station => station.is_installed === 0);

        const stationsWithPostalCodes = await Promise.all(
            unavailableStations.map(async station => {
                const info = stationInfoMap[station.station_id];
                if (!info) return null;

                const postalCode = await getPostalCode(info.lat, info.lon);
                return {
                    name: info.name,
                    postalCode: postalCode
                };
            })
        );

        res.json(stationsWithPostalCodes.filter(station => station !== null));
    } catch (error) {
        console.error('Erreur lors de la récupération des stations Vélib:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
