/**
 * Service "ici express" — génération de scripts radio 60" via LLM
 * À partir des données collectées pour chaque ville, génère un script
 * correspondant à l'un des formats éditoriaux définis dans le guide.
 */

const anthropicService = require('../utils/anthropicService');
const openaiService = require('../utils/openaiService');
const mistralService = require('../utils/mistralService');

const limogesService = require('./limogesService');
const rouenService = require('./rouenService');
const weatherService = require('../utils/weatherService');
const tomTomService = require('../utils/tomTomService');

// ============================================================
// Catalogue des formats ICI Express
// ============================================================

const FORMATS = {
  'format-a': {
    category: 'Ici Express', formatLetter: 'A',
    label: 'Format A',
    emoji: '💖',
    description: 'Coup de cœur · Routes · Rendez-vous solidaires · Marchés + météo',
    habillage: 'mixed',
    needs: ['events', 'brocantes', 'actus', 'trafic', 'travaux', 'meteo', 'air', 'vigicrues']
  },
  'format-b': {
    category: 'Ici Express', formatLetter: 'B',
    label: 'Format B',
    emoji: '🎭',
    description: 'Idées sorties · Transports · Emploi · Vie de quartier + météo',
    habillage: 'mixed',
    needs: ['events', 'brocantes', 'trains', 'travaux', 'actus', 'emploi', 'pharmacies', 'meteo', 'air']
  },
  'format-c': {
    category: 'Ici Express', formatLetter: 'C',
    label: 'Format C',
    emoji: '�',
    description: 'Bons plans gratuits · Démarches utiles · Vie de famille + météo',
    habillage: 'mixed',
    needs: ['brocantes', 'events', 'actus', 'pharmacies', 'meteo', 'air']
  },
  'format-d': {
    category: 'Ici Express', formatLetter: 'D',
    label: 'Format D',
    emoji: '⭐',
    description: 'Immanquables · Adoption SPA + météo',
    habillage: 'mixed',
    needs: ['events', 'actus', 'meteo', 'air']
  }
};

// ============================================================
// Collecteur de données par ville
// ============================================================

async function collectCityData(city, needs) {
  const data = {};
  const tasks = [];

  if (needs.includes('meteo')) {
    tasks.push(weatherService.getWeatherData(city).then(d => { data.meteo = d; }).catch(() => {}));
  }
  if (needs.includes('trafic')) {
    tasks.push(tomTomService.getTrafficIncidents(city, 'fr-FR').then(d => { data.trafic = d; }).catch(() => {}));
  }

  const svc = city === 'limoges' ? limogesService : rouenService;
  const methodsMap = city === 'limoges'
    ? {
        events: 'getOpenAgendaEvents',
        brocantes: 'getBrocantesLimoges',
        travaux: 'getTravauxLimoges',
        actus: 'getActualitesLimoges',
        trains: 'getTrainsLimoges',
        air: 'getQualiteAir',
        vigicrues: 'getVigicruesData',
        pharmacies: 'getPharmaciesGarde',
        emploi: 'getEmploiLimoges'
      }
    : {
        events: 'getOpenAgendaEvents',
        brocantes: 'getBrocantesRouen',
        travaux: 'getTravauxRouen',
        actus: 'getActualitesRouen',
        trains: 'getTrainsRouen',
        air: 'getQualiteAir',
        vigicrues: 'getVigicruesData',
        pharmacies: 'getPharmaciesGarde',
        emploi: 'getEmploiRouen'
      };

  for (const [key, method] of Object.entries(methodsMap)) {
    if (needs.includes(key) && typeof svc[method] === 'function') {
      tasks.push(svc[method]().then(d => { data[key] = d; }).catch(() => {}));
    }
  }

  await Promise.all(tasks);
  return data;
}

// ============================================================
// Construction des prompts par format
// ============================================================

