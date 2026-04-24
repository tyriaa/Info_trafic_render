const axios = require('axios');

const BASE_URL = "https://parisdata.opendatasoft.com/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records";

class SolidariteService {
    cleanHtml(text) {
        if (!text) return '';
        
        let cleaned = text.toString();
        cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
        cleaned = cleaned.replace(/<\/p\s*>/gi, '\n');
        cleaned = cleaned.replace(/<[^>]+>/g, '');
        cleaned = cleaned.replace(/\n\s*\n+/g, '\n');
        
        return cleaned.trim();
    }

    async getSolidarite() {
        try {
            const response = await axios.get(BASE_URL, {
                params: {
                    refine: 'qfap_tags:Solidarité',
                    limit: 100
                },
                timeout: 30000
            });

            const data = response.data;
            const results = data.results || [];

            const events = results.map(item => {
                const name = (item.title || '').trim();
                const description = this.cleanHtml(item.description || '');
                const dateText = this.cleanHtml(item.date_description || '');
                
                const city = (item.address_city || '').trim();
                const postalCode = (item.address_zipcode || '').toString().trim();
                const place = (item.address_name || '').trim();
                const address = (item.address_street || '').trim();
                const link = (item.url || '').trim();

                // Construire le lieu complet
                const locationParts = [place, address, postalCode, city].filter(part => part);
                const location = locationParts.join(', ');

                return {
                    title: name,
                    when: dateText,
                    place: location || 'Lieu non précisé',
                    description: description,
                    url: link,
                    date_start: item.date_start || null
                };
            });

            // Trier par date de début (du plus récent au plus lointain)
            events.sort((a, b) => {
                if (!a.date_start) return 1;
                if (!b.date_start) return -1;
                return new Date(a.date_start) - new Date(b.date_start);
            });

            return events;
        } catch (error) {
            console.error('Erreur lors de la récupération des événements solidarité:', error);
            throw error;
        }
    }
}

module.exports = new SolidariteService();
