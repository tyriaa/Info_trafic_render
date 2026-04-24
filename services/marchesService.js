const axios = require('axios');
const cheerio = require('cheerio');

const URL = "https://www.paris.fr/pages/les-marches-parisiens-2428";

class MarchesService {
    cleanText(text) {
        if (!text) return '';
        return text.replace(/\s+/g, ' ').trim();
    }

    getCurrentAndNextDay() {
        const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const now = new Date();
        const today = days[now.getDay()];
        const tomorrow = days[(now.getDay() + 1) % 7];
        
        return { today, tomorrow };
    }

    async getMarches() {
        try {
            const response = await axios.get(URL, {
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 30000
            });

            const $ = cheerio.load(response.data);
            const results = [];

            // Parcourir chaque jour (accordéon)
            $('.accordion-header').each((i, header) => {
                const dayTitle = this.cleanText($(header).find('.accordion-header-title').text());
                
                // Vérifier si c'est un jour de la semaine
                const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
                const currentDay = days.find(d => dayTitle.toLowerCase() === d.toLowerCase());
                
                if (!currentDay) return;

                // Trouver le panneau correspondant
                const buttonId = $(header).find('button').attr('id');
                const panelId = $(header).find('button').attr('aria-controls');
                const panel = $(`#${panelId}`);
                
                if (!panel.length) return;

                // Récupérer le HTML du panneau
                const panelHtml = panel.html();
                
                // Parser le contenu du panneau
                let currentDistrict = '';
                const lines = panelHtml.split('<br>');
                
                for (let j = 0; j < lines.length; j++) {
                    const line = lines[j];
                    const lineText = this.cleanText($('<div>').html(line).text());
                    
                    // Détecter arrondissement
                    if (line.includes('<strong>') && lineText.includes('arrondissement')) {
                        currentDistrict = lineText;
                        continue;
                    }
                    
                    // Détecter marché (lien <a>)
                    if (line.includes('<a href=') && lineText.startsWith('Marché')) {
                        const name = lineText;
                        let address = '';
                        let hours = '';
                        let metro = '';
                        
                        // Regarder les 5 lignes suivantes pour extraire les infos
                        for (let k = j + 1; k < Math.min(j + 6, lines.length); k++) {
                            const nextLine = this.cleanText($('<div>').html(lines[k]).text());
                            
                            if (!nextLine || nextLine.includes('arrondissement') || nextLine.startsWith('Marché')) {
                                break;
                            }
                            
                            const low = nextLine.toLowerCase();
                            if (low.startsWith('de ') || low.includes('sans interruption') || low.match(/\d+h\d*/)) {
                                hours = nextLine;
                            } else if (low.startsWith('métro') || low.startsWith('metro')) {
                                metro = nextLine.replace(/Métro\s*:\s*/gi, '').replace(/Metro\s*:\s*/gi, '').trim();
                            } else if (!address && nextLine.length > 3) {
                                address = nextLine;
                            }
                        }
                        
                        results.push({
                            day: currentDay,
                            district: currentDistrict,
                            name: name,
                            address: address,
                            hours: hours,
                            metro: metro
                        });
                    }
                }
            });

            // Filtrer pour ne garder que J0 et J+1
            const { today, tomorrow } = this.getCurrentAndNextDay();
            const filteredResults = results.filter(market => 
                market.day === today || market.day === tomorrow
            );

            // Grouper par arrondissement
            const groupedByDistrict = {};
            
            filteredResults.forEach(market => {
                const district = market.district || 'Autres';
                
                if (!groupedByDistrict[district]) {
                    groupedByDistrict[district] = [];
                }
                
                groupedByDistrict[district].push({
                    name: market.name,
                    day: market.day,
                    hours: market.hours,
                    address: market.address,
                    metro: market.metro
                });
            });

            // Convertir en tableau et trier par numéro d'arrondissement
            const districtArray = Object.keys(groupedByDistrict).map(district => ({
                district: district,
                markets: groupedByDistrict[district]
            }));

            // Trier par numéro d'arrondissement (extraire le numéro du début)
            districtArray.sort((a, b) => {
                const numA = parseInt(a.district.match(/^\d+/)) || 999;
                const numB = parseInt(b.district.match(/^\d+/)) || 999;
                return numA - numB;
            });

            return districtArray;

        } catch (error) {
            console.error('Erreur lors de la récupération des marchés:', error);
            throw error;
        }
    }
}

module.exports = new MarchesService();
