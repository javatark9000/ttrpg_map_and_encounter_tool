// Presentation only: the server supplies the result. No roll is decided here.
const PHI = (1 + Math.sqrt(5)) / 2;
const vertices = [
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
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map((v) => v * s);
const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function unit(v) {
  const length = Math.hypot(...v) || 1;
  return v.map((x) => x / length);
}
const faces = [
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
  const right = cross(up, normal);
  return {
    indices,
    center,
    normal,
    up,
    right,
    points: points.map((p) => add(center, mul(sub(p, center), 0.95))),
    value: 0,
  };
});
// As on a physical d20, opposite faces sum to 21.
let nextPair = 20;
for (const face of faces) {
  if (face.value) continue;
  face.value = nextPair;
  faces.find((other) => dot(face.normal, other.normal) < -0.999).value = 21 - nextPair;
  nextPair -= 2;
}
const TILE = 256,
  ATLAS_WIDTH = TILE * 4,
  ATLAS_HEIGHT = TILE * 8;
const CAMERA = 4.8,
  LENS = 3.08,
  REST_TILT = -0.38;

function faceUV(face, point) {
  const local = sub(point, face.center);
  return [0.5 + dot(local, face.right) * 0.88, 0.55 - dot(local, face.up) * 0.88];
}
function makeMesh() {
  const data = [];
  const triangle = (points, normal, face = null) => {
    for (const point of points) {
      const uv = face ? faceUV(face, point) : [0, 0];
      const tile = face ? face.value - 1 : 0;
      data.push(
        ...point,
        ...normal,
        ((tile % 4) + uv[0]) / 4,
        (Math.floor(tile / 4) + uv[1]) / 8,
        face ? 0 : 1,
      );
    }
  };
  const edges = new Map();
  faces.forEach((face) => {
    triangle(face.points, face.normal, face);
    for (let i = 0; i < 3; i++) {
      const a = face.indices[i],
        b = face.indices[(i + 1) % 3];
      const key = [a, b].sort((x, y) => x - y).join(':');
      if (!edges.has(key)) edges.set(key, []);
      edges.get(key).push({ face, a, b, p: face.points[i], q: face.points[(i + 1) % 3] });
    }
  });
  for (const [a, b] of edges.values()) {
    const p = b.a === a.a ? b.p : b.q,
      q = b.a === a.a ? b.q : b.p;
    const normal = unit(add(a.face.normal, b.face.normal));
    triangle([a.p, a.q, p], normal);
    triangle([a.q, q, p], normal);
  }
  vertices.forEach((normal, i) => {
    const corners = faces
      .filter((f) => f.indices.includes(i))
      .map((f) => f.points[f.indices.indexOf(i)]);
    const center = mul(corners.reduce(add, [0, 0, 0]), 1 / corners.length);
    const right = unit(sub(corners[0], center)),
      up = cross(normal, right);
    corners.sort(
      (a, b) =>
        Math.atan2(dot(sub(a, center), up), dot(sub(a, center), right)) -
        Math.atan2(dot(sub(b, center), up), dot(sub(b, center), right)),
    );
    corners.forEach((p, j) => triangle([center, p, corners[(j + 1) % corners.length]], normal));
  });
  return new Float32Array(data);
}

