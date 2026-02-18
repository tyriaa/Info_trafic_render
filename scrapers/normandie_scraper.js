const axios = require('axios');
const xml2js = require('xml2js');
const puppeteer = require('puppeteer');

class NormandieRSSScraper {
    constructor() {
        this.rssUrl = 'https://www.myastuce.fr/fr/rss/rss-feed/disruptions';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Referer': 'https://www.myastuce.fr/',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin'
        };
    }

    /**
     * Extrait le type de transport et le numéro de ligne à partir du titre de l'item RSS
     * @param {string} title - Le titre de l'item RSS
     * @returns {Object} - Objet contenant le type de transport et le numéro de ligne
     */
    extractLineInfo(title) {
        const lowerTitle = title.toLowerCase();
        let lineType = 'bus'; // Par défaut
        let lineNumber = '';

        // Détecter le métro
        if (lowerTitle.includes('metro') || lowerTitle.includes('métro') || lowerTitle.includes(' m ') || lowerTitle.includes('ascenseur')) {
            lineType = 'metro';
            const match = lowerTitle.match(/m(?:étro|etro)?\s*([0-9]+)?/);
            lineNumber = match && match[1] ? match[1] : 'M';
        } 
        // Détecter le TEOR (T1, T2, T3, T4, T5)
        else if (lowerTitle.match(/\bt[1-5]\b/) || lowerTitle.includes('teor')) {
            lineType = 'teor';
            const match = lowerTitle.match(/\b(t[1-5])\b/);
            lineNumber = match ? match[1].toUpperCase() : '';
        } 
        // Tout le reste est considéré comme bus
        else {
            lineType = 'bus';
            // Extraire le premier numéro ou code de ligne trouvé au début du titre
            // Formats possibles : "14-20", "F1-20-305", "filo'r 5", "Ligne 201", "42-315", etc.
            const patterns = [
                /^([0-9]{1,3}(?:-[0-9]{1,3})*)/,  // 14-20, 42-315, 301-322-342
                /^(f[0-9]+(?:-[0-9]+)*)/i,         // F1-20-305, F7-41, F3-310-311
                /^(filo'r\s*[0-9]+)/i,             // filo'r 5, filo'r 3
                /^(l[0-9]+)/i,                     // L526, L201
                /ligne\s+([0-9]+)/i                // Ligne 201, Ligne 42
            ];
            
            for (const pattern of patterns) {
                const match = title.match(pattern);
                if (match && match[1]) {
                    lineNumber = match[1];
                    break;
                }
            }
            
            // Si aucun pattern ne correspond, prendre les premiers caractères avant ":"
            if (!lineNumber) {
                const match = title.match(/^([^:]+)/);
                if (match) {
                    lineNumber = match[1].trim().substring(0, 20);
                }
            }
        }

        return {
            type: lineType,
            line: lineNumber
        };
    }

    /**
     * Extraction de la date de mise à jour à partir du contenu
     * @param {string} content - Le contenu de l'item RSS
     * @returns {string} - La date de mise à jour formatée
     */
    extractUpdateDate(content) {
        // Cherche une date dans le format "Mis à jour le JJ/MM/YYYY à HH:MM"
        const dateRegex = /mis à jour le (\d{2}\/\d{2}\/\d{4}) à (\d{2}:\d{2})/i;
        const match = content.match(dateRegex);
        
        if (match) {
            return `${match[1]} ${match[2]}`;
        }
        
        // Sinon, utiliser la date actuelle
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    /**
     * Extraction des dates de début et fin de la perturbation
     * @param {string} content - Le contenu de l'item RSS
     * @returns {Object} - Les dates de début et fin formatées
     */
    extractDateRange(content) {
        // Cherche une plage de dates dans le format "du JJ/MM/YYYY au JJ/MM/YYYY"
        const dateRangeRegex = /du (\d{2}\/\d{2}\/\d{4}) au (\d{2}\/\d{2}\/\d{4})/i;
        const match = content.match(dateRangeRegex);
        
        if (match) {
            return {
                start_date: match[1],
                end_date: match[2]
            };
        }
        
        return {
            start_date: null,
            end_date: null
        };
    }

    /**
     * Récupère le flux RSS avec Puppeteer pour contourner la protection anti-scraping
     * @returns {Promise<string>} - Le contenu XML du flux RSS
     */
    async fetchRSSWithPuppeteer() {
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            
            // Configurer le User-Agent
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // Naviguer vers le flux RSS
            await page.goto(this.rssUrl, { waitUntil: 'networkidle0', timeout: 30000 });
            
            // Attendre un peu pour que le contenu se charge
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Essayer de récupérer le texte brut de la page (pour les flux RSS affichés en texte)
            const bodyText = await page.evaluate(() => {
                // Si le contenu est dans un <pre> ou directement dans le body
                const pre = document.querySelector('pre');
                if (pre) {
                    return pre.textContent;
                }
                return document.body.textContent;
            });
            
            // Si le texte commence par <?xml, c'est probablement du XML
            if (bodyText.trim().startsWith('<?xml')) {
                await browser.close();
                return bodyText;
            }
            
            // Sinon retourner le HTML complet
            const content = await page.content();
            await browser.close();
            return content;
        } catch (error) {
            if (browser) {
                await browser.close();
            }
            throw error;
        }
    }

    /**
     * Récupère les perturbations du réseau Astuce via le flux RSS
     * @returns {Promise<Object>} - Les perturbations groupées par type de transport
     */
    async getPerturbations() {
        try {
            // Essayer d'abord avec axios (plus rapide)
            let responseData;
            try {
                const response = await axios.get(this.rssUrl, { 
                    headers: this.headers,
                    timeout: 10000,
                    responseType: 'text'
                });
                responseData = response.data;
            } catch (fetchError) {
                console.log('⚠️ Échec avec axios, tentative avec Puppeteer...');
                responseData = null;
            }

            // Si axios retourne du HTML ou échoue, utiliser Puppeteer
            if (!responseData || responseData.includes('<app-root>') || responseData.includes('<!DOCTYPE html>')) {
                console.log('🤖 Utilisation de Puppeteer pour contourner la protection anti-scraping...');
                try {
                    responseData = await this.fetchRSSWithPuppeteer();
                } catch (puppeteerError) {
                    console.error('❌ Échec avec Puppeteer:', puppeteerError.message);
                    return this.getFallbackData();
                }
            }

            // Vérifier si on a bien du XML maintenant
            if (responseData.includes('<app-root>') || responseData.includes('<!DOCTYPE html>')) {
                console.log('⚠️ Le flux RSS retourne toujours du HTML');
                return this.getFallbackData();
            }

            // Si on reçoit du XML valide, le parser
            const cleanXmlData = responseData
                .replace(/&(?![a-zA-Z0-9#]{1,7};)/g, '&amp;')
                .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
                .replace(/&([^;]+)=([^;]*);/g, '&amp;$1=$2;');

            const parser = new xml2js.Parser({ 
                explicitArray: false,
                sanitizeText: true,
                trim: true
            });
            
            let result;
            try {
                result = await parser.parseStringPromise(cleanXmlData);
            } catch (parseError) {
                console.error('Erreur lors de l\'analyse XML:', parseError);
                return this.getFallbackData();
            }

            if (!result.rss || !result.rss.channel || !result.rss.channel.item) {
                console.log('Aucune perturbation trouvée dans le flux RSS');
                return this.getFallbackData();
            }
            
            const items = Array.isArray(result.rss.channel.item) 
                ? result.rss.channel.item 
                : [result.rss.channel.item];
            
            const disruptions = {
                metro: [],
                teor: [],
                bus: []
            };
            
            const processedLines = new Map();
            
            for (const item of items) {
                const title = item.title;
                const description = item.description;
                const link = item.link;
                const pubDate = item.pubDate || '';
                
                const lineInfo = this.extractLineInfo(title);
                const updateTime = this.extractUpdateDate(description);
                const dateRange = this.extractDateRange(description);
                
                if (!lineInfo.line) {
                    continue;
                }
                
                const lineId = `${lineInfo.type}_${lineInfo.line}`;
                
                if (!processedLines.has(lineId)) {
                    const disruptionObj = {
                        line: lineInfo.line,
                        line_type: `${lineInfo.type}_lines`,
                        alerts: [{
                            title: title,
                            description: this.cleanDescription(description),
                            link: link,
                            publication_date: pubDate,
                            update_time: updateTime,
                            start_date: dateRange.start_date,
                            end_date: dateRange.end_date
                        }]
                    };
                    
                    if (disruptions[lineInfo.type]) {
                        disruptions[lineInfo.type].push(disruptionObj);
                    }
                    
                    processedLines.set(lineId, disruptionObj);
                } else {
                    const existingDisruption = processedLines.get(lineId);
                    if (existingDisruption) {
                        existingDisruption.alerts.push({
                            title: title,
                            description: this.cleanDescription(description),
                            link: link,
                            publication_date: pubDate,
                            update_time: updateTime,
                            start_date: dateRange.start_date,
                            end_date: dateRange.end_date
                        });
                    }
                }
            }
            
            if (Object.values(disruptions).every(arr => arr.length === 0)) {
                console.log('Aucune perturbation trouvée après traitement');
                return this.getFallbackData();
            }
            
            return disruptions;
        } catch (error) {
            console.error('Erreur lors de la récupération des perturbations:', error);
            return this.getFallbackData();
        }
    }
    
    /**
     * Nettoie la description en supprimant les balises HTML
     * @param {string} description - Description contenant du HTML
     * @returns {string} - Description nettoyée
     */
    cleanDescription(description) {
        if (!description) return '';
        // Supprimer les balises HTML
        return description.replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    /**
     * Retourne des données de secours en cas d'erreur
     * @returns {Object} - Données de secours vides
     */
    getFallbackData() {
        console.log('⚠️ Erreur lors de la récupération des perturbations MyAstuce');
        console.log('Retour de données vides');
        
        return {
            metro: [],
            teor: [],
            bus: []
        };
    }
}

module.exports = NormandieRSSScraper;
