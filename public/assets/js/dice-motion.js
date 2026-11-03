import { diceTrajectories, polyhedralTrajectories } from './dice-trajectories.js';
import { getDiceModel } from './dice-models.js';
import {
  axisRotation,
  faceSymmetry,
  quaternionProduct,
  rotationMatrix,
  slerp,
  transform,
  unit,
} from './dice-geometry.js';

// Camera looks down onto the table; world Y is gravity's opposite, not screen Y.
const viewRotation = axisRotation([1, 0, 0], Math.PI / 2 - 0.38);
const viewMatrix = rotationMatrix(viewRotation);
const targetHeight = 0.8;
function makeTableOutline(height) {
  return Array.from({ length: 64 }, (_, i) => {
    const angle = (i * Math.PI) / 32;
    return transform(viewMatrix, [Math.cos(angle) * 3.5, -height, Math.sin(angle) * 3.5]);
  });
}
export const tableOutline = makeTableOutline(targetHeight);
const coinTableOutline = makeTableOutline(0.11);
export function createPhysicalThrow(result, seed, sides = 20) {
  const model = getDiceModel(sides);
  const trajectories = sides === 20 ? diceTrajectories : polyhedralTrajectories[sides];
  if (!Number.isInteger(result) || result < 1 || result > sides)
    throw new RangeError('Invalid die result');
  let hash = 2166136261;
  for (const character of String(seed))
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  const track = trajectories.tracks[hash % trajectories.tracks.length];
  // Slow down only the coin's physical clock, not the post-result reading time.
  const timeScale = sides === 2 ? 2 : 1;
  return {
    track,
    result,
    restHeight: sides === 2 ? 0.11 : targetHeight,
    tableOutline: sides === 2 ? coinTableOutline : tableOutline,
    timeScale,
    step: trajectories.step * timeScale,
    duration: (track.samples.length - 1) * trajectories.step * timeScale,
    // Apply the SAME symmetry to EVERY frame, from release to rest. The die is never
    // steered toward a value, and neither the numbering nor its physical contacts change.
    symmetry: faceSymmetry(result, track.topFace, model.faces),
  };
}
export function samplePhysicalThrow(throwing, seconds) {
  const { track, duration, symmetry, result, timeScale = 1 } = throwing;
  const frame = Math.max(0, Math.min(track.samples.length - 1, seconds / throwing.step));
  const index = Math.floor(frame),
    blend = frame - index;
  const a = track.samples[index],
    b = track.samples[Math.min(index + 1, track.samples.length - 1)];
  const position = a.slice(0, 3).map((value, i) => value + (b[i] - value) * blend);
  const rotation = quaternionProduct(slerp(unit(a.slice(3)), unit(b.slice(3)), blend), symmetry);
  const offset = transform(viewMatrix, [
    position[0],
    position[1] - throwing.restHeight,
    position[2],
  ]);
  const ground = transform(viewMatrix, [position[0], -throwing.restHeight, position[2]]);
  const zoom = Math.max(0, Math.min(1, (seconds - duration + 0.8 * timeScale) / (0.8 * timeScale)));
  const eased = zoom * zoom * (3 - 2 * zoom);
  // Frame the higher release, then move closer as it drops toward the table.
  const release = Math.max(0, Math.min(1, 1 - seconds / (0.8 * timeScale)));
  const releaseWide = release * release * (3 - 2 * release);
  const impact = track.impacts.findLast(([time]) => time * timeScale <= seconds);
  return {
    position,
    worldRotation: rotation,
    rotation: quaternionProduct(viewRotation, rotation),
    offset,
    ground,
    camera: 11.5 + 4.5 * releaseWide - 6.7 * eased,
    height: position[1],
    restHeight: throwing.restHeight,
    tableOutline: throwing.tableOutline,
    contactAge: impact ? seconds - impact[0] * timeScale : Infinity,
    contactStrength: impact?.[1] || 0,
    settled: seconds >= duration,
    result: seconds >= duration ? result : null,
  };
}
