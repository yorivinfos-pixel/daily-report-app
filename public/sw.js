// ============================================
// Daily Report Site Supervisor - Service Worker
// ============================================

const CACHE_NAME = 'daily-report-v2';
const STATIC_ASSETS = [
    '/',
    '/pm',
    '/pm.html',
    '/css/styles.css',
    '/css/pm-dashboard.css',
    '/js/supervisor.js',
    '/js/pm-dashboard.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Installation
self.addEventListener('install', event => {
    console.log('Service Worker: Installation');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Mise en cache des fichiers statiques');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activation
self.addEventListener('activate', event => {
    console.log('Service Worker: Activation');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(cacheName => cacheName !== CACHE_NAME)
                    .map(cacheName => {
                        console.log('Service Worker: Suppression ancien cache', cacheName);
                        return caches.delete(cacheName);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch - Stratégie Network First avec fallback Cache
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Ignorer les requêtes non-GET
    if (request.method !== 'GET') return;
    
    // Ignorer les requêtes socket.io
    if (url.pathname.includes('socket.io')) return;
    
    // Pour les requêtes API, toujours essayer le réseau d'abord
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // Cloner et mettre en cache les réponses réussies
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Si hors ligne, essayer le cache
                    return caches.match(request);
                })
        );
        return;
    }
    
    // Pour les images uploadées, network first
    if (url.pathname.startsWith('/uploads/')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseClone);
                    });
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }
    
    // Pour les assets statiques, cache first
    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    // Mettre à jour le cache en arrière-plan
                    fetch(request).then(response => {
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, response);
                        });
                    }).catch(() => {});
                    
                    return cachedResponse;
                }
                
                return fetch(request).then(response => {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseClone);
                    });
                    return response;
                });
            })
    );
});

// Background Sync pour les rapports offline
self.addEventListener('sync', event => {
    if (event.tag === 'sync-reports') {
        event.waitUntil(syncReports());
    }
});

async function syncReports() {
    try {
        // Récupérer les rapports en attente depuis IndexedDB
        const pendingReports = await getPendingReports();
        
        for (const report of pendingReports) {
            try {
                const response = await fetch('/api/reports', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(report)
                });
                
                if (response.ok) {
                    await removePendingReport(report.id);
                }
            } catch (error) {
                console.error('Erreur sync rapport:', error);
            }
        }
    } catch (error) {
        console.error('Erreur sync:', error);
    }
}

// Push Notifications
self.addEventListener('push', event => {
    const data = event.data?.json() || {};
    
    const options = {
        body: data.body || 'Nouveau message',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        },
        actions: [
            { action: 'open', title: 'Voir' },
            { action: 'close', title: 'Fermer' }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'Daily Report', options)
    );
});

// Notification Click
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then(clientList => {
                const url = event.notification.data?.url || '/';
                
                for (const client of clientList) {
                    if (client.url === url && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                if (clients.openWindow) {
                    return clients.openWindow(url);
                }
            })
        );
    }
});

// Helpers pour IndexedDB (stub - à implémenter si offline first requis)
async function getPendingReports() {
    return [];
}

async function removePendingReport(id) {
    return true;
}
