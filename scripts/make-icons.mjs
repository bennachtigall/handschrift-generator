// Erzeugt die PNG-Icons (ohne externe Abhängigkeiten) aus einer einfachen Vektorzeichnung.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function png(size) {
  const px = new Uint8Array(size * size * 4);
  const S = size / 512;
  // Handschrift-Zug: kleine Schleife + Schwung, Koordinaten auf 512er-Raster
  const path = [[120,330],[150,250],[190,190],[230,170],[250,200],[225,260],[190,330],[200,350],[240,310],[290,230],[320,200],[345,215],[330,270],[320,330],[350,340],[400,260],[420,230]];
  const segs = [];
  for (let i = 0; i < path.length - 1; i++) segs.push([path[i], path[i + 1]]);
  const dist = (x, y) => { let m = 1e9; for (const [[ax, ay], [bx, by]] of segs) { const dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy)); } return m; };
  const baseline = (x, y) => (x > 90 && x < 430 ? Math.abs(y - 390) : 1e9);
  const smooth = (d, r) => Math.max(0, Math.min(1, (r - d) / 1.2 + 0.5));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / S, v = (y + 0.5) / S;
    const g = v / 512;
    let r = 0 + 20 * g, gg = 122 - 30 * g, b = 255 - 40 * g; // Blau-Verlauf
    const a1 = smooth(dist(u, v), 16), a2 = smooth(baseline(u, v), 5) * 0.55;
    const a = Math.max(a1, a2);
    r = r * (1 - a) + 255 * a; gg = gg * (1 - a) + 255 * a; b = b * (1 - a) + 255 * a;
    const i = (y * size + x) * 4; px[i] = r; px[i + 1] = gg; px[i + 2] = b; px[i + 3] = 255;
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1); }
  const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
for (const [name, s] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) writeFileSync(new URL(`../public/${name}`, import.meta.url), png(s));
