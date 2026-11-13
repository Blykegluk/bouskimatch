// Draws the app icon pixel by pixel and writes real PNG files, so the home-screen
// icon needs no image editor and no extra dependency.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SS = 4; // supersampling, for smooth edges

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Colour of one sample point, in a 0..1 square. */
function sample(u, v) {
  const GRASS_A = [63, 174, 82];
  const GRASS_B = [47, 150, 68];
  const DARK = [11, 61, 26];
  const WHITE = [255, 255, 255];
  const GOLD = [255, 225, 77];

  // Rounded-square background.
  const r = 0.22;
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
  if (Math.hypot(dx, dy) > r) return null; // transparent corner

  const stripe = Math.floor(u * 7) % 2 === 0 ? GRASS_A : GRASS_B;
  let col = stripe;

  // Soft light in the middle.
  const dCentre = Math.hypot(u - 0.5, v - 0.5);
  col = mix(col, [90, 200, 110], Math.max(0, 0.45 - dCentre) * 0.5);

  // Gold ring, then the ball.
  const ballR = 0.3;
  if (dCentre < ballR + 0.055 && dCentre > ballR + 0.012) col = GOLD;
  if (dCentre < ballR) {
    col = WHITE;
    // Three dark patches, like a football.
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
      const px = 0.5 + Math.cos(a) * 0.145;
      const py = 0.5 + Math.sin(a) * 0.145;
      if (Math.hypot(u - px, v - py) < 0.075) col = DARK;
    }
    if (dCentre > ballR - 0.022) col = DARK;
  }
  return col;
}

function render(size) {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const cov = a / n / 255;
      px[i] = cov ? Math.round(r / n / cov) : 0;
      px[i + 1] = cov ? Math.round(g / n / cov) : 0;
      px[i + 2] = cov ? Math.round(b / n / cov) : 0;
      px[i + 3] = Math.round(a / n);
    }
  }
  return px;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no filter
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`public/icon-${size}.png`, png(size, render(size)));
  console.log(`public/icon-${size}.png`);
}
