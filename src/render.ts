import type { Profile, Settings, Variant } from './types';
import { MM, pageSize, paperDef, type PaperDef } from './paper';

export interface RStroke { pts: [number, number, number][]; color: string; alpha?: number } // x,y,Breite in pt
export interface Mark { kind: 'highlight' | 'missing'; x: number; y: number; w: number; h: number; color: string; ch?: string }
export interface RPage { w: number; h: number; strokes: RStroke[]; marks: Mark[] }
export interface Rendered { pages: RPage[]; paper: PaperDef; missing: string[]; ink: string }

// ---------- Zufall (reproduzierbar, pro Zeichen-Index) ----------
function hash(seed: number, a: number, b: number) {
  let h = (seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const rs = (seed: number, a: number, b: number) => hash(seed, a, b) * 2 - 1; // -1..1
function vnoise(seed: number, a: number, t: number) { // glatter 1D-Wertrauschen -1..1
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  return rs(seed, a, i) * (1 - u) + rs(seed, a, i + 1) * u;
}

// ---------- Markup: **unterstrichen**, ==Textmarker== ----------
interface Ch { c: string; u: boolean; h: boolean }
export function parseMarkup(text: string): Ch[] {
  const out: Ch[] = []; let u = false, h = false;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('**', i)) { u = !u; i++; continue; }
    if (text.startsWith('==', i)) { h = !h; i++; continue; }
    out.push({ c: text[i], u, h });
  }
  return out;
}

interface Cell { text: string; v: Variant | null; gi: number; u: boolean; h: boolean; x: number; w: number; space?: boolean }
interface Line { cells: Cell[]; width: number }

