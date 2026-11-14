import type { Stroke, Variant, Pt } from './types';
import { ON_BASELINE } from './charset';

// Rohe Striche (x-Höhen, relativ zum Feld) → normalisierter Glyph:
// linke Tintenkante = 0, Grundlinie automatisch geradegerückt (bei Zeichen, die auf der Linie sitzen).
export function makeVariant(strokes: Stroke[], key: string): Variant | null {
  const sts = strokes.filter((s) => s.pts.length > 0);
  if (!sts.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of sts) for (const [x, y] of s.pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  let dy = 0;
  const single = [...key].length === 1;
  if (single && ON_BASELINE.has(key) && Math.abs(maxY) < 0.45) dy = -maxY;
  else if (!single && Math.abs(maxY) < 0.45) dy = -maxY; // Paare ohne Unterlänge
  const out: Stroke[] = sts.map((s) => ({ pts: s.pts.map(([x, y, p]): Pt => [round(x - minX), round(y + dy), p]) }));
  return { strokes: out, w: round(maxX - minX), top: round(minY + dy), bottom: round(maxY + dy) };
}
const round = (v: number) => Math.round(v * 1000) / 1000;

// Punkte ausdünnen (sehr dichte Pencil-Samples)
export function thin(pts: Pt[], minDist: number): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const l = out[out.length - 1];
    if (Math.hypot(pts[i][0] - l[0], pts[i][1] - l[1]) >= minDist) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
