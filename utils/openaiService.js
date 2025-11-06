/**
 * Service pour interagir avec l'API OpenAI GPT-4o
 * Pour le projet Info Trafic
 */

const axios = require('axios');

// Clé API depuis les variables d'environnement
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Modèle GPT-4o par défaut
const DEFAULT_MODEL = "gpt-4o";

/**
 * Génère un flash trafic avec GPT-4o
 * @param {string} prompt - Le prompt contenant les données de trafic
 * @param {Object} options - Options de génération
 * @param {string} options.apiKey - Clé API OpenAI
 * @param {number} options.temperature - Température (0-1)
 * @param {number} options.top_p - Top-P (0-1)
 * @param {number} options.max_tokens - Nombre maximum de tokens
 * @returns {Promise<string>} - Le flash trafic généré
 */
const generateFlashTraffic = async (prompt, options = {}) => {
  try {
    const {
      apiKey = OPENAI_API_KEY,
      temperature = 0.7,
      top_p = 0.9,
      max_tokens = 400
    } = options;

    if (!apiKey) {
      throw new Error('Clé API OpenAI requise pour utiliser GPT-4o. Définissez OPENAI_API_KEY dans votre fichier .env ou fournissez-la dans la configuration.');
    }

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
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
      throw new Error('Réponse invalide de l\'API OpenAI');
    }
  } catch (error) {
    console.error('Erreur lors de la génération du flash trafic avec GPT-4o:', error);
    
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error?.message || 'Erreur API OpenAI';
      
      if (status === 401) {
        throw new Error('Clé API OpenAI invalide ou expirée');
      } else if (status === 429) {
        throw new Error('Limite de taux API OpenAI dépassée. Veuillez réessayer plus tard.');
      } else if (status === 400) {
        throw new Error(`Requête invalide: ${message}`);
      } else {
        throw new Error(`Erreur API OpenAI (${status}): ${message}`);
      }
    } else if (error.code === 'ECONNABORTED') {
      throw new Error('Timeout de l\'API OpenAI. Veuillez réessayer.');
    } else {
      throw error;
    }
  }
};

// Export des fonctions pour utilisation dans d'autres modules
module.exports = {
  generateFlashTraffic
};