export function render(text: string, profile: Profile, s: Settings): Rendered {
  const paper = paperDef(s);
  const { w: W, h: H } = pageSize(s);
  const sc = s.xh * MM;
  const left = Math.max(s.marginL * MM, paper.minLeft), right = W - s.marginR * MM;
  const avail = Math.max(sc * 4, right - left);
  const ink = s.customColor ? s.color : (s.paper === 'dunkel' ? paper.defaultInk : s.color);
  const chars = parseMarkup(text.replace(/\r/g, '').replace(/\t/g, '  '));
  const missing = new Set<string>();
  const lastVar = new Map<string, number>();

  const pick = (key: string, gi: number): Variant | null => {
    const vs = profile.glyphs[key];
    if (!vs || !vs.length) return null;
    let i = Math.floor(hash(s.seed, gi, 1) * vs.length);
    if (vs.length > 1 && lastVar.get(key) === i) i = (i + 1 + Math.floor(hash(s.seed, gi, 2) * (vs.length - 1))) % vs.length;
    lastVar.set(key, i);
    return vs[i];
  };
  const adv = (v: Variant | null) => (v ? v.w * sc : 0.8 * sc);

  // Wörter bilden (Zellen), Paare bevorzugt
  const lines: Line[][] = []; // pro Absatz: Zeilen
  let gi = 0;
  const paras: Ch[][] = [[]];
  for (const c of chars) { if (c.c === '\n') paras.push([]); else paras[paras.length - 1].push(c); }
  const spaceW = profile.spaceWidth * sc * s.wordSpacing;
  for (const para of paras) {
    const pl: Line[] = [];
    let cur: Line = { cells: [], width: 0 };
    let i = 0;
    while (i < para.length) {
      if (para[i].c === ' ') {
        const cell: Cell = { text: ' ', v: null, gi: gi++, u: para[i].u, h: para[i].h, x: 0, w: spaceW * (1 + 0.08 * rs(s.seed, gi, 9)), space: true };
        if (cur.cells.length) { cur.cells.push(cell); cur.width += cell.w; }
        i++; continue;
      }
      // Wort einsammeln
      const wordCells: Cell[] = [];
      while (i < para.length && para[i].c !== ' ') {
        let used = 1, key = para[i].c;
        if (s.usePairs) {
          for (const n of [3, 2]) {
            if (i + n <= para.length && !para.slice(i, i + n).some((q) => q.c === ' ')) {
              const k = para.slice(i, i + n).map((q) => q.c).join('');
              if (profile.glyphs[k]?.length) { key = k; used = n; break; }
            }
          }
        }
        const v = pick(key, gi);
        if (!v && used === 1) missing.add(key);
        wordCells.push({ text: key, v, gi: gi, u: para[i].u, h: para[i].h, x: 0, w: adv(v) });
        gi += used; i += used;
      }
      let ww = 0;
      wordCells.forEach((c, k) => { c.x = ww; ww += c.w + (k < wordCells.length - 1 ? s.letterSpacing * sc : 0); });
      if (cur.width + ww > avail && cur.cells.length) {
        while (cur.cells.length && cur.cells[cur.cells.length - 1].space) { cur.width -= cur.cells.pop()!.w; }
        pl.push(cur); cur = { cells: [], width: 0 };
      }
      if (ww > avail) { // überlanges Wort zeichenweise umbrechen
        let acc: Cell[] = [], aw = 0;
        for (const c of wordCells) {
          if (aw + c.w > avail && acc.length) { pl.push({ cells: acc, width: aw }); acc = []; aw = 0; }
          c.x = aw; acc.push(c); aw += c.w + s.letterSpacing * sc;
        }
        cur = { cells: acc, width: aw };
      } else {
        const base = cur.width;
        for (const c of wordCells) { c.x += base; cur.cells.push(c); }
        cur.width += ww;
      }
    }
    pl.push(cur);
    lines.push(pl);
  }

  // Seiten aufbauen
  const pages: RPage[] = [];
  const newPage = (): RPage => { const p = { w: W, h: H, strokes: [], marks: [] }; pages.push(p); return p; };
  let page = newPage();
  const skip = Math.max(1, Math.round(s.lineSpacing));
  const free = !paper.ruling;
  const lh = free ? Math.max(0.5, s.lineSpacing) * sc : paper.ruling!.step * skip;
  const firstMin = s.marginT * MM + 1.9 * sc;
  let y: number;
  const firstBase = () => {
    if (free) return firstMin;
    const r = paper.ruling!; let yy = r.first;
    while (yy < firstMin) yy += r.step * skip;
    return yy;
  };
  y = firstBase();
  const gap = free ? 0 : 0.35 * MM; // Schrift knapp über der Linie
  let lineNo = 0;
  const bottomLimit = H - s.marginB * MM;

  for (const pl of lines) for (const line of pl) {
    if (y + 1.1 * sc > bottomLimit && (page.strokes.length || page.marks.length || lineNo)) { page = newPage(); y = firstBase(); lineNo = 0; }
    emitLine(line, left, y - gap, lineNo);
    y += lh; lineNo++;
  }

  function emitLine(line: Line, x0: number, baseY: number, ln: number) {
    const drift = Math.tan((s.lineDrift * Math.PI) / 180);
    const lineY = (x: number) => baseY + drift * (x - x0) + s.lineWobble * sc * 0.5 * vnoise(s.seed, 5000 + ln, (x - x0) / (9 * sc));
    // Läufe für Markierungen
    let runU: { a: number; b: number } | null = null, runH: { a: number; b: number } | null = null;
    const flushU = () => { if (runU) { underline(runU.a, runU.b, lineY); runU = null; } };
    const flushH = () => { if (runH) { page.marks.push({ kind: 'highlight', x: runH.a, y: lineY(runH.a) - 1.55 * sc, w: runH.b - runH.a, h: 2.35 * sc, color: s.highlightColor }); runH = null; } };
    const tilt = Math.tan((s.slant * Math.PI) / 180);
    for (let k = 0; k < line.cells.length; k++) {
      const c = line.cells[k];
      const cx = x0 + c.x;
      const x1 = cx + c.w + (c.space ? 0 : s.letterSpacing * sc * 0.5);
      if (c.u) runU = runU ? { a: runU.a, b: x1 } : { a: cx, b: x1 }; else flushU();
      if (c.h) runH = runH ? { a: runH.a, b: x1 } : { a: cx, b: x1 }; else flushH();
      if (c.space) continue;
      const by = lineY(cx + c.w / 2);
      if (!c.v) {
        if (s.showMissing) page.marks.push({ kind: 'missing', x: cx, y: by - 1.2 * sc, w: c.w, h: 1.6 * sc, color: '#ff3b30', ch: c.text });
        continue;
      }
      const g = c.gi;
      const size = 1 + s.jitterSize * rs(s.seed, g, 11);
      const rot = (s.jitterRot * rs(s.seed, g, 12) * Math.PI) / 180;
      const dy = s.jitterBase * sc * rs(s.seed, g, 13);
      const dx = s.jitterBase * sc * 0.4 * rs(s.seed, g, 14);
      const cr = Math.cos(rot), sr = Math.sin(rot);
      const pivX = c.v.w / 2;
      c.v.strokes.forEach((st, si) => {
        const out: [number, number, number][] = [];
        st.pts.forEach(([px, py, pr], pi) => {
          // Verzerrung: glattes Rauschen entlang des Strichs
          const nA = vnoise(s.seed, g * 7 + si * 3, pi * 0.3) * s.jitterDistort * 0.07;
          const nB = vnoise(s.seed, g * 7 + si * 3 + 1, pi * 0.3 + 40) * s.jitterDistort * 0.07;
          let ux = px + nA, uy = py + nB;
          ux += tilt * -uy; // Schrägstellung (y nach unten positiv → nach oben nach rechts)
          const rx = (ux - pivX) * size, ry = uy * size;
          const X = cx + dx + (pivX + 0) * sc + (rx * cr - ry * sr) * sc;
          const Y = by + dy + (rx * sr + ry * cr) * sc;
          const wv = s.penWidth * Math.max(0.3, 1 - s.pressure + s.pressure * 2 * Math.min(1, Math.max(0, pr)));
          out.push([X, Y, wv]);
        });
        page.strokes.push({ pts: out, color: ink });
      });
    }
    flushU(); flushH();
  }
  function underline(a: number, b: number, lineY: (x: number) => number) {
    const n = Math.max(3, Math.round((b - a) / (2.5 * sc)));
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= n; i++) { const x = a + ((b - a) * i) / n; pts.push([x, lineY(x) + 0.42 * sc + 0.05 * sc * vnoise(s.seed, 777, i * 0.8), s.penWidth]); }
    page.strokes.push({ pts, color: ink });
  }
  if (pages.length > 1 && !pages[pages.length - 1].strokes.length && !pages[pages.length - 1].marks.length) pages.pop();
  return { pages, paper, missing: [...missing], ink };
}

