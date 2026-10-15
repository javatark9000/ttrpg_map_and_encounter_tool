import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/assets/js/dice.js', import.meta.url), 'utf8');
let now = 1000;
let nextId = 0;
let clips = 0;
let textures = 0;
const scheduled = new Map();
const labels = [];
const gradient = { addColorStop() {} };
const context2d = {
    setTransform() {},
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    ellipse() {},
    fill() {},
    fillRect() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    translate() {},
    rotate() {},
    scale() {},
    transform() {},
    clip() {
        clips++;
    },
    drawImage() {
        textures++;
    },
    createRadialGradient: () => gradient,
    fillText: (text) => labels.push(text),
};
const surfaces = [];
function canvas() {
    const surface = {
        width: 0,
        height: 0,
        getContext: (kind) => (kind === '2d' ? context2d : null),
        getBoundingClientRect: () => ({ width: 300, height: 300 }),
        cloneNode: canvas,
        replaceWith() {},
        addEventListener() {},
    };
    surfaces.push(surface);
    return surface;
}
const motion = { matches: true, addEventListener() {} };
const context = vm.createContext({
    document: { createElement: canvas },
    devicePixelRatio: 3,
    matchMedia: () => motion,
    ResizeObserver: class {
        observe() {}
    },
    performance: { now: () => now },
    requestAnimationFrame: (callback) => {
        scheduled.set(++nextId, callback);
        return nextId;
    },
    cancelAnimationFrame: (id) => scheduled.delete(id),
    canvas: canvas(),
    effectsCanvas: canvas(),
});
vm.runInContext(source.replace('export function', 'function'), context);
const run = (code) => vm.runInContext(code, context);
function tick(milliseconds) {
    now += milliseconds;
    const callbacks = [...scheduled.values()];
    scheduled.clear();
    callbacks.forEach((callback) => callback(now));
}
assert.equal(run('vertices.length'), 12);
assert.equal(run('faces.length'), 20);
assert.equal(run('new Set(faces.map(f => f.value)).size'), 20);
assert.ok(
    run('faces.every(f => faces.find(o => dot(f.normal,o.normal)<-0.999).value+f.value===21)'),
);
for (let value = 1; value <= 20; value++) {
    assert.ok(
        run(
            `dot(transform(rotationMatrix(landingRotation(${value})), faces.find(f=>f.value===${value}).normal),[0,-Math.sin(REST_TILT),Math.cos(REST_TILT)]) > 0.99999`,
        ),
        `face ${value} lands facing the viewer`,
    );
    assert.ok(
        run(
            `dot(transform(rotationMatrix(landingRotation(${value})), faces.find(f=>f.value===${value}).up),[0,Math.cos(REST_TILT),Math.sin(REST_TILT)]) > 0.99999`,
        ),
        `number ${value} is upright`,
    );
}
assert.equal(run('makeMesh().length / 9'), 420, '20 faces, 30 bevel strips and 12 corner caps');
assert.ok(run('makeMesh().every(Number.isFinite)'), 'mesh contains no NaN');
assert.ok(
    run('faces.every(f => f.points.every(p => faceUV(f,p).every(v=>v>0 && v<1)))'),
    'UVs stay inside their own atlas tile',
);
assert.ok(
    run(
        `Array.from({length:101},(_,i)=>slerp([0,0,0,1],landingRotation(20),i/100)).every(q=>Math.abs(Math.hypot(...q)-1)<0.00001)`,
    ),
    'slerp preserves a rigid rotation',
);
run(
    'const renderer = createD20Renderer(canvas, effectsCanvas); let landed = 0; renderer.start(); renderer.land(14, () => landed++);',
);
assert.equal(
    labels.length,
    20,
    'numbers are drawn into the texture once, never as floating screen text',
);
assert.ok(labels.includes('14'));
assert.ok(clips > 0 && textures > 0, 'no-WebGL fallback clips and projects the texture onto faces');
assert.equal(run('landed'), 1, 'reduced motion reveals the authoritative result immediately');
assert.equal(scheduled.size, 0, 'reduced motion has no spinning or particle RAF loop');
assert.ok(
    surfaces.filter((s) => s.width && s.width !== 1024).every((s) => s.width <= 600),
    'DPR capped at two',
);

