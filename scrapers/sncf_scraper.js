const axios = require('axios');

class SNCFScraper {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.stations = {
            'Lille Europe': 'stop_point:SNCF:87223263:Train',
            'Lille Flandres': 'stop_point:SNCF:87286005:Train',
            'Gare de Rouen-Rive-Droite': 'stop_point:SNCF:87411017:Train' // Ajout de la gare de Rouen
        };
    }

    async getSchedules() {
        const allSchedules = {};
        
        for (const [stationName, stationId] of Object.entries(this.stations)) {
            try {
                const departures = await this.getStationSchedules(stationId, 'departures');
                const arrivals = await this.getStationSchedules(stationId, 'arrivals');
                allSchedules[stationName] = {
                    departures,
                    arrivals
                };
            } catch (error) {
                console.error(`Error fetching schedules for ${stationName}:`, error);
                allSchedules[stationName] = {
                    departures: [],
                    arrivals: []
                };
            }
        }
        
        return allSchedules;
    }

    async getStationSchedules(stationId, type) {
        const url = `https://api.sncf.com/v1/coverage/sncf/stop_points/${stationId}/${type}`;
        
        try {
            const response = await axios.get(url, {
                headers: {
                    'Authorization': this.apiKey
                }
            });

            const schedules = response.data[type].map(schedule => {
                const scheduleTime = schedule.stop_date_time[`${type === 'departures' ? 'departure' : 'arrival'}_date_time`];
                const direction = schedule.display_informations.direction;
                const lineCode = schedule.display_informations.code;
                const lineType = schedule.display_informations.commercial_mode;
                const trainNumber = schedule.display_informations.headsign;
                const finalDestination = schedule.route?.direction?.name || direction;

                // Convert time from "YYYYMMDDTHHmmss" to "HH:mm"
                const time = scheduleTime.substring(9, 11) + ':' + scheduleTime.substring(11, 13);

                return {
                    time,
                    direction: type === 'arrivals' ? `${lineCode} → ${finalDestination}` : direction,
                    type: lineType,
                    train_number: trainNumber
                };
            });

            return schedules;

        } catch (error) {
            console.error(`Error fetching station ${type}:`, error);
            throw error;
        }
    }
}

module.exports = SNCFScraper;