// ---------- Zeichnen eines gerenderten Seiteninhalts auf Canvas ----------
export function drawPage(ctx: CanvasRenderingContext2D, p: RPage, sc: number, withMarks = true) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const m of p.marks) {
    if (m.kind === 'highlight') { ctx.globalAlpha = 0.4; ctx.fillStyle = m.color; ctx.fillRect(m.x * sc, m.y * sc, m.w * sc, m.h * sc); ctx.globalAlpha = 1; }
  }
  for (const st of p.strokes) {
    ctx.strokeStyle = st.color; ctx.fillStyle = st.color;
    const pts = st.pts;
    if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0] * sc, pts[0][1] * sc, (pts[0][2] * sc) / 2, 0, Math.PI * 2); ctx.fill(); continue; }
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      ctx.lineWidth = ((a[2] + b[2]) / 2) * sc;
      ctx.beginPath(); ctx.moveTo(a[0] * sc, a[1] * sc); ctx.lineTo(b[0] * sc, b[1] * sc); ctx.stroke();
    }
  }
  if (withMarks) for (const m of p.marks) {
    if (m.kind === 'missing') {
      ctx.strokeStyle = m.color; ctx.lineWidth = 1.2 * sc; ctx.setLineDash([3 * sc, 2 * sc]);
      ctx.strokeRect(m.x * sc, m.y * sc, Math.max(m.w, 6) * sc, m.h * sc); ctx.setLineDash([]);
      ctx.fillStyle = m.color; ctx.font = `${Math.max(6, m.h * 0.7) * sc}px -apple-system, sans-serif`; ctx.textBaseline = 'middle';
      ctx.fillText(m.ch ?? '?', (m.x + 1.5) * sc, (m.y + m.h / 2) * sc);
    }
  }
}
