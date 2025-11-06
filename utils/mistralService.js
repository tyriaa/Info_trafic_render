/**
 * Service pour interagir avec l'API Mistral Pixtral
 * Pour le projet Info Trafic
 */

const axios = require('axios');

// Clé API depuis les variables d'environnement
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';

// Modèle Pixtral par défaut
const DEFAULT_MODEL = "pixtral-12b-2409";

/**
 * Génère un flash trafic avec Pixtral
 * @param {string} prompt - Le prompt contenant les données de trafic
 * @param {Object} options - Options de génération
 * @param {string} options.apiKey - Clé API Mistral
 * @param {number} options.temperature - Température (0-1)
 * @param {number} options.top_p - Top-P (0-1)
 * @param {number} options.max_tokens - Nombre maximum de tokens
 * @returns {Promise<string>} - Le flash trafic généré
 */
const generateFlashTraffic = async (prompt, options = {}) => {
  try {
    const {
      apiKey = MISTRAL_API_KEY,
      temperature = 0.7,
      top_p = 0.9,
      max_tokens = 400
    } = options;

    if (!apiKey) {
      throw new Error('Clé API Mistral requise pour utiliser Pixtral. Définissez MISTRAL_API_KEY dans votre fichier .env ou fournissez-la dans la configuration.');
    }

    const response = await axios.post('https://api.mistral.ai/v1/chat/completions', {
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: temperature,
      top_p: top_p,
      max_tokens: max_tokens
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (response.data && response.data.choices && response.data.choices[0]) {
      return response.data.choices[0].message.content;
    } else {
      throw new Error('Réponse invalide de l\'API Mistral');
    }
  } catch (error) {
    console.error('Erreur lors de la génération du flash trafic avec Pixtral:', error);
    
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error?.message || 'Erreur API Mistral';
      
      if (status === 401) {
        throw new Error('Clé API Mistral invalide ou expirée');
      } else if (status === 429) {
        throw new Error('Limite de taux API Mistral dépassée. Veuillez réessayer plus tard.');
      } else if (status === 400) {
        throw new Error(`Requête invalide: ${message}`);
      } else {
        throw new Error(`Erreur API Mistral (${status}): ${message}`);
      }
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Timeout de l\'API Mistral. Veuillez réessayer.');
    } else {
      throw error;
    }
  }
};

// Export des fonctions pour utilisation dans d'autres modules
module.exports = {
  generateFlashTraffic
};
