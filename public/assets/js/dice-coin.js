// Coin artwork and surface details, shared by WebGL and the Canvas fallback.
// Results remain authoritative: 1 = NO, 2 = Cara (logo).
let logoPromise = null;
export function loadCoinLogo() {
  if (!logoPromise) {
    logoPromise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const scale = 256 / Math.max(image.naturalWidth, image.naturalHeight);
          canvas.width = Math.round(image.naturalWidth * scale);
          canvas.height = Math.round(image.naturalHeight * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < pixels.data.length; i += 4) {
            const luminance =
              pixels.data[i] * 0.2126 + pixels.data[i + 1] * 0.7152 + pixels.data[i + 2] * 0.0722;
            const ink = Math.pow(Math.max(0, (245 - luminance) / 245), 0.75) * 255;
            pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = ink;
            pixels.data[i + 3] = 255;
          }
          ctx.putImageData(pixels, 0, 0);
          resolve(canvas);
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error('No se pudo cargar el logo de la moneda.'));
      image.src = new URL('../ui/Logo.jpg', import.meta.url).href;
    }).catch((error) => {
      console.warn(error.message);
      logoPromise = null;
      return null;
    });
  }
  return logoPromise;
}

export function paintCoinFace(ctx, face, tile, logo) {
  const center = tile / 2;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (face.value === 1) {
    ctx.font = `bold ${tile * 0.34}px Georgia, serif`;
    ctx.fillText('NO', center, center + tile * 0.01, tile * 0.6);
  } else if (logo) {
    const scale = (tile * 0.66) / Math.max(logo.width, logo.height);
    ctx.drawImage(
      logo,
      center - (logo.width * scale) / 2,
      center - (logo.height * scale) / 2,
      logo.width * scale,
      logo.height * scale,
    );
  } else {
    ctx.font = `bold ${tile * 0.17}px Georgia, serif`;
    ctx.fillText('CARA', center, center, tile * 0.6);
  }
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 1.4;
  for (const radius of [0.405, 0.365]) {
    ctx.beginPath();
    ctx.arc(center, center, tile * radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 80; i++) {
    const angle = (i * Math.PI) / 40;
    ctx.moveTo(center + Math.cos(angle) * tile * 0.384, center + Math.sin(angle) * tile * 0.384);
    ctx.lineTo(center + Math.cos(angle) * tile * 0.397, center + Math.sin(angle) * tile * 0.397);
  }
  ctx.stroke();
}

export const coinCracks = [
  [
    [0.91, 0.12],
    [0.68, 0.08],
    [0.54, 0.2],
    [0.3, 0.16],
  ],
  [
    [0.68, 0.08],
    [0.6, -0.12],
  ],
  [
    [-0.6, -0.69],
    [-0.46, -0.45],
    [-0.5, -0.3],
  ],
  [
    [-0.46, -0.45],
    [-0.28, -0.51],
  ],
];
const vector = (p) => `vec2(${p.map((v) => v.toFixed(4)).join(',')})`;
export const coinCrackShader = `
float coinSegment(vec2 p, vec2 a, vec2 b) {
  vec2 delta = b - a;
  float t = clamp(dot(p - a, delta) / dot(delta, delta), 0.0, 1.0);
  return length(p - a - delta * t);
}
float coinFracture(vec2 p) {
  float distance = 2.0;
  ${coinCracks.flatMap((path) => path.slice(1).map((end, i) => `distance = min(distance, coinSegment(p, ${vector(path[i])}, ${vector(end)}));`)).join('\n')}
  return 1.0 - smoothstep(0.002, 0.011, distance);
}`;

export function softwareCoinAtlas(atlas) {
  const canvas = document.createElement('canvas');
  canvas.width = atlas.width;
  canvas.height = atlas.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'difference';
  ctx.globalAlpha = 0.65;
  ctx.drawImage(atlas, 0, 0);
  return canvas;
}

export function paintCoinSilhouette(ctx, points, color) {
  // Cover the bevel between caps and rim in the software renderer as well.
  const sorted = points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (list) => {
    const hull = [];
    for (const point of list) {
      while (hull.length > 1 && turn(hull.at(-2), hull.at(-1), point) <= 0) hull.pop();
      hull.push(point);
    }
    return hull.slice(0, -1);
  };
  const hull = [...half(sorted), ...half([...sorted].reverse())];
  ctx.beginPath();
  hull.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function coinMetalColor(outcome, reveal, light) {
  const silver = [190, 201, 211],
    target = outcome > 0 ? [221, 174, 61] : [184, 97, 51];
  return `rgb(${silver.map((v, i) => (v + (target[i] - v) * reveal) * light).join(',')})`;
}
