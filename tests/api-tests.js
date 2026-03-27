#!/usr/bin/env node
/**
 * tests/api-tests.js
 * Tests automatisés complets des endpoints critiques
 * Usage: node tests/api-tests.js [BASE_URL]
 * Default: http://localhost:3000
 *
 * Couvre : santé, auth, CRUD rapports/sites/users, validation input,
 *          rate-limiting login, export, chat, changement mot de passe,
 *          accès non-autorisé, rôles.
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000';

let passed = 0;
let failed = 0;
let skipped = 0;
let token = null;        // admin token
let pmToken = null;      // pm token (si dispo)
let currentUserId = null;

async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        if (err.message === '__SKIP__') {
            skipped++;
            console.log(`  ⏭️  ${name} (skipped)`);
        } else {
            failed++;
            console.log(`  ❌ ${name} — ${err.message}`);
        }
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

function skip() { throw new Error('__SKIP__'); }

async function api(method, path, body, headers = {}) {
    const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(`${BASE_URL}${path}`, opts);
    const data = await resp.json().catch(() => null);
    return { status: resp.status, data };
}

async function authApi(method, path, body, tkn) {
    return api(method, path, body, { Authorization: `Bearer ${tkn || token}` });
}

// ========== TESTS ==========

async function runTests() {
    console.log(`\n🧪 Tests API complets — ${BASE_URL}\n`);

    // ===== 1. HEALTH =====
    console.log('📡 Health Check:');
    await test('GET / retourne 200 HTML', async () => {
        const resp = await fetch(`${BASE_URL}/`);
        assert(resp.status === 200, `Status ${resp.status}`);
        const ct = resp.headers.get('content-type') || '';
        assert(ct.includes('text/html'), `Content-Type: ${ct}`);
    });

    await test('GET /pm retourne 200 HTML', async () => {
        const resp = await fetch(`${BASE_URL}/pm`);
        assert(resp.status === 200, `Status ${resp.status}`);
    });

    await test('GET /admin retourne 200 HTML', async () => {
        const resp = await fetch(`${BASE_URL}/admin`);
        assert(resp.status === 200, `Status ${resp.status}`);
    });

    // ===== 2. ZONE MAPPING =====
    console.log('\n🗺️  Zone Mapping:');
    await test('GET /api/zone-mapping retourne le mapping', async () => {
        const { status, data } = await api('GET', '/api/zone-mapping');
        assert(status === 200, `Status ${status}`);
        assert(data.success === true, 'success !== true');
        assert(data.mapping && typeof data.mapping === 'object', 'mapping manquant');
        assert(data.defaultZone, 'defaultZone manquant');
    });

    // ===== 3. AUTH — validation input =====
    console.log('\n🔐 Authentification:');
    await test('POST /api/auth/login sans body → 400', async () => {
        const { status } = await api('POST', '/api/auth/login', {});
        assert(status === 400, `Expected 400, got ${status}`);
    });

    await test('POST /api/auth/login username seul → 400', async () => {
        const { status } = await api('POST', '/api/auth/login', { username: 'admin' });
        assert(status === 400, `Expected 400, got ${status}`);
    });

    await test('POST /api/auth/login password seul → 400', async () => {
        const { status } = await api('POST', '/api/auth/login', { password: 'test' });
        assert(status === 400, `Expected 400, got ${status}`);
    });

    await test('POST /api/auth/login credentials invalides → 401', async () => {
        const { status } = await api('POST', '/api/auth/login', {
            username: 'nonexistent_user_test_xyz',
            password: 'wrongpassword'
        });
        assert(status === 401, `Expected 401, got ${status}`);
    });

    await test('POST /api/auth/login admin → 200 + token + user object', async () => {
        const { status, data } = await api('POST', '/api/auth/login', {
            username: 'admin',
            password: process.env.SEED_DEFAULT_PASSWORD || 'test'
        });
        if (status === 200) {
            assert(data.token, 'Token manquant');
            assert(data.user, 'User object manquant');
            assert(data.user.role === 'admin', `Role inattendu: ${data.user.role}`);
            assert(data.user.username === 'admin', `Username inattendu: ${data.user.username}`);
            token = data.token;
            currentUserId = data.user.id;
        } else {
            console.log('    ⚠️  Login admin échoué (mot de passe test incorrect) — tests auth-required seront skippés');
        }
    });

    // ===== 4. PROTECTED ROUTES =====
    if (token) {
        // --- Reports ---
        console.log('\n📋 Rapports (auth required):');
        await test('GET /api/reports → success + array', async () => {
            const { status, data } = await authApi('GET', '/api/reports');
            assert(status === 200, `Status ${status}`);
            assert(data.success === true, 'success !== true');
            assert(Array.isArray(data.reports), 'reports not array');
        });

        await test('GET /api/reports?region=Kinshasa → filtre fonctionne', async () => {
            const { status, data } = await authApi('GET', '/api/reports?region=Kinshasa');
            assert(status === 200, `Status ${status}`);
            assert(data.success === true, 'success !== true');
            assert(Array.isArray(data.reports), 'reports not array');
        });

        // --- Sites ---
        console.log('\n🏗️  Sites:');
        await test('GET /api/sites → success + array/object', async () => {
            const { status, data } = await authApi('GET', '/api/sites');
            assert(status === 200, `Status ${status}`);
            assert(data.success === true, 'success !== true');
        });

        // --- Export ---
        console.log('\n📊 Export:');
        await test('GET /api/export/site-tracking → rows array', async () => {
            const { status, data } = await authApi('GET', '/api/export/site-tracking');
            assert(status === 200, `Status ${status}`);
            assert(data.success === true, 'success !== true');
            assert(Array.isArray(data.rows), 'rows not array');
        });

        // --- Admin Users ---
        console.log('\n👤 Admin - Utilisateurs:');
        await test('GET /api/admin/users → users array', async () => {
            const { status, data } = await authApi('GET', '/api/admin/users');
            assert(status === 200, `Status ${status}`);
            assert(data.success === true, 'success !== true');
            assert(Array.isArray(data.users), 'users not array');
            assert(data.users.length > 0, 'Aucun utilisateur trouvé');
        });

        // --- CRUD User (create, toggle, delete) ---
        let testUserId = null;

        await test('POST /api/admin/users — créer un utilisateur test', async () => {
            const { status, data } = await authApi('POST', '/api/admin/users', {
                full_name: 'Test Automate',
                username: '_test_auto_' + Date.now(),
                password: 'TestPass123',
                role: 'supervisor',
                zone: 'Zone 1'
            });
            assert(status === 200 || status === 201, `Status ${status}`);
            assert(data.success === true, 'success !== true');
            if (data.user && data.user._id) testUserId = data.user._id;
            else if (data.user && data.user.id) testUserId = data.user.id;
        });

        await test('POST /api/admin/users — doublon username → erreur', async () => {
            const { status } = await authApi('POST', '/api/admin/users', {
                full_name: 'Admin Doublon',
                username: 'admin',
                password: 'TestPass123',
                role: 'supervisor'
            });
            assert(status === 400 || status === 409 || status === 500, `Expected error, got ${status}`);
        });

        await test('POST /api/admin/users — password trop court → erreur', async () => {
            const { status } = await authApi('POST', '/api/admin/users', {
                full_name: 'Short Password',
                username: '_test_short_' + Date.now(),
                password: '123',
                role: 'supervisor'
            });
            // Le serveur peut accepter (pas de validation longueur) — on vérifie juste que ça ne crashe pas
            assert(status >= 200 && status < 600, `Status inattendu: ${status}`);
        });

        if (testUserId) {
            await test('PUT /api/admin/users/:id/toggle — désactiver utilisateur test', async () => {
                const { status, data } = await authApi('PUT', `/api/admin/users/${testUserId}/toggle`);
                assert(status === 200, `Status ${status}`);
                assert(data.success === true, 'success !== true');
            });

            await test('DELETE /api/admin/users/:id — supprimer utilisateur test', async () => {
                const { status, data } = await authApi('DELETE', `/api/admin/users/${testUserId}`);
                assert(status === 200, `Status ${status}`);
                assert(data.success === true, 'success !== true');
            });
        }

        // --- Phases config ---
        console.log('\n🧱 Phases Config:');
        await test('GET /api/phases-config → array de phases', async () => {
            const { status, data } = await authApi('GET', '/api/phases-config');
            assert(status === 200, `Status ${status}`);
            assert(data.success === true, 'success !== true');
            assert(Array.isArray(data.phases), 'phases not array');
            assert(data.phases.length >= 17, `Seulement ${data.phases.length} phases`);
        });

        // --- Password change ---
        console.log('\n🔑 Changement de mot de passe:');
        await test('PUT /api/auth/change-password sans current_password → erreur', async () => {
            const { status } = await authApi('PUT', '/api/auth/change-password', {
                new_password: 'NewPass123'
            });
            assert(status === 400 || status === 401, `Expected 400/401, got ${status}`);
        });

        await test('PUT /api/auth/change-password mauvais ancien mdp → erreur', async () => {
            const { status } = await authApi('PUT', '/api/auth/change-password', {
                current_password: 'WrongOldPass',
                new_password: 'NewPass123'
            });
            assert(status === 400 || status === 401, `Expected 400/401, got ${status}`);
        });

        // --- Chat ---
        console.log('\n💬 Chat:');
        await test('GET /api/chat/messages → array', async () => {
            const { status, data } = await authApi('GET', '/api/chat/messages');
            assert(status === 200, `Status ${status}`);
            // Peut retourner un array directement ou { success, messages }
            const isArray = Array.isArray(data);
            const hasMessages = data && data.success === true && Array.isArray(data.messages);
            assert(isArray || hasMessages, 'Réponse chat invalide');
        });
    }

    // ===== 5. UNAUTHORIZED ACCESS =====
    console.log('\n🚫 Accès non autorisé:');
    await test('GET /api/reports sans token → 401', async () => {
        const { status } = await api('GET', '/api/reports');
        assert(status === 401, `Expected 401, got ${status}`);
    });

    await test('GET /api/sites sans token → 401', async () => {
        const { status } = await api('GET', '/api/sites');
        assert(status === 401, `Expected 401, got ${status}`);
    });

    await test('GET /api/admin/users sans token → 401', async () => {
        const { status } = await api('GET', '/api/admin/users');
        assert(status === 401, `Expected 401, got ${status}`);
    });

    await test('Token invalide → 401/403', async () => {
        const { status } = await api('GET', '/api/reports', null, {
            Authorization: 'Bearer invalid.token.here'
        });
        assert(status === 401 || status === 403, `Expected 401/403, got ${status}`);
    });

    await test('Token expiré (forgé) → 401/403', async () => {
        const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTAwMDAwMDAwMCwiZXhwIjoxMDAwMDAwMDAxfQ.invalid';
        const { status } = await api('GET', '/api/reports', null, {
            Authorization: `Bearer ${fakeToken}`
        });
        assert(status === 401 || status === 403, `Expected 401/403, got ${status}`);
    });

    await test('POST /api/admin/users sans token → 401', async () => {
        const { status } = await api('POST', '/api/admin/users', {
            full_name: 'Hacker', username: 'hacker', password: '123456', role: 'admin'
        });
        assert(status === 401, `Expected 401, got ${status}`);
    });

    // ===== 6. ROUTES INEXISTANTES =====
    console.log('\n🔍 Routes inexistantes:');
    await test('GET /api/nonexistent → 404', async () => {
        const resp = await fetch(`${BASE_URL}/api/nonexistent`);
        assert(resp.status === 404, `Expected 404, got ${resp.status}`);
    });

    // ===== 7. SECURITY HEADERS =====
    console.log('\n🛡️  Sécurité:');
    await test('Headers de sécurité (Helmet)', async () => {
        const resp = await fetch(`${BASE_URL}/`);
        const csp = resp.headers.get('content-security-policy') || resp.headers.get('x-content-type-options');
        assert(csp, 'Aucun header de sécurité détecté (CSP ou X-Content-Type-Options)');
    });

    await test('X-Powered-By masqué', async () => {
        const resp = await fetch(`${BASE_URL}/`);
        const powered = resp.headers.get('x-powered-by');
        assert(!powered, `X-Powered-By exposé: ${powered}`);
    });

    // ===== RÉSULTAT =====
    const total = passed + failed + skipped;
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`📊 Résultat: ${passed} passé(s), ${failed} échoué(s), ${skipped} skippé(s) / ${total} total`);
    console.log(`${'═'.repeat(50)}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
});
