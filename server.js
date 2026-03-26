try { require('dotenv').config(); } catch (e) { console.log('Mode production: dotenv ignoré'); }

// ======= MongoDB Atlas (Mongoose) =======
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const mongoUri = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!mongoUri) {
    console.error('❌ FATAL: Variable d\'environnement MONGODB_URI manquante. Le serveur ne peut pas démarrer.');
    process.exit(1);
}
if (!JWT_SECRET) {
    console.error('❌ FATAL: Variable d\'environnement JWT_SECRET manquante. Le serveur ne peut pas démarrer.');
    process.exit(1);
}

mongoose.connect(mongoUri)
    .then(() => console.log("✅ Connecté à MongoDB avec succès sur Cluster0 !"))
    .catch(err => {
        console.error("❌ Erreur critique connexion MongoDB:", err.message);
        if (err.message.includes('replicaSet')) {
            console.warn("⚠️ Attention: L'ancienne chaîne de connexion replicaSet est détectée. Passage automatique à SRV...");
        }
    });

// ======= Modèle User =======
const userSchema = new mongoose.Schema({
    full_name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password_hash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'group_pm', 'program_manager', 'pm', 'supervisor'], required: true },
    zone: { type: String, default: '' },
    profile_photo: { type: String, default: '' },
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now },
    last_login: Date
});
const User = mongoose.model('User', userSchema);

const reportSchema = new mongoose.Schema({
    site_id: String,
    site_name: String,
    activities: String,
    comments: String,
    supervisor_name: String,
    region: String,
    zone: String,
    phase_name: String,
    phase_status: String,
    phase_start_date: String,
    phase_end_date: String,
    phase_estimated_label: String,
    phase_estimated_min_days: Number,
    phase_estimated_max_days: Number,
    phase_actual_days: Number,
    phase_variance_days: Number,
    schedule_warnings: [String],
    is_rfi_ready: { type: Boolean, default: false },
    rfi_ready_at: Date,
    milestone_category: String,
    planned_duration_days: Number,
    actual_duration_days: Number,
    is_final_acceptance: { type: Boolean, default: false },
    acceptance_document: {
        filename: String,
        original_name: String,
        url: String,
        uploaded_at: Date
    },
    supervisor_score: Number,
    score_breakdown: {
        schedule_score: Number,
        quality_score: Number,
        phase_points: [
            {
                phase_name: String,
                points: Number,
                delay_days: Number
            }
        ]
    },
    report_date: String,
    created_at: { type: Date, default: Date.now },
    status: { type: String, default: 'pending' },
    images: [
        {
            url: String,
            filename: String
        }
    ],
    feedbacks: [
        {
            pm_name: String,
            feedback: String,
            created_at: { type: Date, default: Date.now }
        }
    ],
    reviewed_at: Date
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

const Report = mongoose.model('Report', reportSchema);

async function reconcileReviewedReports() {
    try {
        const result = await Report.updateMany(
            { status: { $ne: 'reviewed' }, 'feedbacks.0': { $exists: true } },
            { $set: { status: 'reviewed' } }
        );
        if (result.modifiedCount > 0) {
            console.log(`ℹ️ Synchronisation statuts: ${result.modifiedCount} rapport(s) passés à reviewed`);
        }
    } catch (err) {
        console.warn('⚠️ Impossible de synchroniser les statuts reviewed:', err.message);
    }
}

setTimeout(() => {
    reconcileReviewedReports();
}, 2000);

function normalizeProvince(str = '') {
    return String(str)
        .trim()
        .normalize('NFD')
        // Compatibility: remove accents by stripping combining marks
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

const PROVINCE_TO_ZONE = {
    // Zone 1 — Ouest / Grand Bandundu / Grand Équateur
    [normalizeProvince('Kinshasa')]: 'Zone 1',
    [normalizeProvince('Kongo-Central')]: 'Zone 1',
    [normalizeProvince('Bandundu')]: 'Zone 1',
    [normalizeProvince('Kwango')]: 'Zone 1',
    [normalizeProvince('Kwilu')]: 'Zone 1',
    [normalizeProvince('Equateur')]: 'Zone 1',
    [normalizeProvince('Mai-Ndombe')]: 'Zone 1',
    [normalizeProvince('Mongala')]: 'Zone 1',
    [normalizeProvince('Tshuapa')]: 'Zone 1',
    [normalizeProvince('Nord-Ubangi')]: 'Zone 1',
    [normalizeProvince('Sud-Ubangi')]: 'Zone 1',

    // Zone 2 — Est (Kivu, Maniema, etc.) — pas le copper belt
    [normalizeProvince('Maniema')]: 'Zone 2',
    [normalizeProvince('Nord-Kivu')]: 'Zone 2',
    [normalizeProvince('Sud-Kivu')]: 'Zone 2',
    [normalizeProvince('Nord Kivu')]: 'Zone 2',
    [normalizeProvince('Sud Kivu')]: 'Zone 2',
    [normalizeProvince('Ituri')]: 'Zone 2',
    [normalizeProvince('Tshopo')]: 'Zone 2',
    [normalizeProvince('Bas-Uele')]: 'Zone 2',
    [normalizeProvince('Haut-Uele')]: 'Zone 2',
    [normalizeProvince('Lomami')]: 'Zone 2',
    [normalizeProvince('Haut-Lomami')]: 'Zone 2',
    [normalizeProvince('Tanganyika')]: 'Zone 2',

    // Zone 3 — Grand Kasaï
    [normalizeProvince('Kasai-Central')]: 'Zone 3',
    [normalizeProvince('Kasai-Oriental')]: 'Zone 3',
    [normalizeProvince('Kasai')]: 'Zone 3',
    [normalizeProvince('Sankuru')]: 'Zone 3',

    // Zone 4 — Copper belt (Haut-Katanga, Lualaba, etc.)
    [normalizeProvince('Haut-Katanga')]: 'Zone 4',
    [normalizeProvince('Lualaba')]: 'Zone 4'
};

function getZoneFromRegion(region) {
    return PROVINCE_TO_ZONE[normalizeProvince(region)] || 'Zone 4';
}

const siteSchema = new mongoose.Schema({
    id: String,
    name: String,
    location: String,
    region: String,
    zone: String,
    assigned_supervisor: String,
    assigned_by_pm: String,
    assigned_at: Date,
    b2s_vendor: { type: String, default: '' },
    target_rfi: { type: String, default: '' },
    created_at: { type: Date, default: Date.now }
});
const Site = mongoose.model('Site', siteSchema);

const chatMessageSchema = new mongoose.Schema({
    scope_type: { type: String, enum: ['zone', 'report'], required: true },
    scope_id: { type: String, required: true },
    sender_role: { type: String, enum: ['pm', 'supervisor'], required: true },
    sender_name: { type: String, required: true },
    message: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
});
const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: '*',
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json({ limit: '10mb' }));
app.use(mongoSanitize());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.use('/uploads', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Fichier introuvable. Ce fichier a été perdu car il était stocké en local sur un serveur éphémère. Configurez Cloudinary pour éviter ce problème.'
    });
});

