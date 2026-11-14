import type { PaperId, Settings } from './types';

export const MM = 72 / 25.4;
export type Op =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { t: 'dot'; x: number; y: number; r: number; color: string }
  | { t: 'image'; src: string; x: number; y: number; w: number; h: number };

export interface PaperDef {
  ops: Op[];
  ruling: { first: number; step: number } | null; // Grundlinien in pt
  minLeft: number; // pt
  defaultInk: string;
  rec: { xh: number; skip: number };
}

export const PAPERS: { id: PaperId; name: string }[] = [
  { id: 'weiss', name: 'Weiß' }, { id: 'liniert', name: 'Liniert' }, { id: 'kariert', name: 'Kariert' },
  { id: 'punkte', name: 'Punktraster' }, { id: 'college', name: 'Collegeblock' },
  { id: 'grundschule', name: 'Grundschule' }, { id: 'dunkel', name: 'Dunkel' }, { id: 'bild', name: 'Eigenes Bild' },
];

export function pageSize(s: Pick<Settings, 'format' | 'landscape'>) {
  let w = s.format === 'A4' ? 210 : 148, h = s.format === 'A4' ? 297 : 210;
  if (s.landscape) [w, h] = [h, w];
  return { w: w * MM, h: h * MM };
}

const BLUE = '#a9c9ec', RED = '#e9908f';

export function paperDef(s: Settings): PaperDef {
  const { w, h } = pageSize(s);
  const ops: Op[] = [];
  const dark = s.paper === 'dunkel';
  ops.push({ t: 'rect', x: 0, y: 0, w, h, fill: dark ? '#1c1c1e' : '#ffffff' });
  let ruling: PaperDef['ruling'] = null;
  let minLeft = 0;
  let rec = { xh: 3.2, skip: 1 };
  const hl = (y: number, color = BLUE, width = 0.6) => ops.push({ t: 'line', x1: 0, y1: y, x2: w, y2: y, color, width });
  const vl = (x: number, color = BLUE, width = 0.6, y1 = 0, y2 = h) => ops.push({ t: 'line', x1: x, y1, x2: x, y2, color, width });
  const id: PaperId = s.paper;
  if (id === 'liniert' || id === 'college') {
    const step = (id === 'liniert' ? 8 : 7.1) * MM;
    const first = (id === 'liniert' ? 25 : 22) * MM;
    for (let y = first; y < h - 5 * MM; y += step) hl(y);
    if (id === 'college') { vl(30 * MM, RED, 0.8); vl(31.2 * MM, RED, 0.8); minLeft = 34 * MM; rec = { xh: 2.7, skip: 1 }; }
    else rec = { xh: 3.0, skip: 1 };
    ruling = { first, step };
  } else if (id === 'kariert' || id === 'punkte') {
    const step = 5 * MM;
    if (id === 'kariert') { for (let y = 0; y <= h; y += step) hl(y, BLUE, 0.4); for (let x = 0; x <= w; x += step) vl(x, BLUE, 0.4); }
    else for (let y = step; y < h; y += step) for (let x = step; x < w; x += step) ops.push({ t: 'dot', x, y, r: 0.7, color: '#9aa3ad' });
    ruling = { first: step * 4, step };
    rec = { xh: 2.4, skip: 1 };
  } else if (id === 'grundschule') {
    const g = 14 * MM, z = 3.5 * MM;
    let first = 0, n = 0;
    for (let y0 = 20 * MM; y0 + 3 * z < h - 8 * MM; y0 += g, n++) {
      hl(y0, '#c9d7e6', 0.4); hl(y0 + z, '#c9d7e6', 0.4); hl(y0 + 2 * z, '#e07a7a', 0.8); hl(y0 + 3 * z, '#c9d7e6', 0.4);
      if (!n) first = y0 + 2 * z;
    }
    ruling = { first, step: g };
    rec = { xh: 3.5, skip: 1 };
  } else if (id === 'dunkel') {
    rec = { xh: 3.2, skip: 3 };
  } else if (id === 'bild' && s.paperImage) {
    ops.push({ t: 'image', src: s.paperImage, x: 0, y: 0, w, h });
    rec = { xh: 3.2, skip: 3 };
  } else rec = { xh: 3.2, skip: 3 };
  return { ops, ruling, minLeft, defaultInk: dark ? '#f2f2f7' : '#1c3f94', rec };
}

// Zeichnen auf Canvas (sc = Pixel pro pt)
const imgCache = new Map<string, HTMLImageElement>();
export function getImage(src: string): Promise<HTMLImageElement> {
  const c = imgCache.get(src);
  if (c?.complete) return Promise.resolve(c);
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => { imgCache.set(src, i); res(i); }; i.onerror = rej; i.src = src; });
}
export function drawOps(ctx: CanvasRenderingContext2D, ops: Op[], sc: number) {
  for (const o of ops) {
    if (o.t === 'rect') { ctx.fillStyle = o.fill; ctx.fillRect(o.x * sc, o.y * sc, o.w * sc, o.h * sc); }
    else if (o.t === 'line') { ctx.strokeStyle = o.color; ctx.lineWidth = o.width * sc; ctx.beginPath(); ctx.moveTo(o.x1 * sc, o.y1 * sc); ctx.lineTo(o.x2 * sc, o.y2 * sc); ctx.stroke(); }
    else if (o.t === 'dot') { ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(o.x * sc, o.y * sc, o.r * sc, 0, Math.PI * 2); ctx.fill(); }
    else if (o.t === 'image') {
      const im = imgCache.get(o.src);
      if (im) { const r = Math.max(o.w / im.width, o.h / im.height); const dw = im.width * r, dh = im.height * r; ctx.drawImage(im, (o.x + (o.w - dw) / 2) * sc, (o.y + (o.h - dh) / 2) * sc, dw * sc, dh * sc); }
    }
  }
}
