const axios = require('axios');

const API_URL = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records?limit=100&refine=group%3A%22Mus%C3%A9es%22";

class MuseesService {
    async getMusees() {
        try {
            const response = await axios.get(API_URL, {
                timeout: 20000
            });

            const data = response.data;
            const results = data.results || [];

            const musees = results.map(item => {
                const name = (item.title || '').trim();
                const dateText = (item.date_description || '').replace(/<br\s*\/?>/g, ' ').trim();

                const locationName = (item.address_name || '').trim();
                const address = (item.address_street || '').trim();
                const city = (item.address_city || '').trim();
                const postalCode = (item.address_zipcode || '').trim();

                const locationParts = [locationName, address, postalCode, city].filter(part => part);
                const location = locationParts.join(', ');

                return {
                    title: name,
                    when: dateText.replace(/\s+/g, ' '),
                    place: location || 'Lieu non précisé',
                    price: item.price_type || 'Tarif non précisé',
                    url: item.url || '',
                    date_start: item.date_start || null
                };
            });

            // Trier par date de début (du plus récent au plus lointain)
            musees.sort((a, b) => {
                if (!a.date_start) return 1;
                if (!b.date_start) return -1;
                return new Date(a.date_start) - new Date(b.date_start);
            });

            return musees;
        } catch (error) {
            console.error('Erreur lors de la récupération des musées:', error);
            throw error;
        }
    }
}

module.exports = new MuseesService();