// ======= Middleware JWT =======
function generateToken(user) {
    return jwt.sign(
        { id: user._id, username: user.username, role: user.role, full_name: user.full_name, zone: user.zone },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Token manquant' });
    }
    try {
        const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ success: false, error: 'Token invalide ou expiré' });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Accès refusé' });
        }
        next();
    };
}

// ======= Routes AUTH (publiques) =======
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ success: false, error: 'Identifiant et mot de passe requis' });
        }
        const user = await User.findOne({ username: username.trim().toLowerCase() });
        if (!user) {
            return res.status(401).json({ success: false, error: 'Identifiant ou mot de passe incorrect' });
        }
        if (!user.is_active) {
            return res.status(403).json({ success: false, error: 'Compte désactivé. Contactez l\'administrateur.' });
        }
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Identifiant ou mot de passe incorrect' });
        }
        user.last_login = new Date();
        await user.save();
        const token = generateToken(user);
        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                full_name: user.full_name,
                username: user.username,
                role: user.role,
                zone: user.zone,
                profile_photo: user.profile_photo || ''
            }
        });
    } catch (err) {
        console.error('Erreur login:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password_hash');
        if (!user) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password) {
            return res.status(400).json({ success: false, error: 'Mot de passe actuel et nouveau requis' });
        }
        if (String(new_password).length < 6) {
            return res.status(400).json({ success: false, error: 'Le nouveau mot de passe doit comporter au moins 6 caractères' });
        }
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
        const valid = await bcrypt.compare(current_password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Mot de passe actuel incorrect' });
        }
        user.password_hash = await bcrypt.hash(new_password, 10);
        await user.save();
        res.json({ success: true, message: 'Mot de passe mis à jour' });
    } catch (err) {
        console.error('Erreur change-password:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// ======= Routes ADMIN (gestion des comptes) =======
app.get('/api/admin/users', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-password_hash').sort({ role: 1, full_name: 1 });
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erreur chargement utilisateurs' });
    }
});

app.post('/api/admin/users', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { full_name, username, password, role, zone } = req.body;
        if (!full_name || !username || !password || !role) {
            return res.status(400).json({ success: false, error: 'Champs requis: full_name, username, password, role' });
        }
        if (!['admin', 'group_pm', 'program_manager', 'pm', 'supervisor'].includes(role)) {
            return res.status(400).json({ success: false, error: 'Rôle invalide' });
        }
        const existing = await User.findOne({ username: username.trim().toLowerCase() });
        if (existing) {
            return res.status(409).json({ success: false, error: 'Ce nom d\'utilisateur existe déjà' });
        }
        const password_hash = await bcrypt.hash(password, 10);
        const user = new User({
            full_name: full_name.trim(),
            username: username.trim().toLowerCase(),
            password_hash,
            role,
            zone: zone || ''
        });
        await user.save();
        const safeUser = user.toObject();
        delete safeUser.password_hash;
        res.json({ success: true, user: safeUser });
    } catch (err) {
        console.error('Erreur création utilisateur:', err);
        res.status(500).json({ success: false, error: 'Erreur création utilisateur' });
    }
});

app.put('/api/admin/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { full_name, username, password, role, zone, is_active } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });

        if (full_name) user.full_name = full_name.trim();
        if (username) user.username = username.trim().toLowerCase();
        if (password) user.password_hash = await bcrypt.hash(password, 10);
        if (role && ['admin', 'group_pm', 'program_manager', 'pm', 'supervisor'].includes(role)) user.role = role;
        if (zone !== undefined) user.zone = zone;
        if (is_active !== undefined) user.is_active = is_active;

        await user.save();
        const safeUser = user.toObject();
        delete safeUser.password_hash;
        res.json({ success: true, user: safeUser });
    } catch (err) {
        console.error('Erreur modification utilisateur:', err);
        res.status(500).json({ success: false, error: 'Erreur modification utilisateur' });
    }
});

app.delete('/api/admin/users/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'Utilisateur introuvable' });
        if (user.role === 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin', is_active: true });
            if (adminCount <= 1) {
                return res.status(400).json({ success: false, error: 'Impossible de supprimer le dernier admin' });
            }
        }
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erreur suppression utilisateur' });
    }
});

// Endpoint pour lister les superviseurs (utilisé par les dropdowns)
app.get('/api/users/supervisors', authMiddleware, async (req, res) => {
    try {
        const supervisors = await User.find({ role: 'supervisor', is_active: true })
            .select('full_name username zone profile_photo').sort({ full_name: 1 });
        res.json({ success: true, supervisors });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erreur chargement superviseurs' });
    }
});

// Upload photo de profil
app.post('/api/users/profile-photo', authMiddleware, (req, res, next) => {
    upload.single('photo')(req, res, (err) => {
        if (!err) return next();
        return res.status(400).json({ success: false, error: 'Upload photo invalide' });
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'Aucune photo fournie' });
        const photoUrl = req.file.path || req.file.url || `/uploads/images/${req.file.filename}`;
        await User.findByIdAndUpdate(req.user.id, { profile_photo: photoUrl });
        res.json({ success: true, profile_photo: photoUrl });
    } catch (err) {
        console.error('Erreur upload photo profil:', err);
        res.status(500).json({ success: false, error: 'Erreur upload photo profil' });
    }
});

// Récupérer les infos utilisateurs avec photos (pour le PM dashboard)
app.get('/api/users/profiles', authMiddleware, async (req, res) => {
    try {
        const users = await User.find({ is_active: true })
            .select('full_name username role zone profile_photo').sort({ full_name: 1 });
        res.json({ success: true, users });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Erreur chargement profils' });
    }
});

