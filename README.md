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

# Info Trafic France

Une application web qui affiche en temps réel les perturbations de transport dans les principales villes françaises :
- Lille : Métro, Bus, Tram
- Marseille : Métro, Bus, Ferry
- Paris : Métro, RER, Bus

## Fonctionnalités

- Affichage en temps réel des perturbations
- Interface intuitive et responsive
- Mise à jour automatique des informations
- Affichage des horaires de train pour Lille
- Flash trafic généré par IA pour Paris
- Flash trafic radio (30s, 60s, 90s) pour bulletins d'information

## Technologies

- Node.js
- Express
- Axios pour les requêtes API
- HTML/CSS pour l'interface utilisateur

## Installation

1. Cloner le repository
2. Installer les dépendances : `npm install`
3. Configurer les variables d'environnement dans `.env`
4. Lancer l'application : `npm start`

<<<<<<< HEAD
- **Backend** : Node.js, Express.js
- **Frontend** : HTML5, CSS3, JavaScript ES6+
- **APIs** : IDFM (RATP), TomTom Traffic, SNCF Connect, Vélib Métropole
- **Cartes** : Leaflet.js avec tuiles personnalisées
- **IA** : Anthropic Claude pour génération de contenu
- **Containerisation** : Docker
=======
## Déploiement

L'application est déployée sur Hugging Face Spaces et accessible à l'adresse :
https://huggingface.co/spaces/tyriaa/Info_Trafic

Check out the configuration reference at https://huggingface.co/docs/hub/spaces-config-reference
>>>>>>> b47e729 (Ajout météo, mise a jour tri-traffic, nouvelle sytadin integration)
