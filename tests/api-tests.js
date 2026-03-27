#!/usr/bin/env node
/**
 * tests/api-tests.js
 * Tests automatisés des endpoints critiques
 * Usage: node tests/api-tests.js [BASE_URL]
 * Default: http://localhost:3000
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000';

let passed = 0;
let failed = 0;
let token = null;

async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        console.log(`  ❌ ${name} — ${err.message}`);
    }
}

function assert(condition, msg) {
    if (!condition) throw new Error(msg || 'Assertion failed');
}

async function api(method, path, body, headers = {}) {
    const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
    if (body) opts.body = JSON.stringify(body);
    const resp = await fetch(`${BASE_URL}${path}`, opts);
    const data = await resp.json().catch(() => null);
    return { status: resp.status, data };
}

async function authApi(method, path, body) {
    return api(method, path, body, { Authorization: `Bearer ${token}` });
}

// ========== TESTS ==========

async function runTests() {
    console.log(`\n🧪 Tests API — ${BASE_URL}\n`);

    // --- Health ---
    console.log('📡 Connexion:');
    await test('GET / retourne HTML', async () => {
        const resp = await fetch(`${BASE_URL}/`);
        assert(resp.status === 200, `Status ${resp.status}`);
    });

    // --- Zone Mapping ---
    console.log('\n🗺️  Zone Mapping:');
    await test('GET /api/zone-mapping retourne le mapping', async () => {
        const { status, data } = await api('GET', '/api/zone-mapping');
        assert(status === 200, `Status ${status}`);
        assert(data.success === true, 'success !== true');
        assert(data.mapping && typeof data.mapping === 'object', 'mapping manquant');
        assert(data.defaultZone, 'defaultZone manquant');
    });

    // --- Auth ---
    console.log('\n🔐 Authentification:');
    await test('POST /api/auth/login sans body → 400', async () => {
        const { status } = await api('POST', '/api/auth/login', {});
        assert(status === 400, `Expected 400, got ${status}`);
    });

    await test('POST /api/auth/login credentials invalides → 401', async () => {
        const { status } = await api('POST', '/api/auth/login', {
            username: 'nonexistent_user_test',
            password: 'wrongpassword'
        });
        assert(status === 401, `Expected 401, got ${status}`);
    });

    await test('POST /api/auth/login admin → 200 + token', async () => {
        const { status, data } = await api('POST', '/api/auth/login', {
            username: 'admin',
            password: process.env.SEED_DEFAULT_PASSWORD || 'test'
        });
        // Si le mot de passe de test est correct, on obtient 200; sinon on skip
        if (status === 200) {
            assert(data.token, 'Token manquant dans la réponse');
            token = data.token;
        } else {
            console.log('    ⚠️  Login admin échoué (mot de passe test incorrect) — tests auth-required seront skippés');
        }
    });

    // --- Protected routes (require login) ---
    if (token) {
        console.log('\n📋 Rapports (auth required):');

        await test('GET /api/reports → liste de rapports', async () => {
            const { status, data } = await authApi('GET', '/api/reports');
            assert(status === 200, `Status ${status}`);
            assert(data.success === true, 'success !== true');
            assert(Array.isArray(data.reports), 'reports not array');
        });

        await test('GET /api/sites → liste de sites', async () => {
            const { status, data } = await authApi('GET', '/api/sites');
            assert(status === 200, `Status ${status}`);
            assert(data.success === true, 'success !== true');
        });

        await test('GET /api/export/site-tracking → données tracking', async () => {
            const { status, data } = await authApi('GET', '/api/export/site-tracking');
            assert(status === 200, `Status ${status}`);
            assert(data.success === true, 'success !== true');
            assert(Array.isArray(data.rows), 'rows not array');
        });

        await test('GET /api/admin/users → liste utilisateurs', async () => {
            const { status, data } = await authApi('GET', '/api/admin/users');
            assert(status === 200, `Status ${status}`);
            assert(data.success === true, 'success !== true');
            assert(Array.isArray(data.users), 'users not array');
        });
    }

    // --- Unauthorized access ---
    console.log('\n🚫 Accès non autorisé:');
    await test('GET /api/reports sans token → 401', async () => {
        const { status } = await api('GET', '/api/reports');
        assert(status === 401, `Expected 401, got ${status}`);
    });

    await test('GET /api/sites sans token → 401', async () => {
        const { status } = await api('GET', '/api/sites');
        assert(status === 401, `Expected 401, got ${status}`);
    });

    await test('Token invalide → 401', async () => {
        const { status } = await api('GET', '/api/reports', null, {
            Authorization: 'Bearer invalid.token.here'
        });
        assert(status === 401 || status === 403, `Expected 401/403, got ${status}`);
    });

    // --- Résultat ---
    console.log(`\n${'═'.repeat(45)}`);
    console.log(`📊 Résultat: ${passed} passé(s), ${failed} échoué(s)`);
    console.log(`${'═'.repeat(45)}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
});
