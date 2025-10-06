# Utiliser l'image officielle Node.js 20 LTS (recommandé pour Azure)
FROM node:20

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm ci --only=production && npm cache clean --force

# Copier le code source
COPY . .

# Exposer le port (Azure utilise PORT dynamique)
EXPOSE 8080

# Variables d'environnement pour Azure
ENV NODE_ENV=production

# Commande pour démarrer l'application
CMD ["npm", "start"]
