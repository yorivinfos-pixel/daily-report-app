const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Créer les dossiers nécessaires
const uploadsDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// ================== JSON Database ==================

const DB_FILE = path.join(dataDir, 'database.json');

// Structure de la base de données
const defaultDB = {
    reports: [],
    feedbacks: [],
    sites: []
};

// Charger la base de données
function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Erreur lecture DB:', error);
    }
    return { ...defaultDB };
}

// Sauvegarder la base de données
function saveDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Erreur sauvegarde DB:', error);
    }
}

// Initialiser la DB
let db = loadDB();

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Route pour le dashboard PM
app.get('/pm', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pm.html'));
});

// Configuration Multer pour upload d'images
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const reportId = req.params.reportId || req.body.report_id || 'temp';
        const reportDir = path.join(uploadsDir, reportId);
        if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
        cb(null, reportDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Seules les images sont autorisées!'));
    }
});

// ================== API ROUTES ==================

// Créer un nouveau rapport
app.post('/api/reports', (req, res) => {
    try {
        const { site_id, site_name, activities, comments, supervisor_name, region, report_date } = req.body;
        
        const report = {
            id: uuidv4(),
            site_id,
            site_name,
            activities,
            comments,
            supervisor_name,
            region: region || 'Non spécifiée',
            report_date: report_date || new Date().toISOString().split('T')[0],
            created_at: new Date().toISOString(),
            status: 'pending',
            images: []
        };
        
        db.reports.unshift(report);
        saveDB(db);
        
        // Notifier tous les PM connectés
        io.emit('new-report', report);
        
        res.json({ success: true, report });
    } catch (error) {
        console.error('Erreur création rapport:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Uploader des images pour un rapport
app.post('/api/reports/:reportId/images', upload.array('images', 10), (req, res) => {
    try {
        const { reportId } = req.params;
        const images = [];
        
        const reportIndex = db.reports.findIndex(r => r.id === reportId);
        if (reportIndex === -1) {
            return res.status(404).json({ success: false, error: 'Rapport non trouvé' });
        }
        
        for (const file of req.files) {
            const image = {
                id: uuidv4(),
                report_id: reportId,
                filename: file.filename,
                original_name: file.originalname,
                url: `/uploads/${reportId}/${file.filename}`,
                created_at: new Date().toISOString()
            };
            images.push(image);
            db.reports[reportIndex].images.push(image);
        }
        
        saveDB(db);
        
        // Notifier les PM des nouvelles images
        io.emit('new-images', { reportId, images });
        
        res.json({ success: true, images });
    } catch (error) {
        console.error('Erreur upload images:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Récupérer tous les rapports (pour PM dashboard)
app.get('/api/reports', (req, res) => {
    try {
        res.json({ success: true, reports: db.reports });
    } catch (error) {
        console.error('Erreur récupération rapports:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Récupérer un rapport spécifique
app.get('/api/reports/:id', (req, res) => {
    try {
        const report = db.reports.find(r => r.id === req.params.id);
        if (!report) {
            return res.status(404).json({ success: false, error: 'Rapport non trouvé' });
        }
        
        const feedbacks = db.feedbacks.filter(f => f.report_id === req.params.id);
        
        res.json({ 
            success: true, 
            report: {
                ...report,
                feedbacks
            }
        });
    } catch (error) {
        console.error('Erreur récupération rapport:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PM envoie un feedback
app.post('/api/reports/:reportId/feedback', (req, res) => {
    try {
        const { reportId } = req.params;
        const { feedback, pm_name } = req.body;
        
        const reportIndex = db.reports.findIndex(r => r.id === reportId);
        if (reportIndex === -1) {
            return res.status(404).json({ success: false, error: 'Rapport non trouvé' });
        }
        
        const feedbackData = {
            id: uuidv4(),
            report_id: reportId,
            feedback,
            pm_name,
            created_at: new Date().toISOString()
        };
        
        db.feedbacks.unshift(feedbackData);
        db.reports[reportIndex].status = 'reviewed';
        saveDB(db);
        
        // Notifier le superviseur du feedback
        io.emit('new-feedback', { reportId, feedback: feedbackData });
        
        res.json({ success: true, feedback: feedbackData });
    } catch (error) {
        console.error('Erreur ajout feedback:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Récupérer les feedbacks d'un rapport
app.get('/api/reports/:reportId/feedbacks', (req, res) => {
    try {
        const feedbacks = db.feedbacks.filter(f => f.report_id === req.params.reportId);
        res.json({ success: true, feedbacks });
    } catch (error) {
        console.error('Erreur récupération feedbacks:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Gestion des sites
app.get('/api/sites', (req, res) => {
    try {
        res.json({ success: true, sites: db.sites });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/sites', (req, res) => {
    try {
        const { id, name, location } = req.body;
        
        const site = {
            id: id || uuidv4(),
            name,
            location,
            created_at: new Date().toISOString()
        };
        
        // Vérifier si le site existe déjà
        const existingIndex = db.sites.findIndex(s => s.id === site.id);
        if (existingIndex !== -1) {
            db.sites[existingIndex] = site;
        } else {
            db.sites.push(site);
        }
        
        saveDB(db);
        res.json({ success: true, site });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================== EXPORT API ==================

// Export rapports en CSV (pour Excel)
app.get('/api/export/excel', (req, res) => {
    try {
        const { region, date } = req.query;
        let reports = [...db.reports];
        
        // Filtrer par région
        if (region) {
            reports = reports.filter(r => r.region === region);
        }
        
        // Filtrer par date
        if (date) {
            const filterDate = new Date(date).toDateString();
            reports = reports.filter(r => new Date(r.created_at).toDateString() === filterDate);
        }
        
        // Créer le CSV
        const headers = ['Site ID', 'Nom du Site', 'Région', 'Superviseur', 'Activités', 'Commentaires', 'Status', 'Date', 'Nb Photos'];
        const rows = reports.map(r => [
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
        
        // BOM pour UTF-8 dans Excel
        const BOM = '\uFEFF';
        const csv = BOM + headers.join(';') + '\n' + rows.map(r => r.join(';')).join('\n');
        
        const filename = `eastcastle-rapports-${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (error) {
        console.error('Erreur export Excel:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Export rapport unique en JSON (pour génération PDF côté client)
app.get('/api/export/report/:id', (req, res) => {
    try {
        const report = db.reports.find(r => r.id === req.params.id);
        if (!report) {
            return res.status(404).json({ success: false, error: 'Rapport non trouvé' });
        }
        
        const feedbacks = db.feedbacks.filter(f => f.report_id === req.params.id);
        
        res.json({ 
            success: true, 
            report: { ...report, feedbacks },
            company: 'Eastcastle'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ================== SOCKET.IO ==================

io.on('connection', (socket) => {
    console.log('Client connecté:', socket.id);
    
    // Rejoindre une room selon le rôle
    socket.on('join-role', (role) => {
        socket.join(role);
        console.log(`Client ${socket.id} rejoint le rôle: ${role}`);
    });
    
    // Rejoindre une room de rapport spécifique
    socket.on('join-report', (reportId) => {
        socket.join(`report-${reportId}`);
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
╚════════════════════════════════════════════════════════════╝
    `);
});
