// GoodNotes-Export (.goodnotes) mit echten, bearbeitbaren Strichen.
// Eigene Implementierung auf Basis der dokumentierten Formatfakten (inkterop, goodnotes-codec: MIT; goodparse-README)
// und eines Vergleichs mit einer echten, von GoodNotes erzeugten Datei (Schema 24). Es wurde KEIN Code übernommen.
import { zipSync } from 'fflate';
import type { RPage } from './render';

// msg = [[Feldnummer, Typ, Wert], ...]; Typ: v=varint, s=Bytes/Text/Nachricht, f=float32, d=float64
type Field = [number, 'v' | 's' | 'f' | 'd', any];
type Msg = Field[];

const te = new TextEncoder();
function varint(n: bigint | number, out: number[]) {
  let v = BigInt.asUintN(64, BigInt(n));
  while (v >= 0x80n) { out.push(Number(v & 0x7fn) | 0x80); v >>= 7n; }
  out.push(Number(v));
}
function encode(msg: Msg): Uint8Array {
  const out: number[] = [];
  for (const [num, type, val] of msg) {
    if (type === 'v') { varint(num << 3, out); varint(val, out); }
    else if (type === 'f') { varint((num << 3) | 5, out); const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, val, true); out.push(...b); }
    else if (type === 'd') { varint((num << 3) | 1, out); const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, val, true); out.push(...b); }
    else {
      const bytes: Uint8Array = typeof val === 'string' ? te.encode(val) : Array.isArray(val) ? encode(val) : val;
      varint((num << 3) | 2, out); varint(bytes.length, out);
      for (let i = 0; i < bytes.length; i++) out.push(bytes[i]);
    }
  }
  return Uint8Array.from(out);
}
function concat(arrs: Uint8Array[]) { const o = new Uint8Array(arrs.reduce((a, b) => a + b.length, 0)); let p = 0; for (const a of arrs) { o.set(a, p); p += a.length; } return o; }
function delimited(msgs: Msg[]) {
  const parts: Uint8Array[] = [];
  for (const m of msgs) { const b = encode(m); const h: number[] = []; varint(b.length, h); parts.push(Uint8Array.from(h), b); }
  return concat(parts);
}

// bv41-Rahmen mit unkomprimierten LZ4-Blöcken (nur Literale – gültiges LZ4)
function bv41(body: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  const CH = 32768;
  for (let i = 0; i < Math.max(body.length, 1); i += CH) {
    const chunk = body.subarray(i, i + CH), n = chunk.length;
    const head: number[] = [];
    if (n < 15) head.push(n << 4); else { head.push(0xf0); let r = n - 15; while (r >= 255) { head.push(255); r -= 255; } head.push(r); }
    const payload = concat([Uint8Array.from(head), chunk]);
    const hdr = new Uint8Array(12); hdr.set(te.encode('bv41'), 0);
    new DataView(hdr.buffer).setUint32(4, n, true); new DataView(hdr.buffer).setUint32(8, payload.length, true);
    parts.push(hdr, payload);
  }
  parts.push(te.encode('bv4$'));
  return concat(parts);
}

// Kugelschreiber: "vuA(v)A(S(uu))A(S(uuuu))vA(f)" – Dicke, Befehle (0 move, 1 quad), moves, quads (cx cy x y)
const BALL_SIG = 'vuA(v)A(S(uu))A(S(uuuu))vA(f)';
function ballGeometry(pts: [number, number][], thickness: number): Uint8Array {
  const kinds: number[] = [0], quads: number[][] = [];
  const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (pts.length === 1) { kinds.push(1); quads.push([pts[0][0], pts[0][1], pts[0][0] + 0.01, pts[0][1]]); }
  else if (pts.length === 2) { kinds.push(1); const m = mid(pts[0], pts[1]); quads.push([m[0], m[1], pts[1][0], pts[1][1]]); }
  else {
    const first = mid(pts[0], pts[1]); const c0 = mid(pts[0], first);
    kinds.push(1); quads.push([c0[0], c0[1], first[0], first[1]]);
    for (let i = 1; i < pts.length - 1; i++) {
      const end = i === pts.length - 2 ? pts[i + 1] : mid(pts[i], pts[i + 1]);
      kinds.push(1); quads.push([pts[i][0], pts[i][1], end[0], end[1]]);
    }
  }
  const sig = te.encode(BALL_SIG + '\0');
  const size = 2 + 4 + 4 + kinds.length * 2 + 4 + 8 + 4 + quads.length * 16 + 2 + 4;
  const body = new Uint8Array(8 + sig.length + size); const dv = new DataView(body.buffer);
  body.set(te.encode('tpl\0'), 0); dv.setUint32(4, body.length, true); body.set(sig, 8);
  let o = 8 + sig.length;
  const u16 = (v: number) => { dv.setUint16(o, v, true); o += 2; };
  const u32 = (v: number) => { dv.setUint32(o, v, true); o += 4; };
  const f32 = (v: number) => { dv.setFloat32(o, v, true); o += 4; };
  u16(2); f32(thickness);
  u32(kinds.length); kinds.forEach(u16);
  u32(1); f32(pts[0][0]); f32(pts[0][1]);
  u32(quads.length); quads.forEach((q) => q.forEach(f32));
  u16(1); u32(0);
  return bv41(body);
}

