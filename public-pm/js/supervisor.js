// ============================================
// Daily Report Site Supervisor - Supervisor JS
// ============================================

class SupervisorApp {
    constructor() {
        this.socket = null;
        this.selectedImages = [];
        this.myReports = [];
        
        this.init();
    }
    
    init() {
        this.setupSocket();
        this.setupForm();
        this.setupImageUpload();
        this.setupModal();
        this.loadMyReports();
        this.loadSavedSupervisorName();
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
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connecté au serveur');
            document.getElementById('connection-status').classList.add('online');
            document.getElementById('connection-status').classList.remove('offline');
            this.socket.emit('join-role', 'supervisor');
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
        });
        
        // Auto-remplir le préfixe du Site ID quand une province est sélectionnée
        regionSelect.addEventListener('change', () => {
            const selectedOption = regionSelect.options[regionSelect.selectedIndex];
            const prefix = selectedOption.dataset.prefix;
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
    }
    
    // ================== Image Upload ==================
    
    setupImageUpload() {
        const uploadArea = document.getElementById('image-upload-area');
        const imageInput = document.getElementById('image-input');
        const previewContainer = document.getElementById('image-preview');
        
        // Click sur la zone d'upload
        uploadArea.addEventListener('click', () => imageInput.click());
        
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
        imageInput.addEventListener('change', () => {
            const files = Array.from(imageInput.files);
            this.addImages(files);
            imageInput.value = ''; // Reset pour permettre re-selection
        });
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
            const response = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error || 'Erreur lors de la création du rapport');
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
        
        const response = await fetch(`/api/reports/${reportId}/images`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Erreur lors de l\'upload des images');
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
            const response = await fetch('/api/reports');
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
        
        container.innerHTML = this.myReports.map(report => `
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
                        📷 ${report.images?.length || 0} photos
                    </span>
                </div>
            </div>
        `).join('');
        
        // Ajouter event listeners pour voir les détails
        container.querySelectorAll('.report-card').forEach(card => {
            card.addEventListener('click', () => {
                const reportId = card.dataset.id;
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
        
        try {
            const response = await fetch(`/api/reports/${reportId}`);
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
            const response = await fetch(`/api/reports/${reportId}`, {
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
