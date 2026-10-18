// Presentation only: the server supplies the result. No roll is decided here.
import { add, sub, mul, dot, cross, unit, rotationMatrix, transform } from './dice-geometry.js';
import { createPhysicalThrow, samplePhysicalThrow, tableOutline } from './dice-motion.js';
import { getDiceModel } from './dice-models.js';

const TILE = 256,
  ATLAS_WIDTH = TILE * 4,
  ATLAS_HEIGHT = TILE * 8;
const LENS = 3.08;

function faceUV(face, point) {
  const local = sub(point, face.center);
  const scale = face.uvScale ?? 0.88;
  return [
    0.5 + dot(local, face.right) * scale,
    (face.uvCenter ?? 0.55) - dot(local, face.up) * scale,
  ];
}
function makeMesh({ vertices, faces }) {
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
    for (let i = 1; i < face.points.length - 1; i++)
      triangle([face.points[0], face.points[i], face.points[i + 1]], face.normal, face);
    for (let i = 0; i < face.indices.length; i++) {
      const a = face.indices[i],
        b = face.indices[(i + 1) % face.indices.length];
      const key = [a, b].sort((x, y) => x - y).join(':');
      if (!edges.has(key)) edges.set(key, []);
      edges
        .get(key)
        .push({ face, a, b, p: face.points[i], q: face.points[(i + 1) % face.points.length] });
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

function makeAtlas({ faces }) {
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
    // Only the percentile tens die uses two-character labels (00–90).
    const numeralScale = face.label?.length === 2 ? 0.75 : 1;
    ctx.font = `bold ${83 * numeralScale}px Georgia, serif`;
    if (face.markings) {
      ctx.font = 'bold 48px Georgia, serif';
      for (const marking of face.markings) {
        const [u, v] = faceUV(face, marking.point);
        ctx.save();
        ctx.translate(u * TILE, v * TILE);
        ctx.rotate(Math.atan2(u - 0.5, (face.uvCenter ?? 0.55) - v));
        ctx.fillText(marking.label, 0, 0);
        ctx.restore();
      }
    } else {
      ctx.fillText(
        face.label ?? String(face.value),
        TILE * 0.5,
        TILE * ((face.uvCenter ?? 0.55) + 0.015),
        TILE * 0.45 * numeralScale,
      );
    }
    if (!face.label && (face.value === 6 || face.value === 9)) {
      ctx.fillRect(TILE * 0.46, TILE * 0.735, TILE * 0.08, 2);
    }
    ctx.restore();
  });
  return atlas;
}

const vertexShader = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUV;
attribute float aBevel;
uniform mat3 uRotation;
uniform vec3 uOffset;
uniform mediump float uCamera;
uniform float uAspect;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec2 vUV;
varying float vBevel;
void main() {
  vec3 p = uRotation * aPosition + uOffset;
  float depth = uCamera - p.z;
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
uniform mediump float uCamera;
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
  vec3 n = normalize(vNormal), v = normalize(vec3(0.0,0.0,uCamera)-vPosition);
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

function webglPainter(canvas, atlas, model) {
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
    const mesh = makeMesh(model);
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
      ['uRotation', 'uOffset', 'uCamera', 'uAspect', 'uOutcome', 'uImpact'].map((name) => [
        name,
        gl.getUniformLocation(program, name),
      ]),
    );
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    const paint = (pose, width, height) => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (pose.hidden) return;
      gl.uniformMatrix3fv(uniforms.uRotation, false, rotationMatrix(pose.rotation));
      gl.uniform3fv(uniforms.uOffset, pose.offset);
      gl.uniform1f(uniforms.uCamera, pose.camera);
      gl.uniform1f(uniforms.uAspect, width / height);
      gl.uniform1f(uniforms.uOutcome, pose.outcome || 0);
      gl.uniform1f(uniforms.uImpact, pose.impact || 0);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.length / 9);
    };
    paint.dispose = () => {
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
    };
    return paint;
  } catch (error) {
    console.warn('Dados: usando renderizado compatible.', error);
    gl.deleteProgram(program);
    if (buffer) gl.deleteBuffer(buffer);
    if (texture) gl.deleteTexture(texture);
    return null;
  } finally {
    shaders.forEach((shader) => gl.deleteShader(shader));
  }
}

