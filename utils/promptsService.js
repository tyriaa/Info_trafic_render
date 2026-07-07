/**
 * Service de prompts thématiques pour la génération de flash radio
 * Chaque module correspond à une catégorie éditoriale ICI Radio France
 */

// ============================================================
// Modules thématiques — Templates de prompts par catégorie
// ============================================================

const PROMPT_MODULES = {

  /**
   * MODULE : Mobilité / Trafic / Météo
   * Destiné au flash trafic classique (Paris, Rouen, Limoges, Marseille…)
   */
  mobiliteMeteo: {
    id: 'mobiliteMeteo',
    label: 'Mobilité / Trafic / Météo',
    emoji: '🚗',
    description: 'Flash radio sur les incidents routiers, perturbations transports en commun et vigilances météo',
    template: `Tu es journaliste radio spécialisé trafic pour ICI {{ville}}.
Rédige un flash trafic professionnel, direct et concis pour le {{date}}.
Durée cible : 30 à 45 secondes à l'antenne (environ 80-100 mots).

Règles de rédaction :
- Commence par les faits les plus impactants (accidents, lignes coupées, vigilances météo)
- Utilise un vocabulaire radio : "ce matin", "à cette heure", "on signale", "prudence"
- Cite les axes/lignes par leur nom courant (A13, RER A, ligne 4, boulevard des Capucines…)
- Si une vigilance météo est active, mentionne-la en premier
- Pas de listes à puces, uniquement du texte fluide à lire à voix haute
- Termine par une formule de clôture (ex : "Bonne route à tous.")

Données disponibles :
{{data}}`,
    variables: ['ville', 'date', 'data']
  },

  /**
   * MODULE : Emploi
   * Offres d'emploi et actualités France Travail / marché du travail local
   */
  emploi: {
    id: 'emploi',
    label: 'Emploi',
    emoji: '💼',
    description: 'Flash emploi sur les offres et actualités du marché du travail local',
    template: `Tu es journaliste radio pour ICI {{ville}}.
Rédige un flash emploi de 20 à 30 secondes (environ 50-70 mots) pour le {{date}}.

Règles :
- Mets en avant les offres ou secteurs qui recrutent activement
- Précise la localisation quand elle est disponible
- Parle de façon concrète et utile pour l'auditeur en recherche d'emploi
- Évite le jargon administratif
- Si des chiffres marquants sont disponibles (ex : "50 postes ouverts"), utilise-les
- Texte fluide, pensé pour être lu à voix haute

Données offres d'emploi :
{{data}}`,
    variables: ['ville', 'date', 'data']
  },

  /**
   * MODULE : Sorties Famille / Enfants / Nature
   * Événements familiaux, activités enfants, sorties nature locales
   */
  familleSorties: {
    id: 'familleSorties',
    label: 'Sorties Famille / Enfants / Nature',
    emoji: '🌿',
    description: 'Flash sorties pour les familles : activités enfants, nature, plein air',
    template: `Tu es journaliste radio pour ICI {{ville}}.
Rédige un flash sorties famille de 20 à 30 secondes (environ 50-70 mots) pour le {{date}}.

Règles :
- Sélectionne en priorité : activités pour enfants, spectacles jeune public, balades nature, événements gratuits en famille
- Indique le lieu et si c'est gratuit ou payant
- Ton chaleureux et enthousiaste, sans excès
- Si plusieurs événements, cite les 2 ou 3 plus attractifs
- Texte fluide, pensé pour être lu à voix haute

Événements disponibles :
{{data}}`,
    variables: ['ville', 'date', 'data'],
    filterCategories: ['famille', 'nature', 'gratuit']
  },

  /**
   * MODULE : Bons Plans Gratuits
   * Événements, activités et services gratuits sur le territoire
   */
  bonsPlansGratuits: {
    id: 'bonsPlansGratuits',
    label: 'Bons Plans Gratuits',
    emoji: '🎁',
    description: 'Flash bons plans : événements et activités gratuits à saisir',
    template: `Tu es journaliste radio pour ICI {{ville}}.
Rédige un flash "bons plans" de 20 à 25 secondes (environ 45-60 mots) pour le {{date}}.

Règles :
- Ne cite QUE des événements ou services gratuits ou à tarif réduit
- Sois percutant et vendeur : l'auditeur doit avoir envie d'y aller
- Précise le lieu et si c'est ce week-end, aujourd'hui, ou jusqu'à une date
- Texte fluide, pensé pour être lu à voix haute

Bons plans disponibles :
{{data}}`,
    variables: ['ville', 'date', 'data'],
    filterCategories: ['gratuit']
  },

  /**
   * MODULE : Vie Pratique / Démarches Utiles
   * Informations pratiques : travaux, fermetures, démarches administratives, permanences
   */
  viePratique: {
    id: 'viePratique',
    label: 'Vie Pratique / Démarches Utiles',
    emoji: '📋',
    description: 'Flash info pratique : travaux, fermetures de services, démarches utiles',
    template: `Tu es journaliste radio pour ICI {{ville}}.
Rédige un flash vie pratique de 20 à 30 secondes (environ 50-70 mots) pour le {{date}}.

Règles :
- Mets en avant ce qui impacte directement le quotidien des auditeurs (fermetures, travaux, délais)
- Formule de façon utile et actionnable : "pensez à…", "à noter que…", "jusqu'au…"
- Évite les formulations trop administratives
- Texte fluide, pensé pour être lu à voix haute

Données pratiques :
{{data}}`,
    variables: ['ville', 'date', 'data']
  },

  /**
   * MODULE : Événements Solidaires
   * Collectes, associations, bénévolat, initiatives citoyennes
   */
  evenementsSolidaires: {
    id: 'evenementsSolidaires',
    label: 'Événements Solidaires',
    emoji: '🤝',
    description: 'Flash solidarité : collectes, bénévolat, initiatives associatives locales',
    template: `Tu es journaliste radio pour ICI {{ville}}.
Rédige un flash solidarité de 20 à 25 secondes (environ 45-60 mots) pour le {{date}}.

Règles :
- Mets en valeur l'initiative sans tomber dans le prosélytisme
- Indique comment participer concrètement (lieu, horaire, contact si disponible)
- Ton engagé et positif
- Texte fluide, pensé pour être lu à voix haute

Événements solidaires disponibles :
{{data}}`,
    variables: ['ville', 'date', 'data'],
    filterCategories: ['solidaire']
  }
};

