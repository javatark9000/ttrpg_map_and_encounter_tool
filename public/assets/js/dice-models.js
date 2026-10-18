// Face-transitive convex dice. The same geometry drives rendering and collision simulation.
import {
  vertices as icoVertices,
  faces as icoFaces,
  add,
  sub,
  mul,
  dot,
  cross,
  unit,
} from './dice-geometry.js';

export const DICE_SIDES = [4, 6, 8, 10, 12, 20, 100];
const models = new Map();

function polyhedron(sides, vertices, polygons) {
  const faces = polygons.map((polygon) => {
    let indices = [...polygon];
    const center = mul(indices.map((i) => vertices[i]).reduce(add, [0, 0, 0]), 1 / indices.length);
    let normal = unit(
      cross(
        sub(vertices[indices[1]], vertices[indices[0]]),
        sub(vertices[indices[2]], vertices[indices[0]]),
      ),
    );
    if (dot(normal, center) < 0) {
      normal = mul(normal, -1);
      indices = [indices[0], ...indices.slice(1).reverse()];
    }
    const up = unit(sub(vertices[indices[0]], center));
    const right = cross(up, normal);
    const points = indices.map((i) => add(center, mul(sub(vertices[i], center), 0.95)));
    const extent = Math.max(
      ...points.flatMap((point) => [
        Math.abs(dot(sub(point, center), up)),
        Math.abs(dot(sub(point, center), right)),
      ]),
    );
    return {
      indices,
      center,
      normal,
      up,
      right,
      points,
      uvScale: 0.43 / extent,
      uvCenter: 0.5,
      value: 0,
    };
  });
  let value = 1;
  for (const face of faces) {
    if (face.value) continue;
    face.value = value++;
    const opposite = faces.find((other) => dot(face.normal, other.normal) < -0.999);
    if (opposite) opposite.value = sides + 1 - face.value;
  }
  if (sides === 4) {
    // A tetrahedron rests on the result face: its opposite vertex carries that value
    // on each of the three adjacent faces, as on a conventional tip-read d4.
    const labels = vertices.map((_, i) => faces.find((face) => !face.indices.includes(i)).value);
    for (const face of faces)
      face.markings = face.indices.map((i) => ({
        point: add(face.center, mul(sub(vertices[i], face.center), 0.57)),
        label: String(labels[i]),
      }));
  }
  return { sides, vertices, faces, resultDirection: sides === 4 ? -1 : 1 };
}

export function getDiceModel(sides = 20, labels = 'number') {
  if (sides === 20) return { sides, vertices: icoVertices, faces: icoFaces, resultDirection: 1 };
  if (![4, 6, 8, 10, 12].includes(sides)) throw new RangeError('Invalid physical die');
  const key = `${sides}:${labels}`;
  if (models.has(key)) return models.get(key);
  let vertices, polygons;
  if (sides === 4) {
    vertices = [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ].map(unit);
    polygons = [
      [0, 1, 2],
      [0, 3, 1],
      [0, 2, 3],
      [1, 3, 2],
    ];
  } else if (sides === 6) {
    vertices = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ].map(unit);
    polygons = [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [0, 4, 5, 1],
      [3, 2, 6, 7],
      [0, 3, 7, 4],
      [1, 5, 6, 2],
    ];
  } else if (sides === 8) {
    vertices = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    polygons = [];
    for (const x of [0, 1])
      for (const y of [2, 3]) for (const z of [4, 5]) polygons.push([x, y, z]);
  } else if (sides === 10) {
    const height = 1.2,
      cosine = Math.cos(Math.PI / 5),
      belt = (height * (1 - cosine)) / (1 + cosine);
    vertices = Array.from({ length: 10 }, (_, i) => [
      Math.cos((i * Math.PI) / 5) / height,
      Math.sin((i * Math.PI) / 5) / height,
      (i % 2 ? -belt : belt) / height,
    ]);
    vertices.push([0, 0, 1], [0, 0, -1]);
    polygons = [];
    for (let i = 0; i < 10; i += 2) {
      polygons.push([10, i, (i + 1) % 10, (i + 2) % 10]);
      polygons.push([11, (i + 1) % 10, (i + 2) % 10, (i + 3) % 10]);
    }
  } else {
    // The dodecahedron is the dual of the existing regular icosahedron.
    vertices = icoFaces.map((face) => unit(face.center));
    polygons = icoVertices.map((normal, i) => {
      const neighbors = icoFaces.flatMap((face, j) => (face.indices.includes(i) ? [j] : []));
      const right = unit(
        sub(vertices[neighbors[0]], mul(normal, dot(vertices[neighbors[0]], normal))),
      );
      const up = cross(normal, right);
      return neighbors.sort(
        (a, b) =>
          Math.atan2(dot(vertices[a], up), dot(vertices[a], right)) -
          Math.atan2(dot(vertices[b], up), dot(vertices[b], right)),
      );
    });
  }
  const model = polyhedron(sides, vertices, polygons);
  if (sides === 10 && labels !== 'number')
    for (const face of model.faces)
      face.label =
        labels === 'tens'
          ? String((face.value % 10) * 10).padStart(2, '0')
          : String(face.value % 10);
  models.set(key, model);
  return model;
}

export function percentileDice(result) {
  if (!Number.isInteger(result) || result < 1 || result > 100)
    throw new RangeError('Invalid percentile result');
  const tens = Math.floor((result % 100) / 10),
    units = result % 10;
  return {
    tens: tens || 10,
    units: units || 10,
    label: `${String(tens * 10).padStart(2, '0')} + ${units} = ${result}`,
  };
}