// ======= Migration : configurer les zones et nouveaux rôles =======
app.post('/api/admin/setup-zones', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const results = [];

        // 1. Supprimer le compte Sunil (group_pm)
        const sunil = await User.findOne({ username: 'sunil' });
        if (sunil) {
            sunil.is_active = false;
            await sunil.save();
            results.push('Sunil désactivé');
        }

        // 2. Créer les Program Managers s'ils n'existent pas
        const programManagers = [
            { full_name: 'Prince BEDESIRE', username: 'prince.bedesire', role: 'program_manager', zone: '' },
            { full_name: 'Josian DOLA', username: 'josian.dola', role: 'program_manager', zone: '' }
        ];
        for (const pm of programManagers) {
            const exists = await User.findOne({ username: pm.username });
            if (!exists) {
                const bcrypt = require('bcryptjs');
                const hash = await bcrypt.hash(process.env.SEED_DEFAULT_PASSWORD || 'PASSWORD_REDACTED', 10);
                await User.create({ ...pm, password_hash: hash });
                results.push(`${pm.full_name} créé (program_manager)`);
            } else {
                exists.role = 'program_manager';
                await exists.save();
                results.push(`${pm.full_name} mis à jour (program_manager)`);
            }
        }

        // 3. Affecter PM Jean-Baptiste à Zone Kasaï
        const pmJB = await User.findOne({ full_name: /jean.baptiste/i });
        if (pmJB) { pmJB.zone = 'Zone 3'; await pmJB.save(); results.push(`PM ${pmJB.full_name} → Zone 3 (Kasaï)`); }

        // 4. Affecter les superviseurs aux zones
        const zoneAssignments = [
            { names: ['baudoin', 'denis'], zone: 'Zone 3' },
            { names: ['patient', 'pacifique', 'bravo', 'evariste'], zone: 'Zone 2' },
            { names: ['gaston', 'patou'], zone: 'Zone 4' },
            { names: ['grace', 'vincent', 'don'], zone: 'Zone 1' }
        ];

        for (const assignment of zoneAssignments) {
            for (const name of assignment.names) {
                const user = await User.findOne({
                    role: 'supervisor',
                    $or: [
                        { full_name: new RegExp(name, 'i') },
                        { username: new RegExp(name, 'i') }
                    ]
                });
                if (user) {
                    user.zone = assignment.zone;
                    await user.save();
                    results.push(`${user.full_name} → ${assignment.zone}`);
                } else {
                    results.push(`⚠️ Superviseur "${name}" non trouvé`);
                }
            }
        }

        // 5. Créer le superviseur Bravo s'il n'existe pas
        const bravo = await User.findOne({ full_name: /bravo/i });
        if (!bravo) {
            const bcrypt = require('bcryptjs');
            const hash = await bcrypt.hash(process.env.SEED_DEFAULT_PASSWORD || 'PASSWORD_REDACTED', 10);
            await User.create({ full_name: 'Bravo SUPERVISOR', username: 'bravo.supervisor', password_hash: hash, role: 'supervisor', zone: 'Zone 2' });
            results.push('Bravo créé (superviseur, Zone 2)');
        }

        res.json({ success: true, results });
    } catch (err) {
        console.error('Erreur setup-zones:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Affectation des noms officiels des PM par zone + superviseur Bravo Béton (Est)
app.post('/api/admin/sync-pm-names', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const results = [];
        const seedPwd = process.env.SEED_DEFAULT_PASSWORD || 'PASSWORD_REDACTED';

        let pm3 = await User.findOne({ username: 'pm3', role: 'pm' });
        if (!pm3) pm3 = await User.findOne({ role: 'pm', zone: 'Zone 3' });
        if (pm3) {
            pm3.full_name = 'Jean-Baptiste MBUYI';
            pm3.zone = 'Zone 3';
            await pm3.save();
            results.push('Zone 3 (Kasaï) → Jean-Baptiste MBUYI');
        } else {
            results.push('⚠️ PM Zone 3 introuvable (compte pm3 ou rôle pm + Zone 3)');
        }

        let pm4 = await User.findOne({ username: 'pm4', role: 'pm' });
        if (!pm4) pm4 = await User.findOne({ role: 'pm', zone: 'Zone 4' });
        if (pm4) {
            pm4.full_name = 'Jean-Claude MULAND';
            pm4.zone = 'Zone 4';
            await pm4.save();
            results.push('Zone 4 (Haut-Katanga) → Jean-Claude MULAND');
        } else {
            results.push('⚠️ PM Zone 4 introuvable (compte pm4 ou rôle pm + Zone 4)');
        }

        let bravoUser = await User.findOne({ username: 'bravo.supervisor' });
        if (!bravoUser) bravoUser = await User.findOne({ username: 'bravo.beton', role: 'supervisor' });
        if (!bravoUser) {
            bravoUser = await User.findOne({
                role: 'supervisor',
                $or: [{ full_name: /bravo/i }, { username: /bravo/i }]
            });
        }
        if (bravoUser) {
            bravoUser.full_name = 'Bravo Béton';
            bravoUser.zone = 'Zone 2';
            if (bravoUser.username === 'bravo.supervisor') {
                const taken = await User.findOne({ username: 'bravo.beton' });
                if (!taken) bravoUser.username = 'bravo.beton';
            }
            await bravoUser.save();
            results.push('Superviseur Est → Bravo Béton (Zone 2)');
        } else {
            const password_hash = await bcrypt.hash(seedPwd, 10);
            await User.create({
                full_name: 'Bravo Béton',
                username: 'bravo.beton',
                password_hash,
                role: 'supervisor',
                zone: 'Zone 2'
            });
            results.push('Bravo Béton créé (superviseur, Zone 2 — Est)');
        }

        res.json({ success: true, results });
    } catch (err) {
        console.error('Erreur sync-pm-names:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ======= Seed initial : créer l'admin si aucun user =======
async function seedInitialUsers() {
    try {
        const count = await User.countDocuments();
        if (count > 0) return;

        const seedPassword = process.env.SEED_DEFAULT_PASSWORD;
        if (!seedPassword) {
            console.warn('⚠️ Seed ignoré: variable SEED_DEFAULT_PASSWORD non définie. Créez les comptes via l\'admin.');
            return;
        }

        console.log('🌱 Création des comptes initiaux...');

        const users = [
            { full_name: 'Administrateur', username: 'admin', role: 'admin', zone: '' },
            { full_name: 'Sunil (Group PM)', username: 'sunil', role: 'group_pm', zone: '' },
            { full_name: 'PM Zone 1', username: 'pm1', role: 'pm', zone: 'Zone 1' },
            { full_name: 'PM Zone 2', username: 'pm2', role: 'pm', zone: 'Zone 2' },
            { full_name: 'Jean-Baptiste MBUYI', username: 'pm3', role: 'pm', zone: 'Zone 3' },
            { full_name: 'Jean-Claude MULAND', username: 'pm4', role: 'pm', zone: 'Zone 4' },
            { full_name: 'Evariste FAMBA', username: 'evariste.famba', role: 'supervisor', zone: '' },
            { full_name: 'Gaston MUTSHIPULE', username: 'gaston.mutshipule', role: 'supervisor', zone: '' },
            { full_name: 'Patou KIESELO', username: 'patou.kieselo', role: 'supervisor', zone: '' },
            { full_name: 'Denis ILUNGA', username: 'denis.ilunga', role: 'supervisor', zone: '' },
            { full_name: 'Grace NGOMBA', username: 'grace.ngomba', role: 'supervisor', zone: '' },
            { full_name: 'Don MAFINGE', username: 'don.mafinge', role: 'supervisor', zone: '' },
            { full_name: 'Vincent KAPAJIKA', username: 'vincent.kapajika', role: 'supervisor', zone: '' },
            { full_name: 'Patient KYAVIRO', username: 'patient.kyaviro', role: 'supervisor', zone: '' },
            { full_name: 'Baudoin TSHIMBUNDU', username: 'baudoin.tshimbundu', role: 'supervisor', zone: '' },
            { full_name: 'Pacifique KABASODA', username: 'pacifique.kabasoda', role: 'supervisor', zone: '' },
        ];

        for (const u of users) {
            const password_hash = await bcrypt.hash(seedPassword, 10);
            await User.create({
                full_name: u.full_name,
                username: u.username,
                password_hash,
                role: u.role,
                zone: u.zone
            });
        }
        console.log(`✅ ${users.length} comptes créés (admin, group_pm, 4 PM, 10 superviseurs)`);
    } catch (err) {
        console.warn('⚠️ Erreur seed utilisateurs:', err.message);
    }
}

setTimeout(() => {
    seedInitialUsers();
}, 3000);

const hasCloudinaryCreds = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET &&
    process.env.CLOUDINARY_CLOUD_NAME !== 'VOTRE_CLOUD_NAME' &&
    process.env.CLOUDINARY_API_KEY !== 'VOTRE_API_KEY' &&
    process.env.CLOUDINARY_API_SECRET !== 'VOTRE_API_SECRET'
);

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'VOTRE_CLOUD_NAME',
    api_key: process.env.CLOUDINARY_API_KEY || 'VOTRE_API_KEY',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'VOTRE_API_SECRET',
});

const imageUploadDir = path.join(__dirname, 'uploads', 'images');
if (!fs.existsSync(imageUploadDir)) {
    fs.mkdirSync(imageUploadDir, { recursive: true });
}

const localImageStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, imageUploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '');
        cb(null, `${Date.now()}-${uuidv4()}${ext}`);
    }
});

const cloudinaryStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => ({
        folder: 'daily-report-site-supervisor',
        format: file.mimetype.split('/')[1],
        public_id: `${Date.now()}-${uuidv4()}`,
        resource_type: 'image',
    }),
});

const upload = multer({
    storage: hasCloudinaryCreds ? cloudinaryStorage : localImageStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        // Some phones (e.g. iPhone) upload HEIC/HEIF photos
        const allowedTypes = /jpeg|jpg|png|gif|webp|heic|heif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Seules les images sont autorisées!'));
    },
});

if (!hasCloudinaryCreds) {
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ❌ CLOUDINARY NON CONFIGURÉ                                ║');
    console.error('║  Les images seront stockées en local et PERDUES sur Render! ║');
    console.error('║  Ajoutez CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et       ║');
    console.error('║  CLOUDINARY_API_SECRET dans vos variables d\'environnement.  ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
}

const acceptanceUploadDir = path.join(__dirname, 'uploads', 'acceptance');
if (!fs.existsSync(acceptanceUploadDir)) {
    fs.mkdirSync(acceptanceUploadDir, { recursive: true });
}

const acceptanceLocalStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, acceptanceUploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '');
        cb(null, `${Date.now()}-${uuidv4()}${ext}`);
    }
});

const acceptanceCloudinaryStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => ({
        folder: 'daily-report-acceptance',
        public_id: `${Date.now()}-${uuidv4()}`,
        resource_type: /pdf/.test(file.mimetype) ? 'raw' : 'image',
    }),
});

const acceptanceUpload = multer({
    storage: hasCloudinaryCreds ? acceptanceCloudinaryStorage : acceptanceLocalStorage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /pdf|jpeg|jpg|png|webp/;
        const extname = allowed.test(path.extname(file.originalname).toLowerCase());
        const mimetype = /(application\/pdf|image\/jpeg|image\/jpg|image\/png|image\/webp)/.test(file.mimetype);
        if (extname && mimetype) return cb(null, true);
        cb(new Error('Document acceptance invalide (PDF ou image uniquement).'));
    }
});

function computeActualDurationDays(startDate, endDate) {
    const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    const day = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, day);
}

function computeSupervisorScore({ plannedDays, actualDays, reportsCount, totalImages, feedbackCount }) {
    const planned = Number(plannedDays) || 0;
    const actual = Number(actualDays) || 0;
    let scheduleScore = 70;
    if (planned > 0 && actual > 0) {
        if (actual <= planned) scheduleScore = 100;
        else {
            const overrunPct = ((actual - planned) / planned) * 100;
            scheduleScore = Math.max(20, Math.round(100 - overrunPct));
        }
    }

    const hasImageScore = Math.min(100, totalImages > 0 ? 70 + Math.min(30, totalImages * 2) : 40);
    const reportingScore = Math.min(100, 60 + Math.min(40, reportsCount * 4));
    const communicationScore = Math.min(100, 60 + Math.min(40, feedbackCount * 8));
    const qualityScore = Math.round((hasImageScore * 0.4) + (reportingScore * 0.35) + (communicationScore * 0.25));

    const finalScore = Math.round((scheduleScore * 0.6) + (qualityScore * 0.4));
    return { finalScore, scheduleScore, qualityScore };
}

const PHASES_CONFIG = {
    'Implantation': { min: 1, max: 1, deps: [], weight: 2 },
    'Excavation': { min: 2, max: 5, deps: [], weight: 6 },
    'Réseau de terre': { min: 1, max: 1, deps: ['Excavation'], weight: 4 },
    'Béton de propreté': { min: 1, max: 1, deps: ['Excavation'], weight: 3 },
    'Rebars': { min: 2, max: 5, deps: ['Béton de propreté'], weight: 6 },
    'RFC (Ready for Casting)': { min: 1, max: 1, deps: ['Rebars'], weight: 3 },
    'Casting (Coulage)': { min: 1, max: 1, deps: ['Rebars'], weight: 7 },
    'Curing': { min: 5, max: 7, deps: ['Casting (Coulage)'], weight: 5 },
    'Backfilling': { min: 2, max: 3, deps: ['Casting (Coulage)'], weight: 5 },
    'Tower Erection': { min: 3, max: 5, deps: ['Casting (Coulage)'], weight: 8 },
    'Casting Slabs': { min: 1, max: 2, deps: ['Backfilling'], weight: 6 },
    'Manholes': { min: 2, max: 3, deps: ['Tower Erection'], weight: 6 },
    'Power Installation': { min: 1, max: 2, deps: ['Casting Slabs', 'Tower Erection'], weight: 8 },
    'Guardhouse': { min: 5, max: 10, deps: ['Tower Erection'], weight: 9 },
    'Fence': { min: 5, max: 10, deps: ['Tower Erection'], weight: 9 },
    'Nivellement & Épandage': { min: 1, max: 2, deps: ['Guardhouse', 'Fence'], weight: 6 },
    'Cleaning Site': { min: 1, max: 1, deps: ['Power Installation', 'Nivellement & Épandage'], weight: 7 },
    'Autres': { min: 1, max: 999, deps: [], weight: 0 }
};

function buildEstimatedLabel(min, max) {
    return min === max ? `${min}` : `${min}-${max}`;
}

function computeDelayDays(actualDays, maxDays) {
    const actual = Number(actualDays || 0);
    const max = Number(maxDays || 0);
    if (!actual || !max) return 0;
    return Math.max(0, Math.round((actual - max) * 10) / 10);
}

const RFI_REQUIRED_PHASES = [
    'Casting (Coulage)',
    'Tower Erection',
    'Casting Slabs',
    'Power Installation',
    'Manholes'
];

