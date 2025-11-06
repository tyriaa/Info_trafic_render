/* eslint-disable no-undef */
/**
 * Service pour interagir avec l'API Anthropic Claude
 * Pour le projet Info Trafic
 */

// Import des dépendances
const { Anthropic } = require('@anthropic-ai/sdk');

// Clé API depuis les variables d'environnement
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
console.log('ANTHROPIC_API_KEY chargée:', API_KEY ? 'OUI' : 'NON');
console.log('Longueur de la clé:', API_KEY.length);

// Initialisation du client Anthropic
const anthropic = new Anthropic({
  apiKey: API_KEY
});

// Modèle Claude par défaut 
const DEFAULT_MODEL = "claude-3-7-sonnet-20250219";

// Fonctions supprimées car non utilisées :
// - generateResponse()
// - generateWithSystemPrompt() 
// - checkClaudeAvailability()

/**
 * Génère un flash trafic avec Claude
 * @param {string} prompt - Le prompt contenant les données de trafic
 * @param {Object} options - Options de génération
 * @param {string} options.apiKey - Clé API Anthropic (optionnel si configurée dans .env)
 * @param {number} options.temperature - Température (0-1)
 * @param {number} options.top_p - Top-P (0-1)
 * @param {number} options.max_tokens - Nombre maximum de tokens
 * @returns {Promise<string>} - Le flash trafic généré
 */
const generateFlashTraffic = async (prompt, options = {}) => {
  try {
    const {
      apiKey = API_KEY,
      temperature = 0.7,
      top_p = 0.9,
      max_tokens = 400
    } = options;

    if (!apiKey) {
      throw new Error('Clé API Anthropic non configurée. Définissez ANTHROPIC_API_KEY dans votre fichier .env ou fournissez-la dans la configuration.');
    }

    // Créer un client avec la clé API fournie si différente de celle par défaut
    const clientToUse = apiKey === API_KEY ? anthropic : new Anthropic({ apiKey });

    const response = await clientToUse.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: max_tokens,
      temperature: temperature,
      top_p: top_p,
      messages: [
        { role: "user", content: prompt }
      ]
    });

    const generatedText = response.content[0].text;
    console.log('Réponse Claude - Longueur:', generatedText.length);
    console.log('Réponse Claude - Fin:', generatedText.slice(-50));
    console.log('Réponse Claude - Stop reason:', response.stop_reason);
    return generatedText;
  } catch (error) {
    console.error('Erreur lors de la génération du flash trafic:', error);
    
    // Gestion des erreurs spécifiques à Anthropic
    if (error.status === 401) {
      throw new Error('Clé API Anthropic invalide ou expirée');
    } else if (error.status === 429) {
      throw new Error('Limite de taux API Anthropic dépassée. Veuillez réessayer plus tard.');
    } else if (error.status === 400) {
      throw new Error(`Requête invalide: ${error.message}`);
    } else {
      throw error;
    }
  }
};

// Export des fonctions pour utilisation dans d'autres modules
module.exports = {
  generateFlashTraffic
};
