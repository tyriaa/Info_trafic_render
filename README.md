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
