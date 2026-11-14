import type { Profile, Stroke, Pt } from './types';
import { GROUPS, DEFAULT_PAIRS, MIN_VARIANTS, MAX_VARIANTS } from './charset';
import { makeVariant, thin } from './glyph';
import { h, askText, confirmBox, toast, debounce } from './util';

const U = 56; // Pixel pro x-Höhe im Schreibfeld
const BASE = 2.6 * U;
const SPACE = ' ';

export interface TplHost {
  profile: () => Profile;
  changed: () => void; // Profil wurde verändert (speichern + Vorschau)
}

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

class Field {
  el: HTMLElement; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D;
  strokes: Stroke[] = []; private cur: Pt[] | null = null; private pid = -1;
  constructor(private key: string, private idx: number, private onChange: (i: number, s: Stroke[]) => void) {
    const wU = key === SPACE ? 6 : key.length === 1 ? 3.6 : 1.9 * key.length + 0.8;
    this.canvas = h('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = wU * U * dpr; this.canvas.height = 4.2 * U * dpr;
    this.canvas.style.width = wU * U + 'px'; this.canvas.style.height = 4.2 * U + 'px';
    this.ctx = this.canvas.getContext('2d')!; this.ctx.scale(dpr, dpr);
    const undo = h('button', { class: 'btn sm', onclick: () => { this.strokes.pop(); this.draw(); this.onChange(this.idx, this.strokes); } }, '↶ Rückgängig');
    const clear = h('button', { class: 'btn sm', onclick: () => { this.strokes = []; this.draw(); this.onChange(this.idx, this.strokes); } }, 'Neu schreiben');
    this.el = h('div', { class: 'fbox' }, h('div', { class: 'pill' }, key === SPACE ? 'Leerzeichen – waagerechten Strich in Wortabstand ziehen' : `Variante ${idx + 1}`), this.canvas, h('div', { class: 'row' }, undo, clear));
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.up(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    this.draw();
  }
  private pt(e: PointerEvent): Pt {
    const r = this.canvas.getBoundingClientRect();
    const p = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    return [(e.clientX - r.left) / U, (e.clientY - r.top - BASE) / U, p];
  }
  private down(e: PointerEvent) {
    if (e.pointerType === 'touch') return; // Finger/Handballen ignorieren
    e.preventDefault();
    this.pid = e.pointerId; this.canvas.setPointerCapture(e.pointerId);
    this.cur = [this.pt(e)]; this.strokes.push({ pts: this.cur }); this.draw();
  }
  private move(e: PointerEvent) {
    if (!this.cur || e.pointerId !== this.pid) return;
    e.preventDefault();
    const evs = (e as any).getCoalescedEvents?.() as PointerEvent[] | undefined;
    for (const ce of evs?.length ? evs : [e]) this.cur.push(this.pt(ce));
    this.draw();
  }
  private up(e: PointerEvent) {
    if (!this.cur || e.pointerId !== this.pid) return;
    const s = this.strokes[this.strokes.length - 1];
    s.pts = thin(this.cur, 0.012); this.cur = null; this.pid = -1;
    this.draw(); this.onChange(this.idx, this.strokes);
  }
  setStrokes(s: Stroke[]) { this.strokes = s; this.draw(); }
  draw() {
    const { ctx } = this, w = this.canvas.width, hgt = this.canvas.height; // wegen scale: Zeichenflächen in CSS-Pixeln
    const cw = parseFloat(this.canvas.style.width), ch = parseFloat(this.canvas.style.height);
    ctx.clearRect(0, 0, w, hgt);
    const line = (y: number, color: string, wd: number, dash: number[] = []) => { ctx.strokeStyle = color; ctx.lineWidth = wd; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); };
    const sub = css('--line');
    line(BASE - 2 * U, sub, 1, [6, 5]);            // Oberlänge
    line(BASE - U, sub, 1.5, [2, 5]);              // Mittellinie
    line(BASE, '#e0605a', 2);                      // Grundlinie
    line(BASE + U, sub, 1, [6, 5]);                // Unterlänge
    ctx.setLineDash([]);
    ctx.fillStyle = sub; ctx.font = '11px -apple-system, sans-serif';
    ctx.fillText('Oberlänge', 6, BASE - 2 * U - 4); ctx.fillText('Mittellinie', 6, BASE - U - 4); ctx.fillText('Grundlinie', 6, BASE - 4); ctx.fillText('Unterlänge', 6, BASE + U - 4);
    ctx.strokeStyle = css('--text'); ctx.fillStyle = css('--text'); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    void ch;
    for (const s of this.strokes) {
      const p = s.pts;
      if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0] * U, BASE + p[0][1] * U, 2.2, 0, 7); ctx.fill(); continue; }
      for (let i = 1; i < p.length; i++) {
        ctx.lineWidth = 1.2 + 3.4 * ((p[i][2] + p[i - 1][2]) / 2);
        ctx.beginPath(); ctx.moveTo(p[i - 1][0] * U, BASE + p[i - 1][1] * U); ctx.lineTo(p[i][0] * U, BASE + p[i][1] * U); ctx.stroke();
      }
    }
  }
}

