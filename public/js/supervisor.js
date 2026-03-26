// ============================================
// YoRivSiteTrack-YST1 - Supervisor JS
// ============================================

function safeJsonParse(value, fallback) {
    try {
        return JSON.parse(value);
    } catch (_) {
        return fallback;
    }
}

/** ID MongoDB fiable (certaines réponses n'exposent que _id) */
function getReportId(report) {
    if (!report) return '';
    let v = report.id != null ? report.id : report._id;
    if (v && typeof v === 'object') {
        if (v.$oid) v = v.$oid;
        else if (typeof v.toString === 'function') v = v.toString();
    }
    return v != null ? String(v).trim() : '';
}

class SupervisorApp {
    constructor() {
        this.socket = null;
        this.selectedImages = [];
        this.myReports = [];
        this.assignedSites = [];
        this.zoneChatMessages = [];
        this.unreadReportCounts = safeJsonParse(localStorage.getItem('supervisorUnreadReportCounts') || '{}', {});
        this.unreadZoneCount = parseInt(localStorage.getItem('supervisorUnreadZoneCount') || '0', 10);
        this.serverUrl = 'https://daily-report-app-fanv.onrender.com';
        this.language = localStorage.getItem('appLanguage') || 'fr';
        this.authToken = localStorage.getItem('authToken') || null;
        this.currentUser = safeJsonParse(localStorage.getItem('currentUser'), null);
        
        this.setupLogin();
        if (this.authToken && this.currentUser) {
            this.showApp();
        }
    }

    /** Toujours aligner la mémoire sur localStorage (évite « Token manquant » si l’instance a perdu authToken). */
    syncAuthTokenFromStorage() {
        const t = localStorage.getItem('authToken');
        if (t) this.authToken = t;
        return this.authToken;
    }

    getAuthHeaders() {
        this.syncAuthTokenFromStorage();
        const headers = { 'Content-Type': 'application/json' };
        if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
        return headers;
    }

