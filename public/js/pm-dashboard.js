// ============================================
// Daily Report Site Supervisor - PM Dashboard JS
// ============================================

function safeJsonParse(value, fallback) {
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

function normalizeProvince(str = '') {
    return String(str)
        .trim()
        .normalize('NFD')
        // Compatibility: remove accents by stripping combining marks
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

// Zone mapping based on province (Zone 1-3 are explicit; Zone 4 is the rest)
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
    [normalizeProvince('Kasai')]: 'Zone 3',
    [normalizeProvince('Sankuru')]: 'Zone 3'
};

class PMDashboard {
    constructor() {
        this.socket = null;
        this.reports = [];
        this.unreadReportCounts = safeJsonParse(localStorage.getItem('pmUnreadReportCounts') || '{}', {});
        this.unreadZoneCount = parseInt(localStorage.getItem('pmUnreadZoneCount') || '0', 10);
        this.currentFilter = 'all';
        this.selectedReport = null;
        this.currentImages = [];
        this.currentImageIndex = 0;
        this.serverUrl = this.getServerUrl();
        this.language = localStorage.getItem('pmLanguage') || 'fr';
        
        this.init();
    }

    persistUnreadState() {
        localStorage.setItem('pmUnreadReportCounts', JSON.stringify(this.unreadReportCounts));
        localStorage.setItem('pmUnreadZoneCount', String(this.unreadZoneCount));
    }

    updateZoneBadge() {
        const badge = document.getElementById('pm-zone-chat-badge');
        if (!badge) return;
        badge.style.display = this.unreadZoneCount > 0 ? 'inline-flex' : 'none';
        badge.textContent = String(this.unreadZoneCount);
    }
    
    getServerUrl() {
        return 'https://daily-report-app-fanv.onrender.com';
    }
    
    getApiUrl(endpoint) {
        if (this.serverUrl) {
            return `${this.serverUrl}${endpoint}`;
        }
        return endpoint;
    }
    
    init() {
        // Vérifier si on a besoin de configurer le serveur
        if (!this.serverUrl && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            this.showServerConfig();
            return;
        }
        
        this.setupLanguage();
        this.setupSocket();
        this.setupNavigation();
        this.setupSearch();
        this.setupSiteAssignment();
        this.setupDetailPanel();
        this.setupImageModal();
        this.loadReports();
        this.loadPMName();
        this.loadPMZone();
        this.setupZoneChat();
    }

    setupLanguage() {
        const select = document.getElementById('pm-language-select');
        if (!select) return;
        select.value = this.language;
        select.addEventListener('change', () => {
            this.language = select.value;
            localStorage.setItem('pmLanguage', this.language);
            this.applyLanguage();
        });
        this.applyLanguage();
    }

    t(fr, en) {
        return this.language === 'en' ? en : fr;
    }

    applyLanguage() {
        const mappings = [
            ['#search-input', this.t('Rechercher par site, superviseur...', 'Search by site, supervisor...'), 'placeholder'],
            ['#pm-zone-chat-input', this.t('Écrire un message à la zone...', 'Write a message to the zone...'), 'placeholder'],
            ['#connection-text', this.t('Déconnecté', 'Disconnected')]
        ];
        mappings.forEach(([selector, value, attr]) => {
            const el = document.querySelector(selector);
            if (!el) return;
            if (attr === 'placeholder') el.setAttribute('placeholder', value);
            else el.textContent = value;
        });
    }
    
    showServerConfig() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="server-config-overlay">
                <div class="server-config-modal">
                    <h2>⚙️ Configuration du Serveur</h2>
                    <p>Entrez l'adresse IP de votre serveur (ex: 192.168.1.100)</p>
                    <div class="config-form">
                        <div class="input-group">
                            <span class="prefix">http://</span>
                            <input type="text" id="server-ip" placeholder="192.168.1.x" pattern="[0-9.]+">
                            <span class="suffix">:3000</span>
                        </div>
                        <button id="save-server-btn" class="btn-primary">💾 Enregistrer</button>
                        <p class="help-text">Trouvez l'IP de votre PC avec la commande: <code>ipconfig</code></p>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('save-server-btn').addEventListener('click', () => {
            const ip = document.getElementById('server-ip').value.trim();
            if (ip) {
                const url = `http://${ip}:3000`;
                localStorage.setItem('serverUrl', url);
                this.serverUrl = url;
                window.location.reload();
            } else {
                alert('Veuillez entrer une adresse IP valide');
            }
        });
    }
    
    // ================== Socket.IO Setup ==================
    
    setupSocket() {
        try {
            this.socket = this.serverUrl ? io(this.serverUrl) : io();
        
        this.socket.on('connect', () => {
            console.log('PM Dashboard connecté');
            document.getElementById('connection-status').classList.add('online');
            document.getElementById('connection-status').classList.remove('offline');
            document.getElementById('connection-text').textContent = 'Connecté';
            this.socket.emit('join-role', 'pm');
            this.joinZoneRoom();
        });
        
        this.socket.on('disconnect', () => {
            console.log('PM Dashboard déconnecté');
            document.getElementById('connection-status').classList.remove('online');
            document.getElementById('connection-status').classList.add('offline');
            document.getElementById('connection-text').textContent = 'Déconnecté';
        });
        
        // Nouveau rapport reçu
        this.socket.on('new-report', (report) => {
            console.log('Nouveau rapport reçu:', report);
            this.handleNewReport(report);
        });
        
        // Nouvelles images reçues
        this.socket.on('new-images', (data) => {
            console.log('Nouvelles images:', data);
            this.handleNewImages(data);
        });
        
        // Rapport supprimé
        this.socket.on('report-deleted', (data) => {
            console.log('Rapport supprimé:', data);
            this.handleReportDeleted(data);
        });

        this.socket.on('new-chat-message', (message) => {
            this.handleIncomingZoneChat(message);
            this.handleIncomingReportChat(message);
        });
        
        // Erreur de connexion
        this.socket.on('connect_error', (error) => {
            console.error('Erreur de connexion:', error);
            document.getElementById('connection-text').textContent = 'Erreur connexion';
        });
        } catch (error) {
            console.error('Erreur setup socket:', error);
            this.showToast('Erreur de connexion au serveur', 'error');
        }
    }
    
    // ================== Navigation ==================
    
    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Mettre à jour l'état actif
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                
                // Filtrer les rapports
                this.currentFilter = item.dataset.view;
                this.updateViewTitle();
                this.renderReports();
            });
        });
    }
    
    updateViewTitle() {
        const titleMap = {
            'all': 'Tous les Rapports',
            'pending': 'Rapports En Attente',
            'reviewed': 'Rapports Examinés'
        };
        document.getElementById('view-title').textContent = titleMap[this.currentFilter];
    }
    
    // ================== Search & Filter ==================
    
    setupSearch() {
        const searchInput = document.getElementById('search-input');
        const dateFilter = document.getElementById('date-filter');
        const regionFilter = document.getElementById('region-filter');
        const pmZoneFilter = document.getElementById('pm-zone-filter');
        const showOtherZones = document.getElementById('show-other-zones');
        
        searchInput.addEventListener('input', () => {
            this.renderReports();
        });
        
        dateFilter.addEventListener('change', () => {
            this.renderReports();
        });
        
        regionFilter.addEventListener('change', () => {
            this.renderReports();
        });

        if (pmZoneFilter) {
            pmZoneFilter.addEventListener('change', () => {
                localStorage.setItem('pmZone', pmZoneFilter.value);
                this.joinZoneRoom();
                this.loadZoneChatMessages();
                this.renderReports();
            });
        }

        if (showOtherZones) {
            showOtherZones.addEventListener('change', () => {
                this.renderReports();
            });
        }
        
        // Boutons d'export
        document.getElementById('export-pdf').addEventListener('click', () => {
            this.exportPDF();
        });
        
        document.getElementById('export-excel').addEventListener('click', () => {
            this.exportExcel();
        });
    }

    setupZoneChat() {
        const form = document.getElementById('pm-zone-chat-form');
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.sendZoneChatMessage();
        });
        this.loadZoneChatMessages();
        this.updateZoneBadge();
    }

    getCurrentPmZone() {
        return document.getElementById('pm-zone-filter')?.value || 'Zone 1';
    }

    joinZoneRoom() {
        if (!this.socket) return;
        this.socket.emit('join-zone', this.getCurrentPmZone());
    }

    async loadZoneChatMessages() {
        const zone = this.getCurrentPmZone();
        const list = document.getElementById('pm-zone-chat-list');
        if (!list) return;

        try {
            const response = await fetch(this.getApiUrl(`/api/chat/messages?scope_type=zone&scope_id=${encodeURIComponent(zone)}&limit=120`));
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erreur chat');
            this.renderZoneChatMessages(result.messages || []);
            this.unreadZoneCount = 0;
            this.persistUnreadState();
            this.updateZoneBadge();
        } catch (error) {
            console.error('Erreur chat zone:', error);
            list.innerHTML = '<div class="empty-state"><p>Impossible de charger le chat de zone</p></div>';
        }
    }

    renderZoneChatMessages(messages) {
        const list = document.getElementById('pm-zone-chat-list');
        if (!list) return;
        if (!messages.length) {
            list.innerHTML = '<div class="empty-state"><p>Aucun message pour cette zone</p></div>';
            return;
        }

        list.innerHTML = messages.map(m => `
            <div class="feedback-item">
                <div class="feedback-header">
                    <span class="feedback-pm">${m.sender_name} (${m.sender_role})</span>
                    <span class="feedback-date">${this.formatDate(m.created_at)}</span>
                </div>
                <div class="feedback-text">${m.message}</div>
            </div>
        `).join('');
        list.scrollTop = list.scrollHeight;
    }

    async sendZoneChatMessage() {
        const input = document.getElementById('pm-zone-chat-input');
        const pmName = document.getElementById('pm-name-input')?.value?.trim() || 'PM';
        const text = (input?.value || '').trim();
        if (!text) return;

        const zone = this.getCurrentPmZone();
        try {
            const response = await fetch(this.getApiUrl('/api/chat/messages'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scope_type: 'zone',
                    scope_id: zone,
                    sender_role: 'pm',
                    sender_name: pmName,
                    message: text
                })
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result?.error || `HTTP ${response.status}`);
            }
            input.value = '';
        } catch (error) {
            console.error('Erreur envoi chat zone:', error);
            this.showToast(`Erreur chat: ${error.message}`, 'error');
        }
    }

    setupSiteAssignment() {
        const form = document.getElementById('site-assignment-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.assignSiteToSupervisor();
        });
    }

    async assignSiteToSupervisor() {
        const pmName = document.getElementById('pm-name-input')?.value?.trim() || 'PM';
        const payload = {
            id: document.getElementById('assign-site-id').value.trim(),
            name: document.getElementById('assign-site-name').value.trim(),
            region: document.getElementById('assign-site-region').value,
            assigned_supervisor: document.getElementById('assign-supervisor-name').value.trim(),
            location: document.getElementById('assign-site-location').value.trim(),
            assigned_by_pm: pmName
        };

        try {
            const response = await fetch(this.getApiUrl('/api/sites'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result?.error || `HTTP ${response.status}`);
            }

            this.showToast(`Site ${payload.id} attribué à ${payload.assigned_supervisor}`, 'success');
            document.getElementById('site-assignment-form').reset();
        } catch (error) {
            console.error('Erreur attribution site:', error);
            this.showToast(`Erreur attribution: ${error.message}`, 'error');
        }
    }
    
    // ================== Export Functions ==================
    
    exportExcel() {
        const region = document.getElementById('region-filter').value;
        const date = document.getElementById('date-filter').value;
        const pmZone = document.getElementById('pm-zone-filter')?.value;
        const showOtherZones = document.getElementById('show-other-zones')?.checked;
        
        let url = '/api/export/excel?';
        if (region) url += `region=${encodeURIComponent(region)}&`;
        if (pmZone && !showOtherZones) url += `zone=${encodeURIComponent(pmZone)}&`;
        if (date) url += `date=${encodeURIComponent(date)}`;
        
        window.location.href = url;
        this.showToast('Export Excel en cours...', 'info');
    }
    
    exportPDF() {
        const filtered = this.getFilteredReports();
        
        if (filtered.length === 0) {
            this.showToast('Aucun rapport à exporter', 'warning');
            return;
        }
        
        // Générer le PDF côté client
        const region = document.getElementById('region-filter').value || 'Toutes les provinces';
        const date = document.getElementById('date-filter').value || new Date().toISOString().split('T')[0];
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>YoRiv Daily Reports</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 20px; }
                    .header h1 { color: #2563eb; margin: 0; }
                    .header p { color: #666; margin: 5px 0; }
                    .report { border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; page-break-inside: avoid; }
                    .report-header { display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px; }
                    .site-info h3 { margin: 0; color: #333; }
                    .site-info p { margin: 2px 0; color: #666; font-size: 12px; }
                    .status { padding: 4px 12px; border-radius: 12px; font-size: 12px; }
                    .status.pending { background: #fef3c7; color: #d97706; }
                    .status.reviewed { background: #d1fae5; color: #059669; }
                    .section { margin: 10px 0; }
                    .section-title { font-weight: bold; color: #333; font-size: 12px; text-transform: uppercase; }
                    .section-content { color: #555; margin-top: 5px; }
                    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #888; font-size: 12px; }
                    @media print { .report { page-break-inside: avoid; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🏗️ YORIV</h1>
                    <p>Rapport Journalier des Sites</p>
                    <p><strong>Région:</strong> ${region} | <strong>Date:</strong> ${date}</p>
                    <p><strong>Total:</strong> ${filtered.length} rapport(s)</p>
                </div>
                ${filtered.map(r => `
                    <div class="report">
                        <div class="report-header">
                            <div class="site-info">
                                <h3>${r.site_name}</h3>
                                <p><strong>ID:</strong> ${r.site_id} | <strong>Région:</strong> ${r.region || 'N/A'}</p>
                                <p><strong>Superviseur:</strong> ${r.supervisor_name || 'N/A'}</p>
                                <p><strong>Date:</strong> ${new Date(r.created_at).toLocaleString('fr-FR')}</p>
                            </div>
                            <span class="status ${r.status}">${r.status === 'reviewed' ? '✅ Examiné' : '⏳ En attente'}</span>
                        </div>
                        <div class="section">
                            <div class="section-title">Activités</div>
                            <div class="section-content">${r.activities}</div>
                        </div>
                        ${r.comments ? `
                            <div class="section">
                                <div class="section-title">Commentaires</div>
                                <div class="section-content">${r.comments}</div>
                            </div>
                        ` : ''}
                        <div class="section">
                            <div class="section-title">Photos</div>
                            <div class="section-content">${r.images?.length || 0} photo(s) jointe(s)</div>
                        </div>
                    </div>
                `).join('')}
                <div class="footer">
                    <p>YoRiv - Document généré le ${new Date().toLocaleString('fr-FR')}</p>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
        
        this.showToast('PDF généré - Utilisez Ctrl+P pour imprimer', 'success');
    }
    
    getFilteredReports() {
        let filtered = [...this.reports];
        
        // Filtre par status
        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(r => r.status === this.currentFilter);
        }

        // Filtre par zone du PM (par défaut)
        const pmZone = document.getElementById('pm-zone-filter')?.value;
        const showOtherZones = document.getElementById('show-other-zones')?.checked;
        if (pmZone && !showOtherZones) {
            filtered = filtered.filter(r => this.getReportZone(r) === pmZone);
        }
        
        // Filtre par région
        const regionFilter = document.getElementById('region-filter').value;
        if (regionFilter) {
            filtered = filtered.filter(r => r.region === regionFilter);
        }
        
        // Filtre par recherche
        const searchTerm = document.getElementById('search-input').value.toLowerCase();
        if (searchTerm) {
            filtered = filtered.filter(r => 
                r.site_id.toLowerCase().includes(searchTerm) ||
                r.site_name.toLowerCase().includes(searchTerm) ||
                (r.supervisor_name && r.supervisor_name.toLowerCase().includes(searchTerm)) ||
                (r.region && r.region.toLowerCase().includes(searchTerm)) ||
                r.activities.toLowerCase().includes(searchTerm)
            );
        }
        
        // Filtre par date
        const dateFilter = document.getElementById('date-filter').value;
        if (dateFilter) {
            const filterDate = new Date(dateFilter).toDateString();
            filtered = filtered.filter(r => 
                new Date(r.created_at).toDateString() === filterDate
            );
        }
        
        return filtered;
    }
    
    // ================== Load & Render Reports ==================
    
    async loadReports() {
        const grid = document.getElementById('reports-grid');
        
        try {
            const response = await fetch(this.getApiUrl('/api/reports'));
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            this.reports = result.reports;
            this.updateStats();
            this.renderReports();
            
        } catch (error) {
            console.error('Erreur chargement rapports:', error);
            grid.innerHTML = '<div class="empty-state"><p>Erreur lors du chargement des rapports</p></div>';
        }
    }
    
    updateStats(reports = this.reports) {
        const total = reports.length;
        const pending = reports.filter(r => r.status === 'pending').length;
        const reviewed = reports.filter(r => r.status === 'reviewed').length;
        const totalImages = reports.reduce((sum, r) => sum + (r.images?.length || 0), 0);
        
        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-pending').textContent = pending;
        document.getElementById('stat-reviewed').textContent = reviewed;
        document.getElementById('stat-images').textContent = totalImages;
        
        document.getElementById('total-count').textContent = total;
        document.getElementById('pending-count').textContent = pending;
        document.getElementById('reviewed-count').textContent = reviewed;
    }
    
    renderReports() {
        const grid = document.getElementById('reports-grid');
        const filtered = this.getFilteredReports();
        this.updateStats(filtered);
        
        if (filtered.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <p>Aucun rapport trouvé</p>
                </div>
            `;
            return;
        }
        
        grid.innerHTML = filtered.map(report => this.createReportCard(report)).join('');
        
        // Ajouter les event listeners
        grid.querySelectorAll('.pm-report-card').forEach(card => {
            card.addEventListener('click', () => {
                this.selectReport(card.dataset.id);
            });
        });
        
        // Event listeners pour les miniatures d'images
        grid.querySelectorAll('.pm-image-thumb').forEach(img => {
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                const reportId = img.closest('.pm-report-card').dataset.id;
                const report = this.reports.find(r => r.id === reportId);
                if (report && report.images) {
                    const index = parseInt(img.dataset.index);
                    this.openImageModal(report.images, index);
                }
            });
        });
    }
    
    createReportCard(report) {
        const isNew = this.isNewReport(report);
        const imagesHtml = this.createImagesPreview(report.images);
        const unreadCount = this.unreadReportCounts[report.id] || 0;
        
        return `
            <div class="pm-report-card ${isNew ? 'new' : ''} ${this.selectedReport?.id === report.id ? 'selected' : ''}" 
                 data-id="${report.id}">
                <div class="pm-card-header">
                    <div class="pm-site-info">
                        <span class="pm-site-id">${report.site_id}</span>
                        <h3>${report.site_name}</h3>
                        <span class="pm-supervisor">👷 ${report.supervisor_name || 'Non spécifié'}</span>
                        <span class="pm-region">🌍 ${report.region || 'N/A'}</span>
                        <span class="pm-zone">🗺️ ${this.getReportZone(report)}</span>
                        <span class="pm-report-date">📆 Rapport du: ${report.report_date || 'N/A'}</span>
                    </div>
                    <span class="pm-status-badge ${report.status}">
                        ${report.status === 'pending' ? '⏳ En attente' : '✅ Examiné'}
                    </span>
                </div>
                <div class="pm-card-content">${report.activities}</div>
                ${imagesHtml}
                <div class="pm-card-footer">
                    <span>📅 Soumis: ${this.formatDate(report.created_at)} • ${report.phase_name || report.milestone_category || 'Jalon N/A'} (${report.phase_status || 'on track'})</span>
                    <span>📷 ${report.images?.length || 0} photos ${unreadCount > 0 ? `<span class="pm-chat-badge">${unreadCount}</span>` : ''}</span>
                </div>
            </div>
        `;
    }

    getReportZone(report) {
        if (report?.zone) return report.zone;
        const region = report?.region || '';
        return PROVINCE_TO_ZONE[normalizeProvince(region)] || 'Zone 4';
    }
    
    createImagesPreview(images) {
        if (!images || images.length === 0) return '';
        
        const displayImages = images.slice(0, 3);
        const remaining = images.length - 3;
        
        let html = '<div class="pm-card-images">';
        
        displayImages.forEach((img, index) => {
            html += `<img src="${img.url}" class="pm-image-thumb" alt="Photo" data-index="${index}">`;
        });
        
        if (remaining > 0) {
            html += `<div class="pm-image-more">+${remaining}</div>`;
        }
        
        html += '</div>';
        return html;
    }
    
    isNewReport(report) {
        const reportDate = new Date(report.created_at);
        const now = new Date();
        const diffMinutes = (now - reportDate) / (1000 * 60);
        return diffMinutes < 5 && report.status === 'pending';
    }
    
    // ================== Detail Panel ==================
    
    setupDetailPanel() {
        const closeBtn = document.getElementById('close-panel');
        closeBtn.addEventListener('click', () => this.closeDetailPanel());
        
        // PM Name
        const pmInput = document.getElementById('pm-name-input');
        pmInput.addEventListener('change', () => {
            localStorage.setItem('pmName', pmInput.value);
        });
    }
    
    loadPMName() {
        const savedName = localStorage.getItem('pmName');
        if (savedName) {
            document.getElementById('pm-name-input').value = savedName;
        }
    }

    loadPMZone() {
        const select = document.getElementById('pm-zone-filter');
        if (!select) return;
        const savedZone = localStorage.getItem('pmZone') || select.value || 'Zone 1';
        select.value = savedZone;
    }
    
    async selectReport(reportId) {
        const panel = document.getElementById('detail-panel');
        const content = document.getElementById('detail-content');
        if (this.socket) this.socket.emit('join-report', reportId);
        
        // Marquer comme sélectionné
        document.querySelectorAll('.pm-report-card').forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.id === reportId) {
                card.classList.add('selected');
            }
        });
        
        try {
            const response = await fetch(this.getApiUrl(`/api/reports/${reportId}`));
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            this.selectedReport = result.report;
            if (this.unreadReportCounts[reportId]) {
                delete this.unreadReportCounts[reportId];
                this.persistUnreadState();
            }
            this.renderDetailPanel();
            this.renderReports();
            panel.classList.add('open');
            
        } catch (error) {
            console.error('Erreur:', error);
            this.showToast('Erreur lors du chargement du rapport', 'error');
        }
    }
    
    renderDetailPanel() {
        const content = document.getElementById('detail-content');
        const report = this.selectedReport;
        
        content.innerHTML = `
            <div class="detail-section">
                <div class="detail-section-title">Site</div>
                <div class="detail-section-content">
                    <strong>${report.site_id}</strong><br>
                    ${report.site_name}
                </div>
            </div>
            
            <div class="detail-section">
                <div class="detail-section-title">Région</div>
                <div class="detail-section-content">
                    🌍 ${report.region || 'Non spécifiée'}
                </div>
            </div>
            
            <div class="detail-section">
                <div class="detail-section-title">Superviseur</div>
                <div class="detail-section-content">
                    👷 ${report.supervisor_name || 'Non spécifié'}
                </div>
            </div>
            
            <div class="detail-section">
                <div class="detail-section-title">Date & Heure</div>
                <div class="detail-section-content">
                    📅 ${this.formatDate(report.created_at)}
                </div>
            </div>

            <div class="detail-section">
                <div class="detail-section-title">Jalon & Planning</div>
                <div class="detail-section-content">
                    <strong>Phase:</strong> ${report.phase_name || report.milestone_category || 'N/A'}<br>
                    <strong>Statut:</strong> ${report.phase_status || 'on track'}<br>
                    <strong>Durée estimée:</strong> ${report.phase_estimated_label || 'N/A'} jours<br>
                    <strong>Jours réels phase:</strong> ${report.phase_actual_days || 0} jours<br>
                    <strong>Écart phase:</strong> ${report.phase_variance_days ?? 'N/A'} jours<br>
                    <strong>Durée réalisée site:</strong> ${report.actual_duration_days || 0} jours
                </div>
            </div>

            ${report.schedule_warnings?.length ? `
                <div class="detail-section">
                    <div class="detail-section-title">Alerte planning</div>
                    <div class="detail-section-content">
                        ${report.schedule_warnings.map(w => `- ${w}`).join('<br>')}
                    </div>
                </div>
            ` : ''}
            
            <div class="detail-section">
                <div class="detail-section-title">Activités sur le site</div>
                <div class="detail-section-content">${report.activities}</div>
            </div>
            
            ${report.comments ? `
                <div class="detail-section">
                    <div class="detail-section-title">Commentaires</div>
                    <div class="detail-section-content">${report.comments}</div>
                </div>
            ` : ''}
            
            ${report.images?.length > 0 ? `
                <div class="detail-section">
                    <div class="detail-section-title">Photos (${report.images.length})</div>
                    <div class="detail-images-grid">
                        ${report.images.map((img, index) => `
                            <img src="${img.url}" class="detail-image" data-index="${index}" alt="Photo du site">
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${report.feedbacks?.length > 0 ? `
                <div class="previous-feedbacks">
                    <div class="detail-section-title">Avis précédents</div>
                    ${report.feedbacks.map(fb => `
                        <div class="feedback-item">
                            <div class="feedback-meta">
                                <span>👤 ${fb.pm_name || 'PM'}</span>
                                <span>${this.formatDate(fb.created_at)}</span>
                            </div>
                            <div class="feedback-content">${fb.feedback}</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            ${report.acceptance_document?.url ? `
                <div class="detail-section">
                    <div class="detail-section-title">Clôture / Acceptance</div>
                    <div class="detail-section-content">
                        <a href="${this.resolveFileUrl(report.acceptance_document.url)}" target="_blank">📎 Voir document acceptance</a><br>
                        ${report.supervisor_score !== undefined ? `<strong>Note superviseur:</strong> ${report.supervisor_score}/100` : ''}<br>
                        <strong>Milestone RFI:</strong> ${report.is_rfi_ready ? 'READY' : 'Non atteint'}
                    </div>
                </div>
            ` : ''}
            
            <div class="feedback-form">
                <h4>💬 Envoyer un avis au superviseur</h4>
                <textarea id="feedback-text" class="feedback-textarea" 
                          placeholder="Écrivez votre retour ou instruction ici..."></textarea>
                <button id="send-feedback-btn" class="send-feedback-btn">
                    📤 Envoyer l'avis
                </button>
            </div>

            <div class="feedback-form">
                <h4>🗨️ Chat du rapport</h4>
                <div id="pm-report-chat-list" class="previous-feedbacks" style="max-height: 220px; overflow-y: auto;"></div>
                <textarea id="pm-report-chat-text" class="feedback-textarea"
                          placeholder="Message en temps réel lié à ce rapport..."></textarea>
                <button id="send-report-chat-btn" class="send-feedback-btn">
                    💬 Envoyer au chat du rapport
                </button>
            </div>
            
            <div class="delete-report-section">
                <button id="delete-report-btn" class="delete-report-btn">
                    🗑️ Supprimer ce rapport
                </button>
            </div>
        `;
        
        // Event listeners pour les images
        content.querySelectorAll('.detail-image').forEach(img => {
            img.addEventListener('click', () => {
                const index = parseInt(img.dataset.index);
                this.openImageModal(report.images, index);
            });
        });
        
        // Event listener pour envoyer le feedback
        document.getElementById('send-feedback-btn').addEventListener('click', () => {
            this.sendFeedback();
        });

        document.getElementById('send-report-chat-btn').addEventListener('click', () => {
            this.sendReportChatMessage();
        });
        
        // Event listener pour supprimer le rapport
        document.getElementById('delete-report-btn').addEventListener('click', () => {
            this.deleteReport();
        });

        this.loadReportChatMessages();
    }
    
    async deleteReport() {
        if (!this.selectedReport) return;
        
        const confirmed = confirm(`Êtes-vous sûr de vouloir supprimer ce rapport ?\n\nSite: ${this.selectedReport.site_name}\nDate: ${this.formatDate(this.selectedReport.created_at)}\n\nCette action est irréversible.`);
        
        if (!confirmed) return;
        
        try {
            const response = await fetch(this.getApiUrl(`/api/reports/${this.selectedReport.id}`), {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            this.showToast('Rapport supprimé avec succès', 'success');
            this.closeDetailPanel();
            await this.loadReports();
            
        } catch (error) {
            console.error('Erreur:', error);
            this.showToast('Erreur lors de la suppression du rapport', 'error');
        }
    }
    
    async sendFeedback() {
        const feedbackText = document.getElementById('feedback-text').value.trim();
        const pmName = document.getElementById('pm-name-input').value.trim();
        
        if (!feedbackText) {
            this.showToast('Veuillez écrire un avis', 'warning');
            return;
        }
        
        try {
            const response = await fetch(this.getApiUrl(`/api/reports/${this.selectedReport.id}/feedback`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    feedback: feedbackText,
                    pm_name: pmName || 'PM'
                })
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            this.showToast('Avis envoyé avec succès!', 'success');
            
            // Rafraîchir les données
            await this.loadReports();
            await this.selectReport(this.selectedReport.id);
            
        } catch (error) {
            console.error('Erreur:', error);
            this.showToast('Erreur lors de l\'envoi de l\'avis', 'error');
        }
    }

    async loadReportChatMessages() {
        if (!this.selectedReport?.id) return;
        const list = document.getElementById('pm-report-chat-list');
        if (!list) return;

        try {
            const response = await fetch(this.getApiUrl(`/api/chat/messages?scope_type=report&scope_id=${encodeURIComponent(this.selectedReport.id)}&limit=120`));
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erreur chargement chat');
            const messages = result.messages || [];
            if (!messages.length) {
                list.innerHTML = '<div class="empty-state"><p>Aucun message pour ce rapport</p></div>';
                return;
            }

            list.innerHTML = messages.map(m => `
                <div class="feedback-item">
                    <div class="feedback-meta">
                        <span>👤 ${m.sender_name} (${m.sender_role})</span>
                        <span>${this.formatDate(m.created_at)}</span>
                    </div>
                    <div class="feedback-content">${m.message}</div>
                </div>
            `).join('');
            list.scrollTop = list.scrollHeight;
        } catch (error) {
            console.error('Erreur chat rapport PM:', error);
            list.innerHTML = '<div class="empty-state"><p>Impossible de charger le chat du rapport</p></div>';
        }
    }

    async sendReportChatMessage() {
        if (!this.selectedReport?.id) return;
        const pmName = document.getElementById('pm-name-input')?.value?.trim() || 'PM';
        const input = document.getElementById('pm-report-chat-text');
        const text = (input?.value || '').trim();
        if (!text) return;

        try {
            const response = await fetch(this.getApiUrl('/api/chat/messages'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scope_type: 'report',
                    scope_id: this.selectedReport.id,
                    sender_role: 'pm',
                    sender_name: pmName,
                    message: text
                })
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result?.error || `HTTP ${response.status}`);
            }
            input.value = '';
        } catch (error) {
            console.error('Erreur envoi chat rapport PM:', error);
            this.showToast(`Erreur chat rapport: ${error.message}`, 'error');
        }
    }
    
    closeDetailPanel() {
        document.getElementById('detail-panel').classList.remove('open');
        document.querySelectorAll('.pm-report-card').forEach(card => {
            card.classList.remove('selected');
        });
        this.selectedReport = null;
    }
    
    // ================== Image Modal ==================
    
    setupImageModal() {
        const modal = document.getElementById('image-modal');
        const closeBtn = document.getElementById('image-modal-close');
        const prevBtn = document.getElementById('prev-image');
        const nextBtn = document.getElementById('next-image');
        
        closeBtn.addEventListener('click', () => this.closeImageModal());
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeImageModal();
            }
        });
        
        prevBtn.addEventListener('click', () => this.showPreviousImage());
        nextBtn.addEventListener('click', () => this.showNextImage());
        
        // Navigation clavier
        document.addEventListener('keydown', (e) => {
            if (!modal.classList.contains('active')) return;
            
            if (e.key === 'Escape') this.closeImageModal();
            if (e.key === 'ArrowLeft') this.showPreviousImage();
            if (e.key === 'ArrowRight') this.showNextImage();
        });
    }
    
    openImageModal(images, startIndex = 0) {
        this.currentImages = images;
        this.currentImageIndex = startIndex;
        
        const modal = document.getElementById('image-modal');
        modal.classList.add('active');
        
        this.updateModalImage();
    }
    
    updateModalImage() {
        const img = this.currentImages[this.currentImageIndex];
        const modalImg = document.getElementById('modal-image');
        const counter = document.getElementById('image-counter');
        const downloadBtn = document.getElementById('download-image');
        
        modalImg.src = img.url;
        counter.textContent = `${this.currentImageIndex + 1} / ${this.currentImages.length}`;
        downloadBtn.href = img.url;
        downloadBtn.download = img.original_name || `photo-${this.currentImageIndex + 1}.jpg`;
    }
    
    showPreviousImage() {
        this.currentImageIndex = (this.currentImageIndex - 1 + this.currentImages.length) % this.currentImages.length;
        this.updateModalImage();
    }
    
    showNextImage() {
        this.currentImageIndex = (this.currentImageIndex + 1) % this.currentImages.length;
        this.updateModalImage();
    }
    
    closeImageModal() {
        document.getElementById('image-modal').classList.remove('active');
    }
    
    // ================== Handle Real-time Updates ==================
    
    handleNewReport(report) {
        // Ajouter au début de la liste
        this.reports.unshift(report);
        this.updateStats();
        this.renderReports();
        
        // Notification
        this.showToast(`📋 Nouveau rapport de ${report.supervisor_name || 'un superviseur'}`, 'info');
        
        // Notification système si supporté
        if (Notification.permission === 'granted') {
            new Notification('Nouveau Rapport', {
                body: `Site: ${report.site_name}\nSuperviseur: ${report.supervisor_name || 'N/A'}`,
                icon: '/icons/icon-192.png'
            });
        }
    }
    
    handleNewImages(data) {
        // Mettre à jour le rapport avec les nouvelles images
        const reportIndex = this.reports.findIndex(r => r.id === data.reportId);
        if (reportIndex !== -1) {
            if (!this.reports[reportIndex].images) {
                this.reports[reportIndex].images = [];
            }
            this.reports[reportIndex].images.push(...data.images);
            this.updateStats();
            this.renderReports();
            
            // Si c'est le rapport sélectionné, rafraîchir le panel
            if (this.selectedReport?.id === data.reportId) {
                this.selectReport(data.reportId);
            }
        }
    }
    
    handleReportDeleted(data) {
        // Supprimer le rapport de la liste locale
        const reportIndex = this.reports.findIndex(r => r.id === data.reportId);
        if (reportIndex !== -1) {
            this.reports.splice(reportIndex, 1);
            this.updateStats();
            this.renderReports();
            
            // Si c'est le rapport sélectionné, fermer le panel
            if (this.selectedReport?.id === data.reportId) {
                this.closeDetailPanel();
            }
        }
    }

    handleIncomingZoneChat(message) {
        if (message?.scope_type !== 'zone') return;
        if (message.scope_id !== this.getCurrentPmZone()) return;
        if (document.hidden) {
            this.unreadZoneCount += 1;
            this.persistUnreadState();
            this.updateZoneBadge();
        }
        this.loadZoneChatMessages();
    }

    handleIncomingReportChat(message) {
        if (message?.scope_type !== 'report') return;
        const currentId = this.selectedReport?.id;
        if (currentId && message.scope_id === currentId) {
            this.loadReportChatMessages();
            return;
        }
        this.unreadReportCounts[message.scope_id] = (this.unreadReportCounts[message.scope_id] || 0) + 1;
        this.persistUnreadState();
        this.renderReports();
    }
    
    // ================== Utilities ==================
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${this.getToastIcon(type)}</span>
            <span class="toast-message">${message}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
    
    getToastIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: '📢'
        };
        return icons[type] || icons.info;
    }

    resolveFileUrl(fileUrl) {
        if (!fileUrl) return '';
        if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
        return `${this.serverUrl}${fileUrl}`;
    }
    
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

// Initialiser l'application
document.addEventListener('DOMContentLoaded', () => {
    window.pmDashboard = new PMDashboard();
    
    // Demander permission pour les notifications
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});
