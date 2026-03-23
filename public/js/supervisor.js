// ============================================
// Daily Report Site Supervisor - Supervisor JS
// ============================================

class SupervisorApp {
    constructor() {
        this.socket = null;
        this.selectedImages = [];
        this.myReports = [];
        this.assignedSites = [];
        this.zoneChatMessages = [];
        this.unreadReportCounts = JSON.parse(localStorage.getItem('supervisorUnreadReportCounts') || '{}');
        this.unreadZoneCount = parseInt(localStorage.getItem('supervisorUnreadZoneCount') || '0', 10);
        this.serverUrl = 'https://daily-report-app-fanv.onrender.com';
        
        this.init();
    }

    persistUnreadState() {
        localStorage.setItem('supervisorUnreadReportCounts', JSON.stringify(this.unreadReportCounts));
        localStorage.setItem('supervisorUnreadZoneCount', String(this.unreadZoneCount));
    }

    updateZoneBadge() {
        const badge = document.getElementById('supervisor-zone-chat-badge');
        if (!badge) return;
        badge.style.display = this.unreadZoneCount > 0 ? 'inline-flex' : 'none';
        badge.textContent = String(this.unreadZoneCount);
    }
    
    init() {
        this.setupSocket();
        this.setupForm();
        this.setupImageUpload();
        this.setupModal();
        this.loadMyReports();
        this.loadSavedSupervisorName();
        this.loadAssignedSites();
        this.setupZoneChat();
        this.setDefaultDate();
    }
    
