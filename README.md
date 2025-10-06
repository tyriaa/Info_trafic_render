---
title: Info Trafic France
emoji: 🚉
colorFrom: blue
colorTo: indigo
sdk: static
sdk_version: 1.0.0
app_file: index.js
pinned: false
---

# 🚦 Info Trafic - Application de suivi des transports

Application web moderne pour suivre les perturbations de transport en temps réel pour différentes villes françaises.

## ✨ Fonctionnalités

### 🏙️ **Paris**
- 🚇 Perturbations RATP (Métro, RER, Bus, Tramway) en temps réel
- 🚗 Incidents routiers TomTom (accidents, bouchons, travaux)
- 🚲 Stations Vélib indisponibles
- 🤖 **Flash trafic IA** généré par Claude (Anthropic)
- 🗺️ Cartes interactives avec marqueurs

### 🏭 **Lille**
- 🚊 Perturbations transport local
- 🚄 Horaires SNCF en temps réel

### ⛵ **Marseille**
- 🚢 Horaires des ferries en temps réel

### 🌊 **Normandie (Rouen)**
- 🚆 Perturbations transport et horaires SNCF

## 🛠️ Technologies utilisées

- **Backend** : Node.js, Express.js
- **Frontend** : HTML5, CSS3, JavaScript ES6+
- **APIs** : IDFM (RATP), TomTom Traffic, SNCF Connect, Vélib Métropole
- **Cartes** : Leaflet.js avec tuiles personnalisées
- **IA** : Anthropic Claude pour génération de contenu
- **Containerisation** : Docker

## 🚀 Installation et démarrage

```bash
# Cloner le repository
git clone https://github.com/IX-PIT/info-trafic.git
cd info-trafic

# Installer les dépendances
npm install

# Configurer les variables d'environnement (voir ci-dessous)
cp .env.example .env

# Démarrer l'application
npm start
```

L'application sera disponible sur `http://localhost:3001`

## ⚙️ Variables d'environnement

Créer un fichier `.env` à la racine :

```env
# IA - Anthropic Claude (pour le flash trafic)
ANTHROPIC_API_KEY=votre_clé_claude

# Transport - IDFM (RATP)
IDFM_API_KEY=3WsgOWybmrTiEwa3q8ZsvovvwPkrctnX

# Transport - SNCF Connect
SNCF_API_KEY=votre_clé_sncf

# Environnement
NODE_ENV=development
PORT=3001
```

## 🐳 Déploiement avec Docker

### Build local
```bash
docker build -t info-trafic .
docker run -p 3001:8080 \
  -e ANTHROPIC_API_KEY=votre_clé \
  -e IDFM_API_KEY=3WsgOWybmrTiEwa3q8ZsvovvwPkrctnX \
  info-trafic
```

### Déploiement Azure
L'application est optimisée pour Azure Container Instances et Azure App Service.

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Info Trafic - Interface Web                  │
│  • Pages par ville (Paris, Lille, Marseille, Normandie)       │
│  • Flash trafic en temps réel                                  │
│  • Cartes interactives                                         │
│  • Données transport                                           │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                APIs et Sources de Données                       │
│                                                                 │
│  Sources de données          Services externes                  │
│  ┌─────┐  ┌─────────┐       ┌─────────┐  ┌──────┐             │
│  │IDFM │  │ TomTom  │       │Claude AI│  │ SNCF │             │
│  │RATP │  │ Trafic  │       │  Flash  │  │Trains│             │
│  └─────┘  └─────────┘       └─────────┘  └──────┘             │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                Info Trafic - Backend Node.js                    │
│                                                                 │
│ ┌────────┐ ┌─────────┐ ┌──────┐ ┌─────────┐ ┌──────────┐      │
│ │Express │ │Scrapers │ │ APIs │ │Sécurité │ │Monitoring│      │
│ │Server  │ │   Web   │ │ REST │ │  HTTPS  │ │Logs Azure│      │
│ └────────┘ └─────────┘ └──────┘ └─────────┘ └──────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📝 License

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 📞 Contact

- **Développeur** : Clément Frerebeau
- **Repository** : [https://github.com/IX-PIT/info-trafic](https://github.com/IX-PIT/info-trafic)
Check out the configuration reference at https://huggingface.co/docs/hub/spaces-config-reference
