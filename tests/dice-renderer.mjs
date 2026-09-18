import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/assets/app.js', import.meta.url), 'utf8');
const renderer = source.slice(
    source.indexOf('const D20_VERTICES'),
    source.indexOf('function handleDiceRollStarted'),
);
const drawnNumbers = [];
const gradient = { addColorStop() {} };
const context2d = {
    setTransform() {},
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    ellipse() {},
    fill() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    createLinearGradient: () => gradient,
    translate() {},
    rotate() {},
    strokeText() {},
    fillText: (text) => drawnNumbers.push(text),
};
const canvas = {
    width: 0,
    height: 0,
    getContext: () => context2d,
    getBoundingClientRect: () => ({ width: 208, height: 208 }),
};
const context = vm.createContext({
    $: () => canvas,
    devicePixelRatio: 3,
    matchMedia: () => ({ matches: true }),
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
});
vm.runInContext(`let diceAnimationFrame = null, diceRenderState = null;\n${renderer}`, context);
assert.equal(vm.runInContext('D20_VERTICES.length', context), 12);
assert.equal(vm.runInContext('D20_FACES.length', context), 20);
vm.runInContext('startD20Animation(); landD20(14);', context);
assert.ok(drawnNumbers.includes('14'), 'the revealed result is rendered on its physical face');
assert.ok(
    vm.runInContext(
        'dotVector(transformVector(diceRenderState.matrix, D20_FACES[13].normal), [0, 0, 1]) > 0.999',
        context,
    ),
    'the revealed face lands toward the viewer',
);
assert.ok(canvas.width <= 208 * 2, 'rendering resolution is capped at DPR 2');
console.log('D20 renderer: geometry, result-facing landing and DPR cap OK');
