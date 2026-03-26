# YoRivSiteTrack-YST1
## Fiche Technique Annexe (CTO / Lead Engineer)

### 1) Perimetre fonctionnel
Plateforme de suivi chantier avec 3 fronts:
- Superviseur: saisie rapport, uploads photos, phases, statut, chat.
- PM / Group PM: supervision, feedback, affectation, export.
- Admin: gestion des comptes et des roles.

Use-cases principaux:
- Remontee terrain quotidienne structuree.
- Validation PM et feedback en boucle courte.
- Pilotage multi-sites par region/zone/periode.
- Cloture de site avec document acceptance.

---

### 2) Stack technique
- Backend: Node.js + Express + Socket.IO.
- Base de donnees: MongoDB Atlas via Mongoose.
- Frontend: HTML/CSS/JavaScript vanilla (web app/PWA).
- Auth: JWT Bearer + RBAC.
- Media: Cloudinary (prod) + fallback local (dev/urgence).
- Hebergement: Render (web service).

Fichier d'entree:
- `server.js` (API + Socket.IO + middleware + schemas).

---

### 3) Architecture logique
- Monolithe Node structure en couches legeres:
  - Route handlers API REST.
  - Middleware d'authentification JWT.
  - Models Mongoose (`User`, `Report`, `Site`, `ChatMessage`).
  - Service realtime Socket.IO (rooms role/zone/report).

Front:
- `public/index.html` + `public/js/supervisor.js`
- `public/pm.html` + `public/js/pm-dashboard.js`
- `public/admin.html` (admin panel)

---

### 4) Securite et controle d'acces
- Login: `POST /api/auth/login`
- JWT signe serveur (expir. 7 jours).
- Middleware `authMiddleware` sur endpoints metier.
- Middleware `requireRole(...)` pour routes sensibles.

Roles:
- `admin`
- `group_pm`
- `pm`
- `supervisor`

Mesures en place:
- Hash mot de passe (`bcryptjs`).
- Controle role sur creation/suppression comptes.
- Validation type/taille des uploads.
- Validation ObjectId sur lecture detail rapport.

---

### 5) Modeles de donnees (resume)
`User`
- `full_name`, `username`, `password_hash`, `role`, `zone`, `is_active`, `last_login`.

`Report`
- Site: `site_id`, `site_name`, `region`, `zone`.
- Metier: `phase_name`, `phase_status`, `phase_actual_days`, `phase_variance_days`.
- Qualite: `images[]`, `feedbacks[]`.
- Suivi: `status`, `reviewed_at`, `actual_duration_days`.
- Cloture: `is_final_acceptance`, `acceptance_document`.
- Scoring: `supervisor_score`, `score_breakdown`.

`Site`
- `id`, `name`, `region`, `zone`, `assigned_supervisor`, `assigned_by_pm`, `assigned_at`.

`ChatMessage`
- `scope_type` (`zone` | `report`), `scope_id`, `sender_role`, `sender_name`, `message`.

---

### 6) Workflow metier phase/planning
- 18 phases configurees cote serveur (`PHASES_CONFIG`).
- Chaque phase a:
  - duree min/max,
  - dependances,
  - poids de scoring.
- Statuts de phase: `start`, `on track`, `pending`, `closed`.
- Warnings de planning:
  - dependance non cloturee,
  - retard selon borne max.

KPI derivees:
- retard phase,
- score superviseur,
- RFI readiness selon phases critiques.

---

### 7) API REST (selection)
Auth:
- `POST /api/auth/login`
- `GET /api/auth/me`

Rapports:
- `GET /api/reports`
- `GET /api/reports/:id`
- `POST /api/reports`
- `DELETE /api/reports/:id` (roles management)
- `POST /api/reports/:reportId/feedback`

Uploads:
- `POST /api/reports/:reportId/images`
- `POST /api/reports/:reportId/acceptance-document`

Sites:
- `POST /api/sites`
- `GET /api/sites`
- `GET /api/sites/:siteId/phases-status`

Chat:
- `GET /api/chat/messages`
- `POST /api/chat/messages`

Export:
- `GET /api/export/excel`
- `GET /api/export/report/:id`

---

### 8) Realtime Socket.IO
Rooms:
- role (`supervisor`, `pm`, etc.),
- zone (`zone-...`),
- report (`report-...`),
- supervisor nom normalise.

Evenements principaux:
- `new-report`
- `new-images`
- `new-feedback`
- `report-status-updated`
- `new-site-assigned`
- `new-chat-message`
- `site-rfi-ready`
- `site-closed`

---

### 9) Media pipeline (Cloudinary)
Probleme initial corrige:
- stockage local `/uploads/...` non persistant en environment ephemere.

Etat actuel:
- images rapport et documents acceptance envoyes sur Cloudinary en prod.
- URL media persistantes (`res.cloudinary.com`).
- fallback local garde pour cas sans credentials.

Variables d'environnement requises:
- `MONGODB_URI`
- `JWT_SECRET`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

---

### 10) Front robustness et cache
Correctifs appliques:
- appels API superviseur harmonises via wrapper `apiFetchJson`.
- ajout systematique header `Authorization`.
- synchro defensive du token depuis `localStorage`.
- protections rendering modal (escape HTML).
- versioning script superviseur (`?v=...`) + incrementation cache SW.

Service Worker:
- mode network-first pour API / JS / CSS / HTML.
- cache versionne pour eviction propre.

---

### 11) Exploitation et deploiement
Scripts npm:
- `npm start` (production-like)
- `npm run dev` (nodemon)

Endpoints UI:
- Superviseur: `/`
- PM: `/pm`
- Admin: `/admin`

Deploiement cible:
- Render Web Service
- MongoDB Atlas
- Cloudinary

Points de controle post-deploiement:
- login JWT,
- creation rapport + upload photo,
- feedback PM vers superviseur,
- consultation detail rapport,
- export CSV.

---

### 12) Dette technique / recommandations CTO
Court terme:
- ajouter tests auto API (auth, reports, feedback, uploads).
- ajouter observabilite (logs structures + alerting).
- externaliser config securisee (rotation secrets).

Moyen terme:
- pipeline CI/CD (lint, test, deploy gate).
- hardening securite (rate limiting, audit logs, MFA admin).
- pagination API et index Mongo pour scaling.

Long terme:
- multi-tenant,
- analytics avancees (KPI SLA, forecast retards),
- app mobile native fully offline-first si besoin metier.

---

### 13) Evaluation de reprise par equipe technique
Complexite de reprise:
- Faible a moyenne (stack standard, code lisible, monolithe clair).

Risques faibles:
- dependances mainstream,
- architecture sans verrou proprietaire.

Levier principal de valeur:
- adequation metier deja prouvee + base evolutive exploitable rapidement.

