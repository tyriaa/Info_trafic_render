# Documentation de l'intégration Claude et TomTom

Ce document décrit les modifications apportées au projet "Info Trafic" pour intégrer l'API Claude d'Anthropic et l'API TomTom Traffic Incidents.

## Table des matières

1. [API Claude](#api-claude)
    - [Configuration](#configuration-claude)
    - [Utilisation](#utilisation-claude)
    - [Prompts](#prompts-claude)
2. [API TomTom Traffic](#api-tomtom-traffic)
    - [Configuration](#configuration-tomtom)
    - [Zones géographiques](#zones-géographiques)
    - [Endpoints API](#endpoints-api-tomtom)
3. [Intégration combinée](#intégration-combinée)
    - [Génération de flashs trafic enrichis](#génération-de-flashs-trafic-enrichis)

## API Claude <a name="api-claude"></a>

### Configuration <a name="configuration-claude"></a>

L'API Claude est configurée via la variable d'environnement suivante dans le fichier `.env` :

```
ANTHROPIC_API_KEY=votre_clé_api_claude_ici
```

Le service est initialisé au démarrage de l'application dans `index.js`.

### Utilisation <a name="utilisation-claude"></a>

Le service Claude est implémenté dans `utils/anthropicService.js` et offre les fonctions principales suivantes :

- `generateResponse(prompt, model)` : Génère une réponse à partir d'un prompt utilisateur
- `generateWithSystemPrompt(systemPrompt, userPrompt, model)` : Génère une réponse avec un prompt système et un prompt utilisateur séparés
- `checkClaudeAvailability()` : Vérifie la disponibilité de l'API Claude
- `setApiKey(key)` : Configure la clé API Claude

Endpoints API pour Claude:

- **POST** `/api/config/claude-api-key` : Configure la clé API Claude
- **POST** `/api/test/claude` : Teste la connexion à l'API Claude

### Prompts <a name="prompts-claude"></a>

Les prompts pour Claude sont formatés spécifiquement dans `utils/trafficLLMService.js` pour générer des flashs trafic pertinents et informatifs. Le système utilise un prompt système qui définit le rôle et le style de Claude, et un prompt utilisateur qui contient les données de trafic actuelles.

## API TomTom Traffic <a name="api-tomtom-traffic"></a>

### Configuration <a name="configuration-tomtom"></a>

L'API TomTom est configurée directement dans le service `utils/tomTomService.js` avec la clé API :

```
TOMTOM_API_KEY=PVt4NaZSKKtziZi9DaqNAUzN4flNJnSo
```

### Zones géographiques <a name="zones-géographiques"></a>

L'API est configurée pour les zones suivantes (définies par des bounding boxes) :

- **Paris**: `2.224122,48.815573,2.469920,48.902145`
- **Lille**: `3.001349,50.605670,3.116147,50.648568`
- **Marseille**: `5.352478,43.271082,5.405693,43.315765`
- **Rouen/Normandie**: `1.040725,49.400585,1.150246,49.471065`

### Endpoints API <a name="endpoints-api-tomtom"></a>

Deux endpoints sont disponibles pour accéder aux données TomTom :

- **GET** `/api/tomtom/incidents/:city` : Récupère les incidents de trafic pour une ville spécifique
  - Paramètre path: `city` (paris, lille, marseille, normandie)
  - Paramètre query: `language` (fr-FR par défaut)

- **GET** `/api/tomtom/incidents` : Récupère un résumé des incidents de trafic pour toutes les villes configurées
  - Paramètre query: `language` (fr-FR par défaut)

Exemple de requête :
```
curl 'http://localhost:3001/api/tomtom/incidents/paris'
```

## Intégration combinée <a name="intégration-combinée"></a>

### Génération de flashs trafic enrichis <a name="génération-de-flashs-trafic-enrichis"></a>

La fonction `extractTrafficDataFromPage` dans `utils/trafficLLMService.js` a été modifiée pour intégrer automatiquement les données TomTom aux données extraites des pages HTML. Cela permet d'enrichir les prompts envoyés à Claude avec des données de trafic en temps réel.

Les données sont structurées de la manière suivante dans les prompts :

1. Incidents extraits des pages HTML
2. Incidents TomTom en temps réel (si disponibles)
3. Contexte local (météo, événements, etc.)
4. Informations secondaires (transports en commun, etc.)

Le système formattera automatiquement ces données pour les rendre exploitables par Claude, qui générera ensuite un flash trafic adapté au format demandé (30s, 60s ou 90s).

Exemple d'utilisation dans le code :
```javascript
// Extraction des données de trafic avec enrichissement TomTom
const trafficData = await extractTrafficDataFromPage(document, "Paris");

// Génération d'un flash trafic
const flashTraffic = await generateRadioTrafficUpdate(trafficData, "Paris", "60s");
```

Cette intégration permet de générer des flashs trafic plus précis et à jour avec les conditions routières en temps réel.
