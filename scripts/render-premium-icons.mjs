import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const APPS = {
  music: {
    kind: 'music',
    colors: ['#070816', '#25104c', '#00e5ff', '#ff3bd4', '#ffe66d'],
    targets: [
      ['MusicGenAI/public/favicon.png', 512],
      ['MusicGenAI/public/apple-touch-icon.png', 180],
      ['MusicGenAI/public/pwa-icon-192.png', 192],
      ['MusicGenAI/public/pwa-icon-512.png', 512],
      ['MusicGenAI/public/favicon.ico', 64, 'ico'],
    ],
  },
  yaara: {
    kind: 'yaara',
    colors: ['#120b1f', '#46213f', '#ff7a59', '#ffd2a6', '#7fffd4'],
    targets: [
      ['hey-yaara/public/favicon.png', 512],
      ['hey-yaara/public/apple-touch-icon.png', 180],
      ['hey-yaara/public/icon-192x192.png', 192],
      ['hey-yaara/public/icon-512x512.png', 512],
    ],
  },
  portfolio: {
    kind: 'portfolio',
    colors: ['#0b0a08', '#2a2118', '#ff4d1f', '#fbf5ec', '#00b584'],
    targets: [
      ['Anchit-Work-Portfolio/favicon.png', 512],
      ['Anchit-Work-Portfolio/icons/apple-touch-icon.png', 180],
      ['Anchit-Work-Portfolio/icons/icon-192.png', 192],
      ['Anchit-Work-Portfolio/icons/icon-512.png', 512],
      ['Anchit-Work-Portfolio/icons/icon-maskable-512.png', 512],
    ],
  },
  telesuite: {
    kind: 'telesuite',
    colors: ['#06111f', '#0d2a4a', '#49d8ff', '#8cf7c8', '#ffffff'],
    targets: [
      ['AI-TeleSuite/src/app/favicon.ico', 64, 'ico'],
      ['AI-TeleSuite/public/favicon.png', 512],
      ['AI-TeleSuite/public/icon-192.png', 192],
      ['AI-TeleSuite/public/icon-512.png', 512],
    ],
  },
  lifeengine: {
    kind: 'lifeengine',
    colors: ['#071610', '#103728', '#52ffa8', '#f3fff5', '#ffd166'],
    targets: [
      ['TH-LifeEngine/public/favicon.png', 512],
      ['TH-LifeEngine/public/apple-touch-icon.png', 180],
      ['TH-LifeEngine/public/icon-192.png', 192],
      ['TH-LifeEngine/public/icon-512.png', 512],
    ],
  },
  thirdeye: {
    kind: 'thirdeye',
    colors: ['#070712', '#1b1640', '#9b5cff', '#00e5ff', '#f8f7ff'],
    targets: [
      ['The-Third-Eye/frontend/public/logo.png', 512],
      ['The-Third-Eye/frontend/public/icon-192.png', 192],
      ['The-Third-Eye/frontend/public/icon-512.png', 512],
      ['The-Third-Eye/frontend/public/favicon.png', 512],
    ],
  },
  dtc: {
    kind: 'dtc',
    colors: ['#082018', '#174333', '#c6a15b', '#f7efe2', '#6ee7a8'],
    targets: [
      ['vahdam_dtc_data_engine/favicon.png', 512],
    ],
  },
  mailer: {
    kind: 'mailer',
    colors: ['#160b0d', '#4a141a', '#ff5a66', '#ffd27a', '#fff8ec'],
    targets: [
      ['marketing_mailers__html_architect/favicon.png', 512],
    ],
  },
};

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function icoFromPng(pngBuf, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = size >= 256 ? 0 : size;
  header[7] = size >= 256 ? 0 : size;
  header[8] = 0;
  header[9] = 0;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(pngBuf.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, pngBuf]);
}

function hex(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

function blend(buf, w, h, x, y, color, alpha = 1) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= w || y >= h || alpha <= 0) return;
  const i = (y * w + x) * 4;
  const inv = 1 - alpha;
  buf[i] = Math.round(color[0] * alpha + buf[i] * inv);
  buf[i + 1] = Math.round(color[1] * alpha + buf[i + 1] * inv);
  buf[i + 2] = Math.round(color[2] * alpha + buf[i + 2] * inv);
  buf[i + 3] = 255;
}