    setDefaultDate() {
        const dateInput = document.getElementById('report-date');
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.value = today;
        }
    }
    
    // ================== Socket.IO Setup ==================
    
    setupSocket() {
        this.socket = io(this.serverUrl);
        
        this.socket.on('connect', () => {
            console.log('Connecté au serveur');
            document.getElementById('connection-status').classList.add('online');
            document.getElementById('connection-status').classList.remove('offline');
            this.socket.emit('join-role', 'supervisor');
            this.joinSupervisorRoom();
            this.joinZoneRoom();
        });
        
        this.socket.on('disconnect', () => {
            console.log('Déconnecté du serveur');
            document.getElementById('connection-status').classList.remove('online');
            document.getElementById('connection-status').classList.add('offline');
        });
        
        // Écouter les feedbacks du PM
        this.socket.on('new-feedback', (data) => {
            this.handleNewFeedback(data);
        });

        // Notification d'un nouveau site attribué
        this.socket.on('new-site-assigned', (site) => {
            this.handleNewAssignedSite(site);
        });

        this.socket.on('new-chat-message', (message) => {
            this.handleIncomingZoneChat(message);
            this.handleIncomingReportChat(message);
        });
    }
    
    // ================== Form Setup ==================
    
    setupForm() {
        const form = document.getElementById('report-form');
        const supervisorInput = document.getElementById('supervisor-name');
        const regionSelect = document.getElementById('region');
        const siteIdInput = document.getElementById('site-id');
        
        // Sauvegarder le nom du superviseur
        supervisorInput.addEventListener('change', () => {
            localStorage.setItem('supervisorName', supervisorInput.value);
            document.getElementById('user-name').textContent = supervisorInput.value || 'Superviseur';
            this.joinSupervisorRoom();
            this.loadAssignedSites();
        });
        
        // Auto-remplir le préfixe du Site ID quand une province est sélectionnée
        regionSelect.addEventListener('change', () => {
            const selectedOption = regionSelect.options[regionSelect.selectedIndex];
            const prefix = selectedOption.dataset.prefix;
            localStorage.setItem('supervisorRegion', regionSelect.value);
            this.joinZoneRoom();
            this.loadZoneChatMessages();
            if (prefix) {
                // Si le champ est vide ou ne contient qu'un ancien préfixe, on met le nouveau
                const currentValue = siteIdInput.value;
                if (!currentValue || /^CD[A-Z]{1,3}-?\d*$/.test(currentValue)) {
                    siteIdInput.value = prefix + '-';
                    siteIdInput.focus();
                }
            }
        });
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.submitReport();
        });
    }
    
    loadSavedSupervisorName() {
        const savedName = localStorage.getItem('supervisorName');
        if (savedName) {
            document.getElementById('supervisor-name').value = savedName;
            document.getElementById('user-name').textContent = savedName;
        }

        const savedRegion = localStorage.getItem('supervisorRegion');
        if (savedRegion && document.getElementById('region')) {
            document.getElementById('region').value = savedRegion;
        }
    }

    getSupervisorName() {
        return (document.getElementById('supervisor-name')?.value || '').trim();
    }

    joinSupervisorRoom() {
        const supervisorName = this.getSupervisorName();
        if (this.socket && supervisorName) {
            this.socket.emit('join-supervisor', supervisorName);
        }
    }

    getCurrentZone() {
        const region = document.getElementById('region')?.value || '';
        if (!region) return null;
        const normalized = String(region).trim().toLowerCase();
        const zone1 = ['kinshasa', 'kongo-central', 'bandundu', 'kwango', 'kwilu', 'equateur', 'mai-ndombe', 'mongala', 'tshuapa', 'nord-ubangi', 'sud-ubangi'];
        const zone2 = ['haut-katanga', 'lualaba', 'lomami', 'haut-lomami', 'tanganyika'];
        const zone3 = ['kasai-central', 'kasai-oriental', 'kasai', 'sankuru'];
        if (zone1.includes(normalized)) return 'Zone 1';
        if (zone2.includes(normalized)) return 'Zone 2';
        if (zone3.includes(normalized)) return 'Zone 3';
        return 'Zone 4';
    }

    joinZoneRoom() {
        const zone = this.getCurrentZone();
        if (this.socket && zone) {
            this.socket.emit('join-zone', zone);
        }
    }

    async loadAssignedSites() {
        const container = document.getElementById('assigned-sites');
        const supervisorName = this.getSupervisorName();
        if (!container) return;

        if (!supervisorName) {
            container.innerHTML = '<div class="empty-state"><p>Entrez votre nom pour voir vos sites attribués</p></div>';
            return;
        }

        try {
            const response = await fetch(`${this.serverUrl}/api/sites?supervisor_name=${encodeURIComponent(supervisorName)}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erreur chargement sites');
            this.assignedSites = result.sites || [];
            this.renderAssignedSites();
        } catch (error) {
            console.error('Erreur chargement sites attribués:', error);
            container.innerHTML = '<div class="empty-state"><p>Impossible de charger les sites attribués</p></div>';
        }
    }

    renderAssignedSites() {
        const container = document.getElementById('assigned-sites');
        if (!container) return;

        if (!this.assignedSites.length) {
            container.innerHTML = '<div class="empty-state"><p>Aucun site attribué pour le moment</p></div>';
            return;
        }

        container.innerHTML = this.assignedSites.map(site => `
            <div class="report-card">
                <div class="report-card-header">
                    <div class="report-site-info">
                        <span class="report-site-id">${site.id}</span>
                        <div class="report-site-name">${site.name}</div>
                    </div>
                    <span class="report-status pending">🧭 ${site.zone || 'N/A'}</span>
                </div>
                <div class="report-card-body">
                    <strong>Province:</strong> ${site.region || 'N/A'}<br>
                    <strong>Localisation:</strong> ${site.location || 'N/A'}
                </div>
                <div class="report-card-footer">
                    <span class="report-date">Affecté le: ${site.assigned_at ? this.formatDate(site.assigned_at) : 'N/A'}</span>
                    <span class="report-images-count">PM: ${site.assigned_by_pm || 'PM'}</span>
                </div>
            </div>
        `).join('');
    }

    handleNewAssignedSite(site) {
        const supervisorName = this.getSupervisorName().toLowerCase();
        const target = (site?.assigned_supervisor || '').toLowerCase();
        if (!supervisorName || supervisorName !== target) return;

        this.showToast(`Nouveau site attribué: ${site.id} - ${site.name}`, 'info');
        this.loadAssignedSites();
    }

    setupZoneChat() {
        const form = document.getElementById('supervisor-zone-chat-form');
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.sendZoneChatMessage();
        });
        this.loadZoneChatMessages();
        this.updateZoneBadge();
    }

    async loadZoneChatMessages() {
        const zone = this.getCurrentZone();
        const list = document.getElementById('supervisor-zone-chat-list');
        if (!list) return;
        if (!zone) {
            list.innerHTML = '<div class="empty-state"><p>Sélectionnez d’abord votre province pour activer le chat de zone</p></div>';
            return;
        }

        try {
            const response = await fetch(`${this.serverUrl}/api/chat/messages?scope_type=zone&scope_id=${encodeURIComponent(zone)}&limit=120`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erreur chat');
            this.zoneChatMessages = result.messages || [];
            this.renderZoneChatMessages();
            this.unreadZoneCount = 0;
            this.persistUnreadState();
            this.updateZoneBadge();
        } catch (error) {
            console.error('Erreur chargement chat zone:', error);
            list.innerHTML = '<div class="empty-state"><p>Impossible de charger le chat de zone</p></div>';
        }
    }

    renderZoneChatMessages() {
        const list = document.getElementById('supervisor-zone-chat-list');
        if (!list) return;
        if (!this.zoneChatMessages.length) {
            list.innerHTML = '<div class="empty-state"><p>Aucun message dans votre zone</p></div>';
            return;
        }
        list.innerHTML = this.zoneChatMessages.map(m => `
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
        const zone = this.getCurrentZone();
        const supervisorName = this.getSupervisorName();
        const input = document.getElementById('supervisor-zone-chat-input');
        const text = (input?.value || '').trim();
        if (!zone) {
            this.showToast('Choisissez votre province pour chatter dans votre zone', 'warning');
            return;
        }
        if (!supervisorName) {
            this.showToast('Entrez votre nom de superviseur', 'warning');
            return;
        }
        if (!text) return;

        try {
            const response = await fetch(`${this.serverUrl}/api/chat/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scope_type: 'zone',
                    scope_id: zone,
                    sender_role: 'supervisor',
                    sender_name: supervisorName,
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

    handleIncomingZoneChat(message) {
        if (message?.scope_type !== 'zone') return;
        const zone = this.getCurrentZone();
        if (!zone || message.scope_id !== zone) return;
        if (document.hidden) {
            this.unreadZoneCount += 1;
            this.persistUnreadState();
            this.updateZoneBadge();
        }
        this.loadZoneChatMessages();
    }

    async loadReportChatMessages(reportId) {
        const list = document.getElementById('supervisor-report-chat-list');
        if (!list || !reportId) return;
        try {
            const response = await fetch(`${this.serverUrl}/api/chat/messages?scope_type=report&scope_id=${encodeURIComponent(reportId)}&limit=120`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erreur chargement chat rapport');
            const messages = result.messages || [];
            if (!messages.length) {
                list.innerHTML = '<div class="empty-state"><p>Aucun message pour ce rapport</p></div>';
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
        } catch (error) {
            console.error('Erreur chat rapport superviseur:', error);
            list.innerHTML = '<div class="empty-state"><p>Impossible de charger le chat du rapport</p></div>';
        }
    }

    async sendReportChatMessage(reportId) {
        const supervisorName = this.getSupervisorName();
        const input = document.getElementById('supervisor-report-chat-text');
        const text = (input?.value || '').trim();
        if (!reportId || !supervisorName || !text) return;

        try {
            const response = await fetch(`${this.serverUrl}/api/chat/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scope_type: 'report',
                    scope_id: reportId,
                    sender_role: 'supervisor',
                    sender_name: supervisorName,
                    message: text
                })
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result?.error || `HTTP ${response.status}`);
            }
            input.value = '';
        } catch (error) {
            console.error('Erreur envoi chat rapport superviseur:', error);
            this.showToast(`Erreur chat rapport: ${error.message}`, 'error');
        }
    }

    handleIncomingReportChat(message) {
        if (message?.scope_type !== 'report') return;
        const deleteBtn = document.getElementById('delete-report-btn');
        const currentReportId = deleteBtn?.dataset?.id;
        if (currentReportId && message.scope_id === currentReportId) {
            this.loadReportChatMessages(currentReportId);
            return;
        }
        this.unreadReportCounts[message.scope_id] = (this.unreadReportCounts[message.scope_id] || 0) + 1;
        this.persistUnreadState();
        this.renderMyReports();
    }
    
    // ================== Image Upload ==================
    
    setupImageUpload() {
        const uploadArea = document.getElementById('image-upload-area');
        const imageInputGallery = document.getElementById('image-input-gallery');
        const imageInputCamera = document.getElementById('image-input-camera');
        const pickGalleryBtn = document.getElementById('pick-from-gallery');
        const pickCameraBtn = document.getElementById('pick-from-camera');

        const handleFileInput = (inputEl) => {
            if (!inputEl) return;
            const files = Array.from(inputEl.files || []).filter(f => f.type.startsWith('image/'));
            if (files.length > 0) this.addImages(files);
            inputEl.value = ''; // reset pour permettre re-selection
        };
        
        // Click sur la zone d'upload
        uploadArea.addEventListener('click', () => {
            // Par défaut: ouvrir la galerie
            if (imageInputGallery) imageInputGallery.click();
        });

        // Boutons explicites
        if (pickGalleryBtn && imageInputGallery) {
            pickGalleryBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                imageInputGallery.click();
            });
        }

        if (pickCameraBtn && imageInputCamera) {
            pickCameraBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                imageInputCamera.click();
            });
        }
        
        // Drag & Drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            this.addImages(files);
        });
        
        // Selection de fichiers
        if (imageInputGallery) {
            imageInputGallery.addEventListener('change', () => {
                handleFileInput(imageInputGallery);
            });
        }

        if (imageInputCamera) {
            imageInputCamera.addEventListener('change', () => {
                handleFileInput(imageInputCamera);
            });
        }
    }
    
    addImages(files) {
        const previewContainer = document.getElementById('image-preview');
        
        files.forEach(file => {
            // Éviter les doublons
            if (this.selectedImages.some(img => img.name === file.name && img.size === file.size)) {
                return;
            }
            
            this.selectedImages.push(file);
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const div = document.createElement('div');
                div.className = 'preview-item';
                div.innerHTML = `
                    <img src="${e.target.result}" alt="${file.name}">
                    <button type="button" class="remove-btn" data-name="${file.name}">&times;</button>
                `;
                previewContainer.appendChild(div);
                
                // Event pour supprimer
                div.querySelector('.remove-btn').addEventListener('click', () => {
                    this.removeImage(file.name);
                    div.remove();
                });
            };
            reader.readAsDataURL(file);
        });
    }
    
    removeImage(fileName) {
        this.selectedImages = this.selectedImages.filter(img => img.name !== fileName);
    }
    
    // ================== Submit Report ==================
    
    async submitReport() {
        const submitBtn = document.getElementById('submit-btn');
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
        
        try {
            const formData = {
                site_id: document.getElementById('site-id').value,
                site_name: document.getElementById('site-name').value,
                activities: document.getElementById('activities').value,
                comments: document.getElementById('comments').value,
                supervisor_name: document.getElementById('supervisor-name').value,
                region: document.getElementById('region').value,
                report_date: document.getElementById('report-date').value
            };
            
            // Créer le rapport
            const response = await fetch(this.serverUrl + '/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            let result = null;
            try {
                result = await response.json();
            } catch (_) {
                // response non-JSON (ou erreur réseau)
            }

            if (!response.ok) {
                const serverMsg = result?.error ? `: ${result.error}` : '';
                throw new Error(`Erreur création du rapport (HTTP ${response.status})${serverMsg}`);
            }

            if (!result?.success) {
                throw new Error(result?.error || 'Erreur lors de la création du rapport');
            }
            
            // Upload des images si présentes
            if (this.selectedImages.length > 0) {
                await this.uploadImages(result.report.id);
            }
            
            // Succès
            this.showToast('Rapport envoyé avec succès!', 'success');
            this.resetForm();
            this.loadMyReports();
            
        } catch (error) {
            console.error('Erreur:', error);
            this.showToast(error.message, 'error');
        } finally {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    }
    
    async uploadImages(reportId) {
        const formData = new FormData();
        formData.append('report_id', reportId);
        
        this.selectedImages.forEach(file => {
            formData.append('images', file);
        });
        
        const response = await fetch(`${this.serverUrl}/api/reports/${reportId}/images`, {
            method: 'POST',
            body: formData
        });

        let result = null;
        try {
            result = await response.json();
        } catch (_) {
            // response non-JSON
        }

        if (!response.ok) {
            throw new Error(`Erreur upload des images (HTTP ${response.status})${result?.error ? `: ${result.error}` : ''}`);
        }

        if (!result?.success) {
            throw new Error(result?.error || 'Erreur lors de l\'upload des images');
        }
    }
    
    resetForm() {
        document.getElementById('report-form').reset();
        document.getElementById('image-preview').innerHTML = '';
        this.selectedImages = [];
        
        // Restaurer le nom du superviseur
        this.loadSavedSupervisorName();
    }
    
    // ================== Load Reports ==================
    
    async loadMyReports() {
        const container = document.getElementById('my-reports');
        
        try {
            const response = await fetch(this.serverUrl + '/api/reports');
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            this.myReports = result.reports;
            this.renderMyReports();
            
        } catch (error) {
            console.error('Erreur chargement rapports:', error);
            container.innerHTML = '<div class="empty-state"><p>Impossible de charger les rapports</p></div>';
        }
    }
    
    renderMyReports() {
        const container = document.getElementById('my-reports');
        
        if (this.myReports.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <p>Aucun rapport envoyé pour le moment</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.myReports.map(report => {
            const unreadCount = this.unreadReportCounts[report.id] || 0;
            return `
            <div class="report-card ${report.status}" data-id="${report.id}">
                <div class="report-card-header">
                    <div class="report-site-info">
                        <span class="report-site-id">${report.site_id}</span>
                        <div class="report-site-name">${report.site_name}</div>
                    </div>
                    <span class="report-status ${report.status}">
                        ${report.status === 'pending' ? '⏳ En attente' : '✅ Examiné'}
                    </span>
                </div>
                <div class="report-card-body">
                    ${this.truncateText(report.activities, 100)}
                </div>
                <div class="report-card-footer">
                    <span class="report-date">${this.formatDate(report.created_at)}</span>
                    <span class="report-images-count">
                        📷 ${report.images?.length || 0} photos ${unreadCount > 0 ? `<span class="report-chat-badge">${unreadCount}</span>` : ''}
                    </span>
                </div>
            </div>
        `;
        }).join('');
        
        // Ajouter event listeners pour voir les détails
        container.querySelectorAll('.report-card').forEach(card => {
            card.addEventListener('click', () => {
                const reportId = card.dataset.id;
                if (this.unreadReportCounts[reportId]) {
                    delete this.unreadReportCounts[reportId];
                    this.persistUnreadState();
                    this.renderMyReports();
                }
                this.showReportDetails(reportId);
            });
        });
    }
    
    // ================== Report Details Modal ==================
    
    setupModal() {
        const modal = document.getElementById('report-modal');
        const closeBtn = document.getElementById('modal-close');
        
        closeBtn.addEventListener('click', () => this.closeModal());
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });
    }
    
    async showReportDetails(reportId) {
        const modal = document.getElementById('report-modal');
        const modalBody = document.getElementById('modal-body');
        if (this.socket) this.socket.emit('join-report', reportId);
        
        try {
            const response = await fetch(`${this.serverUrl}/api/reports/${reportId}`);
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error);
            }
            
            const report = result.report;
            
            modalBody.innerHTML = `
                <div class="detail-section">
                    <div class="detail-section-title">Site</div>
                    <div class="detail-section-content">
                        <strong>${report.site_id}</strong> - ${report.site_name}
                    </div>
                </div>
                
                <div class="detail-section">
                    <div class="detail-section-title">Superviseur</div>
                    <div class="detail-section-content">${report.supervisor_name || 'Non spécifié'}</div>
                </div>
                
                <div class="detail-section">
                    <div class="detail-section-title">Activités</div>
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
                            ${report.images.map(img => `
                                <img src="${img.url}" class="detail-image" alt="Photo du site">
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${report.feedbacks?.length > 0 ? `
                    <div class="detail-section">
                        <div class="detail-section-title">Avis du PM</div>
                        ${report.feedbacks.map(fb => `
                            <div class="feedback-item">
                                <div class="feedback-header">
                                    <span class="feedback-pm">${fb.pm_name || 'PM'}</span>
                                    <span class="feedback-date">${this.formatDate(fb.created_at)}</span>
                                </div>
                                <div class="feedback-text">${fb.feedback}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}

                <div class="detail-section">
                    <div class="detail-section-title">Chat du rapport</div>
                    <div id="supervisor-report-chat-list" class="feedback-list"></div>
                    <div class="form-group" style="margin-top: 8px;">
                        <textarea id="supervisor-report-chat-text" rows="2" placeholder="Répondre au PM sur ce rapport..."></textarea>
                    </div>
                    <button type="button" class="submit-btn" id="supervisor-report-chat-send">
                        <span class="btn-icon">💬</span>
                        <span class="btn-text">Envoyer</span>
                    </button>
                </div>
                
                <div class="detail-actions">
                    <button class="btn-delete" id="delete-report-btn" data-id="${report.id}">
                        🗑️ Supprimer ce rapport
                    </button>
                </div>
            `;
            
            modal.classList.add('active');
            
            // Ajouter l'event listener pour la suppression
            document.getElementById('delete-report-btn').addEventListener('click', () => {
                this.deleteReport(report.id);
            });

            document.getElementById('supervisor-report-chat-send').addEventListener('click', () => {
                this.sendReportChatMessage(report.id);
            });
            this.loadReportChatMessages(report.id);
            
        } catch (error) {
            console.error('Erreur:', error);
            this.showToast('Erreur lors du chargement du rapport', 'error');
        }
    }
    
    closeModal() {
        document.getElementById('report-modal').classList.remove('active');
    }
    
    // ================== Delete Report ==================
    
    async deleteReport(reportId) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce rapport ? Cette action est irréversible.')) {
            return;
        }
        
        try {
            const response = await fetch(`${this.serverUrl}/api/reports/${reportId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Erreur lors de la suppression');
            }
            
            this.showToast('Rapport supprimé avec succès', 'success');
            this.closeModal();
            this.loadMyReports();
            
        } catch (error) {
            console.error('Erreur suppression:', error);
            this.showToast('Erreur lors de la suppression du rapport', 'error');
        }
    }
    
    // ================== Handle Feedback ==================
    
    handleNewFeedback(data) {
        // Afficher notification
        this.showToast('Nouvel avis reçu du PM!', 'info');
        
        // Recharger les rapports
        this.loadMyReports();
        
        // Afficher dans la section feedback
        const feedbackSection = document.getElementById('feedback-section');
        const feedbackList = document.getElementById('feedback-list');
        
        feedbackSection.style.display = 'block';
        
        const feedbackHtml = `
            <div class="feedback-item new">
                <div class="feedback-header">
                    <span class="feedback-pm">${data.feedback.pm_name || 'PM'}</span>
                    <span class="feedback-date">${this.formatDate(data.feedback.created_at)}</span>
                </div>
                <div class="feedback-text">${data.feedback.feedback}</div>
            </div>
        `;
        
        feedbackList.insertAdjacentHTML('afterbegin', feedbackHtml);
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

    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }
}

// Initialiser l'application
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SupervisorApp();
});