function makeAtlas() {
  const atlas = document.createElement('canvas');
  atlas.width = ATLAS_WIDTH;
  atlas.height = ATLAS_HEIGHT;
  const ctx = atlas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, atlas.width, atlas.height);
  faces.forEach((face) => {
    const tile = face.value - 1;
    ctx.save();
    ctx.translate((tile % 4) * TILE, Math.floor(tile / 4) * TILE);
    // A restrained inset line, engraved into the same surface.
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    face.points.forEach((point, i) => {
      const [u, v] = faceUV(face, add(face.center, mul(sub(point, face.center), 0.85)));
      if (i) ctx.lineTo(u * TILE, v * TILE);
      else ctx.moveTo(u * TILE, v * TILE);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 83px Georgia, serif';
    ctx.fillText(String(face.value), TILE * 0.5, TILE * 0.565, TILE * 0.45);
    if (face.value === 6 || face.value === 9) {
      ctx.fillRect(TILE * 0.46, TILE * 0.735, TILE * 0.08, 2);
    }
    ctx.restore();
  });
  return atlas;
}

// Quaternions avoid a snap or an upside-down numeral when settling on any of the 20 faces.
function axisRotation(axis, angle) {
  return [...mul(unit(axis), Math.sin(angle / 2)), Math.cos(angle / 2)];
}
function quaternionProduct(a, b) {
  return [
    ...add(add(mul(b.slice(0, 3), a[3]), mul(a.slice(0, 3), b[3])), cross(a, b)),
    a[3] * b[3] - dot(a.slice(0, 3), b.slice(0, 3)),
  ];
}
function rotationMatrix(q) {
  const [x, y, z, w] = q;
  // Column-major, shared by the GPU and the Canvas fallback.
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
function transform(m, v) {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}
function slerp(a, b, t) {
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
function landingRotation(value) {
  const face = faces.find((f) => f.value === value);
  const axis = cross(face.normal, [0, 0, 1]);
  const align = axisRotation(
    Math.hypot(...axis) < 0.0001 ? [1, 0, 0] : axis,
    Math.acos(Math.max(-1, Math.min(1, face.normal[2]))),
  );
  const up = transform(rotationMatrix(align), face.up);
  const upright = quaternionProduct(axisRotation([0, 0, 1], Math.atan2(up[0], up[1])), align);
  // A slightly elevated view keeps the result legible without looking like a flat billboard.
  return quaternionProduct(axisRotation([1, 0, 0], REST_TILT), upright);
}

const vertexShader = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUV;
attribute float aBevel;
uniform mat3 uRotation;
uniform vec2 uOffset;
uniform float uAspect;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec2 vUV;
varying float vBevel;
void main() {
  vec3 p = uRotation * aPosition + vec3(uOffset, 0.0);
  float depth = 4.8 - p.z;
  gl_Position = vec4(p.x * 3.08 / uAspect, p.y * 3.08, 1.002002 * depth - 0.2002002, depth);
  vPosition = p;
  vNormal = uRotation * aNormal;
  vLocal = aPosition;
  vUV = aUV;
  vBevel = aBevel;
}`;
const fragmentShader = `
precision mediump float;
uniform sampler2D uAtlas;
uniform float uOutcome;
uniform float uImpact;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec2 vUV;
varying float vBevel;
const float PI = 3.14159265;
vec3 fresnel(float cosine, vec3 f0) { return f0 + (1.0-f0)*pow(1.0-cosine, 5.0); }
vec3 light(vec3 position, vec3 color, vec3 n, vec3 v, vec3 base, float metal, float rough) {
  vec3 l = normalize(position-vPosition), h = normalize(l+v);
  float nl = max(dot(n,l),0.0), nv = max(dot(n,v),0.001), nh = max(dot(n,h),0.0);
  float a = rough*rough, a2 = a*a, d = nh*nh*(a2-1.0)+1.0;
  float distribution = a2 / max(PI*d*d,0.0001);
  float k = (rough+1.0)*(rough+1.0)/8.0;
  float geometry = (nv/(nv*(1.0-k)+k))*(nl/(nl*(1.0-k)+k));
  vec3 f = fresnel(max(dot(h,v),0.0),mix(vec3(0.045),base,metal));
  return ((1.0-f)*(1.0-metal)*base/PI + distribution*geometry*f/max(4.0*nl*nv,0.001))*color*nl;
}
void main() {
  vec3 n = normalize(vNormal), v = normalize(vec3(0.0,0.0,4.8)-vPosition);
  float ink = texture2D(uAtlas,vUV).r*(1.0-vBevel);
  float etch = texture2D(uAtlas,vUV+vec2(0.0008,-0.0004)).r-texture2D(uAtlas,vUV-vec2(0.0008,-0.0004)).r;
  float grain = sin(vLocal.x*164.0+vLocal.z*80.0)*sin(vLocal.y*153.0-vLocal.z*61.0);
  float cloud = sin(vLocal.x*9.0+sin(vLocal.y*11.0)+vLocal.z*7.0)*0.5+0.5;
  vec3 resin = vec3(0.018,0.095,0.108)*(0.75+0.4*cloud);
  if (uOutcome>0.5) resin=mix(resin,vec3(0.12,0.069,0.018),0.72);
  if (uOutcome< -0.5) resin=mix(resin,vec3(0.085,0.012,0.023),0.85);
  float gilded = max(ink, vBevel);
  vec3 base = mix(resin,vec3(0.65,0.4,0.14),gilded);
  float metal = mix(0.3,0.82,gilded), rough = mix(0.29,0.24,gilded)+grain*0.012;
  vec3 color = light(vec3(-3.5,4.0,5.0),vec3(5.5,4.8,3.8),n,v,base,metal,rough);
  color += light(vec3(4.0,0.5,2.0),vec3(1.7,2.7,3.6),n,v,base,metal,rough);
  color += light(vec3(-1.0,-3.0,1.0),vec3(0.6,1.2,1.4),n,v,base,metal,rough);
  vec3 r = reflect(-v,n);
  vec3 environment = mix(vec3(0.035,0.045,0.055),vec3(0.28,0.34,0.39),smoothstep(-0.6,0.9,r.y));
  environment += vec3(1.5,1.22,0.85)*pow(max(dot(r,normalize(vec3(-0.6,0.9,1.0))),0.0),18.0);
  environment += vec3(0.3,0.55,0.7)*pow(max(dot(r,normalize(vec3(1.0,0.15,0.3))),0.0),32.0);
  color += environment*fresnel(max(dot(n,v),0.0),mix(vec3(0.065),base,metal));
  color += base*0.18;
  color *= 1.0+etch*0.28*(1.0-vBevel);
  vec3 flare = uOutcome>0.0 ? vec3(0.8,0.35,0.04) : vec3(0.5,0.015,0.025);
  color += flare*uImpact*abs(uOutcome)*(0.12+0.3*pow(1.0-max(dot(n,v),0.0),2.0));
  color = (color*(2.51*color+0.03))/(color*(2.43*color+0.59)+0.14);
  gl_FragColor = vec4(pow(clamp(color,0.0,1.0),vec3(1.0/2.2)),1.0);
}`;

function webglPainter(canvas, atlas) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
  });
  if (!gl) return null;
  const shaders = [];
  const program = gl.createProgram();
  let buffer, texture;
  try {
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertexShader],
      [gl.FRAGMENT_SHADER, fragmentShader],
    ]) {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const mesh = makeMesh();
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, mesh, gl.STATIC_DRAW);
    let offset = 0;
    for (const [name, size] of [
      ['aPosition', 3],
      ['aNormal', 3],
      ['aUV', 2],
      ['aBevel', 1],
    ]) {
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 36, offset * 4);
      offset += size;
    }
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    const anisotropy = gl.getExtension('EXT_texture_filter_anisotropic');
    if (anisotropy)
      gl.texParameterf(
        gl.TEXTURE_2D,
        anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(4, gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)),
      );
    const uniforms = Object.fromEntries(
      ['uRotation', 'uOffset', 'uAspect', 'uOutcome', 'uImpact'].map((name) => [
        name,
        gl.getUniformLocation(program, name),
      ]),
    );
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    return (pose, width, height) => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix3fv(uniforms.uRotation, false, rotationMatrix(pose.rotation));
      gl.uniform2f(uniforms.uOffset, pose.x, pose.lift + 0.08);
      gl.uniform1f(uniforms.uAspect, width / height);
      gl.uniform1f(uniforms.uOutcome, pose.result === 20 ? 1 : pose.result === 1 ? -1 : 0);
      gl.uniform1f(uniforms.uImpact, pose.impact || 0);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.length / 9);
    };
  } catch (error) {
    console.warn('D20: usando renderizado compatible.', error);
    gl.deleteProgram(program);
    if (buffer) gl.deleteBuffer(buffer);
    if (texture) gl.deleteTexture(texture);
    return null;
  } finally {
    shaders.forEach((shader) => gl.deleteShader(shader));
  }
}

function project(point, width, height, pose) {
  const scale = (height * 0.5 * LENS) / (CAMERA - point[2]);
  return [
    (point[0] + pose.x) * scale + width / 2,
    height / 2 - (point[1] + pose.lift + 0.08) * scale,
  ];
}
// Software fallback: subdivide textured triangles BEFORE projection. Numerals still
// follow their physical face and remain clipped, even without hardware acceleration.
function canvasPainter(canvas, atlas) {
  const ctx = canvas.getContext('2d');
  function textureTriangle(face, points, projected) {
    const tile = face.value - 1;
    const uv = points.map((p) => {
      const [u, v] = faceUV(face, p);
      return [((tile % 4) + u) * TILE, (Math.floor(tile / 4) + v) * TILE];
    });
    const [s0, s1, s2] = uv,
      [d0, d1, d2] = projected;
    const sx1 = s1[0] - s0[0],
      sy1 = s1[1] - s0[1],
      sx2 = s2[0] - s0[0],
      sy2 = s2[1] - s0[1];
    const dx1 = d1[0] - d0[0],
      dy1 = d1[1] - d0[1],
      dx2 = d2[0] - d0[0],
      dy2 = d2[1] - d0[1];
    const det = sx1 * sy2 - sx2 * sy1;
    if (Math.abs(det) < 0.0001) return;
    const a = (dx1 * sy2 - dx2 * sy1) / det,
      b = (dy1 * sy2 - dy2 * sy1) / det;
    const c = (dx2 * sx1 - dx1 * sx2) / det,
      d = (dy2 * sx1 - dy1 * sx2) / det;
    ctx.save();
    path(projected);
    ctx.clip();
    ctx.transform(a, b, c, d, d0[0] - a * s0[0] - c * s0[1], d0[1] - b * s0[0] - d * s0[1]);
    ctx.drawImage(atlas, 0, 0);
    ctx.restore();
  }
  function path(points) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
  return (pose, width, height) => {
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const m = rotationMatrix(pose.rotation);
    const visible = faces
      .map((face) => ({
        face,
        normal: transform(m, face.normal),
        center: transform(m, face.center),
      }))
      .filter(({ normal, center }) => dot(normal, sub([0, 0, CAMERA], center)) > 0)
      .sort((a, b) => a.center[2] - b.center[2]);
    for (const { face, normal } of visible) {
      const projected = face.points.map((p) => project(transform(m, p), width, height, pose));
      path(projected);
      const light = 0.3 + Math.max(0, dot(normal, unit([-0.6, 1, 1]))) * 0.7;
      ctx.fillStyle =
        pose.result === 1
          ? `rgb(${90 * light},${28 * light},${35 * light})`
          : pose.result === 20
            ? `rgb(${160 * light},${103 * light},${33 * light})`
            : `rgb(${26 * light},${95 * light},${105 * light})`;
      ctx.fill();
      // Screen blending discards the black texture background, retaining gilded markings.
      ctx.save();
      path(projected);
      ctx.clip();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.5 + light * 0.4;
      function subdivide(points, depth) {
        if (!depth) {
          textureTriangle(
            face,
            points,
            points.map((p) => project(transform(m, p), width, height, pose)),
          );
          return;
        }
        const [a, b, c] = points,
          ab = mul(add(a, b), 0.5),
          bc = mul(add(b, c), 0.5),
          ca = mul(add(c, a), 0.5);
        for (const child of [
          [a, ab, ca],
          [ab, b, bc],
          [ca, bc, c],
          [ab, bc, ca],
        ])
          subdivide(child, depth - 1);
      }
      subdivide(face.points, 2);
      ctx.restore();
      path(projected);
      ctx.strokeStyle = `rgba(224,183,105,${0.35 + light * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  };
}

function paintEffects(ctx, width, height, pose, elapsed, reduced) {
  const unitSize = Math.min(width, height),
    cx = width / 2,
    cy = height * 0.79;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(cx + pose.x * unitSize * 0.25, cy);
  ctx.scale(1 + pose.lift * 0.4, 0.18);
  const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, unitSize * 0.3);
  shadow.addColorStop(0, `rgba(0,0,0,${0.65 - pose.lift * 0.3})`);
  shadow.addColorStop(1, 'transparent');
  ctx.fillStyle = shadow;
  ctx.fillRect(-unitSize * 0.4, -unitSize * 0.4, unitSize * 0.8, unitSize * 0.8);
  ctx.restore();
  if (elapsed == null || (pose.result !== 1 && pose.result !== 20)) return;
  const critical = pose.result === 20,
    t = reduced ? 0.32 : elapsed;
  const fade = Math.max(0, 1 - t / 1.8),
    color = critical ? '255,202,100' : '235,66,79';
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const halo = ctx.createRadialGradient(
    cx,
    height * 0.5,
    unitSize * 0.16,
    cx,
    height * 0.5,
    unitSize * 0.53,
  );
  halo.addColorStop(0, `rgba(${color},${fade * 0.15})`);
  halo.addColorStop(0.5, `rgba(${color},${fade * 0.1})`);
  halo.addColorStop(1, 'transparent');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);
  if (!reduced) {
    ctx.strokeStyle = `rgba(${color},${fade * 0.6})`;
    ctx.shadowColor = `rgba(${color},0.8)`;
    ctx.shadowBlur = critical ? 8 : 5;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      unitSize * (0.16 + t * 0.38),
      unitSize * (0.045 + t * 0.1),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    if (critical) {
      for (let i = 0; i < 42; i++) {
        const angle = i * 2.39996,
          speed = 0.15 + (i % 7) * 0.024,
          radius = unitSize * (0.18 + speed * t);
        const x = cx + Math.cos(angle) * radius,
          y = height * 0.47 + Math.sin(angle) * radius + t * t * unitSize * 0.035;
        ctx.globalAlpha = fade * Math.min(1, t * 8) * (0.5 + (i % 3) * 0.2);
        ctx.fillStyle = i % 3 ? '#ffd88a' : '#fff6d5';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + t);
        ctx.fillRect(-1, -2, 1.5 + (i % 2), 3 + (i % 4));
        ctx.restore();
        if (i % 6 === 0) {
          ctx.beginPath();
          ctx.moveTo(x - 4, y);
          ctx.lineTo(x + 4, y);
          ctx.moveTo(x, y - 4);
          ctx.lineTo(x, y + 4);
          ctx.stroke();
        }
      }
    } else {
      // Fractures spread across the contact plane, not across the screen or the text.
      for (let i = 0; i < 9; i++) {
        const angle = (i * Math.PI * 2) / 9,
          reach = unitSize * Math.min(0.36, t * 1.3);
        ctx.globalAlpha = fade * 0.8;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * unitSize * 0.06, cy);
        for (let j = 1; j <= 4; j++) {
          const r = (reach * j) / 4,
            bend = Math.sin(i * 8 + j * 3) * 0.15;
          ctx.lineTo(cx + Math.cos(angle + bend) * r, cy + Math.sin(angle + bend) * r * 0.32);
        }
        ctx.stroke();
      }
      for (let i = 0; i < 22; i++) {
        const a = i * 2.39996,
          r = unitSize * (0.12 + (i % 5) * 0.035);
        ctx.globalAlpha = fade * 0.55;
        ctx.fillStyle = i % 3 ? '#d24b4b' : '#9b7980';
        ctx.fillRect(
          cx + Math.cos(a) * r * (1 + t * 0.3),
          cy + Math.sin(a) * r * 0.2 - t * unitSize * (0.1 + (i % 4) * 0.04),
          1.4,
          2.6,
        );
      }
    }
  }
  ctx.restore();
}

