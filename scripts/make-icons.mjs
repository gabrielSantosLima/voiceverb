/**
 * Generates the app's PNG icons (tray + installer) without external dependencies.
 * Usage: npm run icons
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "assets");

/* -------------------------------------------------------------------------- */
/* Drawing (SDF)                                                              */
/* -------------------------------------------------------------------------- */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function sdRoundedBox(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(wx - vx * t, wy - vy * t);
}

function over(dst, src, alpha) {
  if (alpha <= 0) return dst;
  const a = clamp(alpha, 0, 1);
  return [
    dst[0] * (1 - a) + src[0] * a,
    dst[1] * (1 - a) + src[1] * a,
    dst[2] * (1 - a) + src[2] * a,
    dst[3] * (1 - a) + 255 * a,
  ];
}

/** Returns [r, g, b, a] for a normalized point (0..1). */
function shade(nx, ny) {
  let color = [0, 0, 0, 0];

  // Background: dark rounded square with a slight gradient.
  const bgD = sdRoundedBox(nx, ny, 0.5, 0.5, 0.47, 0.47, 0.24);
  if (bgD < 0.02) {
    const t = clamp(ny, 0, 1);
    const bg = mix([15, 22, 38], [8, 12, 22], t);
    color = over(color, bg, clamp(0.5 - bgD * 800, 0, 1));
  }

  // Microphone color: cyan -> violet.
  const micColor = mix([125, 211, 252], [167, 139, 250], clamp((ny - 0.2) / 0.7, 0, 1));

  // Capsule.
  const capD = sdRoundedBox(nx, ny, 0.5, 0.37, 0.105, 0.175, 0.105);
  color = over(color, micColor, clamp(0.5 - capD * 900, 0, 1));

  // Lower arc (support).
  const adx = nx - 0.5;
  const ady = ny - 0.4;
  const arcD = Math.abs(Math.hypot(adx, ady) - 0.225) - 0.028;
  if (ady > 0) color = over(color, micColor, clamp(0.5 - arcD * 900, 0, 1));

  // Stem.
  const stemD = sdSegment(nx, ny, 0.5, 0.62, 0.5, 0.76) - 0.024;
  color = over(color, micColor, clamp(0.5 - stemD * 900, 0, 1));

  // Base.
  const baseD = sdSegment(nx, ny, 0.385, 0.79, 0.615, 0.79) - 0.026;
  color = over(color, micColor, clamp(0.5 - baseD * 900, 0, 1));

  return color;
}

/* -------------------------------------------------------------------------- */
/* PNG                                                                         */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0; // None filter
    pixels.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const ss = 3; // supersampling 3x3

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const nx = (x + (sx + 0.5) / ss) / size;
          const ny = (y + (sy + 0.5) / ss) / size;
          const [cr, cg, cb, ca] = shade(nx, ny);
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const idx = (y * size + x) * 4;
      pixels[idx] = a > 0 ? Math.round(r / a) : 0;
      pixels[idx + 1] = a > 0 ? Math.round(g / a) : 0;
      pixels[idx + 2] = a > 0 ? Math.round(b / a) : 0;
      pixels[idx + 3] = Math.round(a / (ss * ss));
    }
  }

  return encodePng(size, pixels);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ["icon.png", 512],
  ["icon-256.png", 256],
  ["tray.png", 32],
  ["tray@2x.png", 64],
];

for (const [name, size] of targets) {
  writeFileSync(join(OUT_DIR, name), render(size));
  console.log(`assets/${name} (${size}x${size})`);
}
