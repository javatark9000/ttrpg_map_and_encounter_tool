import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/app.html', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

const boundsContext = vm.createContext({
    state: {
        data: {
            scenario: { width: 4, height: 3 },
            foggedCells: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 0, y: 1 },
            ],
        },
    },
});
vm.runInContext(
    section('function foggedCellSet()', 'function fitVisibleCellsForPlayers()'),
    boundsContext,
);
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('visibleCellBounds()', boundsContext))),
    { x: 0, y: 0, width: 4, height: 3 },
    'visible bounds include every revealed cell',
);
boundsContext.state.data.foggedCells = Array.from({ length: 12 }, (_, index) => ({
    x: index % 4,
    y: Math.floor(index / 4),
}));
assert.equal(
    vm.runInContext('visibleCellBounds()', boundsContext),
    null,
    'a fully fogged map has no visible bounds',
);

let draws = 0;
const paintContext = vm.createContext({
    state: {
        mode: 'fog',
        paint: new Map(),
        data: { blocked: [], foggedCells: [] },
    },
    screenToCell: (x, y) => ({ x, y }),
    validCell: ({ x, y }) => x >= 0 && y >= 0 && x < 5 && y < 5,
    draw: () => draws++,
});
vm.runInContext(section('function paintAt(', 'function tap('), paintContext);
vm.runInContext('paintAt(2, 3, true)', paintContext);
assert.deepEqual(paintContext.state.data.foggedCells, [{ x: 2, y: 3 }]);
assert.deepEqual(paintContext.state.data.blocked, [], 'fog painting does not alter blocked cells');
vm.runInContext('paintAt(2, 3, false)', paintContext);
assert.deepEqual(paintContext.state.data.foggedCells, [], 'reveal painting removes only fog');
assert.equal(draws, 2, 'fog edits redraw optimistically');
const areaContext = vm.createContext({});
vm.runInContext(section('function cellsInArea(', 'function applyFogCells('), areaContext);
assert.deepEqual(
    JSON.parse(
        JSON.stringify(areaContext.cellsInArea({ x: 2, y: 3, widthCells: 3, heightCells: 2 })),
    ),
    [
        { x: 2, y: 3 },
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 2, y: 4 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
    ],
    'rectangle expansion includes every selected cell',
);
const pointerContext = vm.createContext({});
vm.runInContext(section('function foggedForPointer(', 'canvas.onpointerdown'), pointerContext);
assert.equal(pointerContext.foggedForPointer({ pointerType: 'mouse', button: 0 }), false);
assert.equal(pointerContext.foggedForPointer({ pointerType: 'mouse', button: 2 }), true);
assert.equal(pointerContext.foggedForPointer({ pointerType: 'touch', button: 2 }), false);
assert.match(html, /data-mode="fog"/);
assert.doesNotMatch(html, /data-mode="unfog"/);
assert.match(html, /Izquierdo: revelar · derecho: ocultar · Ctrl \+ arrastre: rectángulo/);
assert.match(source, /fogged: !!was\?\.fogged/);
assert.match(source, /fillStyle = '#080b0d80'/);
assert.match(source, /command\(fogPaint \? 'map\.fog\.paint' : 'map\.cells\.paint'/);
assert.match(source, /if \(!fogged\.has\(`\$\{x\},\$\{y\}`\)\)/);
console.log('Fog of war: brush/rectangle reveal and hide, long press, DM overlay and clipping OK');
