import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const state = readFileSync(new URL('../public/assets/js/state.js', import.meta.url), 'utf8');
// Evaluate the whole application entry point: testing start() alone would miss this regression.
const code =
    state.replace('export const state', 'const state') +
    '\n' +
    app.slice(app.indexOf('const DRAW_POINT_MIN_DISTANCE'));
const bootstrap = { campaigns: [], characters: [], scenarios: [] };

async function loadPage(user, failAt = null) {
    const nodes = new Map();
    const calls = [];
    const notices = [];
    let sockets = 0;
    function element(selector) {
        if (!nodes.has(selector))
            nodes.set(selector, {
                hidden: selector === '#app',
                textContent: '',
                innerHTML: '',
                content: '',
                classList: { toggle() {}, add() {}, remove() {} },
                addEventListener() {},
                getContext: () => ({}),
            });
        return nodes.get(selector);
    }
    const context = vm.createContext({
        $: element,
        $$: () => [],
        document: { body: element('body') },
        location: { protocol: 'http:', hostname: 'localhost' },
        toast: (text) => notices.push(text),
        api: async (path) => {
            calls.push(path);
            if (path === failAt) throw new Error('Servidor no disponible');
            if (path === '/me') return { user };
            if (path === '/bootstrap') return bootstrap;
            throw new Error(`Unexpected request: ${path}`);
        },
        ResizeObserver: class {
            observe() {}
        },
        WebSocket: class {
            constructor() {
                sockets++;
            }
        },
    });
    await vm.runInContext(code, context);
    return { element, calls, notices, sockets, user: vm.runInContext('state.user', context) };
}

for (const role of ['DM', 'PLAYER', 'GUEST']) {
    const user = { id: 10, name: 'Sesión persistente', role };
    for (const reload of [false, true]) {
        const page = await loadPage(user);
        assert.deepEqual(
            page.calls,
            ['/me', '/bootstrap'],
            `${role}: page load checks session automatically (reload=${reload})`,
        );
        assert.equal(page.user, user);
        assert.equal(page.element('#auth').hidden, true, 'valid session hides login');
        assert.equal(page.element('#app').hidden, false, 'valid session opens application');
        assert.equal(page.sockets, 1, 'recovered session connects WebSocket once');
        assert.deepEqual(page.notices, []);
    }
}
const anonymous = await loadPage(null);
assert.deepEqual(anonymous.calls, ['/me']);
assert.equal(
    anonymous.element('#auth').hidden,
    false,
    'absent or revoked session still requires login',
);
assert.equal(anonymous.element('#app').hidden, true);
assert.equal(anonymous.sockets, 0);
const failed = await loadPage(null, '/me');
assert.deepEqual(failed.notices, ['Servidor no disponible']);
assert.equal(
    failed.element('#auth-error').textContent,
    'Servidor no disponible',
    'startup error is visible, not silently swallowed',
);
assert.equal(failed.sockets, 0);
const bootstrapFailure = await loadPage({ id: 10, name: 'DM', role: 'DM' }, '/bootstrap');
assert.equal(
    bootstrapFailure.element('#auth').hidden,
    true,
    'bootstrap failure does not log out a valid session',
);
assert.deepEqual(bootstrapFailure.notices, ['Servidor no disponible']);
console.log(
    'Session startup: initial load/reload, all roles, anonymous session and API failures OK',
);
