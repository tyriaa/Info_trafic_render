const axios = require('axios');
require('dotenv').config();

const VELIB_API_KEY = 'gBjXYn00A5pYSKXoaq3VD6HpsNBASEyq';
const VELIB_API_URL = 'https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json';

async function testAPI() {
    try {
        console.log('Test de l\'API Vélib...');
        const response = await axios.get(VELIB_API_URL);
        console.log('Structure de la réponse:', Object.keys(response.data));
        console.log('Structure de data:', Object.keys(response.data.data));
        console.log('Nombre de stations:', response.data.data.stations.length);
        console.log('Première station:', response.data.data.stations[0]);
        return true;
    } catch (error) {
        console.error('Erreur lors du test:', error.message);
        if (error.response) {
            console.error('Détails de l\'erreur:', error.response.data);
        }
        return false;z
    }
}

async function getUnavailableStations() {
    try {
        // Test de l'API d'abord
        const apiTest = await testAPI();
        if (!apiTest) {
            console.error('Test de l\'API échoué');
            return [];
        }

        console.log('Récupération des données Vélib...');
        const response = await axios.get(VELIB_API_URL, {
            headers: {
                'accept': 'application/json',
                'apiKey': VELIB_API_KEY
            }
        });

        if (!response.data || !response.data.data || !response.data.data.stations) {
            console.error('Format de réponse invalide:', response.data);
            return [];
        }

        const stations = response.data.data.stations;
        console.log(`Total des stations: ${stations.length}`);

        const unavailableStations = stations.filter(station => {
            const isUnavailable = station.is_installed === 0 || station.is_renting === 0;
            if (isUnavailable) {
                console.log('Station indisponible trouvée:', station);
            }
            return isUnavailable;
        });

        console.log(`Stations indisponibles trouvées: ${unavailableStations.length}`);

        return unavailableStations.map(station => ({
            stationId: station.station_id,
            name: `Station ${station.station_id}`,
            status: {
                isInstalled: station.is_installed,
                isRenting: station.is_renting,
                isReturning: station.is_returning,
                numBikesAvailable: station.num_bikes_available,
                numDocksAvailable: station.num_docks_available,
                bikesDetails: station.num_bikes_available_types[0] || { mechanical: 0, ebike: 0 }
            }
        }));
    } catch (error) {
        console.error('Erreur détaillée lors de la récupération des stations Vélib:', error.response ? error.response.data : error.message);
        return [];
    }
}

// Exécuter le test au démarrage
testAPI().then(success => {
    console.log('Test initial de l\'API:', success ? 'réussi' : 'échoué');
});

module.exports = {
    getUnavailableStations,
    testAPI
};
