// Generates the PWA icon set (solid iOS-blue rounded square with a white "V")
// as raw PNGs — no image dependencies. Rerun with: npm run icons
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BLUE = { r: 0x00, g: 0x7a, b: 0xff };
const WHITE = { r: 0xff, g: 0xff, b: 0xff };

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set([...type].map((ch) => ch.charCodeAt(0)), 4);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  dv.setUint32(8 + data.length, crc32(crcInput));
  return out;
}

// Distance from point to segment — used to stroke the "V".
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function renderPng(size: number, cornerRadiusFrac: number): Uint8Array {
  const r = size * cornerRadiusFrac;
  const stroke = size * 0.075;
  // "V" geometry, centred, slightly above optical middle.
  const top = size * 0.32;
  const bottom = size * 0.72;
  const halfWidth = size * 0.19;
  const cx = size / 2;

  const raw = new Uint8Array(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      // Rounded-rect alpha
      const ix = Math.min(x, size - 1 - x);
      const iy = Math.min(y, size - 1 - y);
      let alpha = 255;
      if (ix < r && iy < r) {
        const d = Math.hypot(r - ix - 0.5, r - iy - 0.5);
        alpha = d > r ? Math.max(0, Math.round(255 * (1 - (d - r)))) : 255;
      }
      const dLeft = distToSegment(x, y, cx - halfWidth, top, cx, bottom);
      const dRight = distToSegment(x, y, cx + halfWidth, top, cx, bottom);
      const d = Math.min(dLeft, dRight);
      const vMix = Math.max(0, Math.min(1, stroke / 2 + 0.75 - d)); // soft edge
      const col = {
        r: Math.round(BLUE.r + (WHITE.r - BLUE.r) * vMix),
        g: Math.round(BLUE.g + (WHITE.g - BLUE.g) * vMix),
        b: Math.round(BLUE.b + (WHITE.b - BLUE.b) * vMix),
      };
      const p = rowStart + 1 + x * 4;
      raw[p] = col.r;
      raw[p + 1] = col.g;
      raw[p + 2] = col.b;
      raw[p + 3] = alpha;
    }
  }

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, size);
  dv.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const idat = deflateSync(raw, { level: 9 });

  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  return png;
}

const outDir = join(process.cwd(), "public", "icons");
mkdirSync(outDir, { recursive: true });

// Apple touch icons must be opaque squares (iOS applies its own mask).
writeFileSync(join(outDir, "icon-192.png"), renderPng(192, 0.22));
writeFileSync(join(outDir, "icon-512.png"), renderPng(512, 0.22));
writeFileSync(join(outDir, "apple-touch-icon.png"), renderPng(180, 0));
console.log("Icons written to public/icons/");