motion.matches = false;
run('renderer.start(); renderer.start();');
assert.equal(scheduled.size, 1, 'repeated starts replace the old loop');
tick(100);
run('renderer.land(20, () => landed++);');
tick(400);
assert.equal(run('landed'), 1, 'effects wait for contact');
tick(400);
assert.equal(run('landed'), 2);
tick(300);
assert.equal(run('landed'), 2, 'landing callback only fires once');
tick(2000);
assert.equal(scheduled.size, 0, 'effects stop when finished');
run('renderer.start(); renderer.land(1, () => landed++);');
tick(800);
assert.equal(run('landed'), 3, 'fumble also lands');
run('renderer.stop();');
assert.equal(scheduled.size, 0, 'disconnect/scenario switch cancels animation');
run('renderer.start(); renderer.land(1, () => landed++); renderer.stop();');
tick(1000);
assert.equal(run('landed'), 3, 'canceled landing cannot reveal an old result');

// Check the real message handlers: no frontend reroll, stale events ignored, cleanup preserved.
const app = readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const nodes = new Map();
function node(selector) {
    if (!nodes.has(selector))
        nodes.set(selector, { dataset: {}, textContent: '', hidden: false, disabled: false });
    return nodes.get(selector);
}
const received = [];
let landingCallback;
const timers = new Map();
const messages = vm.createContext({
    state: { scenarioId: 4, user: { role: 'DM' }, data: {} },
    $: node,
    createD20Renderer: () => ({
        start() {},
        stop() {
            landingCallback = null;
        },
        land(value, callback) {
            received.push(value);
            landingCallback = callback;
        },
    }),
    setTimeout: (callback, delay) => {
        timers.set(++nextId, { callback, delay });
        return nextId;
    },
    clearTimeout: (id) => timers.delete(id),
    renderDiceRollLog() {},
    toast() {},
});
vm.runInContext(
    'let diceHideTimer=null, diceRenderer=null, pendingDiceRequestId=null;\n' +
        app.slice(
            app.indexOf('function startD20Animation()'),
            app.indexOf("$('#roll-d20').onclick"),
        ),
    messages,
);
const message = (code) => vm.runInContext(code, messages);
message('handleDiceRollStarted({scenarioId:4,rollId:8,rollerName:"DM"});');
message(
    'handleDiceRollRevealed({scenario_id:5,id:8,result:20}); handleDiceRollRevealed({scenario_id:4,id:7,result:20});',
);
assert.equal(received.length, 0, 'other scenarios and stale rolls ignored');
message('handleDiceRollRevealed({scenario_id:4,id:8,result:20});');
assert.deepEqual(received, [20], 'server result is passed unchanged to the renderer');
assert.equal(node('#dice-roll-overlay').className, 'settling');
landingCallback();
assert.equal(node('#dice-roll-overlay').className, 'revealed critical');
assert.equal(node('#dice-roll-value').textContent, '20');
assert.equal([...timers.values()][0].delay, 4100, 'special result stays readable longer');
message(
    'resetDiceAnimation(); handleDiceRollStarted({scenarioId:4,rollId:9,rollerName:"DM"}); handleDiceRollRevealed({scenario_id:4,id:9,result:1});',
);
landingCallback();
assert.equal(node('#dice-roll-overlay').className, 'revealed fumble');
message('resetDiceAnimation();');
assert.equal(node('#dice-roll-overlay').hidden, true);
assert.equal(node('#roll-d20').disabled, false);
assert.equal(timers.size, 0);
console.log(
    'D20: geometry, UVs, all 20 upright landings, fallback, reduced motion, effects, cleanup and server messages OK',
);