export function createD20Renderer(canvas, effectsCanvas) {
  const atlas = makeAtlas();
  let paint = webglPainter(canvas, atlas);
  function useSoftwareRenderer() {
    // A canvas whose WebGL initialization failed may no longer accept a 2D context.
    const replacement = canvas.cloneNode();
    canvas.replaceWith(replacement);
    canvas = replacement;
    paint = canvasPainter(canvas, atlas);
  }
  if (!paint) useSoftwareRenderer();
  const effects = effectsCanvas.getContext('2d');
  let frameId = null,
    lastPose = null,
    startedAt = 0,
    from = null,
    result = null,
    onLand = null,
    notified = false;
  let phase = 'idle',
    seed = 0;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  function cancel() {
    if (frameId != null) cancelAnimationFrame(frameId);
    frameId = null;
  }
  function render(now) {
    frameId = null;
    if (phase === 'idle') return;
    const t = Math.max(0, (now - startedAt) / 1000),
      reduced = motion.matches;
    let pose,
      effectTime = null;
    if (phase === 'rolling') {
      const spin = reduced ? 0.3 : t;
      pose = {
        rotation: quaternionProduct(
          axisRotation([0.8, 1, 0.25], spin * 8 + seed),
          axisRotation([0.1, 0, 1], spin * 2.6),
        ),
        lift: reduced ? 0 : (Math.abs(Math.sin(t * 7)) * 0.24) / (1 + t * 0.6),
        x: reduced ? 0 : (Math.sin(t * 4) * 0.12) / (1 + t),
        result: null,
      };
    } else {
      const duration = reduced ? 0 : 0.72,
        p = duration ? Math.min(1, t / duration) : 1,
        ease = 1 - Math.pow(1 - p, 3);
      let rotation = slerp(from.rotation, landingRotation(result), ease);
      if (!reduced)
        rotation = quaternionProduct(
          axisRotation([1, 0.3, 0.15], Math.sin(p * Math.PI * 4) * Math.pow(1 - p, 2) * 0.12),
          rotation,
        );
      pose = {
        rotation,
        lift: from.lift * (1 - p) + (reduced ? 0 : Math.sin(p * Math.PI) * 0.23),
        x: from.x * (1 - ease),
        result,
      };
      if (p === 1) {
        effectTime = t - duration;
        pose.impact = reduced ? 0.12 : Math.exp(-effectTime * 3) * 0.75;
        if (result === 1 && !reduced)
          pose.x = Math.sin(effectTime * 38) * Math.exp(-effectTime * 9) * 0.045;
        if (!notified) {
          notified = true;
          onLand?.();
        }
      }
    }
    lastPose = pose;
    const bounds = canvas.getBoundingClientRect(),
      width = bounds.width,
      height = bounds.height;
    if (width && height) {
      const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
      for (const surface of [canvas, effectsCanvas]) {
        if (
          surface.width !== Math.round(width * ratio) ||
          surface.height !== Math.round(height * ratio)
        ) {
          surface.width = Math.round(width * ratio);
          surface.height = Math.round(height * ratio);
        }
      }
      paint(pose, width, height);
      effects.setTransform(effectsCanvas.width / width, 0, 0, effectsCanvas.height / height, 0, 0);
      paintEffects(effects, width, height, pose, effectTime, reduced);
    }
    if (!reduced && (phase === 'rolling' || effectTime === null || effectTime < 1.85))
      frameId = requestAnimationFrame(render);
  }
  function redraw() {
    if (phase !== 'idle') {
      cancel();
      render(performance.now());
    }
  }
  const observer = new ResizeObserver(redraw);
  observer.observe(canvas);
  motion.addEventListener('change', redraw);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    observer.unobserve(canvas);
    useSoftwareRenderer();
    observer.observe(canvas);
    redraw();
  });
  return {
    start() {
      cancel();
      phase = 'rolling';
      result = null;
      onLand = null;
      notified = false;
      seed = Math.random() * Math.PI * 2;
      startedAt = performance.now();
      render(startedAt);
    },
    land(value, callback) {
      if (!Number.isInteger(value) || value < 1 || value > 20) return;
      cancel();
      from = lastPose || { rotation: [0, 0, 0, 1], lift: 0, x: 0 };
      phase = 'landing';
      result = value;
      onLand = callback;
      notified = false;
      startedAt = performance.now();
      render(startedAt);
    },
    stop() {
      cancel();
      phase = 'idle';
      lastPose = null;
      onLand = null;
    },
  };
}
