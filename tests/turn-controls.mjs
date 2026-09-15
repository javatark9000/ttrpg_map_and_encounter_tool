import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual application functions without a browser or application database.
const source = readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const sent = [];
const buttons = [{ disabled: false }, { disabled: false }];
const connection = {};
let renders = 0;
let nextId = 0;
const state = {
    scenarioId: 1,
    data: { scenario: { id: 1, version: 10 } },
    user: { role: 'PLAYER' },
    lastPendingRequestIds: new Set(),
    pendingTurn: null,
};
class Socket {
    readyState = 1;
    send(text) {
        sent.push(JSON.parse(text));
    }
}
const context = vm.createContext({
    state,
    WebSocket: Socket,
    wsUrl: () => 'ws://test',
    crypto: { randomUUID: () => `request-${++nextId}` },
    $: () => connection,
    $$: () => buttons,
    toast: () => {},
    subscribe: () => sent.push({ action: 'subscribe' }),
    prepareAnimations: () => {},
    fitMapFocusForPlayers: () => {},
    renderSidebar: () => {},
    renderDetails: () => {
        renders++;
    },
    draw: () => {},
    loadChatThreads: () => Promise.resolve(),
    clearInterval: () => {},
    setTimeout: () => {},
});
vm.runInContext(section('function connectWs()', 'async function syncScenarioList()'), context);
vm.runInContext(section('function command(type', 'function notifyApp('), context);
vm.runInContext('connectWs()', context);
const call = (code) => vm.runInContext(code, context);
const message = (data) => state.ws.onmessage({ data: JSON.stringify(data) });

call("command('turn.next'); command('turn.next')");
assert.equal(sent.length, 1, 'double click sends a single command');
assert.equal(sent[0].payload.expectedVersion, 10, 'command includes snapshot version');
assert.ok(
    buttons.every((b) => b.disabled),
    'both next-turn controls are locked',
);
await message({ type: 'command.accepted', requestId: sent[0].requestId, event: { version: 11 } });
call("command('turn.next')");
assert.equal(sent.length, 1, 'acknowledgement alone does not unlock old state');
await message({ type: 'snapshot', data: { scenario: { id: 1, version: 10 } } });
assert.ok(state.pendingTurn, 'older snapshot cannot release pending command');
await message({ type: 'snapshot', data: { scenario: { id: 1, version: 11 } } });
assert.equal(state.pendingTurn, null, 'confirmed snapshot releases lock');
call('updateTurnControls()');
assert.ok(buttons.every((b) => !b.disabled));
call("command('turn.next')");
assert.equal(sent.length, 2, 'next deliberate click can advance');
assert.equal(sent[1].payload.expectedVersion, 11);
await message({ type: 'command.error', requestId: sent[1].requestId, error: 'stale state' });
assert.equal(state.pendingTurn, null);
assert.equal(sent.at(-1).action, 'subscribe', 'rejected turn requests a fresh snapshot');
const before = renders;
await message({ type: 'snapshot', data: { scenario: { id: 2, version: 90 } } });
await message({ type: 'snapshot', data: { scenario: { id: 1, version: 9 } } });
assert.equal(renders, before, 'other scenarios and stale snapshots are ignored');
call("command('turn.next')");
state.ws.readyState = 3;
state.ws.onclose();
assert.equal(state.pendingTurn, null, 'disconnect clears pending acknowledgement');
assert.ok(
    buttons.every((b) => b.disabled),
    'offline controls remain disabled',
);
console.log('Turn controls: double click, ack/snapshot, errors, stale state and disconnect OK');
