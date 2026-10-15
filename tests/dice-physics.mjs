import assert from 'node:assert/strict';
import { diceTrajectories } from '../public/assets/js/dice-trajectories.js';
import { createPhysicalThrow, samplePhysicalThrow } from '../public/assets/js/dice-motion.js';
import {
    vertices,
    faces,
    add,
    sub,
    dot,
    rotationMatrix,
    transform,
    faceSymmetry,
} from '../public/assets/js/dice-geometry.js';

assert.equal(diceTrajectories.tracks.length, 8);
assert.equal(diceTrajectories.step, 1 / 60);
assert.equal(diceTrajectories.physics.restitution, 0.528, 'restitution is 10% above 0.48');
const visited = new Set();
for (let seed = 0; seed < 8; seed++) {
    const throwing = createPhysicalThrow(14, seed);
    const { track, duration } = throwing;
    visited.add(track.seed);
    assert.ok(track.samples[0][1] >= 4.2 && track.samples[0][1] <= 4.95, 'release is 50% higher');
    assert.ok(duration > 1.5 && duration <= 4.2, 'bounded playback, ending at physical sleep');
    assert.ok(track.impacts.length >= 2, 'multiple simulated collisions');
    assert.ok(track.impacts[1][0] - track.impacts[0][0] > 0.13, 'impacts are separate bounces');
    const acceleration =
        (track.samples[2][1] - 2 * track.samples[1][1] + track.samples[0][1]) /
        diceTrajectories.step ** 2;
    assert.ok(
        acceleration < -20 && acceleration > -23,
        'airborne movement follows gravity, not a sine wave',
    );
    let maxPenetration = 0;
    for (let t = 0; t < duration; t += 1 / 120) {
        const pose = samplePhysicalThrow(throwing, t);
        assert.ok([...pose.position, ...pose.rotation, ...pose.offset].every(Number.isFinite));
        assert.ok(Math.abs(Math.hypot(...pose.rotation) - 1) < 0.00001, 'rotation remains rigid');
        assert.equal(pose.result, null, 'no visible result until the die rests');
        for (const vertex of vertices) {
            const world = transform(rotationMatrix(pose.worldRotation), vertex);
            maxPenetration = Math.min(maxPenetration, world[1] + pose.position[1]);
            const view = add(transform(rotationMatrix(pose.rotation), vertex), pose.offset);
            for (const axis of [0, 1])
                assert.ok(
                    Math.abs((view[axis] * 3.08) / (pose.camera - view[2])) < 0.99,
                    'the full physical flight fits the canvas',
                );
        }
    }
    assert.ok(
        maxPenetration > -0.03,
        `floor contact stays within solver tolerance (${maxPenetration})`,
    );
    const end = samplePhysicalThrow(throwing, duration);
    assert.equal(end.result, 14);
    assert.equal(end.settled, true);
    assert.ok(
        Math.hypot(...end.position.map((v, i) => v - track.samples.at(-2)[i])) < 0.001,
        'the last samples are stationary',
    );
    assert.deepEqual(
        samplePhysicalThrow(createPhysicalThrow(14, seed), 0.7),
        samplePhysicalThrow(throwing, 0.7),
        'same roll ID produces the same flight on every client',
    );
    // Every result uses an actual symmetry of the collider. We never relabel faces or
    // steer the final quaternion: all 160 combinations preserve the recorded contacts.
    for (let value = 1; value <= 20; value++) {
        const symmetry = rotationMatrix(faceSymmetry(value, track.topFace));
        for (const vertex of vertices) {
            const rotated = transform(symmetry, vertex);
            assert.ok(
                vertices.some((v) => Math.hypot(...sub(v, rotated)) < 0.00001),
                'symmetry maps vertices onto the same solid',
            );
        }
        const alternative = createPhysicalThrow(value, seed);
        const result = samplePhysicalThrow(alternative, alternative.duration);
        const face = faces.find((f) => f.value === value);
        assert.ok(
            dot(transform(rotationMatrix(result.worldRotation), face.normal), [0, 1, 0]) > 0.9999,
            `${value} is the upper face at rest`,
        );
        assert.ok(
            dot(transform(rotationMatrix(result.worldRotation), face.up), [0, 0, -1]) > 0.9999,
            'the resting numeral is upright for the camera',
        );
        assert.deepEqual(
            samplePhysicalThrow(alternative, 0.5).position,
            samplePhysicalThrow(throwing, 0.5).position,
            'authoritative value never changes the physical path',
        );
    }
}
assert.equal(visited.size, 8, 'all prepared trajectories are exercised');
for (const invalid of [0, 21, 1.5, NaN, '20'])
    assert.throws(() => createPhysicalThrow(invalid, 0), RangeError);
console.log(
    'D20 physics: 8 Cannon flights, gravity, contacts, framing, deterministic playback and all 160 authoritative landings OK',
);
