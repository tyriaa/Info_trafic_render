/**
 * Service pour récupérer les données météo via OpenWeatherMap
 */

const axios = require('axios');
const { formatShortFrenchTime } = require('./dateUtils');

// Configuration API OpenWeatherMap
const API_KEY = process.env.OPENWEATHER_API_KEY; 
const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

// Coordonnées des villes
const CITY_COORDINATES = {
  paris: {
    name: 'Paris',
    lat: 48.8566,
    lon: 2.3522
  },
  limoges: {
    name: 'Limoges',
    lat: 45.8336,
    lon: 1.2611
  },
  rouen: {
    name: 'Rouen',
    lat: 49.4432,
    lon: 1.0993
  }
};

/**
 * Récupère les données météo pour une ville
 * @param {string} city - Code de la ville ('paris', etc.)
 * @returns {Promise<Object>} - Données météo formatées
 */
async function getWeatherData(city = 'paris') {
  try {
    const cityData = CITY_COORDINATES[city.toLowerCase()];
    if (!cityData) {
      throw new Error(`Ville non supportée: ${city}`);
    }

    const url = `${BASE_URL}?lat=${cityData.lat}&lon=${cityData.lon}&appid=${API_KEY}&units=metric&lang=fr`;
    
    const response = await axios.get(url);
    const data = response.data;

    return formatWeatherData(data, cityData.name);
  } catch (error) {
    console.error(`Erreur lors de la récupération météo pour ${city}:`, error.message);
    return {
      cityName: CITY_COORDINATES[city.toLowerCase()]?.name || city,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Formate les données météo pour l'affichage
 * @param {Object} rawData - Données brutes de l'API
 * @param {string} cityName - Nom de la ville
 * @returns {Object} - Données formatées
 */
function formatWeatherData(rawData, cityName) {
  const weather = rawData.weather[0];
  const main = rawData.main;
  
  // Conversion des timestamps
  const sunrise = rawData.sys.sunrise 
    ? formatShortFrenchTime(new Date(rawData.sys.sunrise * 1000))
    : null;
  const sunset = rawData.sys.sunset 
    ? formatShortFrenchTime(new Date(rawData.sys.sunset * 1000))
    : null;

  // Déterminer l'icône et la couleur selon les conditions
  const weatherInfo = getWeatherDisplayInfo(weather, main.temp);

  return {
    cityName,
    temperature: {
      current: Math.round(main.temp),
      feelsLike: Math.round(main.feels_like),
      min: Math.round(main.temp_min),
      max: Math.round(main.temp_max)
    },
    conditions: {
      main: weather.main,
      description: weather.description,
      icon: weather.icon,
      displayIcon: weatherInfo.icon,
      color: weatherInfo.color
    },
    details: {
      humidity: main.humidity,
      pressure: main.pressure,
      visibility: rawData.visibility ? Math.round(rawData.visibility / 1000) : null
    },
    wind: {
      speed: rawData.wind?.speed ? Math.round(rawData.wind.speed * 3.6) : null, // Conversion m/s vers km/h
      direction: rawData.wind?.deg || null,
      gust: rawData.wind?.gust ? Math.round(rawData.wind.gust * 3.6) : null
    },
    precipitation: {
      rain1h: rawData.rain?.['1h'] || null,
      snow1h: rawData.snow?.['1h'] || null
    },
    sun: {
      sunrise,
      sunset
    },
    clouds: rawData.clouds?.all || null,
    timestamp: new Date().toISOString(),
    lastUpdate: formatShortFrenchTime()
  };
}

/**
 * Détermine l'icône et la couleur d'affichage selon les conditions météo
 * @param {Object} weather - Données météo
 * @param {number} temp - Température
 * @returns {Object} - Icône et couleur pour l'affichage
 */
function getWeatherDisplayInfo(weather, temp) {
  const condition = weather.main.toLowerCase();
  const description = weather.description.toLowerCase();
  
  // Icônes et couleurs selon les conditions
  if (condition.includes('clear')) {
    return { icon: '☀️', color: '#FFD700' }; // Soleil
  } else if (condition.includes('cloud')) {
    if (description.includes('few') || description.includes('scattered')) {
      return { icon: '⛅', color: '#87CEEB' }; // Partiellement nuageux
    }
    return { icon: '☁️', color: '#B0C4DE' }; // Nuageux
  } else if (condition.includes('rain')) {
    if (description.includes('light')) {
      return { icon: '🌦️', color: '#4682B4' }; // Pluie légère
    } else if (description.includes('heavy')) {
      return { icon: '🌧️', color: '#191970' }; // Pluie forte
    }
    return { icon: '🌧️', color: '#4169E1' }; // Pluie
  } else if (condition.includes('snow')) {
    return { icon: '❄️', color: '#E6E6FA' }; // Neige
  } else if (condition.includes('thunderstorm')) {
    return { icon: '⛈️', color: '#483D8B' }; // Orage
  } else if (condition.includes('mist') || condition.includes('fog')) {
    return { icon: '🌫️', color: '#D3D3D3' }; // Brouillard
  }
  
  // Par défaut selon la température
  if (temp > 25) {
    return { icon: '🌡️', color: '#FF6347' }; // Chaud
  } else if (temp < 5) {
    return { icon: '🥶', color: '#B0E0E6' }; // Froid
  }
  
  return { icon: '🌤️', color: '#87CEEB' }; // Par défaut
}

/**
 * Récupère les prévisions météo 5 jours pour une ville
 * @param {string} city - Code de la ville ('paris', etc.)
 * @returns {Promise<Object>} - Prévisions météo formatées
 */
async function getWeatherForecast(city = 'paris') {
  try {
    const cityData = CITY_COORDINATES[city.toLowerCase()];
    if (!cityData) {
      throw new Error(`Ville non supportée: ${city}`);
    }

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${cityData.lat}&lon=${cityData.lon}&appid=${API_KEY}&units=metric&lang=fr`;
    
    const response = await axios.get(url);
    const data = response.data;

    return formatForecastData(data, cityData.name);
  } catch (error) {
    console.error(`Erreur lors de la récupération des prévisions pour ${city}:`, error.message);
    return {
      cityName: CITY_COORDINATES[city.toLowerCase()]?.name || city,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Formate les données de prévisions pour l'affichage
 * @param {Object} rawData - Données brutes de l'API forecast
 * @param {string} cityName - Nom de la ville
 * @returns {Object} - Prévisions formatées
 */
function formatForecastData(rawData, cityName) {
  // Grouper les prévisions par jour
  const forecastsByDay = {};
  const next24Hours = [];
  
  rawData.list.forEach((forecast, index) => {
    const date = new Date(forecast.dt * 1000);
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Stocker les 8 premières prévisions pour les 24 prochaines heures
    if (index < 8) {
      next24Hours.push(formatSingleForecast(forecast));
    }
    
    // Grouper par jour
    if (!forecastsByDay[dateKey]) {
      forecastsByDay[dateKey] = [];
    }
    
    forecastsByDay[dateKey].push(formatSingleForecast(forecast));
  });

  // Créer un résumé par jour avec min/max
  const dailySummary = Object.entries(forecastsByDay).map(([date, forecasts]) => {
    const temps = forecasts.map(f => f.temperature);
    const conditions = forecasts.map(f => f.conditions);
    
    // Trouver la condition la plus représentative (celle du milieu de journée)
    const middayForecast = forecasts.find(f => {
      const hour = new Date(f.datetime).getHours();
      return hour >= 12 && hour <= 15;
    }) || forecasts[Math.floor(forecasts.length / 2)];
    
    return {
      date,
      dateFormatted: formatDateFrench(date),
      dayName: getDayName(date),
      temperature: {
        min: Math.round(Math.min(...temps)),
        max: Math.round(Math.max(...temps))
      },
      conditions: middayForecast.conditions,
      forecasts: forecasts
    };
  });

  return {
    cityName,
    current: rawData.list[0] ? formatSingleForecast(rawData.list[0]) : null,
    next24Hours,
    dailySummary: dailySummary.slice(0, 5), // Limiter à 5 jours
    totalForecasts: rawData.cnt,
    timestamp: new Date().toISOString(),
    lastUpdate: formatShortFrenchTime()
  };
}

/**
 * Formate une prévision individuelle
 * @param {Object} forecast - Prévision individuelle de l'API
 * @returns {Object} - Prévision formatée
 */
function formatSingleForecast(forecast) {
  const weather = forecast.weather[0];
  const weatherInfo = getWeatherDisplayInfo(weather, forecast.main.temp);
  
  return {
    datetime: new Date(forecast.dt * 1000).toISOString(),
    datetimeFormatted: formatShortFrenchTime(new Date(forecast.dt * 1000)),
    temperature: Math.round(forecast.main.temp),
    feelsLike: Math.round(forecast.main.feels_like),
    conditions: {
      main: weather.main,
      description: weather.description,
      icon: weather.icon,
      displayIcon: weatherInfo.icon,
      color: weatherInfo.color
    },
    details: {
      humidity: forecast.main.humidity,
      pressure: forecast.main.pressure
    },
    wind: {
      speed: forecast.wind?.speed ? Math.round(forecast.wind.speed * 3.6) : null,
      direction: forecast.wind?.deg || null
    },
    precipitation: {
      rain3h: forecast.rain?.['3h'] || 0,
      snow3h: forecast.snow?.['3h'] || 0
    },
    clouds: forecast.clouds?.all || 0
  };
}

/**
 * Formate une date en français
 * @param {string} dateString - Date au format YYYY-MM-DD
 * @returns {string} - Date formatée
 */
function formatDateFrench(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long'
  });
}

/**
 * Obtient le nom du jour en français
 * @param {string} dateString - Date au format YYYY-MM-DD
 * @returns {string} - Nom du jour
 */
function getDayName(dateString) {
  const date = new Date(dateString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  
  if (date.toDateString() === today.toDateString()) {
    return "Aujourd'hui";
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return "Demain";
  } else {
    return date.toLocaleDateString('fr-FR', { weekday: 'long' });
  }
}

/**
 * Obtient un résumé météo court pour l'affichage
 * @param {string} city - Code de la ville
 * @returns {Promise<string>} - Résumé météo
 */
async function getWeatherSummary(city = 'paris') {
  try {
    const weather = await getWeatherData(city);
    
    if (weather.error) {
      return `Météo indisponible`;
    }
    
    const temp = weather.temperature.current;
    const desc = weather.conditions.description;
    const icon = weather.conditions.displayIcon;
    
    return `${icon} ${temp}°C, ${desc}`;
  } catch (error) {
    return `Météo indisponible`;
  }
}

module.exports = {
  getWeatherData,
  getWeatherForecast,
  getWeatherSummary,
  formatWeatherData,
  formatForecastData
};
