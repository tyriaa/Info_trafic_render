const axios = require('axios');
const cheerio = require('cheerio');

class PerturbationScraper {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };
        this.url = 'https://mobilille.fr/se-deplacer/info-trafic/';
    }

    async getPerturbations() {
        try {
            const response = await axios.get(this.url, { headers: this.headers });
            const $ = cheerio.load(response.data);
            
            const perturbations = [];
            
            // Trouver toutes les boîtes de perturbation
            $('.infotrafic-mobile-box').each((i, box) => {
                const $box = $(box);
                const lineNumber = $box.find('.line-name').text().replace('Ligne ', '').trim();
                const state = $box.find('.state').text().trim();
                
                // Ne traiter que les lignes perturbées
                if (state.includes('Trafic perturbé')) {
                    const offcanvasId = $box.attr('href')?.replace('#', '');
                    const details = [];
                    
                    // Récupérer les détails dans l'offcanvas correspondant
                    if (offcanvasId) {
                        $(`#${offcanvasId} .info_box_container`).each((j, infoBox) => {
                            const $infoBox = $(infoBox);
                            const title = $infoBox.find('h4').text().trim();
                            const text = $infoBox.find('.info_box_text').text().trim();
                            const updateTime = $infoBox.find('span').text().replace('Mis à jour le ', '').trim();
                            
                            // Extraire les dates et la description
                            const dateRegex = /Du (\d{2}\/\d{2}\/\d{4}) au (\d{2}\/\d{2}\/\d{4})/;
                            const dateMatch = text.match(dateRegex);
                            
                            details.push({
                                title: title,
                                description: text.split('Mis à jour le')[0].trim(),
                                start_date: dateMatch?.[1] || null,
                                end_date: dateMatch?.[2] || null,
                                update_time: updateTime
                            });
                        });
                    }
                    
                    // Déterminer le type de transport
                    let type = 'bus';
                    if (lineNumber.includes('M')) {
                        type = 'metro';
                    } else if (lineNumber.includes('T')) {
                        type = 'tramway';
                    }
                    
                    perturbations.push({
                        line: lineNumber,
                        line_type: type + '_lines',
                        alerts: details
                    });
                }
            });
            
            // Grouper par type de transport
            const grouped = {
                metro: perturbations.filter(p => p.line_type === 'metro_lines'),
                tramway: perturbations.filter(p => p.line_type === 'tram_lines'),
                bus: perturbations.filter(p => p.line_type === 'bus_lines')
            };
            
            return grouped;
            
        } catch (error) {
            console.error("Erreur lors de la récupération des perturbations:", error);
            return {
                metro: [],
                tramway: [],
                bus: []
            };
        }
    }
}

module.exports = PerturbationScraper;