function buildPromptTemplate(format, cityName) {
  const fmt = FORMATS[format];
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const baseInstructions = `Tu es un assistant éditorial pour "ici ${cityName}". Tu dois produire une FICHE DE BRIEF factuelle pour le format "ici express" (${fmt.label}).

Date : ${today}
Zone : ${cityName}
Format : ${fmt.label} (${fmt.description})

RÈGLES STRICTES DE SORTIE :
- Format : UNIQUEMENT une liste de bullet points (un tiret "-" par ligne)
- Aucune phrase d'accroche, aucune introduction, aucune conclusion
- Aucune phrase de liaison, aucun commentaire, aucune narration
- Chaque bullet = 1 info précise et concrète, dense en données factuelles
- Inclure TOUS les détails disponibles : date exacte, heure, lieu précis, adresse, tarif, nom de l'événement/employeur/axe, km, durée, numéro de téléphone si présent
- Format bullet : "- [CATÉGORIE] Nom/titre — lieu — date/heure — prix/détail — info complémentaire"
- Le préfixe [CATÉGORIE] (entre crochets, en MAJUSCULES) est OBLIGATOIRE et correspond à la section éditoriale du bullet
- N'invente RIEN : n'utilise QUE les données fournies ci-dessous
- Si un champ manque, omets-le plutôt que de combler
- Ordre : du plus important/imminent au moins urgent
- Pas de Markdown (pas de **, pas de #, pas de liste numérotée)
- Pas d'emoji sauf si présent dans la donnée source
- Maximum 12 bullets, minimum 5
- Si une donnée source contient une URL (champ url, link, canonicalUrl, lienDirect, detailsUrl, source), AJOUTE-la en FIN du bullet entre parenthèses : "(source: https://...)". Une seule URL par bullet, la plus pertinente. Si aucune URL présente : ne rien mettre.`;

  // Instructions spécifiques = comment croiser les sources par Format
  // Chaque Format regroupe PLUSIEURS thématiques éditoriales du guide ICI.
  // Le LLM doit produire un brief multi-sections, avec préfixe [THÉMATIQUE] pour chaque bullet.
  const specsMap = {
    'format-a': `FORMAT A — Brief éditorial combinant 4 thématiques + météo.
Structure obligatoire du rendu (préfixe [CATÉGORIE] au début de CHAQUE bullet) :

1. [COUP DE CŒUR] — 1 à 2 bullets : 1 événement phare de la semaine (partenariat, temps fort territorial : concert, festival, spectacle majeur). Titre + lieu + date/heure + tarif + contexte.
2. [ROUTES] — 2 à 4 bullets : principales perturbations routières (trafic TomTom + travaux + météo routière si verglas/brouillard/pluie). Axe précis, nature, durée, déviation.
3. [SOLIDARITÉ] — 1 à 2 bullets : rendez-vous solidaires & citoyens (réunions publiques, dons du sang, bénévolat, vaccinations). Événements extraits + actus mairie.
4. [MARCHÉS] — 1 à 2 bullets : marchés du jour, producteurs locaux, AMAP. Lieu + horaires + spécificité.
5. [MÉTÉO] — 1 bullet de synthèse : temp, conditions, vent, alerte si vigicrues/air active.

Total : 6 à 10 bullets.`,

    'format-b': `FORMAT B — Brief éditorial combinant 4 thématiques + météo.
Structure obligatoire du rendu (préfixe [CATÉGORIE] au début de CHAQUE bullet) :

1. [IDÉES SORTIES] — 2 à 3 bullets : sorties variées (culture, plein air, famille), AU MOINS UNE gratuite (ajouter "(gratuit)"). Titre + lieu + date/heure + tarif.
2. [TRANSPORTS] — 1 à 2 bullets : prochains départs trains importants + perturbations bus/tram. Destination, quai, heure, motif.
3. [EMPLOI] — 1 à 2 bullets : offres d'emploi précises (intitulé + employeur + lieu + contrat) ou salon/forum emploi.
4. [VIE DE QUARTIER] — 1 à 2 bullets : travaux en cours (rue, dates, horaires), coupures, fermetures. Adresse obligatoire.
5. [MÉTÉO] — 1 bullet de synthèse.

Total : 6 à 10 bullets.`,

    'format-c': `FORMAT C — Brief éditorial combinant 3 thématiques + météo.
Structure obligatoire du rendu (préfixe [CATÉGORIE] au début de CHAQUE bullet) :

1. [BONS PLANS GRATUITS] — 2 à 3 bullets : vide-greniers, expos gratuites, portes ouvertes, musées gratuits. AJOUTER "(gratuit)" systématiquement.
2. [DÉMARCHES UTILES] — 2 à 3 bullets : pharmacies de garde (nom + adresse + tél + horaires), permanences CNI/mairie/France Services. Dernier bullet = numéros utiles (3237, 15, 112).
3. [VIE DE FAMILLE] — 1 à 2 bullets : activités enfants, ludothèques, centres aérés, animations jeune public, services étudiants/CROUS.
4. [MÉTÉO] — 1 bullet de synthèse.

Total : 6 à 9 bullets.`,

    'format-d': `FORMAT D — Brief éditorial combinant 2 thématiques + météo.
Structure obligatoire du rendu (préfixe [CATÉGORIE] au début de CHAQUE bullet) :

1. [IMMANQUABLES] — 3 à 5 bullets : événements ponctuels à ne pas rater (ouvertures de billetterie, venue de personnalités, inaugurations, concerts phares). Les plus marquants d'abord. Titre + lieu + date + billetterie si connue.
2. [ADOPTION] — 1 bullet : si actus ou events évoquent un animal à l'adoption / portrait SPA / journée adoption, reprends-le. Sinon : "Contactez la SPA locale pour rencontrer les animaux à l'adoption".
3. [MÉTÉO] — 1 bullet de synthèse.

Total : 5 à 7 bullets.`
  };

  const specifics = specsMap[format] || `Croise toutes les sources fournies pour un brief complet.`;

  // Le prompt template contient un PLACEHOLDER {{data}} — la data réelle sera injectée
  // au moment du call LLM (fresh) et non figée dans le template.
  return `${baseInstructions}\n\nCONSIGNE SPÉCIFIQUE AU FORMAT :\n${specifics}\n\nSOURCES DE DONNÉES À CROISER (n'utilise QUE ce qui suit, ne rien inventer) :\n{{data}}\n\nProduis UNIQUEMENT la liste de bullets (lignes commençant par "- "). Croise les sources pour enrichir chaque bullet. Aucun autre texte.`;
}

