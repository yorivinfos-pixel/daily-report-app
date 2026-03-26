# Protocole de remise au client — YoRivSiteTrack-YST1

**YORIV HOLDING** — *Une vision, plusieurs solutions.*

Ce document sert de **référence contractuelle** pour définir ce qui est remis à l’acheteur à la clôture d’une vente (cession / licence / prestation), et de formaliser la **réception** par le client.

---

## 1) Objet

Formaliser la remise du produit **YoRivSiteTrack-YST1** (application web de suivi de chantiers : superviseurs, PM, admin) et des éléments nécessaires à son exploitation autonome ou accompagnée.

---

## 2) Périmètre de remise (selon le pack vendu)

Le vendeur précise dans le contrat commercial le pack retenu. Les blocs ci-dessous s’appliquent **uniquement** si inclus dans ledit pack.

| Bloc | Contenu typique | Inclus si |
|------|-----------------|-----------|
| **A — Code source** | Dépôt Git (ou archive ZIP signée), historique convenu, licence de réutilisation | Licence source / vente code |
| **B — Documentation** | Guides utilisateur, fiches techniques, offres commerciales fournies | Toujours recommandé |
| **C — Déploiement** | Paramétrage Render / MongoDB Atlas / Cloudinary, variables d’environnement (sans secrets en clair dans le code) | Pack « setup » |
| **D — Transfert d’exploitation** | Runbook, accès aux comptes cloud **créés au nom du client**, procédures backup | Pack entreprise / setup |
| **E — Formation** | Sessions visio / présentiel, supports | Selon offre |
| **F — Support** | Période et canal (email, ticket, téléphone) | Selon offre |

---

## 3) Livrables techniques (checklist vendeur)

Cocher au fur et à mesure de la préparation.

### 3.1 Code et structure du projet
- [ ] Arborescence du projet complète (backend `server.js`, front `public/`, assets CSS/JS, manifests PWA si applicables).
- [ ] Fichier `package.json` et lockfile (`package-lock.json`) pour reproductibilité des versions.
- [ ] Scripts npm documentés (`start`, `dev`).
- [ ] Aucun secret en dur dans le dépôt (tokens MongoDB, JWT, Cloudinary à retirer ou à remplacer par des placeholders avant remise si le contrat l’exige).

### 3.2 Base de données
- [ ] Schémas Mongoose décrits ou export de structure attendue (collections : utilisateurs, rapports, sites, messages de chat).
- [ ] Procédure de création d’un cluster MongoDB Atlas côté client (ou accès au cluster dédié au client).
- [ ] Si migration de données : plan de migration + fenêtre de bascule convenue.

### 3.3 Fichiers et médias
- [ ] Politique de stockage des images : **Cloudinary** en production (dossiers / conventions de nommage).
- [ ] Distinction claire : fichiers **hébergés chez le client** vs anciens chemins locaux `/uploads/...` (à ne plus utiliser en prod sans disque persistant).

### 3.4 Sécurité
- [ ] Liste des variables d’environnement requises : `MONGODB_URI`, `JWT_SECRET`, `CLOUDINARY_*`, `PORT` si besoin.
- [ ] Recommandation : **régénérer** tous les secrets côté client à la prise de possession.
- [ ] Rappel des rôles applicatifs : `admin`, `group_pm`, `pm`, `supervisor`.

### 3.5 Déploiement (si inclus)
- [ ] Compte Render (ou équivalent) au **nom du client** ou compte vendeur transféré selon accord écrit.
- [ ] Build / déploiement vérifié : login, création rapport, upload photo, feedback PM, export.
- [ ] Nom de domaine ou URL de production communiquée au client.

---

## 4) Livrables documentaires (checklist vendeur)

- [ ] Guide utilisateur (superviseur / PM / admin) — fichiers fournis avec le projet si présents.
- [ ] Fiche technique (CTO) et synthèse commerciale si vendues avec l’offre.
- [ ] Liste des URL d’accès : application superviseur, dashboard PM, admin (selon déploiement).
- [ ] Procédure de **première connexion** et création de comptes admin.

---

## 5) Ce qui n’est en général pas « remis » sans accord explicite

- Comptes personnels du vendeur (GitHub, Render, Cloudinary, MongoDB) **non** transférés : le client crée les siens ou un transfert formalisé est prévu.
- **Secrets** actuels de production : à **révoquer / régénérer** après migration.
- Données personnelles ou données métier sensibles : traitement conforme au contrat et à la réglementation applicable.
- Nom de domaine, marque, et droits de propriété intellectuelle : **définis dans le contrat de cession ou de licence**.

---

## 6) Procédure de passation (handover)

1. **Kick-off remise** : présentation du périmètre livré et du calendrier.
2. **Remise du support** : dépôt Git / archive + documentation.
3. **Atelier technique** (si prévu) : installation, variables d’environnement, déploiement.
4. **Recette** : le client exécute la checklist de réception (section 7).
5. **Clôture** : signature du PV de réception ou email de validation selon le contrat.

---

## 7) Checklist de réception (à remplir par le client)

Le client confirme avoir reçu et/ou validé les éléments suivants.

| # | Élément | Reçu / OK | Commentaire |
|---|---------|-----------|---------------|
| 1 | Code source ou accès au dépôt | ☐ | |
| 2 | Documentation utilisateur / technique | ☐ | |
| 3 | Liste des variables d’environnement | ☐ | |
| 4 | Environnement de production accessible (URL) | ☐ | |
| 5 | Connexion admin fonctionnelle | ☐ | |
| 6 | Connexion superviseur fonctionnelle | ☐ | |
| 7 | Connexion PM fonctionnelle | ☐ | |
| 8 | Création d’un rapport test | ☐ | |
| 9 | Upload photo test (Cloudinary) | ☐ | |
| 10 | Feedback PM test | ☐ | |
| 11 | Export (CSV) test si inclus | ☐ | |
| 12 | Formation effectuée (si prévue) | ☐ | |

**Réserve éventuelle** (à détailler) :

---

## 8) Procès-verbal de réception (modèle court)

**Projet :** YoRivSiteTrack-YST1  
**Client :** _________________________________________________  
**Prestataire / Cédant :** YORIV HOLDING  

Le soussigné, agissant en qualité de **_________________________________** pour le compte du **Client**, atteste :

- avoir pris connaissance des livrables listés au contrat et dans le présent protocole ;
- avoir effectué les vérifications de la checklist (section 7) ;
- **[ cocher une option ]**
  - ☐ **Accepter sans réserve** la remise du livrable.
  - ☐ **Accepter avec réserve** (cf. détail ci-dessous).

**Réserves :**  
_________________________________________________________________  
_________________________________________________________________

Fait à ____________________, le ___ / ___ / ______  

**Nom et signature du client :**  
_________________________________________________________________

**Nom et signature YORIV HOLDING :**  
_________________________________________________________________

---

## 9) Contact

**YORIV HOLDING**  
*Une vision, plusieurs solutions.*

Pour toute question sur ce protocole : préciser les coordonnées du signataire commercial dans le contrat ou l’offre signée.

---

*Document fourni à titre de modèle — adapter aux clauses du contrat définitif.*
