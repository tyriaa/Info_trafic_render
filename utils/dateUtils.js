/**
 * Utilitaires pour la gestion des dates et fuseaux horaires
 * Assure une cohérence entre local et Azure
 */

/**
 * Formate une date en heure française, peu importe le serveur
 * @param {Date|string} date - Date à formater
 * @param {Object} options - Options de formatage
 * @returns {string} - Date formatée en heure française
 */
function formatFrenchTime(date = new Date(), options = {}) {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  const defaultOptions = {
    timeZone: 'Europe/Paris',
    ...options
  };
  
  return dateObj.toLocaleString('fr-FR', defaultOptions);
}

/**
 * Formate une date complète pour l'affichage (jour, date, heure)
 * @param {Date|string} date - Date à formater
 * @returns {string} - Date formatée complète
 */
function formatFullFrenchDate(date = new Date()) {
  return formatFrenchTime(date, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Formate une heure courte (HH:MM)
 * @param {Date|string} date - Date à formater
 * @returns {string} - Heure formatée
 */
function formatShortFrenchTime(date = new Date()) {
  return formatFrenchTime(date, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Formate une date courte (JJ/MM/AAAA HH:MM)
 * @param {Date|string} date - Date à formater
 * @returns {string} - Date formatée courte
 */
function formatShortFrenchDate(date = new Date()) {
  return formatFrenchTime(date, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Obtient l'heure actuelle en France
 * @returns {Date} - Date actuelle ajustée au fuseau français
 */
function getFrenchTime() {
  return new Date();
}

/**
 * Vérifie si on est en heure d'été ou d'hiver en France
 * @param {Date} date - Date à vérifier (optionnel, défaut = maintenant)
 * @returns {boolean} - true si heure d'été
 */
function isDST(date = new Date()) {
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  
  const janOffset = jan.getTimezoneOffset();
  const julOffset = jul.getTimezoneOffset();
  
  return date.getTimezoneOffset() < Math.max(janOffset, julOffset);
}

module.exports = {
  formatFrenchTime,
  formatFullFrenchDate,
  formatShortFrenchTime,
  formatShortFrenchDate,
  getFrenchTime,
  isDST
};