// Construit la section data (JSON) à partir des données fraîches, à injecter dans {{data}}
// Aucune limite arbitraire : on laisse toutes les données passer au LLM.
function buildDataSection(data) {
  const blocks = {};
  if (data.events) blocks.events = data.events;
  if (data.brocantes) blocks.brocantes = data.brocantes;
  if (data.actus) blocks.actus = data.actus?.actualites || data.actus;
  if (data.travaux) blocks.travaux = data.travaux?.travaux || data.travaux?.results || data.travaux;
  if (data.trafic) {
    // Pré-filtre : on ne garde que les champs utiles pour le LLM.
    // La géométrie (centaines de coordonnées) et les champs techniques sont supprimés.
    blocks.trafic = (data.trafic?.incidents || [])
      .filter(i => i.iconCategory !== 9) // on retire les travaux (déjà dans bloc travaux)
      .map(i => ({
        type: i.type,
        description: i.description,
        depuis: i.location?.from,
        vers: i.location?.to,
        axe: i.location?.roadNumbers,
        retard_min: i.delay?.minutes,
        severite: i.severity
      }));
  }
  if (data.trains) blocks.trains = data.trains;
  if (data.meteo) {
    const m = data.meteo;
    blocks.meteo = {
      temp_actuelle: m.temperature?.current,
      ressenti: m.temperature?.feelsLike,
      min: m.temperature?.min,
      max: m.temperature?.max,
      conditions: m.conditions?.description,
      vent_kmh: m.wind?.speed,
      humidite_pct: m.details?.humidity,
      previsions: m.forecast
    };
  }
  if (data.air) blocks.qualite_air = { indice: data.air.label, aqi: data.air.aqi, pollens: data.air.pollens };
  if (data.vigicrues) blocks.vigicrues = data.vigicrues?.vigilance || data.vigicrues?.stations || data.vigicrues;
  if (data.pharmacies) blocks.pharmacies_garde = data.pharmacies;
  if (data.emploi) blocks.offres_emploi = { offres: data.emploi.offres || [], portail: data.emploi.lienDirect };

  return Object.entries(blocks)
    .map(([k, v]) => `### ${k.toUpperCase()} ###\n${JSON.stringify(v, null, 2)}`)
    .join('\n\n');
}