    setupLogin() {
        const form = document.getElementById('login-form');
        if (!form) return;
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value.trim();
            const password = document.getElementById('login-password').value;
            const errorDiv = document.getElementById('login-error');
            const btn = document.getElementById('login-btn');

            if (!username || !password) {
                errorDiv.textContent = this.t('Veuillez remplir tous les champs', 'Please fill all fields');
                errorDiv.style.display = 'block';
                return;
            }

            btn.disabled = true;
            btn.textContent = this.t('Connexion...', 'Logging in...');
            errorDiv.style.display = 'none';

            try {
                const res = await fetch(`${this.serverUrl}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: username.toLowerCase(), password })
                });
                const data = await res.json();
                if (!data.success) {
                    throw new Error(data.error || 'Erreur de connexion');
                }
                if (data.user.role !== 'supervisor') {
                    throw new Error(this.t(
                        'Ce compte n\'est pas un compte superviseur. Utilisez l\'application PM.',
                        'This account is not a supervisor account. Use the PM app.'
                    ));
                }
                this.authToken = data.token;
                this.currentUser = data.user;
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                this.showApp();
            } catch (err) {
                errorDiv.textContent = err.message;
                errorDiv.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = this.t('Se connecter', 'Log in');
            }
        });

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }

    showApp() {
        const loginScreen = document.getElementById('login-screen');
        const appDiv = document.getElementById('app');
        if (loginScreen) loginScreen.style.display = 'none';
        if (appDiv) appDiv.style.display = '';
        this.init();
    }

    logout() {
        this.authToken = null;
        this.currentUser = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('currentUser');
        const loginScreen = document.getElementById('login-screen');
        const appDiv = document.getElementById('app');
        if (loginScreen) loginScreen.style.display = '';
        if (appDiv) appDiv.style.display = 'none';
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
        const safe = (label, fn) => {
            try { fn(); } catch (e) { console.error(`[init] ${label} failed:`, e); }
        };

        safe('setupLanguage',  () => this.setupLanguage());
        safe('setupSocket',    () => this.setupSocket());
        safe('setupForm',      () => this.setupForm());
        safe('setupImageUpload', () => this.setupImageUpload());
        safe('setupModal',     () => this.setupModal());
        safe('applyUser',      () => this.applyCurrentUser());
        safe('setupZoneChat',  () => this.setupZoneChat());
        safe('setDefaultDate', () => this.setDefaultDate());

        this.loadMyReports();
        this.loadAssignedSites();

        this.warmUpServer();
    }

    applyCurrentUser() {
        if (!this.currentUser) return;
        const nameEl = document.getElementById('user-name');
        if (nameEl) nameEl.textContent = this.currentUser.full_name;

        const supervisorSelect = document.getElementById('supervisor-name');
        if (supervisorSelect) {
            supervisorSelect.value = this.currentUser.full_name;
            supervisorSelect.disabled = true;
        }
    }

    async warmUpServer() {
        try {
            await fetch(`${this.serverUrl}/api/reports?limit=1`, {
                method: 'GET',
                headers: this.getAuthHeaders()
            });
        } catch (_) {}
    }

    setupLanguage() {
        const select = document.getElementById('language-select');
        if (!select) return;
        select.value = this.language;
        select.addEventListener('change', () => {
            this.language = select.value;
            localStorage.setItem('appLanguage', this.language);
            this.applyLanguage();
            this.showToast(this.t('Langue changée', 'Language changed'), 'success');
        });
        this.applyLanguage();
    }

    t(fr, en) {
        return this.language === 'en' ? en : fr;
    }

    getFieldValue(id, fallback = '') {
        const el = document.getElementById(id);
        return el ? (el.value ?? fallback) : fallback;
    }

    async wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async apiFetchJson(url, options = {}, retryDelays = [0, 2500, 5000]) {
        let lastError = null;
        for (let i = 0; i < retryDelays.length; i++) {
            if (retryDelays[i] > 0) await this.wait(retryDelays[i]);
            try {
                this.syncAuthTokenFromStorage();
                const opts = { ...options, headers: { ...(options.headers || {}) } };
                if (this.authToken && !opts.headers['Authorization']) {
                    opts.headers['Authorization'] = `Bearer ${this.authToken}`;
                }
                const response = await fetch(url, opts);
                const rawText = await response.text();
                let json = null;
                try {
                    json = rawText ? JSON.parse(rawText) : null;
                } catch (_) {
                    throw new Error(this.t('Réponse serveur illisible (pas du JSON).', 'Invalid server response (non-JSON).'));
                }
                if (response.status === 401) {
                    this.showToast(this.t('Session expirée. Veuillez vous reconnecter.', 'Session expired. Please log in again.'), 'warning');
                    this.logout();
                    throw new Error('Session expirée');
                }
                if (!response.ok) {
                    const msg = json?.error ? `: ${json.error}` : '';
                    throw new Error(`HTTP ${response.status}${msg}`);
                }
                if (!json?.success) {
                    throw new Error(json?.error || this.t('Réponse serveur invalide', 'Invalid server response'));
                }
                return json;
            } catch (err) {
                lastError = err;
            }
        }
        throw lastError || new Error(this.t('Erreur réseau', 'Network error'));
    }

    applyLanguage() {
        const mappings = [
            ['.logo-subtitle', this.t('SiteTrack', 'SiteTrack')],
            ['.report-form-section .section-title', this.t('Nouveau Rapport Journalier', 'New Daily Report')],
            ['#submit-btn .btn-text', this.t('Envoyer le Rapport', 'Submit Report')],
            ['#supervisor-zone-chat-input', this.t('Écrire un message à votre zone...', 'Write a message to your zone...'), 'placeholder'],
            ['#activities', this.t("Décrivez les activités réalisées sur le site...", 'Describe the site activities...'), 'placeholder'],
            ['#comments', this.t('Observations, pending issues...', 'Observations, pending issues...'), 'placeholder'],
            ['#site-id', this.t('Ex: CDKN-001', 'Ex: CDKN-001'), 'placeholder'],
            ['#site-name', this.t('Ex: Chantier Centre-Ville', 'Ex: Downtown Site'), 'placeholder'],
            ['#supervisor-name', this.t('Entrez votre nom', 'Enter your name'), 'placeholder'],
            ['.reports-history-section .section-title', this.t('Mes Rapports Récents', 'My Recent Reports')]
        ];

        mappings.forEach(([selector, value, attr]) => {
            const el = document.querySelector(selector);
            if (!el) return;
            if (attr === 'placeholder') el.setAttribute('placeholder', value);
            else el.textContent = value;
        });

        const chatSendBtn = document.querySelector('#supervisor-zone-chat-form .btn-text');
        if (chatSendBtn) chatSendBtn.textContent = this.t('Envoyer', 'Send');
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
        if (typeof io === 'undefined') {
            console.warn('Socket.IO not loaded yet – real-time features disabled');
            return;
        }

        const token = localStorage.getItem('authToken') || '';
        this.socket = io(this.serverUrl, {
            auth: { token }
        });
        
        this.socket.on('connect', () => {
            console.log('Connecté au serveur');
            const cs = document.getElementById('connection-status');
            if (cs) { cs.classList.add('online'); cs.classList.remove('offline'); }
            this.socket.emit('join-role', 'supervisor');
            this.joinSupervisorRoom();
            this.joinZoneRoom();
        });
        
        this.socket.on('disconnect', () => {
            console.log('Déconnecté du serveur');
            const cs = document.getElementById('connection-status');
            if (cs) { cs.classList.remove('online'); cs.classList.add('offline'); }
        });
        
        this.socket.on('new-feedback', (data) => {
            this.handleNewFeedback(data);
        });

        this.socket.on('new-site-assigned', (site) => {
            this.handleNewAssignedSite(site);
        });

        this.socket.on('new-chat-message', (message) => {
            this.handleIncomingZoneChat(message);
            this.handleIncomingReportChat(message);
        });
    }

    retrySocketConnect() {
        if (this.socket || typeof io === 'undefined') return;
        try { this.setupSocket(); } catch (_) {}
    }
    
    // ================== Form Setup ==================
    
    setupForm() {
        const form = document.getElementById('report-form');
        const supervisorInput = document.getElementById('supervisor-name');
        const regionSelect = document.getElementById('region');
        const siteIdInput = document.getElementById('site-id');
        const phaseSelect = document.getElementById('phase-name');
        const phaseStatusSelect = document.getElementById('phase-status');
        
        // Sauvegarder le nom du superviseur
        supervisorInput.addEventListener('change', () => {
            localStorage.setItem('supervisorName', supervisorInput.value);
            document.getElementById('user-name').textContent = supervisorInput.value || 'Superviseur';
            this.joinSupervisorRoom();
            this.loadAssignedSites();
            this.loadMyReports();
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

        // === Auto-calcul des jours de phase ===
        const triggerAutoCalculation = () => {
            this.fetchPhaseAutoDays();
            this.computeLocalPhaseDays();
        };

        phaseSelect?.addEventListener('change', () => {
            triggerAutoCalculation();
            this.updateActivitiesLabel();
            this.toggleEndDateField();
        });
        phaseStatusSelect?.addEventListener('change', () => {
            triggerAutoCalculation();
            this.toggleEndDateField();
        });
        siteIdInput?.addEventListener('change', triggerAutoCalculation);
        siteIdInput?.addEventListener('blur', triggerAutoCalculation);

        const startDateInput = document.getElementById('phase-start-date');
        const endDateInput = document.getElementById('phase-end-date');
        startDateInput?.addEventListener('change', () => this.computeLocalPhaseDays());
        endDateInput?.addEventListener('change', () => this.computeLocalPhaseDays());

        // Initialisation
        this.resetPhaseDisplay();
        this.updateActivitiesLabel();
        this.toggleEndDateField();
    }

    /**
     * Fetch auto-calculated phase days from server and update display.
     * Replaces manual day input entirely.
     */
    async fetchPhaseAutoDays() {
        const siteId = (document.getElementById('site-id')?.value || '').trim();
        const phaseSelect = document.getElementById('phase-name');
        const phaseName = phaseSelect?.value || '';
        const reportDate = document.getElementById('report-date')?.value || '';
        const phaseStatus = document.getElementById('phase-status')?.value || 'on track';

        const daysDisplay = document.getElementById('phase-actual-days-display');
        const daysValue = document.getElementById('phase-auto-days-value');
        const daysBadge = document.getElementById('phase-auto-badge');
        const hiddenInput = document.getElementById('phase-actual-days');

        // Si pas de phase sélectionnée, reset
        if (!phaseName) {
            this.resetPhaseDisplay();
            return;
        }

        // Récupérer min/max de la phase sélectionnée
        const opt = phaseSelect.options[phaseSelect.selectedIndex];
        const estimatedMin = Number(opt?.dataset?.min || 0);
        const estimatedMax = Number(opt?.dataset?.max || 0);

        // Si pas de site_id, afficher seulement l'estimé statique
        if (!siteId) {
            this.updatePhaseEstimateDisplay(0, estimatedMin, estimatedMax, 'not_started');
            if (daysDisplay) {
                daysDisplay.className = 'phase-auto-days-display';
                daysValue.textContent = phaseStatus === 'start' ? '1' : '—';
                daysBadge.textContent = phaseStatus === 'start' ? this.t('Jour 1', 'Day 1') : this.t('Nouveau site', 'New site');
                hiddenInput.value = phaseStatus === 'start' ? 1 : 0;
            }
            return;
        }

        // Loading state
        if (daysDisplay) {
            daysDisplay.className = 'phase-auto-days-display loading';
            daysValue.textContent = '...';
            daysBadge.textContent = this.t('Calcul...', 'Calculating...');
        }

        try {
            const url = `${this.serverUrl}/api/sites/${encodeURIComponent(siteId)}/phase-auto-days?phase_name=${encodeURIComponent(phaseName)}&report_date=${encodeURIComponent(reportDate)}`;
            const result = await this.apiFetchJson(url);

            let autoDays = Number(result.auto_days || 0);
            const serverPhaseStatus = result.phase_status || 'not_started';

            // Si c'est un "start" et aucune donnée existante → jour 1
            if (autoDays === 0 && (phaseStatus === 'start' || phaseStatus === 'on track')) {
                autoDays = 1;
            }

            // Déterminer la couleur
            let statusClass = 'has-data';
            let badgeText = '';

            if (autoDays <= 0) {
                statusClass = '';
                badgeText = this.t('Non démarrée', 'Not started');
            } else if (autoDays <= estimatedMin) {
                statusClass = 'on-track';
                badgeText = '✅ ' + this.t('À temps', 'On time');
            } else if (autoDays <= estimatedMax) {
                statusClass = 'on-track';
                badgeText = '✅ ' + this.t('Dans le délai', 'Within schedule');
            } else {
                const delay = autoDays - estimatedMax;
                if (delay <= 2) {
                    statusClass = 'warning';
                    badgeText = '⚠️ +' + delay + this.t('j de retard', 'd delay');
                } else {
                    statusClass = 'danger';
                    badgeText = '🔴 +' + delay + this.t('j de retard', 'd delay');
                }
            }

            if (serverPhaseStatus === 'closed') {
                badgeText = '🏁 ' + this.t('Phase clôturée', 'Phase closed');
            }

            // Mettre à jour le display
            if (daysDisplay) {
                daysDisplay.className = 'phase-auto-days-display ' + statusClass;
                daysValue.textContent = autoDays > 0 ? String(autoDays) : '—';
                daysBadge.textContent = badgeText;
            }
            hiddenInput.value = autoDays;

            // Mettre à jour l'estimé / retard
            this.updatePhaseEstimateDisplay(autoDays, estimatedMin, estimatedMax, serverPhaseStatus);

        } catch (err) {
            console.warn('Erreur calcul auto-jours phase:', err);
            // Fallback : afficher juste les estimés statiques
            if (daysDisplay) {
                daysDisplay.className = 'phase-auto-days-display';
                daysValue.textContent = phaseStatus === 'start' ? '1' : '—';
                daysBadge.textContent = this.t('Calcul indisponible', 'Calculation unavailable');
                hiddenInput.value = phaseStatus === 'start' ? 1 : 0;
            }
            this.updatePhaseEstimateDisplay(0, estimatedMin, estimatedMax, 'not_started');
        }
    }

    /**
     * Update the estimated / delay display with progress bar
     */
    updatePhaseEstimateDisplay(actualDays, minDays, maxDays, phaseStatus) {
        const textEl = document.querySelector('.phase-estimate-text');
        const progressBar = document.getElementById('phase-progress-bar');
        const progressFill = document.getElementById('phase-progress-fill');

        if (!textEl) return;

        if (!minDays && !maxDays) {
            textEl.textContent = this.t('Estimé: N/A | Retard: N/A', 'Estimated: N/A | Delay: N/A');
            if (progressBar) progressBar.style.display = 'none';
            return;
        }

        const estimateLabel = minDays === maxDays ? `${minDays}j` : `${minDays}-${maxDays}j`;

        if (!actualDays || actualDays <= 0) {
            textEl.textContent = `${this.t('Estimé:', 'Estimated:')} ${estimateLabel} | ${this.t('Retard:', 'Delay:')} N/A`;
            if (progressBar) progressBar.style.display = 'none';
            return;
        }

        const delay = Math.round((actualDays - maxDays) * 10) / 10;
        
        if (delay > 0) {
            textEl.innerHTML = `${this.t('Prévu:', 'Planned:')} <strong>${estimateLabel}</strong> | <span style="color:#dc2626;font-weight:600">${this.t('Retard:', 'Delay:')} +${delay}j 🔴</span>`;
        } else if (actualDays > minDays) {
            textEl.innerHTML = `${this.t('Prévu:', 'Planned:')} <strong>${estimateLabel}</strong> | <span style="color:#d97706;font-weight:600">${this.t('En approche du seuil', 'Approaching threshold')} ⚠️</span>`;
        } else {
            textEl.innerHTML = `${this.t('Prévu:', 'Planned:')} <strong>${estimateLabel}</strong> | <span style="color:#059669;font-weight:600">${this.t('Statut:', 'Status:')} ${this.t('À temps', 'On time')} ✅</span>`;
        }

        // Progress bar
        if (progressBar && progressFill) {
            progressBar.style.display = '';
            const pct = Math.min(100, Math.round((actualDays / maxDays) * 100));
            progressFill.style.width = pct + '%';
            progressFill.className = 'phase-progress-fill';
            if (pct > 100 || delay > 0) {
                progressFill.classList.add('danger');
                progressFill.style.width = '100%';
            } else if (pct > 80) {
                progressFill.classList.add('warning');
            }
        }
    }

    toggleEndDateField() {
        const status = document.getElementById('phase-status')?.value || '';
        const endGroup = document.getElementById('phase-end-date-group');
        const scoreRow = document.getElementById('phase-score-row');
        if (endGroup) endGroup.style.display = status === 'closed' ? '' : 'none';
        if (scoreRow && status !== 'closed') scoreRow.style.display = 'none';
    }

    computeLocalPhaseDays() {
        const startStr = document.getElementById('phase-start-date')?.value;
        const endStr = document.getElementById('phase-end-date')?.value;
        const status = document.getElementById('phase-status')?.value || '';
        const reportDate = document.getElementById('report-date')?.value;

        const daysValue = document.getElementById('phase-auto-days-value');
        const daysBadge = document.getElementById('phase-auto-badge');
        const daysDisplay = document.getElementById('phase-actual-days-display');
        const hiddenInput = document.getElementById('phase-actual-days');

        if (!startStr) return;

        const start = new Date(startStr);
        let end;
        if (status === 'closed' && endStr) {
            end = new Date(endStr);
        } else {
            end = reportDate ? new Date(reportDate) : new Date();
        }

        if (isNaN(start) || isNaN(end) || end < start) return;

        const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

        if (hiddenInput) hiddenInput.value = days;
        if (daysValue) daysValue.textContent = String(days);

        const phaseSelect = document.getElementById('phase-name');
        const opt = phaseSelect?.options[phaseSelect.selectedIndex];
        const estimatedMin = Number(opt?.dataset?.min || 0);
        const estimatedMax = Number(opt?.dataset?.max || 0);

        let statusClass = 'has-data';
        if (days <= estimatedMax) {
            statusClass = 'on-track';
            if (daysBadge) daysBadge.textContent = '✅ ' + this.t('À temps', 'On time');
        } else {
            const delay = days - estimatedMax;
            statusClass = delay <= 2 ? 'warning' : 'danger';
            if (daysBadge) daysBadge.textContent = (delay <= 2 ? '⚠️ ' : '🔴 ') + '+' + delay + this.t('j retard', 'd delay');
        }
        if (daysDisplay) daysDisplay.className = 'phase-auto-days-display ' + statusClass;

        this.updatePhaseEstimateDisplay(days, estimatedMin, estimatedMax, status === 'closed' ? 'closed' : 'on_track');

        if (status === 'closed' && endStr) {
            this.showPhaseScore(days, estimatedMin, estimatedMax);
        }
    }

    showPhaseScore(actualDays, minDays, maxDays) {
        const scoreRow = document.getElementById('phase-score-row');
        const scoreValue = document.getElementById('phase-score-value');
        const scoreDetail = document.getElementById('phase-score-detail');
        const scoreDisplay = document.getElementById('phase-score-display');
        if (!scoreRow || !scoreValue) return;

        const phaseSelect = document.getElementById('phase-name');
        const phaseName = phaseSelect?.value || '';

        const phaseConfigs = {
            'Implantation': 5, 'Excavation': 7, 'Réseau de terre': 5, 'Béton de propreté': 5,
            'Rebars': 7, 'RFC (Ready for Casting)': 5, 'Casting (Coulage)': 8, 'Curing': 7,
            'Backfilling': 6, 'Tower Erection': 8, 'Casting Slabs': 6, 'Manholes': 6,
            'Power Installation': 8, 'Guardhouse': 9, 'Fence': 9, 'Nivellement & Épandage': 6,
            'Cleaning Site': 7, 'Autres': 0
        };

        const weight = phaseConfigs[phaseName] || 0;
        const delay = Math.max(0, actualDays - maxDays);

        // 100% = à temps, pénalité de 10% par jour de retard
        let pct = 100;
        if (delay > 0) pct = Math.max(0, 100 - (delay * 10));
        pct = Math.round(pct);

        scoreRow.style.display = '';
        scoreValue.textContent = pct + '%';
        scoreValue.style.color = pct >= 80 ? '#10b981' : pct >= 50 ? '#d97706' : '#ef4444';
        if (scoreDisplay) {
            scoreDisplay.style.borderColor = pct >= 80 ? '#059669' : pct >= 50 ? '#d97706' : '#ef4444';
            scoreDisplay.style.background = pct >= 80 ? 'rgba(5,150,105,0.1)' : pct >= 50 ? 'rgba(217,119,6,0.1)' : 'rgba(239,68,68,0.1)';
        }

        if (scoreDetail) {
            if (delay > 0) {
                scoreDetail.textContent = this.t(
                    `${actualDays}j réels vs ${maxDays}j max → ${delay}j de retard → -${delay * 10}%`,
                    `${actualDays}d actual vs ${maxDays}d max → ${delay}d delay → -${delay * 10}%`
                );
            } else {
                scoreDetail.textContent = this.t(
                    `${actualDays}j réels ≤ ${maxDays}j max → à temps → 100%`,
                    `${actualDays}d actual ≤ ${maxDays}d max → on time → 100%`
                );
            }
        }
    }

    updateActivitiesLabel() {
        const phaseSelect = document.getElementById('phase-name');
        const phaseName = phaseSelect?.value || '';
        const label = document.getElementById('activities-label');
        const hint = document.getElementById('activities-hint');
        const textarea = document.getElementById('activities');

        if (!label) return;

        if (phaseName && phaseName !== 'Autres') {
            label.innerHTML = `<span class="label-icon">⚙️</span> ${this.t('Activités sur le Site', 'Site Activities')} : <strong>${phaseName}</strong>`;
            if (textarea) textarea.placeholder = this.t(
                `Décrivez les activités réalisées sur le site pour la phase "${phaseName}"...`,
                `Describe the site activities for the "${phaseName}" phase...`
            );
            if (hint) hint.textContent = this.t(
                `Détaillez les travaux en cours, ce qui est fait et les blocages éventuels`,
                `Detail ongoing work, completed tasks and any blockers`
            );
        } else {
            label.innerHTML = `<span class="label-icon">⚙️</span> ${this.t('Activités sur le Site', 'Site Activities')}`;
            if (textarea) textarea.placeholder = this.t(
                'Décrivez les activités réalisées sur le site...',
                'Describe the site activities...'
            );
            if (hint) hint.textContent = this.t(
                'Détaillez les travaux en cours pour la phase sélectionnée ci-dessus',
                'Detail the ongoing work for the phase selected above'
            );
        }
    }

    resetPhaseDisplay() {
        const daysDisplay = document.getElementById('phase-actual-days-display');
        const daysValue = document.getElementById('phase-auto-days-value');
        const daysBadge = document.getElementById('phase-auto-badge');
        const hiddenInput = document.getElementById('phase-actual-days');
        const textEl = document.querySelector('.phase-estimate-text');
        const progressBar = document.getElementById('phase-progress-bar');

        if (daysDisplay) daysDisplay.className = 'phase-auto-days-display';
        if (daysValue) daysValue.textContent = '—';
        if (daysBadge) daysBadge.textContent = this.t('Automatique', 'Automatic');
        if (hiddenInput) hiddenInput.value = '0';
        if (textEl) textEl.textContent = this.t('Estimé: N/A | Retard: N/A', 'Estimated: N/A | Delay: N/A');
        if (progressBar) progressBar.style.display = 'none';
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
            const result = await this.apiFetchJson(
                `${this.serverUrl}/api/sites?supervisor_name=${encodeURIComponent(supervisorName)}`
            );
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

        this.playNotificationSound('success');
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
        const chatInput = document.getElementById('supervisor-zone-chat-input');
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendZoneChatMessage();
                }
            });
        }
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
            const result = await this.apiFetchJson(
                `${this.serverUrl}/api/chat/messages?scope_type=zone&scope_id=${encodeURIComponent(zone)}&limit=120`
            );
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
                    <span class="feedback-pm">${this.escapeHtml(m.sender_name)} (${m.sender_role})</span>
                    <span class="feedback-date">${this.formatDate(m.created_at)}</span>
                </div>
                <div class="feedback-text">${this.escapeHtml(m.message).replace(/\n/g, '<br>')}</div>
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
            await this.apiFetchJson(`${this.serverUrl}/api/chat/messages`, {
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
        this.playNotificationSound('default');
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
            const result = await this.apiFetchJson(
                `${this.serverUrl}/api/chat/messages?scope_type=report&scope_id=${encodeURIComponent(reportId)}&limit=120`
            );
            const messages = result.messages || [];
            if (!messages.length) {
                list.innerHTML = '<div class="empty-state"><p>Aucun message pour ce rapport</p></div>';
                return;
            }
            list.innerHTML = messages.map(m => `
                <div class="feedback-item">
                    <div class="feedback-header">
                        <span class="feedback-pm">${this.escapeHtml(m.sender_name)} (${this.escapeHtml(m.sender_role)})</span>
                        <span class="feedback-date">${this.formatDate(m.created_at)}</span>
                    </div>
                    <div class="feedback-text">${this.escapeHtml(m.message).replace(/\n/g, '<br>')}</div>
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
            await this.apiFetchJson(`${this.serverUrl}/api/chat/messages`, {
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
            input.value = '';
        } catch (error) {
            console.error('Erreur envoi chat rapport superviseur:', error);
            this.showToast(`Erreur chat rapport: ${error.message}`, 'error');
        }
    }

    handleIncomingReportChat(message) {
        if (message?.scope_type !== 'report') return;
        this.playNotificationSound('default');
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
                // Input dans le DOM + clic : plusieurs WebViews Android ignorent sinon
                const runtimeInput = document.createElement('input');
                runtimeInput.type = 'file';
                runtimeInput.accept = 'image/*';
                runtimeInput.setAttribute('capture', 'environment');
                runtimeInput.style.cssText = 'position:fixed;left:-9999px;opacity:0;width:1px;height:1px;';
                runtimeInput.addEventListener('change', () => {
                    const files = Array.from(runtimeInput.files || []).filter(f => f.type.startsWith('image/'));
                    if (files.length > 0) this.addImages(files);
                    runtimeInput.remove();
                });
                document.body.appendChild(runtimeInput);
                runtimeInput.click();
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
            const phaseName = this.getFieldValue('phase-name', '').trim();
            const formData = {
                site_id: this.getFieldValue('site-id', '').trim(),
                site_name: this.getFieldValue('site-name', '').trim(),
                activities: this.getFieldValue('activities', '').trim(),
                comments: this.getFieldValue('comments', '').trim(),
                supervisor_name: this.getFieldValue('supervisor-name', '').trim(),
                region: this.getFieldValue('region', ''),
                report_date: this.getFieldValue('report-date', ''),
                phase_name: phaseName,
                phase_status: this.getFieldValue('phase-status', 'on track'),
                phase_actual_days: Number(this.getFieldValue('phase-actual-days', 0) || 0),
                phase_start_date: document.getElementById('phase-start-date')?.value || '',
                phase_end_date: document.getElementById('phase-end-date')?.value || '',
                is_final_acceptance: Boolean(document.getElementById('is-final-acceptance')?.checked)
            };
            formData.milestone_category = formData.phase_name || 'Autres';

            if (!formData.site_id || !formData.site_name || !formData.activities || !formData.supervisor_name || !formData.region) {
                throw new Error(this.t('Veuillez remplir tous les champs obligatoires', 'Please fill all required fields'));
            }
            if (!formData.phase_name) {
                throw new Error(this.t('Choisissez une phase / jalon dans la liste.', 'Please select a phase / milestone.'));
            }
            
            // Créer le rapport
            const result = await this.apiFetchJson(
                this.serverUrl + '/api/reports',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                },
                [0, 3000, 7000]
            );

            const newReportId = getReportId(result.report);
            if (!newReportId) {
                throw new Error(this.t('Réponse serveur sans identifiant de rapport.', 'Server response missing report id.'));
            }
            
            // Upload des images si présentes
            if (this.selectedImages.length > 0) {
                try {
                    await this.uploadImages(newReportId);
                } catch (imageError) {
                    // The report already exists; keep success and only warn for image upload.
                    this.showToast(`Rapport envoyé, mais erreur photos: ${imageError.message}`, 'warning');
                }
            }

            if (formData.is_final_acceptance) {
                const acceptanceFile = document.getElementById('acceptance-document').files?.[0];
                if (!acceptanceFile) {
                    throw new Error('Le document acceptance est obligatoire pour clôturer le site');
                }
                await this.uploadAcceptanceDocument(newReportId, acceptanceFile);
            }
            
            this.playNotificationSound('success');
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
        
        await this.apiFetchJson(
            `${this.serverUrl}/api/reports/${reportId}/images`,
            { method: 'POST', body: formData },
            [0, 2500]
        );
    }

    async uploadAcceptanceDocument(reportId, file) {
        const formData = new FormData();
        formData.append('acceptance_document', file);

        const result = await this.apiFetchJson(
            `${this.serverUrl}/api/reports/${reportId}/acceptance-document`,
            { method: 'POST', body: formData },
            [0, 2500]
        );

        if (result.report?.supervisor_score !== undefined) {
            this.showToast(`Site clôturé. Côte superviseur: ${result.report.supervisor_score}`, 'success');
        }
    }
    
    resetForm() {
        document.getElementById('report-form').reset();
        document.getElementById('image-preview').innerHTML = '';
        this.selectedImages = [];
        
        this.loadSavedSupervisorName();
        this.setDefaultDate();
        this.resetPhaseDisplay();

        const startDate = document.getElementById('phase-start-date');
        const endDate = document.getElementById('phase-end-date');
        if (startDate) startDate.value = '';
        if (endDate) endDate.value = '';
        this.toggleEndDateField();
        const scoreRow = document.getElementById('phase-score-row');
        if (scoreRow) scoreRow.style.display = 'none';
    }
    
    // ================== Load Reports ==================
    
    async loadMyReports() {
        const container = document.getElementById('my-reports');
        
        try {
            const supervisorName = (document.getElementById('supervisor-name')?.value || '').trim();
            const url = supervisorName
                ? `${this.serverUrl}/api/reports?supervisor_name=${encodeURIComponent(supervisorName)}`
                : `${this.serverUrl}/api/reports`;
            const result = await this.apiFetchJson(url, {}, [0, 3000, 7000]);
            
            let list = result.reports || [];
            // Secours si un vieux backend ignore ?supervisor_name=…
            if (supervisorName && list.length === 0) {
                const r2 = await this.apiFetchJson(`${this.serverUrl}/api/reports`, {}, [0, 2500]);
                let all = [];
                try {
                    const j2 = r2 || {};
                    if (j2.success && Array.isArray(j2.reports)) all = j2.reports;
                } catch (_) { /* ignore */ }
                const want = supervisorName.trim().toLowerCase();
                list = all.filter(r => (r.supervisor_name || '').trim().toLowerCase() === want);
            }
            this.myReports = list;
            this.renderMyReports();
            
        } catch (error) {
            console.error('Erreur chargement rapports:', error);
            container.innerHTML = `<div class="empty-state"><p>${this.t('Impossible de charger les rapports', 'Could not load reports')}: ${error.message}</p></div>`;
            setTimeout(() => this.loadMyReports(), 8000);
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
            const rid = getReportId(report);
            const unreadCount = this.unreadReportCounts[rid] || 0;
            return `
            <div class="report-card ${report.status}" data-id="${rid}">
                <div class="report-card-header">
                    <div class="report-site-info">
                        <span class="report-site-id">${this.escapeHtml(report.site_id)}</span>
                        <div class="report-site-name">${this.escapeHtml(report.site_name)}</div>
                    </div>
                    <span class="report-status ${report.status}">
                        ${report.status === 'pending' ? '⏳ En attente' : '✅ Examiné'}
                    </span>
                </div>
                <div class="report-card-body">
                    ${this.escapeHtml(this.truncateText(report.activities, 100))}
                </div>
                <div class="report-card-footer">
                    <span class="report-date">${this.formatDate(report.created_at)} • ${report.phase_name || report.milestone_category || 'Jalon N/A'} (${report.phase_status || 'on track'})</span>
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
        if (!this.syncAuthTokenFromStorage()) {
            this.showToast(
                this.t('Session expirée ou déconnecté. Reconnectez-vous.', 'Session expired. Please log in again.'),
                'error'
            );
            this.logout();
            return;
        }
        const modal = document.getElementById('report-modal');
        const modalBody = document.getElementById('modal-body');
        const rawId = (reportId != null ? String(reportId) : '').trim();
        if (!rawId) {
            this.showToast(this.t('Rapport invalide (identifiant manquant).', 'Invalid report (missing id).'), 'error');
            return;
        }
        if (this.socket) this.socket.emit('join-report', rawId);
        
        try {
            const result = await this.apiFetchJson(
                `${this.serverUrl}/api/reports/${encodeURIComponent(rawId)}`
            );
            const report = result.report;
            if (!report) {
                throw new Error(this.t('Rapport introuvable.', 'Report not found.'));
            }
            
            modalBody.innerHTML = `
                <div class="detail-section">
                    <div class="detail-section-title">Site</div>
                    <div class="detail-section-content">
                        <strong>${this.escapeHtml(String(report.site_id || ''))}</strong> - ${this.escapeHtml(String(report.site_name || ''))}
                    </div>
                </div>
                
                <div class="detail-section">
                    <div class="detail-section-title">Superviseur</div>
                    <div class="detail-section-content">${this.escapeHtml(String(report.supervisor_name || 'Non spécifié'))}</div>
                </div>
                
                <div class="detail-section">
                    <div class="detail-section-title">Activités</div>
                    <div class="detail-section-content">${this.escapeHtml(String(report.activities || '')).replace(/\n/g, '<br>')}</div>
                </div>

                <div class="detail-section">
                    <div class="detail-section-title">Jalon & Planning</div>
                    <div class="detail-section-content">
                        <strong>Phase:</strong> ${this.escapeHtml(String(report.phase_name || report.milestone_category || 'N/A'))}<br>
                        <strong>Statut:</strong> ${this.escapeHtml(String(report.phase_status || 'on track'))}<br>
                        <strong>Durée estimée:</strong> ${this.escapeHtml(String(report.phase_estimated_label || 'N/A'))} jours<br>
                        <strong>Jours réels phase:</strong> ${Number(report.phase_actual_days) || 0} jours<br>
                        <strong>Retard phase:</strong> ${report.phase_variance_days ?? 0} jours<br>
                        <strong>Durée réalisée site:</strong> ${report.actual_duration_days || 0} jours
                    </div>
                </div>
                
                ${report.comments ? `
                    <div class="detail-section">
                        <div class="detail-section-title">Commentaires</div>
                        <div class="detail-section-content">${this.escapeHtml(String(report.comments)).replace(/\n/g, '<br>')}</div>
                    </div>
                ` : ''}
                
                ${report.images?.length > 0 ? `
                    <div class="detail-section">
                        <div class="detail-section-title">Photos (${report.images.length})</div>
                        <div class="detail-images-grid">
                            ${report.images.map(img => `
                                <img src="${this.escapeHtml(String(img.url || ''))}" class="detail-image" alt="Photo du site">
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
                                    <span class="feedback-pm">${this.escapeHtml(String(fb.pm_name || 'PM'))}</span>
                                    <span class="feedback-date">${this.formatDate(fb.created_at)}</span>
                                </div>
                                <div class="feedback-text">${this.escapeHtml(String(fb.feedback || '')).replace(/\n/g, '<br>')}</div>
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

                ${report.acceptance_document?.url ? `
                    <div class="detail-section">
                        <div class="detail-section-title">Document acceptance</div>
                        <div class="detail-section-content">
                            <a href="${this.escapeHtml(String(report.acceptance_document.url))}" target="_blank" rel="noopener noreferrer">📎 Voir le document</a><br>
                            ${report.supervisor_score !== undefined ? `<strong>Côte superviseur:</strong> ${this.escapeHtml(String(report.supervisor_score))}` : ''}<br>
                            <strong>Milestone RFI:</strong> ${report.is_rfi_ready ? 'READY' : 'Non atteint'}
                        </div>
                    </div>
                ` : ''}

                ${report.score_breakdown?.phase_points?.length ? `
                    <div class="detail-section">
                        <div class="detail-section-title">Côtes par phase clôturée</div>
                        <div class="detail-section-content">
                            ${report.score_breakdown.phase_points
                                .map(p => `- ${this.escapeHtml(String(p.phase_name || ''))}: ${p.points > 0 ? '+' : ''}${p.points} ${p.delay_days > 0 ? `(retard ${p.delay_days}j)` : '(à temps)'}`)
                                .join('<br>')}
                        </div>
                    </div>
                ` : ''}
                
                <div class="detail-actions">
                    <button class="btn-delete" id="delete-report-btn" data-id="${this.escapeHtml(getReportId(report))}">
                        🗑️ Supprimer ce rapport
                    </button>
                </div>
            `;
            
            modal.classList.add('active');
            
            const rid = getReportId(report);
            // Ajouter l'event listener pour la suppression
            document.getElementById('delete-report-btn').addEventListener('click', () => {
                this.deleteReport(rid);
            });

            document.getElementById('supervisor-report-chat-send').addEventListener('click', () => {
                this.sendReportChatMessage(rid);
            });
            try {
                await this.loadReportChatMessages(rid);
            } catch (chatErr) {
                console.warn('Chat rapport (non bloquant):', chatErr);
            }
            
        } catch (error) {
            console.error('Erreur:', error);
            const detail = error?.message ? `: ${error.message}` : '';
            this.showToast(`${this.t('Erreur lors du chargement du rapport', 'Error loading report')}${detail}`, 'error');
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
            await this.apiFetchJson(`${this.serverUrl}/api/reports/${reportId}`, { method: 'DELETE' });
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
        this.playNotificationSound('default');
        this.showToast(this.t('Nouvel avis reçu du PM !', 'New feedback from PM!'), 'info');
        
        // Recharger les rapports (inclut le statut « Examiné »)
        this.loadMyReports();
        
        // Afficher dans la section feedback
        const feedbackSection = document.getElementById('feedback-section');
        const feedbackList = document.getElementById('feedback-list');
        if (!feedbackSection || !feedbackList) return;
        
        feedbackSection.style.display = 'block';
        
        const feedbackHtml = `
            <div class="feedback-item new">
                <div class="feedback-header">
                    <span class="feedback-pm">${this.escapeHtml(data.feedback.pm_name || 'PM')}</span>
                    <span class="feedback-date">${this.formatDate(data.feedback.created_at)}</span>
                </div>
                <div class="feedback-text">${this.escapeHtml(data.feedback.feedback || '').replace(/\n/g, '<br>')}</div>
            </div>
        `;
        
        feedbackList.insertAdjacentHTML('afterbegin', feedbackHtml);
    }
    
    // ================== Notification Sound ==================

    playNotificationSound(style = 'default') {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const now = ctx.currentTime;

            const tones = style === 'success'
                ? [[523.25, 0, 0.12], [659.25, 0.12, 0.12], [783.99, 0.24, 0.18]]
                : style === 'warning'
                    ? [[440, 0, 0.15], [440, 0.2, 0.15]]
                    : [[587.33, 0, 0.1], [783.99, 0.12, 0.16]];

            tones.forEach(([freq, offset, dur]) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.25, now + offset);
                gain.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
                osc.connect(gain).connect(ctx.destination);
                osc.start(now + offset);
                osc.stop(now + offset + dur + 0.05);
            });

            setTimeout(() => ctx.close(), 1500);
        } catch (_) {}
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

    escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    formatDate(dateString) {
        if (!dateString) return '—';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return '—';
        const locale = this.language === 'en' ? 'en-US' : 'fr-FR';
        return date.toLocaleDateString(locale, {
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
