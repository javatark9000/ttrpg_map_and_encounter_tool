import { writeFileSync } from 'node:fs';
import { Body, World, Plane, Vec3, ConvexPolyhedron, Material, ContactMaterial } from 'cannon-es';
import {
    axisRotation,
    quaternionProduct,
    rotationMatrix,
    transform,
    dot,
    unit,
} from '../public/assets/js/dice-geometry.js';
import { getDiceModel } from '../public/assets/js/dice-models.js';

// Offline rigid-body simulation. No physics dependency or random roll runs in the browser.
// Keep this generator, the pinned cannon-es version and the generated asset together.
// Finer collision steps keep the faster, higher fall from penetrating the table.
const STEP = 1 / 480;
const SAMPLE_STEP = STEP * 8;
const COUNT = 8;
// 50% higher release and 10% more restitution than the original 2.8–3.3 / 0.48.
const PHYSICS = { minHeight: 4.2, heightRange: 0.75, restitution: 0.528 };
const output = new URL('../public/assets/js/dice-trajectories.js', import.meta.url);
function randomSource(seed) {
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}
function simulate(seed, sides) {
    const { vertices, faces, resultDirection } = getDiceModel(sides);
    const random = randomSource(seed);
    const world = new World({ gravity: new Vec3(0, -22, 0), allowSleep: true });
    world.solver.iterations = 24;
    world.solver.tolerance = 1e-8;
    const floorMaterial = new Material('felt');
    const dieMaterial = new Material('resin');
    world.addContactMaterial(
        new ContactMaterial(floorMaterial, dieMaterial, {
            friction: 0.45,
            restitution: PHYSICS.restitution,
            contactEquationStiffness: 1e7,
            contactEquationRelaxation: 3,
        }),
    );
    const floor = new Body({ mass: 0, material: floorMaterial, shape: new Plane() });
    floor.quaternion.setFromAxisAngle(new Vec3(1, 0, 0), -Math.PI / 2);
    world.addBody(floor);
    const die = new Body({
        mass: 0.03,
        material: dieMaterial,
        shape: new ConvexPolyhedron({
            vertices: vertices.map((p) => new Vec3(...p)),
            faces: faces.map((f) => f.indices),
        }),
        position: new Vec3(0, PHYSICS.minHeight + random() * PHYSICS.heightRange, 0),
        velocity: new Vec3(1.4 + random() * 0.9, -0.5, (random() - 0.5) * 0.8),
        angularVelocity: new Vec3(4 + random() * 6, (random() - 0.5) * 10, 5 + random() * 7),
        linearDamping: 0.12,
        angularDamping: 0.2,
        allowSleep: true,
        sleepSpeedLimit: 0.14,
        sleepTimeLimit: 0.35,
    });
    const initial = axisRotation(
        unit([random() - 0.5, random() - 0.5, random() - 0.5]),
        random() * Math.PI * 2,
    );
    die.quaternion.set(...initial);
    world.addBody(die);
    const samples = [],
        impacts = [];
    let time = 0;
    die.addEventListener('collide', ({ body, contact }) => {
        const speed = Math.abs(contact.getImpactVelocityAlongNormal());
        if (body === floor && speed > 1.2 && time - (impacts.at(-1)?.[0] ?? -1) > 0.13)
            impacts.push([time, Math.min(1, speed / 10)]);
    });
    function record() {
        samples.push([...die.position.toArray(), ...die.quaternion.toArray()]);
    }
    record();
    for (let i = 1; i <= 2400; i++) {
        time = i * STEP;
        world.step(STEP);
        if (i % 8 === 0) {
            record();
            if (die.sleepState === Body.SLEEPING) break;
        }
    }
    const last = samples.at(-1),
        matrix = rotationMatrix(last.slice(3));
    const top = faces.reduce((best, face) =>
        dot(transform(matrix, face.normal), [0, resultDirection, 0]) >
        dot(transform(matrix, best.normal), [0, resultDirection, 0])
            ? face
            : best,
    );
    if (
        die.sleepState !== Body.SLEEPING ||
        dot(transform(matrix, top.normal), [0, resultDirection, 0]) < 0.999 ||
        impacts.length < 2 ||
        time < 1.5 ||
        time > 4.2
    )
        return null;
    // Translate the whole flight and rotate it around gravity, preserving ALL contacts.
    // The final top numeral points toward the viewer; no last-frame alignment is needed.
    const up = transform(matrix, top.up);
    const yaw = axisRotation([0, 1, 0], Math.atan2(up[0], -up[2]));
    const yawMatrix = rotationMatrix(yaw);
    const normalized = samples.map((sample) => [
        ...transform(yawMatrix, [sample[0] - last[0], sample[1], sample[2] - last[2]]),
        ...unit(quaternionProduct(yaw, sample.slice(3))),
    ]);
    if (normalized.some(([x, , z]) => Math.abs(x) > 2.1 || Math.abs(z) > 1.65)) return null;
    return { seed, topFace: top.value, impacts, samples: normalized };
}
const models = {};
for (const sides of [20, 4, 6, 8, 10, 12]) {
    const tracks = [];
    for (let seed = 741; tracks.length < COUNT && seed < 5000; seed++) {
        const track = simulate(seed, sides);
        if (track) tracks.push(track);
    }
    if (tracks.length !== COUNT) throw new Error(`Not enough stable d${sides} trajectories.`);
    models[sides] = { step: SAMPLE_STEP, physics: PHYSICS, tracks };
    console.log(`d${sides}: ${tracks.length} physical trajectories.`);
}
const round = (n) => Math.round(n * 1000000) / 1000000;
const encode = (value) =>
    JSON.stringify(value, (key, v) => (typeof v === 'number' && key !== 'step' ? round(v) : v));
const d20 = models[20];
delete models[20];
const content =
    '// Generated by npm run dice:generate using cannon-es 0.20.0 (MIT). Do not edit by hand.\n' +
    '// Fixed 480 Hz simulation, 60 Hz samples; positions XYZ and quaternion XYZW.\n' +
    '// prettier-ignore\nexport const diceTrajectories = ' +
    encode(d20) +
    ';\n' +
    '// prettier-ignore\nexport const polyhedralTrajectories = ' +
    encode(models) +
    ';\n';
writeFileSync(output, content);
console.log(`Generated 48 trajectories (${(content.length / 1024).toFixed(1)} KiB).`);