function computePhaseWeightedScore(siteReports) {
    const closedByPhase = new Map();
    const startByPhase = new Map();

    siteReports.forEach(r => {
        if (!r.phase_name) return;
        if (!startByPhase.has(r.phase_name)) {
            startByPhase.set(r.phase_name, r);
        }
        if (r.phase_status === 'closed') {
            const prev = closedByPhase.get(r.phase_name);
            if (!prev || new Date(r.created_at) > new Date(prev.created_at)) {
                closedByPhase.set(r.phase_name, r);
            }
        }
    });

    let score = 0;
    const phasePoints = [];
    Object.entries(PHASES_CONFIG).forEach(([phaseName, cfg]) => {
        const closedReport = closedByPhase.get(phaseName);
        if (!closedReport) return;
        const startReport = startByPhase.get(phaseName);

        let actual = Number(closedReport.phase_actual_days || 0);

        if (closedReport.phase_start_date && closedReport.phase_end_date) {
            const s = new Date(closedReport.phase_start_date);
            const e = new Date(closedReport.phase_end_date);
            if (!isNaN(s) && !isNaN(e) && e >= s) {
                actual = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
            }
        } else if (startReport && closedReport) {
            const sDate = startReport.phase_start_date || startReport.report_date || startReport.created_at;
            const eDate = closedReport.phase_end_date || closedReport.report_date || closedReport.created_at;
            const s = new Date(sDate);
            const e = new Date(eDate);
            if (!isNaN(s) && !isNaN(e) && e >= s) {
                actual = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
            }
        }

        const delayDays = computeDelayDays(actual, cfg.max);
        // 100% = à temps, -10% par jour de retard, minimum 0%
        let phasePct = 100;
        if (delayDays > 0) phasePct = Math.max(0, 100 - (delayDays * 10));
        phasePct = Math.round(phasePct);

        score += phasePct;
        phasePoints.push({
            phase_name: phaseName,
            points: phasePct,
            delay_days: delayDays
        });
    });

    const totalPct = phasePoints.length > 0 ? Math.round(score / phasePoints.length) : 0;
    return {
        total: totalPct,
        phasePoints
    };
}

function isSiteRfiReady(siteReports) {
    const closed = new Set(
        siteReports.filter(r => r.phase_name && r.phase_status === 'closed').map(r => r.phase_name)
    );
    return RFI_REQUIRED_PHASES.every(p => closed.has(p));
}

app.get('/api/phases-config', (req, res) => {
    res.json({ success: true, phases: PHASES_CONFIG });
});