export function createTemplateView(host: TplHost) {
  const root = h('div', { class: 'tpl' });
  const list = h('div', { class: 'tpl-list card' });
  const edit = h('div', { class: 'tpl-edit card' });
  root.append(list, edit);
  let sel = 'a';
  let drafts: Stroke[][] = [];
  let fields: Field[] = [];

  const pairKeys = () => {
    const extra = Object.keys(host.profile().glyphs).filter((k) => k.length > 1 && !DEFAULT_PAIRS.includes(k));
    return [...DEFAULT_PAIRS, ...extra];
  };
  const count = (k: string) => (k === SPACE ? (host.profile().spaceWidth ? 3 : 0) : host.profile().glyphs[k]?.length ?? 0);
  const allKeys = () => GROUPS.flatMap((g) => g.chars);

  const persist = debounce(() => host.changed(), 250);

  function renderList() {
    const p = host.profile();
    const keys = allKeys();
    const done = keys.filter((k) => count(k) >= MIN_VARIANTS).length;
    const usable = keys.filter((k) => count(k) >= 1).length;
    list.replaceChildren(
      h('div', { class: 'row' }, h('b', {}, 'Fortschritt'), h('span', { class: 'spacer' }), h('span', { class: 'pill' }, `${done} von ${keys.length} fertig · ${usable} nutzbar`)),
      h('div', { class: 'prog' }, h('i', { class: 'b', style: { width: (usable / keys.length) * 100 + '%', opacity: '.45' } }), h('i', { style: { width: (done / keys.length) * 100 + '%' } })),
      h('p', { class: 'pill' }, `Mindestens ${MIN_VARIANTS} Varianten pro Zeichen (grün). Schon 1 Variante ist nutzbar (orange).`),
    );
    const mkCell = (k: string, label = k) => {
      const n = count(k);
      const dots = h('small', {}, ...Array.from({ length: MIN_VARIANTS }, (_, i) => h('i', { class: i < n ? 'f' : '' })));
      return h('button', { class: `cell${k === sel ? ' sel' : ''}${n > 0 && n < MIN_VARIANTS ? ' part' : ''}`, 'aria-label': `Zeichen ${label}`, style: label.length > 2 ? { fontSize: '16px' } : {}, onclick: () => select(k) }, label, dots);
    };
    for (const g of GROUPS) list.append(h('h3', {}, g.title), h('div', { class: 'grid' }, ...g.chars.map((c) => mkCell(c))));
    const pk = pairKeys();
    list.append(
      h('h3', {}, 'Buchstabenpaare (optional)'),
      h('p', { class: 'pill' }, 'Werden beim Schreiben bevorzugt und wirken natürlicher.'),
      h('div', { class: 'grid' }, ...pk.map((k) => mkCell(k)), h('button', { class: 'cell', 'aria-label': 'Paar hinzufügen', onclick: addPair }, '+')),
      h('h3', {}, 'Leerzeichen'),
      h('div', { class: 'grid' }, mkCell(SPACE, '␣')),
    );
    void p;
  }

  async function addPair() {
    const v = await askText('Neues Buchstabenpaar', '', 'z. B. ft, eit, sp');
    if (!v) return;
    if ([...v].length < 2 || [...v].length > 3 || v.includes(' ')) { toast('Bitte 2 oder 3 Zeichen ohne Leerzeichen.'); return; }
    host.profile().glyphs[v] ??= [];
    select(v);
  }

  function select(k: string) {
    sel = k;
    const p = host.profile();
    drafts = k === SPACE ? [] : (p.glyphs[k] ?? []).map((v) => v.strokes.map((s) => ({ pts: s.pts.map(([x, y, pr]): Pt => [x + 0.6, y, pr]) })));
    renderList(); renderEdit();
  }

  function onField(i: number, strokes: Stroke[]) {
    const p = host.profile();
    drafts[i] = strokes;
    if (sel === SPACE) {
      let min = Infinity, max = -Infinity;
      for (const s of strokes) for (const [x] of s.pts) { min = Math.min(min, x); max = Math.max(max, x); }
      if (isFinite(min) && max - min > 0.1) { p.spaceWidth = Math.round((max - min) * 100) / 100; toast(`Leerzeichen = ${p.spaceWidth.toFixed(2)} x-Höhen`, 1400); }
    } else {
      const vs = drafts.map((d) => makeVariant(shiftBack(d), sel)).filter((v) => v !== null) as NonNullable<ReturnType<typeof makeVariant>>[];
      if (vs.length) p.glyphs[sel] = vs; else if (sel.length === 1) delete p.glyphs[sel]; else p.glyphs[sel] = [];
    }
    persist(); renderList(); updateHead();
  }
  const shiftBack = (d: Stroke[]): Stroke[] => d; // Feldkoordinaten werden in makeVariant normalisiert

  let head: HTMLElement;
  function updateHead() {
    if (!head) return;
    const n = count(sel);
    head.querySelector('.cnt')!.textContent = sel === SPACE ? `Breite: ${host.profile().spaceWidth.toFixed(2)} x-Höhen` : `${n} von ${MIN_VARIANTS}+ Varianten`;
  }

  function renderEdit() {
    const p = host.profile();
    const keys = [...allKeys(), ...pairKeys()];
    const pos = keys.indexOf(sel);
    const nSlots = sel === SPACE ? 1 : Math.min(MAX_VARIANTS, Math.max(MIN_VARIANTS, drafts.filter((d) => d.length).length + 1));
    fields = [];
    const fbox = h('div', { class: 'fields' }, h('div', { class: 'ghost-char' }, sel === SPACE ? '␣' : sel));
    for (let i = 0; i < nSlots; i++) {
      const f = new Field(sel, i, (idx, s) => { onField(idx, s); if (s.length && idx === fields.length - 1 && fields.length < MAX_VARIANTS && sel !== SPACE) renderEditKeep(); });
      if (sel === SPACE && p.spaceWidth) f.setStrokes([{ pts: [[0.6, 0, 0.5], [0.6 + p.spaceWidth, 0, 0.5]] }]);
      else f.setStrokes(drafts[i] ?? []);
      fields.push(f); fbox.append(f.el);
    }
    head = h('div', { class: 'row' },
      h('h2', { style: { margin: '0' } }, sel === SPACE ? 'Leerzeichen' : `Zeichen „${sel}“`),
      h('span', { class: 'pill cnt' }, ''), h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', disabled: pos <= 0, onclick: () => select(keys[pos - 1]) }, '‹ Zurück'),
      h('button', { class: 'btn sm primary', disabled: pos < 0 || pos >= keys.length - 1, onclick: () => select(keys[pos + 1]) }, 'Weiter ›'),
    );
    const tools = h('div', { class: 'row' },
      h('button', { class: 'btn sm danger', onclick: async () => {
        if (!(await confirmBox('Zeichen löschen', `Alle Varianten von „${sel}“ löschen?`))) return;
        if (sel === SPACE) host.profile().spaceWidth = 0.7; else delete host.profile().glyphs[sel];
        persist(); select(sel);
      } }, 'Alle Varianten löschen'),
      h('span', { class: 'pill' }, 'Schreibe mit dem Apple Pencil in die Felder. Finger werden ignoriert. Die Grundlinie (rot) ist wichtig.'));
    edit.replaceChildren(head, fbox, tools);
    updateHead();
  }
  // Nach dem Beschreiben des letzten Feldes ein weiteres Feld anbieten, ohne die Felder neu zu zeichnen
  function renderEditKeep() {
    const wrap = edit.querySelector('.fields') as HTMLElement;
    const i = fields.length;
    if (i >= MAX_VARIANTS) return;
    const f = new Field(sel, i, (idx, s) => { onField(idx, s); if (s.length && idx === fields.length - 1 && fields.length < MAX_VARIANTS) renderEditKeep(); });
    fields.push(f); wrap.append(f.el);
  }

  function refresh() { if (!allKeys().includes(sel) && !pairKeys().includes(sel) && sel !== SPACE) sel = 'a'; select(sel); }
  refresh();
  return { el: root, refresh };
}
