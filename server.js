try { require('dotenv').config(); } catch (e) { console.log('Mode production: dotenv ignoré'); }

// ======= MongoDB Atlas (Mongoose) =======
const mongoose = require('mongoose');
const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://mon_admin:6q4Qz.n-nFe.Xz4@cluster0.e0ovj8t.mongodb.net/?retryWrites=true&w=majority';

// Connexion à MongoDB avec la variable mongoUri
mongoose.connect(mongoUri)
    .then(() => console.log("✅ Connecté à MongoDB avec succès sur Cluster0 !"))
    .catch(err => {
        console.error("❌ Erreur critique connexion MongoDB:", err.message);
        if (err.message.includes('replicaSet')) {
            console.warn("⚠️ Attention: L'ancienne chaîne de connexion replicaSet est détectée. Passage automatique à SRV...");
        }
    });

const reportSchema = new mongoose.Schema({
    site_id: String,
    site_name: String,
    activities: String,
    comments: String,
    supervisor_name: String,
    region: String,
    zone: String,
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
    ]
}, { toJSON: { virtuals: true }, toObject: { virtuals: true } });

const Report = mongoose.model('Report', reportSchema);

function normalizeProvince(str = '') {
    return String(str)
        .trim()
        .normalize('NFD')
        // Compatibility: remove accents by stripping combining marks
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

const PROVINCE_TO_ZONE = {
    // Zone 1
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

    // Zone 2
    [normalizeProvince('Haut-Katanga')]: 'Zone 2',
    [normalizeProvince('Lualaba')]: 'Zone 2',
    [normalizeProvince('Lomami')]: 'Zone 2',
    [normalizeProvince('Haut-Lomami')]: 'Zone 2',
    [normalizeProvince('Tanganyika')]: 'Zone 2',

    // Zone 3
    [normalizeProvince('Kasai-Central')]: 'Zone 3',
    [normalizeProvince('Kasai-Oriental')]: 'Zone 3',
    // UI uses "Kasai" (not "Kasai-Occidental")
    [normalizeProvince('Kasai')]: 'Zone 3',
    [normalizeProvince('Sankuru')]: 'Zone 3',
};

function getZoneFromRegion(region) {
    // Zone 4 = default (partie Est + provinces restantes)
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
    created_at: { type: Date, default: Date.now }
});
const Site = mongoose.model('Site', siteSchema);

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'VOTRE_CLOUD_NAME',
    api_key: process.env.CLOUDINARY_API_KEY || 'VOTRE_API_KEY',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'VOTRE_API_SECRET',
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        return {
            folder: 'daily-report-site-supervisor',
            format: file.mimetype.split('/')[1],
            public_id: `${Date.now()}-${uuidv4()}`,
            resource_type: 'image',
        };
    },
});

const upload = multer({
    storage,
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

app.get('/pm', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pm.html'));
});

// ================== API ROUTES (MongoDB Only) ==================

// GET tous les rapports
app.get('/api/reports', async (req, res) => {
    try {
        const reports = await Report.find().sort({ created_at: -1 });
        res.json({ success: true, reports });
    } catch (err) {
        console.error('Erreur chargement rapports:', err);
        res.status(500).json({ success: false, error: 'Erreur chargement rapports' });
    }
});

// GET un rapport par ID
app.get('/api/reports/:id', async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ success: false, error: 'Rapport introuvable' });
        res.json({ success: true, report });
    } catch (err) {
        console.error('Erreur chargement rapport:', err);
        res.status(500).json({ success: false, error: 'Erreur chargement rapport' });
    }
});

// POST créer un rapport
app.post('/api/reports', async (req, res) => {
    try {
        const reportData = { ...req.body };
        if (!reportData.report_date) reportData.report_date = new Date().toISOString().split('T')[0];
        if (!reportData.region) reportData.region = 'Non spécifiée';
        if (!reportData.zone) reportData.zone = getZoneFromRegion(reportData.region);

        const report = new Report(reportData);
        await report.save();
        io.emit('new-report', report);
        res.json({ success: true, report });
    } catch (err) {
        console.error('Erreur création rapport:', err);
        res.status(500).json({ success: false, error: 'Erreur création rapport' });
    }
});

// Uploader des images pour un rapport
app.post('/api/reports/:reportId/images', upload.array('images', 10), async (req, res) => {
    try {
        const { reportId } = req.params;
        const images = req.files.map(file => ({
            filename: file.filename,
            original_name: file.originalname,
            url: file.path || file.secure_url,
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

// DELETE un rapport
app.delete('/api/reports/:id', async (req, res) => {
    try {
        const result = await Report.findByIdAndDelete(req.params.id);
        if (!result) return res.status(404).json({ success: false, error: 'Rapport introuvable' });
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression rapport:', err);
        res.status(500).json({ success: false, error: 'Erreur suppression rapport' });
    }
});

// PM envoie un feedback
app.post('/api/reports/:reportId/feedback', async (req, res) => {
    try {
        const { feedback, pm_name } = req.body;
        const reportId = req.params.reportId;
        const feedbackData = {
            pm_name,
            feedback,
            created_at: new Date()
        };
        const report = await Report.findByIdAndUpdate(
            reportId,
            { $push: { feedbacks: { $each: [feedbackData], $position: 0 } } },
            { new: true }
        );
        if (!report) return res.status(404).json({ success: false, error: 'Rapport introuvable' });
        io.emit('new-feedback', { reportId, feedback: feedbackData });
        res.json({ success: true, feedback: feedbackData });
    } catch (error) {
        console.error('Erreur ajout feedback:', error);
        res.status(500).json({ success: false, error: 'Erreur ajout feedback' });
    }
});

// Récupérer les feedbacks d'un rapport
app.get('/api/reports/:id/feedbacks', async (req, res) => {
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
app.post('/api/sites', async (req, res) => {
    try {
        const { id, name, location, region, assigned_supervisor, assigned_by_pm } = req.body;
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
                assigned_at: now
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

app.get('/api/sites', async (req, res) => {
    try {
        const { supervisor_name, zone, region } = req.query;
        const query = {};

        if (supervisor_name) query.assigned_supervisor = supervisor_name;
        if (zone) query.zone = zone;
        if (region) query.region = region;

        const sites = await Site.find(query).sort({ assigned_at: -1, created_at: -1 });
        res.json({ success: true, sites });
    } catch (error) {
        console.error('Erreur chargement sites:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================== EXPORT API ==================

app.get('/api/export/excel', async (req, res) => {
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

app.get('/api/export/report/:id', async (req, res) => {
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

// ================== SOCKET.IO ==================

io.on('connection', (socket) => {
    console.log('Client connecté:', socket.id);

    socket.on('join-role', (role) => {
        socket.join(role);
        console.log(`Client ${socket.id} rejoint le rôle: ${role}`);
    });

    socket.on('join-report', (reportId) => {
        socket.join(`report-${reportId}`);
    });

    socket.on('join-supervisor', (supervisorName) => {
        if (!supervisorName) return;
        socket.join(`supervisor-${normalizeProvince(supervisorName)}`);
    });

    socket.on('disconnect', () => {
        console.log('Client déconnecté:', socket.id);
    });
});

// ================== SERVEUR ==================

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║     🏗️  Daily Report Site Supervisor - Serveur Actif       ║
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