# Guide d'installation et d'utilisation - Dashboard PM

## 1. PRÉREQUIS
- Un ordinateur (Windows, Mac, Linux) avec un navigateur moderne (Chrome, Edge, Firefox)
- Un smartphone Android (pour l'application mobile)
- Connexion au réseau local ou Internet

## 2. INSTALLATION SUR PC (APPLICATION WEB)
**A. Lancer le serveur (si vous êtes l'administrateur)**
- Ouvrir un terminal dans le dossier du projet
- Exécuter : `node server.js`
- Laisser le serveur tourner

**B. Accéder au Dashboard PM**
- Ouvrir le navigateur sur l'adresse : `http://localhost:3000/pm.html`
- Pour une installation en application :
  - Cliquer sur l'icône “+” ou “Installer l'application” dans la barre d'adresse
  - Suivre les instructions pour ajouter le Dashboard PM sur le bureau

## 3. INSTALLATION SUR SMARTPHONE (APK)
**A. Copier le fichier DashboardPM.apk (fourni sur le bureau) sur le téléphone**
**B. Ouvrir le fichier sur le téléphone et autoriser l'installation d'applications inconnues**
**C. Lancer l'application Dashboard PM**
**D. Lors du premier lancement, entrer l'adresse IP du serveur (ex : 10.0.2.2 si émulateur, ou l'IP du PC sur le réseau)**

## 4. UTILISATION POUR LES PM (Project Managers)
- Accéder à `http://localhost:3000/pm.html` (ou via l'application installée)
- Se connecter avec son nom (champ en bas à gauche)
- Visualiser tous les rapports envoyés par les superviseurs
- Filtrer par province, statut, etc.
- Donner un feedback sur chaque rapport si besoin

## 5. UTILISATION POUR LES SUPERVISEURS
- Accéder à `http://localhost:3000/` (ou via l'application mobile)
- Remplir le formulaire pour envoyer un rapport (site, activités, photos...)
- Visualiser ses rapports envoyés
- Supprimer un rapport si besoin (bouton 🗑️ sur chaque carte)
- Recevoir les feedbacks du PM en temps réel

## 6. CONSEILS & ASTUCES
- Toujours vérifier que le serveur Node.js est lancé avant d'utiliser l'application
- L'application web fonctionne même hors-ligne après la première visite (PWA)
- Pour toute question technique, contacter l'administrateur du projet

**Bonne utilisation du Dashboard PM !**
