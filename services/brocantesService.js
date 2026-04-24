const axios = require('axios');
const xml2js = require('xml2js');

const RSS_URL = "https://www.inoreader.com/stream/user/1003760131/tag/ICI%20Express";

class BrocantesService {
    constructor() {
        this.parser = new xml2js.Parser({
            explicitArray: false,
            trim: true
        });
    }

    parseTitle(title) {
        title = title.trim();

        // Pattern: "Nom - Ville (75005) - Du 20 au 22 mars 2026"
        const pattern = /^(.*?)\s*-\s*(.*?)\s*\((\d{5})\)\s*-\s*(.*)$/;
        const match = title.match(pattern);

        if (match) {
            return {
                name: match[1].trim(),
                city: match[2].trim(),
                postal_code: match[3].trim(),
                date_text: match[4].trim()
            };
        }

        // Fallback si le titre est incomplet
        return {
            name: title,
            city: '',
            postal_code: '',
            date_text: ''
        };
    }

    async getBrocantes() {
        try {
            const response = await axios.get(RSS_URL, {
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 20000
            });

            const result = await this.parser.parseStringPromise(response.data);
            
            if (!result.rss || !result.rss.channel || !result.rss.channel.item) {
                return [];
            }

            const items = Array.isArray(result.rss.channel.item) 
                ? result.rss.channel.item 
                : [result.rss.channel.item];

            const brocantes = items.map(item => {
                const title = item.title || '';
                const link = item.link || '';
                const parsed = this.parseTitle(title);

                return {
                    title: parsed.name,
                    city: parsed.city,
                    postal_code: parsed.postal_code,
                    when: parsed.date_text,
                    url: link,
                    place: parsed.city ? `${parsed.city} (${parsed.postal_code})` : 'Lieu non précisé'
                };
            });

            return brocantes;
        } catch (error) {
            console.error('Erreur lors de la récupération des brocantes:', error);
            throw error;
        }
    }
}

module.exports = new BrocantesService();