app.get('/api/sites/:siteId/phases-status', authMiddleware, async (req, res) => {
    try {
        const siteReports = await Report.find({ site_id: req.params.siteId }).sort({ report_date: 1, created_at: 1 });

        // Group reports by phase
        const reportsByPhase = new Map();
        siteReports.forEach(r => {
            if (!r.phase_name) return;
            if (!reportsByPhase.has(r.phase_name)) reportsByPhase.set(r.phase_name, []);
            reportsByPhase.get(r.phase_name).push(r);
        });

        const phases = Object.entries(PHASES_CONFIG).map(([name, cfg]) => {
            const phaseReports = reportsByPhase.get(name) || [];
            let status = 'pending';
            let actual_days = 0;
            let color = 'gray';
            let start_date = null;
            let closed_date = null;

            if (phaseReports.length > 0) {
                const firstReport = phaseReports[0];
                start_date = firstReport.phase_start_date || firstReport.report_date || firstReport.created_at;

                const closedReport = phaseReports.find(r => r.phase_status === 'closed');
                if (closedReport) {
                    closed_date = closedReport.phase_end_date || closedReport.report_date || closedReport.created_at;
                    const s = new Date(start_date);
                    const e = new Date(closed_date);
                    if (!isNaN(s) && !isNaN(e)) {
                        actual_days = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
                    }
                    status = 'closed';
                    const delay = computeDelayDays(actual_days, cfg.max);
                    color = delay > 0 ? 'red' : 'green';
                } else {
                    const today = new Date();
                    const s = new Date(start_date);
                    if (!isNaN(s)) {
                        actual_days = Math.max(1, Math.round((today - s) / (1000 * 60 * 60 * 24)) + 1);
                    }
                    status = 'in_progress';
                    if (actual_days <= cfg.min) color = 'green';
                    else if (actual_days <= cfg.max) color = 'orange';
                    else color = 'red';
                }
            }

            return {
                name,
                min: cfg.min,
                max: cfg.max,
                weight: cfg.weight,
                status,
                actual_days,
                color,
                start_date,
                closed_date
            };
        });

        const scoreResult = computePhaseWeightedScore(siteReports);
        const siteScore = {
            total: scoreResult.total,
            closed_count: scoreResult.phasePoints.length,
            phase_points: scoreResult.phasePoints
        };

        res.json({ success: true, phases, site_score: siteScore });
    } catch (err) {
        console.error('Erreur phases-status:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

// Auto-calculate phase duration for a site (used by supervisor form)
app.get('/api/sites/:siteId/phase-auto-days', authMiddleware, async (req, res) => {
    try {
        const siteId = req.params.siteId;
        const phaseName = req.query.phase_name || '';
        if (!siteId || !phaseName) {
            return res.json({ success: true, auto_days: 0, start_date: null, estimated_min: 0, estimated_max: 0 });
        }

        // Find all reports for this site with this phase
        const phaseReports = await Report.find({
            site_id: siteId,
            phase_name: phaseName
        }).sort({ report_date: 1, created_at: 1 });

        const cfg = PHASES_CONFIG[phaseName] || { min: 0, max: 0 };
        let autoDays = 0;
        let startDate = null;
        let phaseStatus = 'not_started';

        if (phaseReports.length > 0) {
            // Find the earliest report for this phase (the "start")
            const firstReport = phaseReports[0];
            startDate = firstReport.report_date || firstReport.created_at;

            // Check if the phase is already closed
            const closedReport = phaseReports.find(r => r.phase_status === 'closed');
            if (closedReport) {
                // Phase is closed - use the closed report's date as end
                const endDate = closedReport.report_date || closedReport.created_at;
                const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
                autoDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
                phaseStatus = 'closed';
            } else {
                // Phase is in progress - calculate from start to today
                const today = new Date(req.query.report_date || new Date().toISOString().split('T')[0]);
                const diffMs = today.getTime() - new Date(startDate).getTime();
                autoDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
                phaseStatus = 'in_progress';
            }
        }

        // Also get all phases summary for this site
        const allSiteReports = await Report.find({ site_id: siteId }).sort({ created_at: 1 });
        const phasesSummary = {};
        allSiteReports.forEach(r => {
            if (!r.phase_name) return;
            if (!phasesSummary[r.phase_name]) {
                phasesSummary[r.phase_name] = {
                    start_date: r.report_date || r.created_at,
                    status: r.phase_status || 'on track',
                    reports_count: 0
                };
            }
            phasesSummary[r.phase_name].reports_count++;
            // Keep updating status to latest
            phasesSummary[r.phase_name].status = r.phase_status || 'on track';
        });

        res.json({
            success: true,
            auto_days: autoDays,
            start_date: startDate,
            phase_status: phaseStatus,
            estimated_min: cfg.min,
            estimated_max: cfg.max,
            phases_summary: phasesSummary
        });
    } catch (err) {
        console.error('Erreur phase-auto-days:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/pm', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pm.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ================== API ROUTES (protégées par JWT) ==================

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET tous les rapports
app.get('/api/reports', authMiddleware, async (req, res) => {
    try {
        const query = {};
        if (req.query.supervisor_name) {
            const raw = String(req.query.supervisor_name).trim();
            if (raw) {
                // Correspondance insensible à la casse / espaces superflus côté DB
                query.supervisor_name = new RegExp(`^\\s*${escapeRegex(raw)}\\s*$`, 'i');
            }
        }
        const reports = await Report.find(query).sort({ created_at: -1 });
        res.json({ success: true, reports });
    } catch (err) {
        console.error('Erreur chargement rapports:', err);
        res.status(500).json({ success: false, error: 'Erreur chargement rapports' });
    }
});

app.get('/api/reports/:id', authMiddleware, async (req, res) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, error: 'Identifiant de rapport invalide' });
        }
        const report = await Report.findById(id);
        if (!report) return res.status(404).json({ success: false, error: 'Rapport introuvable' });
        res.json({ success: true, report });
    } catch (err) {
        console.error('Erreur chargement rapport:', err);
        res.status(500).json({ success: false, error: 'Erreur chargement rapport' });
    }
});

app.post('/api/reports', authMiddleware, async (req, res) => {
    try {
        const reportData = { ...req.body };
        if (!reportData.report_date) reportData.report_date = new Date().toISOString().split('T')[0];
        if (!reportData.region) reportData.region = 'Non spécifiée';
        if (!reportData.zone) reportData.zone = getZoneFromRegion(reportData.region);
        if (!reportData.milestone_category) reportData.milestone_category = reportData.phase_name || 'Autres';
        if (reportData.planned_duration_days !== undefined) {
            reportData.planned_duration_days = Number(reportData.planned_duration_days) || 0;
        }
        if (!reportData.phase_status) reportData.phase_status = 'on track';

        if (reportData.phase_start_date && reportData.phase_end_date) {
            const start = new Date(reportData.phase_start_date);
            const end = new Date(reportData.phase_end_date);
            if (!isNaN(start) && !isNaN(end) && end >= start) {
                reportData.phase_actual_days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
            }
        } else if (reportData.phase_start_date && reportData.phase_status !== 'closed') {
            const start = new Date(reportData.phase_start_date);
            const today = new Date(reportData.report_date || Date.now());
            if (!isNaN(start) && !isNaN(today) && today >= start) {
                reportData.phase_actual_days = Math.round((today - start) / (1000 * 60 * 60 * 24)) + 1;
            }
        }
        if (reportData.phase_actual_days !== undefined) {
            reportData.phase_actual_days = Number(reportData.phase_actual_days) || 0;
        }

        const phaseCfg = PHASES_CONFIG[reportData.phase_name];
        if (phaseCfg) {
            reportData.phase_estimated_min_days = phaseCfg.min;
            reportData.phase_estimated_max_days = phaseCfg.max;
            reportData.phase_estimated_label = buildEstimatedLabel(phaseCfg.min, phaseCfg.max);
            if (reportData.phase_actual_days > 0) {
                reportData.phase_variance_days = computeDelayDays(reportData.phase_actual_days, phaseCfg.max);
            }
        }

        const warnings = [];
        if (reportData.site_id && phaseCfg?.deps?.length) {
            const siteReports = await Report.find({ site_id: reportData.site_id });
            const closedPhases = new Set(
                siteReports
                    .filter(r => r.phase_name && r.phase_status === 'closed')
                    .map(r => r.phase_name)
            );
            phaseCfg.deps.forEach(dep => {
                if (!closedPhases.has(dep)) {
                    warnings.push(`Dépendance non clôturée: ${dep}`);
                }
            });
        }
        if (phaseCfg && Number(reportData.phase_actual_days || 0) > 0) {
            const delay = computeDelayDays(reportData.phase_actual_days, phaseCfg.max);
            if (delay > 0) {
                warnings.push(`Retard phase: +${delay}j (seuil max ${phaseCfg.max}j)`);
            }
        }
        reportData.schedule_warnings = warnings;

        const report = new Report(reportData);
        await report.save();

        // Calcul de la durée réelle en fonction du 1er rapport du site
        if (report.site_id) {
            const firstReport = await Report.findOne({ site_id: report.site_id }).sort({ created_at: 1 });
            const siteReports = await Report.find({ site_id: report.site_id }).sort({ created_at: 1 });
            if (firstReport) {
                report.actual_duration_days = computeActualDurationDays(firstReport.created_at, report.created_at);
                await report.save();
            }
            // Recalculer le score quand une phase est clôturée
            if (report.phase_status === 'closed' && report.phase_name) {
                const scoreResult = computePhaseWeightedScore(siteReports);
                report.supervisor_score = scoreResult.total;
                report.score_breakdown = {
                    schedule_score: scoreResult.total,
                    quality_score: 0,
                    phase_points: scoreResult.phasePoints
                };
                await report.save();
            }

            const rfiReady = isSiteRfiReady(siteReports);
            if (rfiReady && !report.is_rfi_ready) {
                report.is_rfi_ready = true;
                report.rfi_ready_at = new Date();
                await report.save();
                io.emit('site-rfi-ready', {
                    site_id: report.site_id,
                    report_id: report.id,
                    milestone: 'RFI Ready'
                });
            }
        }

        io.emit('new-report', report);
        res.json({ success: true, report });
    } catch (err) {
        console.error('Erreur création rapport:', err);
        res.status(500).json({ success: false, error: 'Erreur création rapport' });
    }
});

app.post('/api/reports/:reportId/images', authMiddleware, (req, res, next) => {
    upload.array('images', 10)(req, res, (err) => {
        if (!err) return next();
        console.error('Erreur middleware upload images:', err);
        return res.status(400).json({ success: false, error: 'Upload images invalide' });
    });
}, async (req, res) => {
    try {
        const { reportId } = req.params;
        const files = Array.isArray(req.files) ? req.files : [];
        if (!files.length) {
            return res.status(400).json({ success: false, error: 'Aucune image reçue' });
        }
        const images = files.map(file => ({
            filename: file.filename,
            original_name: file.originalname,
            url: hasCloudinaryCreds
                ? (file.path || file.secure_url)
                : `/uploads/images/${file.filename}`,
            cloudinary_id: file.filename,
            created_at: new Date()
        }));
        const report = await Report.findByIdAndUpdate(
            reportId,
            { $push: { images: { $each: images, $position: 0 } } },
            { new: true }
        );
        if (!report) return res.status(404).json({ success: false, error: 'Rapport non trouvé' });
        io.emit('new-images', { reportId, images });
        res.json({ success: true, images });
    } catch (error) {
        console.error('Erreur upload images:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/reports/:reportId/acceptance-document', authMiddleware, acceptanceUpload.single('acceptance_document'), async (req, res) => {
    try {
        const { reportId } = req.params;
        const report = await Report.findById(reportId);
        if (!report) return res.status(404).json({ success: false, error: 'Rapport non trouvé' });
        if (!req.file) return res.status(400).json({ success: false, error: 'Document acceptance requis' });

        const fileUrl = hasCloudinaryCreds
            ? (req.file.path || req.file.secure_url)
            : `/uploads/acceptance/${req.file.filename}`;
        report.acceptance_document = {
            filename: req.file.filename,
            original_name: req.file.originalname,
            url: fileUrl,
            uploaded_at: new Date()
        };
        report.is_final_acceptance = true;

        const siteReports = await Report.find({ site_id: report.site_id }).sort({ created_at: 1 });
        const first = siteReports[0];
        const last = siteReports[siteReports.length - 1];
        const actualDays = computeActualDurationDays(first.created_at, last.created_at);
        const phaseScore = computePhaseWeightedScore(siteReports);
        const rfiReady = isSiteRfiReady(siteReports);

        report.actual_duration_days = actualDays;
        report.is_rfi_ready = rfiReady;
        if (rfiReady && !report.rfi_ready_at) report.rfi_ready_at = new Date();
        report.supervisor_score = phaseScore.total;
        report.score_breakdown = {
            schedule_score: phaseScore.total,
            quality_score: phaseScore.total,
            phase_points: phaseScore.phasePoints
        };
        await report.save();

        io.emit('site-closed', {
            reportId: report.id,
            site_id: report.site_id,
            supervisor_name: report.supervisor_name,
            supervisor_score: phaseScore.total
        });

        res.json({ success: true, report });
    } catch (error) {
        console.error('Erreur upload acceptance document:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/reports/:id', authMiddleware, requireRole('admin', 'group_pm', 'program_manager', 'pm'), async (req, res) => {
    try {
        const result = await Report.findByIdAndDelete(req.params.id);
        if (!result) return res.status(404).json({ success: false, error: 'Rapport introuvable' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression rapport:', err);
        res.status(500).json({ success: false, error: 'Erreur suppression rapport' });
    }
});

app.post('/api/reports/:reportId/feedback', authMiddleware, requireRole('admin', 'group_pm', 'program_manager', 'pm'), async (req, res) => {
    try {
        const { feedback, pm_name } = req.body;
        const reportId = req.params.reportId;
        const reviewer = (pm_name || 'PM').trim() || 'PM';
        const feedbackData = {
            pm_name: reviewer,
            feedback,
            created_at: new Date()
        };
        const report = await Report.findByIdAndUpdate(
            reportId,
            {
                $push: { feedbacks: { $each: [feedbackData], $position: 0 } },
                $set: { status: 'reviewed', reviewed_at: new Date() }
            },
            { new: true }
        );
        if (!report) return res.status(404).json({ success: false, error: 'Rapport introuvable' });
        const feedbackPayload = { reportId, feedback: feedbackData };
        io.to('supervisor').emit('new-feedback', feedbackPayload);
        io.emit('report-status-updated', { reportId, status: report.status, reviewed_at: report.reviewed_at });
        res.json({ success: true, feedback: feedbackData });
    } catch (error) {
        console.error('Erreur ajout feedback:', error);
        res.status(500).json({ success: false, error: 'Erreur ajout feedback' });
    }
});

app.get('/api/reports/:id/feedbacks', authMiddleware, async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ success: false, error: 'Rapport introuvable' });
        res.json({ success: true, feedbacks: report.feedbacks || [] });
    } catch (error) {
        console.error('Erreur chargement feedbacks:', error);
        res.status(500).json({ success: false, error: 'Erreur chargement feedbacks' });
    }
});

// SITES API
app.post('/api/sites', authMiddleware, requireRole('admin', 'group_pm', 'program_manager', 'pm'), async (req, res) => {
    try {
        const { id, name, location, region, assigned_supervisor, assigned_by_pm, b2s_vendor, target_rfi } = req.body;
        if (!id || !name || !region || !assigned_supervisor) {
            return res.status(400).json({
                success: false,
                error: 'Champs requis: id, name, region, assigned_supervisor'
            });
        }

        const siteId = id || uuidv4();
        const zone = getZoneFromRegion(region);
        const now = new Date();

        let site = await Site.findOne({ id: siteId });
        if (site) {
            site.name = name;
            site.location = location;
            site.region = region;
            site.zone = zone;
            site.assigned_supervisor = assigned_supervisor;
            site.assigned_by_pm = assigned_by_pm || 'PM';
            site.assigned_at = now;
            if (b2s_vendor !== undefined) site.b2s_vendor = b2s_vendor;
            if (target_rfi !== undefined) site.target_rfi = target_rfi;
            await site.save();
        } else {
            site = new Site({
                id: siteId,
                name,
                location,
                region,
                zone,
                assigned_supervisor,
                assigned_by_pm: assigned_by_pm || 'PM',
                assigned_at: now,
                b2s_vendor: b2s_vendor || '',
                target_rfi: target_rfi || ''
            });
            await site.save();
        }

        const sitePayload = site.toObject ? site.toObject() : site;
        io.to('supervisor').emit('new-site-assigned', sitePayload);
        io.to(`supervisor-${normalizeProvince(assigned_supervisor)}`).emit('new-site-assigned', sitePayload);

        res.json({ success: true, site });
    } catch (error) {
        console.error('Erreur sites:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/sites', authMiddleware, async (req, res) => {
    try {
        const { supervisor_name, zone, region } = req.query;
        const query = {};

        if (supervisor_name) query.assigned_supervisor = supervisor_name;
        if (region) query.region = region;

        let sites = await Site.find(query).sort({ assigned_at: -1, created_at: -1 });

        sites.forEach(s => {
            if (s.region) s.zone = getZoneFromRegion(s.region);
        });

        if (zone) {
            sites = sites.filter(s => s.zone === zone);
        }

        res.json({ success: true, sites });
    } catch (error) {
        console.error('Erreur chargement sites:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// CHAT API
app.get('/api/chat/messages', authMiddleware, async (req, res) => {
    try {
        const { scope_type, scope_id, limit } = req.query;
        if (!scope_type || !scope_id) {
            return res.status(400).json({ success: false, error: 'scope_type et scope_id requis' });
        }

        const parsedLimit = Math.max(1, Math.min(parseInt(limit || '100', 10), 300));
        const messages = await ChatMessage.find({ scope_type, scope_id })
            .sort({ created_at: -1 })
            .limit(parsedLimit);

        res.json({ success: true, messages: messages.reverse() });
    } catch (error) {
        console.error('Erreur chargement messages:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/chat/messages', authMiddleware, async (req, res) => {
    try {
        const { scope_type, scope_id, sender_role, sender_name, message } = req.body;
        if (!scope_type || !scope_id || !sender_role || !sender_name || !message) {
            return res.status(400).json({ success: false, error: 'Champs requis manquants' });
        }

        const chatMessage = new ChatMessage({
            scope_type,
            scope_id,
            sender_role,
            sender_name,
            message: String(message).trim()
        });
        await chatMessage.save();

        const payload = chatMessage.toObject ? chatMessage.toObject() : chatMessage;
        if (scope_type === 'zone') {
            io.to(`zone-${scope_id}`).emit('new-chat-message', payload);
        } else if (scope_type === 'report') {
            io.to(`report-${scope_id}`).emit('new-chat-message', payload);
        }

        res.json({ success: true, message: payload });
    } catch (error) {
        console.error('Erreur envoi message:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================== EXPORT API ==================

app.get('/api/export/excel', authMiddleware, requireRole('admin', 'group_pm', 'program_manager', 'pm'), async (req, res) => {
    try {
        const { region, zone, date } = req.query;
        let query = {};

        if (region) {
            query.region = region;
        }
        if (zone) {
            query.zone = zone;
        }

        const reports = await Report.find(query).sort({ created_at: -1 });

        let filteredReports = reports;
        if (date) {
            const filterDate = new Date(date).toDateString();
            filteredReports = reports.filter(r => new Date(r.created_at).toDateString() === filterDate);
        }

        const headers = ['Site ID', 'Nom du Site', 'Région', 'Superviseur', 'Activités', 'Commentaires', 'Status', 'Date', 'Nb Photos'];
        const rows = filteredReports.map(r => [
            r.site_id,
            r.site_name,
            r.region || 'N/A',
            r.supervisor_name || 'N/A',
            `"${(r.activities || '').replace(/"/g, '""')}"`,
            `"${(r.comments || '').replace(/"/g, '""')}"`,
            r.status === 'reviewed' ? 'Examiné' : 'En attente',
            new Date(r.created_at).toLocaleString('fr-FR'),
            r.images?.length || 0
        ]);

        const BOM = '\uFEFF';
        const csv = BOM + headers.join(';') + '\n' + rows.map(r => r.join(';')).join('\n');

        const filename = `yoriv-rapports-${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (error) {
        console.error('Erreur export Excel:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/export/site-tracking', authMiddleware, requireRole('admin', 'group_pm', 'program_manager', 'pm'), async (req, res) => {
    try {
        const { zone: zoneQuery, region } = req.query;
        const siteQuery = {};
        if (region) siteQuery.region = region;

        let sites = await Site.find(siteQuery).sort({ id: 1 });

        sites.forEach(s => {
            if (s.region) s.zone = getZoneFromRegion(s.region);
        });

        let effectiveZone = (zoneQuery && String(zoneQuery).trim()) || '';

        if (req.user.role === 'pm' && req.user.zone && effectiveZone !== '') {
            effectiveZone = req.user.zone;
        }

        if (effectiveZone) {
            const supUsers = await User.find({ role: 'supervisor', zone: effectiveZone, is_active: true }).select('full_name');
            const nameSet = new Set(supUsers.map(u => (u.full_name || '').trim().toLowerCase()).filter(Boolean));
            sites = sites.filter(s => {
                if (s.zone === effectiveZone) return true;
                const sup = (s.assigned_supervisor || '').trim().toLowerCase();
                return sup && nameSet.has(sup);
            });
        }
        const allReports = await Report.find({}).sort({ created_at: -1 });

        const reportsBySite = {};
        allReports.forEach(r => {
            if (!r.site_id) return;
            if (!reportsBySite[r.site_id]) reportsBySite[r.site_id] = [];
            reportsBySite[r.site_id].push(r);
        });

        function deriveWorkStatus(siteReports) {
            if (!siteReports || !siteReports.length) return 'Not started';
            const phaseOrder = [
                'Cleaning Site', 'Nivellement & Épandage', 'Fence', 'Guardhouse',
                'Power Installation', 'Manholes', 'Casting Slabs', 'Tower Erection',
                'Backfilling', 'Curing', 'Casting (Coulage)', 'RFC (Ready for Casting)',
                'Rebars', 'Béton de propreté', 'Réseau de terre', 'Excavation', 'Implantation'
            ];
            const closedPhases = new Set();
            let latestPhase = null;
            let latestStatus = null;

            siteReports.forEach(r => {
                if (!r.phase_name || r.phase_name === 'Autres') return;
                if (r.phase_status === 'closed') closedPhases.add(r.phase_name);
            });

            for (const phaseName of phaseOrder) {
                const phaseReports = siteReports.filter(r => r.phase_name === phaseName);
                if (phaseReports.length > 0) {
                    latestPhase = phaseName;
                    latestStatus = closedPhases.has(phaseName) ? 'closed' : (phaseReports[0].phase_status || 'on track');
                    break;
                }
            }

            if (!latestPhase) {
                const first = siteReports.find(r => r.phase_name && r.phase_name !== 'Autres');
                if (first) {
                    latestPhase = first.phase_name;
                    latestStatus = closedPhases.has(first.phase_name) ? 'closed' : (first.phase_status || 'on track');
                }
            }

            if (!latestPhase) return 'Not started';

            const shortNames = {
                'Implantation': 'Implantation',
                'Excavation': 'Excavation',
                'Réseau de terre': 'Ground network',
                'Béton de propreté': 'Lean concrete',
                'Rebars': 'Rebars',
                'RFC (Ready for Casting)': 'RFC',
                'Casting (Coulage)': 'Foundation',
                'Curing': 'Curing',
                'Backfilling': 'Backfilling',
                'Tower Erection': 'Tower erection',
                'Casting Slabs': 'Slabs',
                'Manholes': 'Manholes',
                'Power Installation': 'Power installation',
                'Guardhouse': 'Guardhouse',
                'Fence': 'Fence',
                'Nivellement & Épandage': 'Leveling',
                'Cleaning Site': 'Cleaning'
            };

            const label = shortNames[latestPhase] || latestPhase;
            if (latestStatus === 'closed') return `${label} completed`;
            if (latestStatus === 'start') return `${label} started`;
            if (latestStatus === 'pending') return `${label} pending`;
            return `${label} WIP`;
        }

        const rows = sites.map(site => {
            const siteReports = reportsBySite[site.id] || [];
            return {
                site_id: site.id,
                anchor_site_name: site.name,
                site_name_region: site.region || '',
                supervisor: site.assigned_supervisor || '',
                b2s_vendor: site.b2s_vendor || '',
                target_rfi: site.target_rfi || '',
                work_status: deriveWorkStatus(siteReports)
            };
        });

        res.json({ success: true, rows });
    } catch (err) {
        console.error('Erreur export site-tracking:', err);
        res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
});

app.get('/api/export/report/:id', authMiddleware, async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).json({ success: false, error: 'Rapport non trouvé' });
        }

        res.json({
            success: true,
            report: report,
            company: 'YoRiv'
        });
    } catch (error) {
        console.error('Erreur export JSON:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================== SOCKET.IO (avec auth JWT) ==================

io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
        return next(new Error('Authentification requise'));
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
        next();
    } catch (err) {
        return next(new Error('Token invalide'));
    }
});

io.on('connection', (socket) => {
    console.log(`Client connecté: ${socket.id} (${socket.user?.username || 'inconnu'})`);

    socket.on('join-role', (role) => {
        socket.join(role);
    });

    socket.on('join-report', (reportId) => {
        socket.join(`report-${reportId}`);
    });

    socket.on('join-supervisor', (supervisorName) => {
        if (!supervisorName) return;
        socket.join(`supervisor-${normalizeProvince(supervisorName)}`);
    });

    socket.on('join-zone', (zone) => {
        if (!zone) return;
        socket.join(`zone-${zone}`);
    });

    socket.on('disconnect', () => {
        console.log(`Client déconnecté: ${socket.id}`);
    });
});

// ================== SERVEUR ==================

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║     🏗️  YoRivSiteTrack-YST1 - Serveur Actif                ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  📱 Interface Superviseur: http://localhost:${PORT}           ║
║  💻 Dashboard PM:          http://localhost:${PORT}/pm        ║
║                                                            ║
║  Pour accès réseau, utilisez votre IP locale:              ║
║  📱 Mobile: http://[VOTRE-IP]:${PORT}                         ║
║  💻 PM:     http://[VOTRE-IP]:${PORT}/pm                      ║
║                                                            ║
║  Le serveur est prêt à recevoir des rapports!              ║
╚═`);
});