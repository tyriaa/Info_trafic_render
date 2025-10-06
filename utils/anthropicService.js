/* eslint-disable no-undef */
/**
 * Service pour interagir avec l'API Anthropic Claude
 * Pour le projet Info Trafic
 */

// Import des dépendances
const { Anthropic } = require('@anthropic-ai/sdk');

// Clé API depuis les variables d'environnement
const API_KEY = process.env.ANTHROPIC_API_KEY || '';

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
 * @returns {Promise<string>} - Le flash trafic généré
 */
const generateFlashTraffic = async (prompt) => {
  try {
    if (!API_KEY) {
      throw new Error('Clé API Anthropic non configurée. Définissez ANTHROPIC_API_KEY dans votre fichier .env');
    }

    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 400,
      messages: [
        { role: "user", content: prompt }
      ]
    });

    return response.content[0].text;
  } catch (error) {
    console.error('Erreur lors de la génération du flash trafic:', error);
    throw error;
  }
};

// Export des fonctions pour utilisation dans d'autres modules
module.exports = {
  generateFlashTraffic
};