const rnd32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
const uuid = () => crypto.randomUUID().toUpperCase();
const stamp = (n = 1): Msg => [[1, 'v', n], [2, 'v', rnd32()]];
function uuidPlusOne(u: string) {
  const n = (BigInt('0x' + u.replace(/-/g, '')) + 1n) % (1n << 128n);
  const h = n.toString(16).toUpperCase().padStart(32, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const KEYS = '!-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';
function keyAfter(a: string) {
  let out = '';
  for (let i = 0; ; i++) {
    const ia = i < a.length ? KEYS.indexOf(a[i]) : 0;
    if (KEYS.length - ia > 1) return out + KEYS[Math.floor((ia + KEYS.length) / 2)];
    out += i < a.length ? a[i] : KEYS[0];
  }
}
function rgba(hex: string, alpha = 1): Msg {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
  return c.map((v, i) => [i + 1, 'f', v] as Field).filter(([, , v]) => v);
}

const GN = 11 / 6; // GoodNotes-Einheiten pro PDF-Punkt

export interface GnOptions { title: string; pages: RPage[]; backgroundPdf: Uint8Array; thumbnail?: Uint8Array | null; ink: string }

export function buildGoodnotes(o: GnOptions): Uint8Array {
  const W = o.pages[0].w * GN, H = o.pages[0].h * GN;
  const device = BigInt.asUintN(62, (BigInt(rnd32()) << 32n) | BigInt(rnd32()));
  let clock = Date.now() - 2000; const tick = () => ++clock;
  const time = () => Date.now() + Math.random();
  const docId = uuid();
  const files: Record<string, Uint8Array> = {};
  const ev: Msg[] = [];

  ev.push([[1, 's', docId], [30, 's', [
    [1, 's', docId],
    [2, 's', [[1, 's', o.title], [2, 's', stamp()]]],
    [3, 's', [[1, 's', '5A53E89E-F4C2-4548-8DD3-E9DF9FB4592E'], [2, 's', stamp()]]],
    [6, 's', [[1, 's', 'P'], [2, 's', stamp()]]],
    [7, 's', [[1, 's', '5A53E89E-F4C2-4548-8DD3-E9DF9FB4592E'], [2, 's', stamp()]]],
    [9, 's', 'de_DE'], [10, 'd', time()], [11, 's', uuid()], [13, 'v', device], [14, 'v', tick()],
    [17, 's', ''], [18, 's', ''], [19, 's', [[2, 's', stamp()]]], [20, 'v', 24],
  ]]]);

  const attId = uuid();
  files[`attachments/${attId}`] = o.backgroundPdf;
  ev.push([[1, 's', attId], [6, 's', [
    [1, 's', attId], [2, 's', attId], [5, 'v', o.backgroundPdf.length], [6, 's', docId],
    [10, 'd', time()], [11, 's', uuid()], [12, 's', [[1, 'v', 1], [2, 'v', 1]]],
    [14, 'v', device], [15, 'v', tick()], [16, 'v', 24],
  ]]]);

  const layerId = uuid();
  ev.push([[1, 's', layerId], [2, 's', [
    [1, 's', docId], [2, 's', layerId], [4, 's', attId], [5, 'v', 1], [6, 'v', 1], [7, 'f', 29.333334],
    [8, 's', [[1, 'f', W], [2, 'f', H]]],
    [9, 's', `${uuid()}_standard_1_2 - Handschrift`],
    [10, 'd', time()], [11, 's', uuid()],
    [12, 's', [[1, 'f', 29.333334], [2, 's', stamp()]]],
    [13, 's', [[1, 'v', 1], [2, 's', stamp()]]],
    [15, 'v', device], [16, 'v', tick()],
    [17, 's', [[1, 'v', 1], [2, 's', stamp()]]],
    [18, 's', [[1, 's', [[1, 's', [[1, 'f', W * 0.0527], [2, 'f', H * 0.0544]]], [2, 's', [[1, 'f', W * 0.8945], [2, 'f', H * 0.8912]]]]],
      [2, 'f', 28.416668], [3, 'f', 0.9166667], [5, 'v', 1]]],
    [19, 's', [[2, 's', stamp()]]], [21, 'v', 24],
  ]]]);

  const notesIndex: Msg[] = [];
  const pageIds: { entity: string; content: string }[] = [];
  let key = '';
  let seq = 345000 + (rnd32() % 1000);
  o.pages.forEach((page) => {
    const entity = uuid(), content = uuidPlusOne(entity);
    key = keyAfter(key);
    pageIds.push({ entity, content });
    ev.push([[1, 's', entity], [54, 's', [
      [1, 's', docId], [2, 's', entity], [3, 's', [[1, 's', layerId], [2, 's', stamp()]]], [4, 's', [[1, 's', key], [2, 's', stamp()]]],
      [10, 'd', time()], [11, 's', uuid()], [13, 'v', device], [14, 'v', tick()], [15, 'v', 24],
      [17, 's', [[1, 's', [[2, 's', [[1, 's', [[1, 'f', 0.8666667], [2, 'f', 0.8666667], [3, 'f', 0.8666667], [4, 'f', 1]]], [2, 's', [[1, 'f', 1], [2, 'f', 1], [3, 'f', 1], [4, 'f', 1]]]]]]], [2, 's', stamp()]]],
    ]]]);

    const recs: Msg[] = [];
    let idx = 0;
    const emit = (pts: [number, number][], widthGn: number, color: Msg, highlighter: boolean) => {
      if (!pts.length) return;
      const id = uuid(), st = stamp(2);
      recs.push([[1, 's', id], [2, 's', st], [8, 'v', device], [9, 'v', ++seq], [14, 'v', 5381], [16, 'v', 24]]);
      const body: Msg = [[1, 's', id], [2, 's', ballGeometry(pts, widthGn)]];
      body.push([4, 's', color]);
      if (highlighter) body.push([5, 'v', 1]);
      body.push([6, 's', ''], [7, 's', [[1, 's', [[1, 'v', ++idx], [2, 'v', rnd32()]]]]], [9, 's', ''], [15, 's', st], [20, 's', ''], [21, 'v', 24]);
      recs.push([[7, 's', body]]);
    };
    for (const m of page.marks) if (m.kind === 'highlight') {
      const y = (m.y + m.h / 2) * GN;
      emit([[m.x * GN, y], [(m.x + m.w) * GN, y]], m.h * GN, rgba(m.color, 0.45), true);
    }
    for (const s of page.strokes) {
      const pts = s.pts.map(([x, y]) => [x * GN, y * GN] as [number, number]);
      const meanW = s.pts.reduce((a, p) => a + p[2], 0) / s.pts.length;
      emit(pts, Math.max(0.3, meanW * GN), rgba(s.color), false);
    }
    notesIndex.push([[1, 's', content], [2, 's', `notes/${content}`]]);
    files[`notes/${content}`] = delimited(recs);
  });

  ev.push([[1, 's', docId], [10, 's', [
    [1, 's', docId], [2, 's', pageIds[0].entity], [3, 's', `PagingViewServiceUpdater:${uuid()}`],
    [10, 'd', time()], [11, 's', uuid()], [13, 'v', device], [14, 'v', tick()], [15, 'v', 24],
  ]]]);
  pageIds.forEach((p, i) => {
    ev.push([[1, 's', p.content], [104, 's', [
      [1, 's', docId], [2, 's', p.content], [10, 'd', time()], [11, 's', uuid()], [13, 's', 'de_DE'], [14, 'v', 1],
      [15, 's', uuid()], [17, 'v', device], [18, 'v', tick()], [19, 'v', 24]]]]);
    ev.push([[1, 's', p.content], [105, 's', [
      [1, 'v', i + 1], [2, 's', docId], [4, 's', p.content], [6, 's', 'de_DE'], [10, 'd', time()], [11, 's', uuid()],
      [13, 'v', device], [14, 'v', tick()], [15, 'v', 24]]]]);
    ev.push([[1, 's', p.content], [102, 's', [
      [1, 's', p.content], [10, 'd', time()], [11, 's', uuid()], [13, 'v', device], [14, 'v', tick()], [15, 'v', 24], [16, 's', docId]]]]);
  });
  ev.push([[1, 's', docId], [31, 's', [
    [1, 's', docId], [2, 's', [[1, 's', o.title], [2, 's', stamp(2)]]],
    [10, 'd', time()], [11, 's', uuid()], [13, 'v', device], [14, 'v', tick()], [15, 'v', 24]]]]);

  files['index.search.pb'] = new Uint8Array(0);
  files['document.info.pb'] = new Uint8Array(0);
  files['index.notes.pb'] = delimited(notesIndex);
  files['index.events.pb'] = delimited(ev);
  files['index.attachments.pb'] = delimited([[[1, 's', attId], [2, 's', `attachments/${attId}`]]]);
  files['schema.pb'] = Uint8Array.from([0x08, 0x18]);
  if (o.thumbnail) files['thumbnail.jpg'] = o.thumbnail;
  return zipSync(files, { level: 6 });
}