function project(point, width, height, camera) {
  const scale = (height * 0.5 * LENS) / (camera - point[2]);
  return [point[0] * scale + width / 2, height / 2 - point[1] * scale];
}
// Software fallback: subdivide textured triangles BEFORE projection. Numerals still
// follow their physical face and remain clipped, even without hardware acceleration.
function canvasPainter(canvas, atlas, { faces }) {
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
    if (pose.hidden) return;
    const m = rotationMatrix(pose.rotation);
    const visible = faces
      .map((face) => ({
        face,
        normal: transform(m, face.normal),
        center: add(transform(m, face.center), pose.offset),
      }))
      .filter(({ normal, center }) => dot(normal, sub([0, 0, pose.camera], center)) > 0)
      .sort((a, b) => a.center[2] - b.center[2]);
    for (const { face, normal } of visible) {
      const projected = face.points.map((p) =>
        project(add(transform(m, p), pose.offset), width, height, pose.camera),
      );
      path(projected);
      const light = 0.3 + Math.max(0, dot(normal, unit([-0.6, 1, 1]))) * 0.7;
      ctx.fillStyle =
        pose.outcome === -1
          ? `rgb(${90 * light},${28 * light},${35 * light})`
          : pose.outcome === 1
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
            points.map((p) =>
              project(add(transform(m, p), pose.offset), width, height, pose.camera),
            ),
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
      for (let i = 1; i < face.points.length - 1; i++)
        subdivide([face.points[0], face.points[i], face.points[i + 1]], 2);
      ctx.restore();
      path(projected);
      ctx.strokeStyle = `rgba(224,183,105,${0.35 + light * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  };
}

function paintEffects(ctx, width, height, pose, elapsed, reduced) {
  ctx.clearRect(0, 0, width, height);
  if (pose.hidden) return;
  const unitSize = Math.min(width, height),
    [cx, cy] = project(pose.ground, width, height, pose.camera),
    [bodyX, bodyY] = project(pose.offset, width, height, pose.camera),
    radius = (height * 0.5 * LENS) / (pose.camera - pose.ground[2]),
    airborne = Math.max(0, pose.height - 0.8);
  // A visible contact plane gives the bounce height a reference. The camera zooms
  // into this same table; neither the floor nor the die changes scale in world space.
  ctx.save();
  const felt = ctx.createRadialGradient(
    width / 2,
    height * 0.55,
    0,
    width / 2,
    height * 0.55,
    unitSize * 0.58,
  );
  felt.addColorStop(0, '#31474d80');
  felt.addColorStop(0.75, '#1a2c3240');
  felt.addColorStop(1, '#111d2200');
  ctx.beginPath();
  tableOutline.forEach((point, i) => {
    const [x, y] = project(point, width, height, pose.camera);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = felt;
  ctx.fill();
  ctx.strokeStyle = `rgba(186,162,110,${Math.max(0, pose.camera - 7) * 0.035})`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1 + airborne * 0.12, 0.8 + airborne * 0.1);
  const shadow = ctx.createRadialGradient(
    0,
    0,
    radius * 0.12,
    0,
    0,
    radius * (1.1 + airborne * 0.18),
  );
  shadow.addColorStop(0, `rgba(0,0,0,${0.65 / (1 + airborne * 1.5)})`);
  shadow.addColorStop(1, 'transparent');
  ctx.fillStyle = shadow;
  ctx.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 4);
  ctx.restore();
  // Brief contact dust follows actual collisions, not a periodic bounce animation.
  if (!reduced && pose.contactAge < 0.22) {
    ctx.save();
    ctx.strokeStyle = `rgba(213,191,152,${(1 - pose.contactAge / 0.22) * pose.contactStrength * 0.2})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      radius * (0.4 + pose.contactAge * 2),
      radius * (0.3 + pose.contactAge * 1.5),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
  }
  if (elapsed == null || !pose.outcome) return;
  const critical = pose.outcome === 1,
    t = reduced ? 0.32 : elapsed;
  const fade = Math.max(0, 1 - t / 1.8),
    color = critical ? '255,202,100' : '235,66,79';
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const halo = ctx.createRadialGradient(
    bodyX,
    bodyY,
    unitSize * 0.16,
    bodyX,
    bodyY,
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
      unitSize * (0.1 + t * 0.22),
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
        const x = bodyX + Math.cos(angle) * radius,
          y = bodyY + Math.sin(angle) * radius + t * t * unitSize * 0.035;
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
          ctx.lineTo(cx + Math.cos(angle + bend) * r, cy + Math.sin(angle + bend) * r * 0.65);
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

export function createDiceRenderer(canvas, effectsCanvas) {
  let model = getDiceModel(20),
    modelKey = '20:number',
    atlas = makeAtlas(model);
  let paint = webglPainter(canvas, atlas, model);
  function useSoftwareRenderer() {
    // A canvas whose WebGL initialization failed may no longer accept a 2D context.
    const replacement = canvas.cloneNode();
    canvas.replaceWith(replacement);
    canvas = replacement;
    paint = canvasPainter(canvas, atlas, model);
  }
  if (!paint) useSoftwareRenderer();
  const effects = effectsCanvas.getContext('2d');
  let frameId = null,
    startedAt = 0,
    throwing = null,
    settledAt = null,
    onLand = null;
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
    let pose = { hidden: true },
      effectTime = null;
    if (phase === 'throwing') {
      pose = samplePhysicalThrow(throwing, reduced || settledAt != null ? throwing.duration : t);
      if (pose.settled) {
        if (settledAt == null) {
          settledAt = now;
          onLand?.();
        }
        effectTime = (now - settledAt) / 1000;
        pose.contactAge += effectTime;
        pose.impact = reduced ? 0.12 : Math.exp(-effectTime * 3) * 0.75;
      }
    }
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
      pose.outcome = model.sides === 20 ? (pose.result === 20 ? 1 : pose.result === 1 ? -1 : 0) : 0;
      paint(pose, width, height);
      effects.setTransform(effectsCanvas.width / width, 0, 0, effectsCanvas.height / height, 0, 0);
      paintEffects(effects, width, height, pose, effectTime, reduced);
    }
    if (!reduced && phase === 'throwing' && (effectTime === null || effectTime < 1.85))
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
    start(rollId = 0, sides = 20, labels = 'number') {
      cancel();
      if (`${sides}:${labels}` !== modelKey) {
        model = getDiceModel(sides, labels);
        modelKey = `${sides}:${labels}`;
        atlas = makeAtlas(model);
        paint.dispose?.();
        observer.unobserve(canvas);
        paint = webglPainter(canvas, atlas, model);
        if (!paint) useSoftwareRenderer();
        observer.observe(canvas);
      }
      phase = 'waiting';
      throwing = null;
      onLand = null;
      settledAt = null;
      seed = rollId;
      startedAt = performance.now();
      render(startedAt);
    },
    land(value, callback) {
      if (!Number.isInteger(value) || value < 1 || value > model.sides) return;
      cancel();
      throwing = createPhysicalThrow(value, seed, model.sides);
      phase = 'throwing';
      onLand = callback;
      settledAt = null;
      startedAt = performance.now();
      render(startedAt);
    },
    stop() {
      cancel();
      phase = 'idle';
      throwing = null;
      onLand = null;
    },
  };
}

// Existing integrations can still request the original d20 renderer.
export { createDiceRenderer as createD20Renderer };