function line(buf, w, h, x1, y1, x2, y2, width, color, alpha = 1) {
  const minX = Math.floor(Math.min(x1, x2) - width);
  const maxX = Math.ceil(Math.max(x1, x2) + width);
  const minY = Math.floor(Math.min(y1, y2) - width);
  const maxY = Math.ceil(Math.max(y1, y2) + width);
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
    const px = x1 + t * dx, py = y1 + t * dy;
    const d = Math.hypot(x - px, y - py);
    const a = Math.max(0, Math.min(1, (width / 2 + 1 - d))) * alpha;
    blend(buf, w, h, x, y, color, a);
  }
}

function circle(buf, w, h, cx, cy, r, color, alpha = 1, stroke = 0) {
  const min = Math.floor(Math.max(0, Math.min(cx, cy) - r - stroke - 2));
  const max = Math.ceil(Math.min(w, h, Math.max(cx, cy) + r + stroke + 2));
  for (let y = min; y < max; y++) for (let x = min; x < max; x++) {
    const d = Math.hypot(x - cx, y - cy);
    const edge = stroke ? Math.abs(d - r) : d;
    const threshold = stroke ? stroke / 2 : r;
    const a = Math.max(0, Math.min(1, threshold + 1 - edge)) * alpha;
    blend(buf, w, h, x, y, color, a);
  }
}

function poly(buf, w, h, points, color, alpha = 1) {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) blend(buf, w, h, x, y, color, alpha);
    }
  }
}

function drawBackground(buf, size, colors) {
  const a = hex(colors[0]), b = hex(colors[1]), glow = hex(colors[2]);
  const cx = size * 0.72, cy = size * 0.18;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const t = (x + y) / (size * 2);
    let c = mix(a, b, t);
    const g = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / (size * 0.72));
    c = mix(c, glow, g * 0.28);
    const vignette = Math.max(0, Math.hypot(x - size / 2, y - size / 2) / (size * 0.78) - 0.45);
    c = c.map(v => Math.round(v * (1 - vignette * 0.55)));
    const i = (y * size + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
  }
}