// ============================================================
// Fonction principale : génération
// ============================================================

// Prépare le TEMPLATE de prompt (avec {{data}}) + un aperçu des données actuelles
// Le template est destiné à être affiché/édité dans l'UI.
// La vraie data sera injectée fraîche au moment du call LLM.
async function prepareIciExpress({ city, format }) {
  if (!FORMATS[format]) throw new Error(`Format inconnu : ${format}`);
  if (!['limoges', 'rouen'].includes(city)) throw new Error(`Ville non supportée : ${city}`);

  const fmt = FORMATS[format];
  const cityName = city === 'limoges' ? 'Limoges' : 'Rouen';

  // Template avec placeholder {{data}} — pas besoin de collecter la data pour l'afficher
  const promptTemplate = buildPromptTemplate(format, cityName);

  // Mais on collecte quand même un APERÇU pour que l'utilisateur puisse voir
  // ce qui sera injecté (à titre indicatif uniquement).
  const data = await collectCityData(city, fmt.needs);
  const dataPreview = buildDataSection(data);

  return {
    city: cityName,
    format,
    fmt,
    promptTemplate,      // contient {{data}} — éditable par l'utilisateur
    dataPreview,         // aperçu actuel (pour info uniquement)
    dataPreviewLength: dataPreview.length,
    timestamp: new Date().toISOString()
  };
}

async function generateIciExpress({ city, format, model = 'claude', customPrompt = null }) {
  if (!FORMATS[format]) {
    throw new Error(`Format inconnu : ${format}`);
  }
  if (!['limoges', 'rouen'].includes(city)) {
    throw new Error(`Ville non supportée : ${city}`);
  }

  const fmt = FORMATS[format];
  const cityName = city === 'limoges' ? 'Limoges' : 'Rouen';

  // On collecte TOUJOURS les données fraîches au moment du call — jamais de snapshot
  const freshData = await collectCityData(city, fmt.needs);
  const freshDataSection = buildDataSection(freshData);

  // Le template (custom ou défaut) doit contenir {{data}} pour l'injection
  let template;
  if (customPrompt && typeof customPrompt === 'string' && customPrompt.trim().length > 50) {
    template = customPrompt;
  } else {
    template = buildPromptTemplate(format, cityName);
  }

  // Injection de la data fraîche dans le placeholder
  let prompt;
  if (template.includes('{{data}}')) {
    prompt = template.replace('{{data}}', freshDataSection);
  } else {
    // Sécurité : si l'utilisateur a supprimé le placeholder, on ajoute la data à la fin
    prompt = template + '\n\nDONNÉES ACTUELLES :\n' + freshDataSection;
  }

  const temperature = 0.3;
  const top_p = 0.9;
  const max_tokens = 1200;
  let scriptText;

  if (model === 'gpt4o') {
    scriptText = await openaiService.generateFlashTraffic(prompt, temperature, top_p, max_tokens);
  } else if (model === 'pixtral') {
    scriptText = await mistralService.generateFlashTraffic(prompt, temperature, top_p, max_tokens);
  } else {
    scriptText = await anthropicService.generateFlashTraffic(prompt, temperature, top_p, max_tokens);
  }

  return {
    city: cityName,
    format: format,
    label: fmt.label,
    emoji: fmt.emoji,
    category: fmt.category,
    habillage: fmt.habillage,
    script: (scriptText || '').trim(),
    model: model,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  FORMATS,
  generateIciExpress,
  prepareIciExpress
};
