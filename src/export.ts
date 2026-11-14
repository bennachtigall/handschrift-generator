import { PDFDocument, StandardFonts, rgb, LineCapStyle, type PDFPage } from 'pdf-lib';
import { zipSync } from 'fflate';
import { drawOps, getImage, type Op } from './paper';
import { drawPage, type Rendered, type RPage } from './render';
import { buildGoodnotes } from './goodnotes';

const hexRgb = (h: string) => { const n = parseInt(h.replace('#', ''), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const dataBytes = (url: string) => { const b = atob(url.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };

async function paperToPdf(doc: PDFDocument, page: PDFPage, ops: Op[], H: number) {
  for (const o of ops) {
    if (o.t === 'rect') page.drawRectangle({ x: o.x, y: H - o.y - o.h, width: o.w, height: o.h, color: hexRgb(o.fill) });
    else if (o.t === 'line') page.drawLine({ start: { x: o.x1, y: H - o.y1 }, end: { x: o.x2, y: H - o.y2 }, thickness: o.width, color: hexRgb(o.color) });
    else if (o.t === 'dot') page.drawCircle({ x: o.x, y: H - o.y, size: o.r, color: hexRgb(o.color) });
    else if (o.t === 'image') {
      const bytes = dataBytes(o.src);
      const img = o.src.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const r = Math.max(o.w / img.width, o.h / img.height), dw = img.width * r, dh = img.height * r;
      page.drawImage(img, { x: o.x + (o.w - dw) / 2, y: H - o.y - o.h + (o.h - dh) / 2, width: dw, height: dh });
    }
  }
}

async function inkToPdf(doc: PDFDocument, page: PDFPage, p: RPage) {
  const H = p.h;
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const m of p.marks) if (m.kind === 'highlight') page.drawRectangle({ x: m.x, y: H - m.y - m.h, width: m.w, height: m.h, color: hexRgb(m.color), opacity: 0.4 });
  for (const s of p.strokes) {
    const col = hexRgb(s.color);
    if (s.pts.length === 1) { page.drawCircle({ x: s.pts[0][0], y: H - s.pts[0][1], size: s.pts[0][2] / 2, color: col }); continue; }
    // Abschnitte gleicher (quantisierter) Breite zu einem Pfad zusammenfassen
    const q = (a: number[], b: number[]) => Math.round((a[2] + b[2]) / 2 / 0.08) * 0.08;
    let i = 1;
    while (i < s.pts.length) {
      const wq = q(s.pts[i - 1], s.pts[i]);
      let d = `M ${s.pts[i - 1][0].toFixed(2)} ${s.pts[i - 1][1].toFixed(2)}`;
      let j = i;
      while (j < s.pts.length && q(s.pts[j - 1], s.pts[j]) === wq) { d += ` L ${s.pts[j][0].toFixed(2)} ${s.pts[j][1].toFixed(2)}`; j++; }
      page.drawSvgPath(d, { x: 0, y: H, borderColor: col, borderWidth: Math.max(0.2, wq), borderLineCap: LineCapStyle.Round });
      i = j;
    }
  }
  for (const m of p.marks) if (m.kind === 'missing') {
    page.drawRectangle({ x: m.x, y: H - m.y - m.h, width: Math.max(m.w, 6), height: m.h, borderColor: hexRgb('#ff3b30'), borderWidth: 0.7, borderDashArray: [3, 2] });
    try { page.drawText(m.ch ?? '?', { x: m.x + 1.5, y: H - m.y - m.h * 0.72, size: m.h * 0.6, font, color: hexRgb('#ff3b30') }); } catch { /* Zeichen nicht in Helvetica */ }
  }
}

export async function makePdf(r: Rendered, withPaper: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const p of r.pages) {
    const page = doc.addPage([p.w, p.h]);
    if (withPaper) await paperToPdf(doc, page, r.paper.ops, p.h);
    await inkToPdf(doc, page, p);
  }
  return doc.save();
}

export async function paperOnlyPdf(r: Rendered, withPaper: boolean): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const p = r.pages[0];
  const page = doc.addPage([p.w, p.h]);
  if (withPaper) await paperToPdf(doc, page, r.paper.ops, p.h);
  else page.drawRectangle({ x: 0, y: 0, width: p.w, height: p.h, color: rgb(1, 1, 1) });
  return doc.save();
}

export async function pageCanvas(r: Rendered, i: number, pxPerPt: number, withPaper: boolean): Promise<HTMLCanvasElement> {
  const p = r.pages[i];
  const c = document.createElement('canvas');
  c.width = Math.round(p.w * pxPerPt); c.height = Math.round(p.h * pxPerPt);
  const ctx = c.getContext('2d')!;
  if (withPaper) {
    for (const o of r.paper.ops) if (o.t === 'image') await getImage(o.src);
    drawOps(ctx, r.paper.ops, pxPerPt);
  }
  drawPage(ctx, p, pxPerPt);
  return c;
}
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob>((res) => c.toBlob((b) => res(b!), type, q));

export async function makePngs(r: Rendered, withPaper: boolean): Promise<Blob[]> {
  const out: Blob[] = [];
  for (let i = 0; i < r.pages.length; i++) out.push(await toBlob(await pageCanvas(r, i, 300 / 72, withPaper), 'image/png'));
  return out;
}

export async function makeGoodnotes(r: Rendered, withPaper: boolean, title: string): Promise<Uint8Array> {
  const bg = await paperOnlyPdf(r, withPaper);
  const tc = await pageCanvas(r, 0, 0.5, true);
  const tb = new Uint8Array(await (await toBlob(tc, 'image/jpeg', 0.8)).arrayBuffer());
  return buildGoodnotes({ title, pages: r.pages, backgroundPdf: bg, thumbnail: tb, ink: r.ink });
}

export async function deliver(files: File[]) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files })) {
    try { await nav.share({ files }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  for (const f of files) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 20000);
  }
}
export const zipFiles = async (blobs: { name: string; blob: Blob }[]) => {
  const obj: Record<string, Uint8Array> = {};
  for (const b of blobs) obj[b.name] = new Uint8Array(await b.blob.arrayBuffer());
  return zipSync(obj, { level: 0 });
};