function drawMark(buf, size, spec) {
  const [bgA, bgB, c1, c2, c3] = spec.colors.map(hex);
  const s = size;
  const cx = s / 2, cy = s / 2;
  circle(buf, s, s, cx, cy, s * 0.33, c3, 0.08, s * 0.018);
  circle(buf, s, s, cx, cy, s * 0.27, c1, 0.18, s * 0.012);

  if (spec.kind === 'music') {
    circle(buf, s, s, cx, cy, s * 0.25, c1, 0.35, s * 0.045);
    for (let i = 0; i < 8; i++) {
      const x = s * (0.29 + i * 0.06);
      const h = s * (0.11 + Math.sin(i * 1.35) * 0.045 + (i % 3) * 0.015);
      line(buf, s, s, x, cy - h, x, cy + h, s * 0.026, i % 2 ? c2 : c1, 0.95);
    }
    poly(buf, s, s, [[s * 0.61, s * 0.38], [s * 0.61, s * 0.62], [s * 0.76, s * 0.5]], c3, 0.96);
  } else if (spec.kind === 'yaara') {
    circle(buf, s, s, cx, cy, s * 0.25, c3, 0.9);
    circle(buf, s, s, s * 0.39, s * 0.45, s * 0.085, c1, 0.95);
    circle(buf, s, s, s * 0.61, s * 0.45, s * 0.085, c1, 0.95);
    poly(buf, s, s, [[s * 0.34, s * 0.52], [s * 0.5, s * 0.7], [s * 0.66, s * 0.52]], c1, 0.95);
    line(buf, s, s, s * 0.70, s * 0.39, s * 0.82, s * 0.34, s * 0.025, c2, 0.95);
    line(buf, s, s, s * 0.70, s * 0.50, s * 0.84, s * 0.50, s * 0.025, c2, 0.95);
    line(buf, s, s, s * 0.70, s * 0.61, s * 0.82, s * 0.66, s * 0.025, c2, 0.95);
  } else if (spec.kind === 'portfolio') {
    line(buf, s, s, s * 0.30, s * 0.72, s * 0.50, s * 0.25, s * 0.055, c3, 0.98);
    line(buf, s, s, s * 0.50, s * 0.25, s * 0.72, s * 0.72, s * 0.055, c3, 0.98);
    line(buf, s, s, s * 0.39, s * 0.56, s * 0.62, s * 0.56, s * 0.044, c1, 0.98);
    line(buf, s, s, s * 0.25, s * 0.34, s * 0.75, s * 0.66, s * 0.018, c2, 0.9);
  } else if (spec.kind === 'telesuite') {
    circle(buf, s, s, cx, cy, s * 0.28, c1, 0.2, s * 0.02);
    line(buf, s, s, s * 0.31, s * 0.60, s * 0.43, s * 0.38, s * 0.055, c3, 0.98);
    line(buf, s, s, s * 0.43, s * 0.38, s * 0.59, s * 0.38, s * 0.055, c3, 0.98);
    line(buf, s, s, s * 0.59, s * 0.38, s * 0.70, s * 0.60, s * 0.055, c3, 0.98);
    for (let i = 0; i < 4; i++) line(buf, s, s, s * (0.34 + i * 0.1), s * (0.67 - i * 0.035), s * (0.39 + i * 0.1), s * (0.67 + i * 0.035), s * 0.018, c2, 0.9);
  } else if (spec.kind === 'lifeengine') {
    line(buf, s, s, s * 0.24, cy, s * 0.40, cy, s * 0.03, c3, 0.95);
    line(buf, s, s, s * 0.40, cy, s * 0.47, s * 0.34, s * 0.03, c3, 0.95);
    line(buf, s, s, s * 0.47, s * 0.34, s * 0.56, s * 0.66, s * 0.03, c3, 0.95);
    line(buf, s, s, s * 0.56, s * 0.66, s * 0.64, cy, s * 0.03, c3, 0.95);
    line(buf, s, s, s * 0.64, cy, s * 0.78, cy, s * 0.03, c3, 0.95);
    circle(buf, s, s, s * 0.57, s * 0.39, s * 0.18, c1, 0.75);
    line(buf, s, s, s * 0.48, s * 0.51, s * 0.69, s * 0.30, s * 0.025, c2, 0.75);
  } else if (spec.kind === 'thirdeye') {
    poly(buf, s, s, [[s * 0.18, cy], [cx, s * 0.29], [s * 0.82, cy], [cx, s * 0.71]], c3, 0.86);
    poly(buf, s, s, [[s * 0.25, cy], [cx, s * 0.36], [s * 0.75, cy], [cx, s * 0.64]], bgB, 0.85);
    circle(buf, s, s, cx, cy, s * 0.145, c1, 0.98);
    circle(buf, s, s, cx, cy, s * 0.055, c2, 0.98);
    circle(buf, s, s, cx, cy, s * 0.31, c1, 0.26, s * 0.016);
  } else if (spec.kind === 'dtc') {
    line(buf, s, s, s * 0.27, s * 0.70, s * 0.27, s * 0.48, s * 0.05, c3, 0.96);
    line(buf, s, s, s * 0.43, s * 0.70, s * 0.43, s * 0.36, s * 0.05, c1, 0.96);
    line(buf, s, s, s * 0.59, s * 0.70, s * 0.59, s * 0.42, s * 0.05, c3, 0.96);
    circle(buf, s, s, s * 0.63, s * 0.35, s * 0.16, c2, 0.9);
    line(buf, s, s, s * 0.54, s * 0.45, s * 0.74, s * 0.25, s * 0.018, bgA, 0.8);
  } else if (spec.kind === 'mailer') {
    poly(buf, s, s, [[s * 0.23, s * 0.36], [s * 0.77, s * 0.36], [s * 0.77, s * 0.66], [s * 0.23, s * 0.66]], c3, 0.95);
    line(buf, s, s, s * 0.23, s * 0.36, cx, s * 0.55, s * 0.025, c1, 0.95);
    line(buf, s, s, s * 0.77, s * 0.36, cx, s * 0.55, s * 0.025, c1, 0.95);
    line(buf, s, s, s * 0.35, s * 0.74, s * 0.65, s * 0.25, s * 0.02, c2, 0.85);
    line(buf, s, s, s * 0.50, s * 0.22, s * 0.50, s * 0.32, s * 0.018, c2, 0.85);
  }
}

function render(spec, size) {
  const buf = Buffer.alloc(size * size * 4);
  drawBackground(buf, size, spec.colors);
  drawMark(buf, size, spec);
  return png(size, size, buf);
}

for (const spec of Object.values(APPS)) {
  for (const [rel, size, format] of spec.targets) {
    const file = resolve(ROOT, rel);
    mkdirSync(dirname(file), { recursive: true });
    const image = render(spec, size);
    writeFileSync(file, format === 'ico' ? icoFromPng(image, size) : image);
    console.log(`${rel} ${size}x${size}`);
  }
}
