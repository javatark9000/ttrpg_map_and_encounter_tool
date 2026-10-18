// Shared by the physical collider, the trajectory player and both renderers.
const PHI = (1 + Math.sqrt(5)) / 2;
export const vertices = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
].map(unit);
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const mul = (a, s) => a.map((v) => v * s);
export const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function unit(v) {
  const length = Math.hypot(...v) || 1;
  return v.map((x) => x / length);
}
export const faces = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
].map((indices) => {
  const points = indices.map((i) => vertices[i]);
  const center = mul(points.reduce(add, [0, 0, 0]), 1 / 3);
  const normal = unit(center);
  const up = unit(sub(points[0], center));
  return {
    indices,
    center,
    normal,
    up,
    right: cross(up, normal),
    points: points.map((p) => add(center, mul(sub(p, center), 0.95))),
    value: 0,
  };
});
let nextPair = 20;
for (const face of faces) {
  if (face.value) continue;
  face.value = nextPair;
  faces.find((other) => dot(face.normal, other.normal) < -0.999).value = 21 - nextPair;
  nextPair -= 2;
}
export function axisRotation(axis, angle) {
  return [...mul(unit(axis), Math.sin(angle / 2)), Math.cos(angle / 2)];
}
export function quaternionProduct(a, b) {
  return [
    ...add(add(mul(b.slice(0, 3), a[3]), mul(a.slice(0, 3), b[3])), cross(a, b)),
    a[3] * b[3] - dot(a.slice(0, 3), b.slice(0, 3)),
  ];
}
export function conjugate(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}
export function rotationMatrix(q) {
  const [x, y, z, w] = q;
  // Column-major: identical convention for WebGL, Cannon and software rendering.
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y + z * w),
    2 * (x * z - y * w),
    2 * (x * y - z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z + x * w),
    2 * (x * z + y * w),
    2 * (y * z - x * w),
    1 - 2 * (x * x + y * y),
  ];
}
export function transform(m, v) {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}
export function slerp(a, b, t) {
  let cosine = dot(a, b);
  if (cosine < 0) {
    b = mul(b, -1);
    cosine = -cosine;
  }
  if (cosine > 0.9995) return unit(add(mul(a, 1 - t), mul(b, t)));
  const angle = Math.acos(Math.min(1, cosine)),
    sine = Math.sin(angle);
  return add(mul(a, Math.sin((1 - t) * angle) / sine), mul(b, Math.sin(t * angle) / sine));
}
// Face -> canonical frame (normal +Z, numeral up +Y).
export function faceOrientation(value, modelFaces = faces) {
  const face = modelFaces.find((f) => f.value === value);
  const axis = cross(face.normal, [0, 0, 1]);
  const align = axisRotation(
    Math.hypot(...axis) < 0.0001 ? [1, 0, 0] : axis,
    Math.acos(Math.max(-1, Math.min(1, face.normal[2]))),
  );
  const up = transform(rotationMatrix(align), face.up);
  return quaternionProduct(axisRotation([0, 0, 1], Math.atan2(up[0], up[1])), align);
}
// An exact polyhedral symmetry (icosahedral for d20), NOT an end-of-throw correction.
// Every vertex maps onto another vertex, so all physical contacts remain valid.
export function faceSymmetry(result, restingFace, modelFaces = faces) {
  return quaternionProduct(
    conjugate(faceOrientation(restingFace, modelFaces)),
    faceOrientation(result, modelFaces),
  );
}
