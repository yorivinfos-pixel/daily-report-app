# 📋 Daily Report Site Supervisor

Application de rapports journaliers pour superviseurs de chantier avec synchronisation en temps réel.

## 🚀 Fonctionnalités

### Pour les Superviseurs (Mobile/Terrain)
- ✅ Création de rapports journaliers avec : Site ID, Nom du Site, Activités, Commentaires
- 📷 Upload de photos (prise en direct ou depuis galerie)
- 📱 Interface optimisée mobile (PWA installable)
- 🔔 Réception des avis du PM en temps réel
- 📴 Mode hors-ligne (consultation des rapports en cache)

### Pour le Project Manager (PC/Bureau)
- 📊 Dashboard avec vue d'ensemble des rapports
- ⏳ Filtrage par statut (En attente / Examiné)
- 🔍 Recherche par site, superviseur, date
- 🖼️ Visualisation et téléchargement des photos
- 💬 Envoi d'avis/feedback aux superviseurs
- 🔔 Notifications en temps réel des nouveaux rapports

## 📦 Installation

### Prérequis
- Node.js v16 ou supérieur
- npm ou yarn

### Étapes

1. **Installer les dépendances**
```bash
cd "Daily Report Site Supervisor"
npm install
```

2. **Démarrer le serveur**
```bash
npm start
```

3. **Accéder à l'application**
- **Superviseur (Mobile)**: http://localhost:3000
- **PM Dashboard (PC)**: http://localhost:3000/pm

## 📱 Installation sur Mobile (PWA)

### Android (Chrome)
1. Ouvrir http://[votre-ip]:3000 dans Chrome
2. Cliquer sur les 3 points (menu)
3. Sélectionner "Ajouter à l'écran d'accueil"
4. L'application sera installée comme une app native

### iOS (Safari)
1. Ouvrir http://[votre-ip]:3000 dans Safari
2. Cliquer sur le bouton "Partager"
3. Sélectionner "Sur l'écran d'accueil"
4. Valider l'ajout

## 🏗️ Architecture

```
Daily Report Site Supervisor/
├── server.js              # Backend Node.js + Express + Socket.IO
├── package.json           # Dépendances npm
├── data/                  # Base de données SQLite
│   └── reports.db
├── uploads/               # Images uploadées
│   └── [report-id]/
├── public/
│   ├── index.html        # Interface Superviseur
│   ├── pm.html           # Dashboard PM
│   ├── manifest.json     # Fichier PWA
│   ├── sw.js             # Service Worker
│   ├── css/
│   │   ├── styles.css    # Styles communs
│   │   └── pm-dashboard.css
│   ├── js/
│   │   ├── supervisor.js   # Logique Superviseur
│   │   └── pm-dashboard.js # Logique PM
│   └── icons/            # Icônes PWA
```

## 🔌 API REST

### Rapports

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/reports` | Liste tous les rapports |
| GET | `/api/reports/:id` | Détails d'un rapport |
| POST | `/api/reports` | Créer un rapport |
| POST | `/api/reports/:id/images` | Ajouter des images |
| POST | `/api/reports/:id/feedback` | Ajouter un avis PM |
| GET | `/api/reports/:id/feedbacks` | Liste des avis |

### Sites

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/sites` | Liste des sites |
| POST | `/api/sites` | Ajouter un site |

## 🔄 Événements Socket.IO

| Événement | Direction | Description |
|-----------|-----------|-------------|
| `new-report` | Serveur → Clients | Nouveau rapport créé |
| `new-images` | Serveur → Clients | Nouvelles images ajoutées |
| `new-feedback` | Serveur → Superviseur | Avis du PM reçu |
| `join-role` | Client → Serveur | Rejoindre un groupe (supervisor/pm) |

## 🌐 Déploiement en Production

### Option 1: Hébergement Local (Réseau d'entreprise)

1. **Configurer le serveur**
```bash
# Définir le port (optionnel)
set PORT=80  # Windows
export PORT=80  # Linux/Mac

# Démarrer
npm start
```

2. **Accès depuis le réseau**
   - Trouver l'IP du serveur: `ipconfig` (Windows) ou `ifconfig` (Linux)
   - Superviseurs: http://[IP-SERVEUR]:3000
   - PM: http://[IP-SERVEUR]:3000/pm

### Option 2: Hébergement Cloud

Déployer sur Heroku, Railway, Render, ou tout service supportant Node.js.

```bash
# Exemple avec Railway
npm install -g railway
railway login
railway init
railway up
```

### Option 3: VPS avec Nginx (Recommandé)

1. **Configurer Nginx comme reverse proxy**
```nginx
server {
    listen 80;
    server_name reports.votredomaine.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

2. **Utiliser PM2 pour la gestion du processus**
```bash
npm install -g pm2
pm2 start server.js --name "daily-report"
pm2 save
pm2 startup
```

## 🔒 Sécurité (Recommandations)

Pour un déploiement en production, ajoutez:

1. **Authentification**: Ajoutez un système de login (JWT, sessions)
2. **HTTPS**: Utilisez Let's Encrypt pour le SSL
3. **Validation**: Validez toutes les entrées utilisateur
4. **Rate Limiting**: Limitez les requêtes API
5. **Backup**: Sauvegardez régulièrement la base de données

## 🛠️ Développement

```bash
# Mode développement avec rechargement automatique
npm run dev
```

## 📝 Format des données

### Rapport
```json
{
    "id": "uuid",
    "site_id": "SITE-001",
    "site_name": "Chantier Centre-Ville",
    "activities": "Description des activités...",
    "comments": "Commentaires additionnels...",
    "supervisor_name": "Jean Dupont",
    "created_at": "2024-01-15T10:30:00Z",
    "status": "pending|reviewed"
}
```

### Feedback
```json
{
    "id": "uuid",
    "report_id": "uuid",
    "feedback": "Contenu de l'avis...",
    "pm_name": "Marie Martin",
    "created_at": "2024-01-15T11:00:00Z"
}
```

## 🤝 Support

Pour toute question ou problème, ouvrez une issue ou contactez l'administrateur système.

---

**Version**: 1.0.0  
**Licence**: MIT
