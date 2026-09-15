import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const effects = [];
const canvas = {
    setPointerCapture() {},
    addEventListener() {},
    classList: { add() {}, remove() {} },
};
const context = vm.createContext({
    canvas,
    state: {},
    screenToCell: (x, y) => ({ x: Math.floor(x / 10), y: Math.floor(y / 10) }),
    validCell: ({ x, y }) => x >= 0 && y >= 0 && x < 20 && y < 20,
    draw() {},
    renderEntitySelection() {},
    inspect() {},
    renderSidebar() {},
    toast() {},
    $: () => ({}),
    maybeDoubleTap: () => {
        effects.push('doubleTap');
        return false;
    },
    publishDmView: () => effects.push('pan'),
    zoomAt: () => effects.push('zoom'),
    command: (type) => effects.push(type),
    paintAt: () => effects.push('paint'),
    startDrawStroke: () => effects.push('draw'),
    addDrawPoint: () => effects.push('draw'),
    finishDrawStroke: () => effects.push('draw'),
    createObjectArea: () => effects.push('object'),
    createNpcAt: () => effects.push('npc'),
    editCellNote: () => effects.push('note'),
    showCellMenu: () => effects.push('menu'),
});
for (const [start, end] of [
    ['function selectionDraftArea()', 'function drawSelectionDraft('],
    ['canvas.onpointerdown =', 'function sendDraw('],
    ['function tap(', '// Token creation, selection, and inspection.'],
    ['function tokensAtCell(', 'function selectionItems()'],
])
    vm.runInContext(section(start, end), context);

function reset(mode = 'pan', role = 'DM') {
    effects.length = 0;
    context.state = {
        user: { role, id: 1 },
        mode,
        camera: { x: 0, y: 0, z: 1 },
        pointers: new Map(),
        paint: new Map(),
        selectedObjects: new Set(),
        selectedNpcs: new Set([22]),
        selectedPlayers: new Set(),
        lastTap: { x: 45, y: 45, t: 0 },
        data: {
            objects: [{ id: 11, x: 2, y: 2, width_cells: 1, height_cells: 1 }],
            npcs: [
                { id: 21, x: 4, y: 4, visible: 1, health: 10 },
                { id: 22, x: 7, y: 7, visible: 1, health: 10 },
            ],
            players: [{ id: 31, x: 3, y: 3, placed: 1 }],
        },
    };
}
function event(type, x, y, extra = {}) {
    return {
        type,
        offsetX: x,
        offsetY: y,
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        altKey: true,
        preventDefault() {},
        ...extra,
    };
}
function click(x, y, extra = {}) {
    canvas.onpointerdown(event('pointerdown', x, y, extra));
    canvas.onpointerup(event('pointerup', x, y, extra));
}
function drag(extra = {}, release = {}) {
    canvas.onpointerdown(event('pointerdown', 15, 15, extra));
    canvas.onpointermove(event('pointermove', 55, 55, { ...extra, ...release }));
    canvas.onpointerup(event('pointerup', 55, 55, { ...extra, ...release }));
}

for (const mode of ['pan', 'select', 'mapfocus', 'block', 'unblock', 'draw', 'object', 'npc']) {
    reset(mode);
    drag({}, { altKey: false });
    assert.deepEqual(
        [...context.state.selectedNpcs].sort(),
        [21, 22],
        `${mode}: Alt drag adds NPC without clearing previous selection`,
    );
    assert.deepEqual(
        [...context.state.selectedObjects],
        [11],
        `${mode}: rectangle selects objects`,
    );
    assert.equal(context.state.mode, mode, `${mode}: original tool remains selected`);
    assert.deepEqual(context.state.camera, { x: 0, y: 0, z: 1 }, `${mode}: camera does not move`);
    assert.deepEqual(
        effects,
        [],
        `${mode}: releasing Alt during drag does not execute the underlying tool`,
    );
    assert.equal(context.state.selectionDraft, null);
    assert.equal(context.state.drag, null);
    click(45, 45);
    assert.deepEqual([...context.state.selectedNpcs], [22], `${mode}: Alt click toggles one NPC`);
    assert.deepEqual([...context.state.selectedObjects], [11]);
    click(105, 105);
    assert.deepEqual(
        [...context.state.selectedObjects],
        [11],
        `${mode}: empty Alt click preserves selection`,
    );
    assert.deepEqual(effects, [], `${mode}: clicks do not create, paint, draw, edit notes or zoom`);
}
reset('select');
context.state.moveToken = { kind: 'NPC', id: 22 };
context.state.cloneSource = { kind: 'NPC', id: 22 };
click(45, 45);
assert.deepEqual(effects, [], 'Alt bypasses pending move and cloning');
assert.equal(context.state.moveToken.id, 22, 'pending move is preserved');
assert.equal(context.state.cloneSource.id, 22, 'clone tool is preserved');
click(45, 45, { altKey: false });
assert.deepEqual(effects, ['token.move_dm'], 'normal click resumes the pending tool');

reset();
canvas.onpointerdown(event('pointerdown', 15, 15));
canvas.onpointermove(event('pointermove', 55, 55));
canvas.onpointercancel(event('pointercancel', 55, 55));
assert.deepEqual([...context.state.selectedNpcs], [22], 'cancelled gesture never selects');
assert.equal(context.state.selectionDraft, null);

for (const role of ['PLAYER', 'GUEST']) {
    reset('pan', role);
    drag();
    assert.deepEqual(
        [...context.state.selectedNpcs],
        [22],
        `${role}: Alt does not enable DM selection`,
    );
    assert.equal(!!context.state.drag?.forceSelect, false);
}
reset();
drag({ button: 1 });
assert.ok(effects.includes('pan'), 'middle mouse remains pan even with Alt');
assert.deepEqual([...context.state.selectedNpcs], [22]);
reset();
drag({ pointerType: 'touch' });
assert.ok(effects.includes('pan'), 'touch gestures keep their normal behavior');
assert.deepEqual([...context.state.selectedNpcs], [22]);
reset();
drag({ altKey: false });
assert.ok(effects.includes('pan'), 'drag without Alt still pans');
reset();
context.state.encounterSelecting = true;
context.state.selectedNpcs.clear();
drag();
assert.deepEqual(
    [...context.state.selectedPlayers],
    [31],
    'encounter selection continues to include players',
);
assert.deepEqual([...context.state.selectedNpcs], [21]);
console.log(
    'Alt selection: tools, additive clicks/rectangle, cancellation, roles, encounter and normal gestures OK',
);