// ============================================================
// Fonctions utilitaires
// ============================================================

/**
 * Construit un prompt à partir d'un module thématique et des données
 * @param {string} moduleId - Identifiant du module (ex: 'mobiliteMeteo')
 * @param {Object} params - Variables à injecter : { ville, date, data }
 * @returns {string} - Prompt complet prêt à envoyer à l'IA
 */
function buildPrompt(moduleId, params = {}) {
  const module = PROMPT_MODULES[moduleId];
  if (!module) {
    throw new Error(`Module de prompt inconnu : ${moduleId}. Modules disponibles : ${Object.keys(PROMPT_MODULES).join(', ')}`);
  }

  let prompt = module.template;

  for (const [key, value] of Object.entries(params)) {
    const placeholder = `{{${key}}}`;
    const replacement = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || '');
    prompt = prompt.split(placeholder).join(replacement);
  }

  return prompt;
}

/**
 * Filtre des événements par catégories thématiques
 * @param {Array} events - Liste d'événements avec champ `categories`
 * @param {Array} targetCategories - Ex: ['famille', 'nature']
 * @returns {Array} - Événements correspondants
 */
function filterEventsByCategories(events, targetCategories) {
  if (!targetCategories || targetCategories.length === 0) return events;
  return events.filter(e => {
    const cats = e.categories || [];
    return targetCategories.some(tc => cats.includes(tc));
  });
}

/**
 * Retourne la liste des modules disponibles (pour le sélecteur UI)
 * @returns {Array} - Liste des modules avec id, label, emoji, description
 */
function getAvailableModules() {
  return Object.values(PROMPT_MODULES).map(({ id, label, emoji, description, filterCategories }) => ({
    id, label, emoji, description, filterCategories: filterCategories || []
  }));
}

module.exports = {
  PROMPT_MODULES,
  buildPrompt,
  filterEventsByCategories,
  getAvailableModules
};
