import './style.css';
import { registerSW } from 'virtual:pwa-register';
import type { Profile, Settings, Preset } from './types';
import { allProfiles, saveProfile, deleteProfile, allPresets, savePreset, deletePreset, kvGet, kvSet, newProfile, DEFAULT_SETTINGS, exportBackup, importBackup, uid } from './db';
import { render, drawPage, type Rendered } from './render';
import { PAPERS, paperDef, drawOps, getImage, pageSize } from './paper';
import { createTemplateView } from './template';
import { makePdf, makePngs, makeGoodnotes, deliver, zipFiles } from './export';
import { h, toast, sheet, askText, confirmBox, debounce, pickFile, readText, readDataUrl } from './util';

registerSW({ immediate: true });

const SAMPLE = `Hallo! Das ist ein Test meiner eigenen Handschrift.

Der **Fuchs** springt über den ==faulen Hund==. Zahlen: 0123456789 (und ein paar Zeichen: ?!&%€).

Schön, dass es klappt – ganz ohne Papier und Scanner.`;

let profiles: Profile[] = [];
let profile!: Profile;
let settings: Settings = { ...DEFAULT_SETTINGS };
let text = SAMPLE;
let presets: Preset[] = [];
let mode: 'write' | 'template' = 'write';
let pageIdx = 0;
let zoom = 1;
let rendered: Rendered | null = null;
let withPaperExport = true;

const saveSettings = debounce(() => { void kvSet('settings', settings); }, 300);
const saveText = debounce(() => { void kvSet('text', text); }, 300);

// ---------- Vorschau ----------
const pagesEl = h('div', { class: 'pages' });
const pageInfo = h('span', { class: 'pill' }, '');
const notice = h('div', { class: 'notice', style: { display: 'none' } });
let canvasEl: HTMLCanvasElement | null = null;
let renderToken = 0;

async function refreshPreview() {
  const token = ++renderToken;
  rendered = render(text, profile, settings);
  if (settings.paper === 'bild' && settings.paperImage) { try { await getImage(settings.paperImage); } catch { /* ignorieren */ } }
  if (token !== renderToken) return;
  const r = rendered;
  pageIdx = Math.min(pageIdx, r.pages.length - 1);
  pageInfo.textContent = `Seite ${pageIdx + 1} / ${r.pages.length}`;
  const have = Object.values(profile.glyphs).filter((v) => v.length).length;
  if (!have) { notice.style.display = ''; notice.textContent = 'Noch keine Handschrift vorhanden – wechsle oben zu „Schablone“ und schreibe die Zeichen mit dem Apple Pencil.'; }
  else if (r.missing.length && settings.showMissing) { notice.style.display = ''; notice.textContent = `Noch nicht geschrieben (rot markiert): ${r.missing.slice(0, 24).join(' ')}${r.missing.length > 24 ? ' …' : ''}`; }
  else notice.style.display = 'none';
  drawCurrent();
}
function drawCurrent() {
  if (!rendered) return;
  const p = rendered.pages[pageIdx];
  const avail = pagesEl.clientWidth - 32;
  const availH = pagesEl.clientHeight - 32;
  const fit = Math.min(avail / p.w, availH / p.h);
  const cssW = Math.max(120, p.w * (zoom <= 1 ? fit * zoom : (avail / p.w) * zoom));
  const sc = cssW / p.w;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const c = canvasEl ?? (canvasEl = h('canvas'));
  c.width = Math.round(p.w * sc * dpr); c.height = Math.round(p.h * sc * dpr);
  c.style.width = p.w * sc + 'px'; c.style.height = p.h * sc + 'px';
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.scale(dpr, dpr);
  drawOps(ctx, rendered.paper.ops, sc);
  drawPage(ctx, p, sc);
  if (c.parentElement !== pagesEl) pagesEl.replaceChildren(c);
  pageInfo.textContent = `Seite ${pageIdx + 1} / ${rendered.pages.length}`;
}
const refresh = debounce(() => { void refreshPreview(); }, 60);

// ---------- Regler ----------
interface SliderDef { key: keyof Settings; label: string; min: number; max: number; step: number; unit?: string; dec?: number; dyn?: () => Partial<SliderDef> }
const SLIDERS: Record<string, SliderDef[]> = {
  'Schrift': [
    { key: 'xh', label: 'Schriftgröße (x-Höhe)', min: 1.5, max: 8, step: 0.1, unit: ' mm', dec: 1 },
    { key: 'slant', label: 'Neigung (Slant)', min: -20, max: 30, step: 0.5, unit: '°', dec: 1 },
    { key: 'penWidth', label: 'Strichstärke', min: 0.3, max: 3, step: 0.05, unit: ' pt', dec: 2 },
    { key: 'pressure', label: 'Druckvariation', min: 0, max: 1, step: 0.05, dec: 2 },
  ],
  'Abstände': [
    { key: 'letterSpacing', label: 'Buchstabenabstand', min: -0.4, max: 1, step: 0.01, unit: ' x', dec: 2 },
    { key: 'wordSpacing', label: 'Wortabstand', min: 0.3, max: 2.5, step: 0.05, unit: '×', dec: 2 },
    { key: 'lineSpacing', label: 'Zeilenabstand', min: 1, max: 6, step: 0.1, dec: 1, dyn: () => (paperDef(settings).ruling ? { label: 'Zeilenabstand (Linien pro Zeile)', min: 1, max: 4, step: 1, dec: 0 } : { label: 'Zeilenabstand (Vielfaches der Höhe)', min: 1, max: 6, step: 0.1, dec: 1 }) },
  ],
  'Unsauberkeit': [
    { key: 'jitterBase', label: 'Wackeln auf der Grundlinie', min: 0, max: 0.6, step: 0.01, dec: 2 },
    { key: 'jitterRot', label: 'Rotation der Buchstaben', min: 0, max: 8, step: 0.1, unit: '°', dec: 1 },
    { key: 'jitterSize', label: 'Größenvariation', min: 0, max: 0.3, step: 0.01, dec: 2 },
    { key: 'jitterDistort', label: 'Verzerren der Striche', min: 0, max: 1.5, step: 0.05, dec: 2 },
  ],
  'Zeilen': [
    { key: 'lineDrift', label: 'Ansteigen / Abfallen', min: -5, max: 5, step: 0.1, unit: '°', dec: 1 },
    { key: 'lineWobble', label: 'Zeilen wandern lassen', min: 0, max: 1, step: 0.01, dec: 2 },
  ],
  'Ränder': [
    { key: 'marginL', label: 'Links', min: 5, max: 60, step: 1, unit: ' mm', dec: 0 },
    { key: 'marginR', label: 'Rechts', min: 5, max: 60, step: 1, unit: ' mm', dec: 0 },
    { key: 'marginT', label: 'Oben', min: 5, max: 60, step: 1, unit: ' mm', dec: 0 },
    { key: 'marginB', label: 'Unten', min: 5, max: 60, step: 1, unit: ' mm', dec: 0 },
  ],
};
function defaultFor(key: keyof Settings): number {
  if (key === 'xh') return paperDef(settings).rec.xh;
  if (key === 'lineSpacing') { const d = paperDef(settings); return d.ruling ? d.rec.skip : 3; }
  return DEFAULT_SETTINGS[key] as number;
}
function slider(def0: SliderDef): HTMLElement {
  let def = { ...def0 };
  const input = h('input', { type: 'range' });
  const val = h('b', {});
  const label = h('span', {});
  const fmt = () => { val.textContent = (settings[def.key] as number).toFixed(def.dec ?? 1) + (def.unit ?? ''); };
  const apply = () => {
    if (def0.dyn) def = { ...def0, ...def0.dyn() };
    label.textContent = def.label;
    input.min = String(def.min); input.max = String(def.max); input.step = String(def.step);
    input.value = String(settings[def.key]); fmt();
  };
  input.addEventListener('input', () => { (settings as any)[def.key] = parseFloat(input.value); fmt(); saveSettings(); refresh(); });
  const reset = h('button', { class: 'reset', title: 'Zurücksetzen', 'aria-label': 'Zurücksetzen', onclick: () => { (settings as any)[def.key] = defaultFor(def.key); apply(); saveSettings(); refresh(); } }, '↺');
  const el = h('div', { class: 'ctl' }, h('div', { class: 'lbl' }, label, h('span', { class: 'rr' }, val, reset)), input);
  (el as any).sync = apply;
  apply();
  return el;
}

let syncers: (() => void)[] = [];
function buildSidebar(): HTMLElement {
  syncers = [];
  const side = h('aside', { class: 'side card', id: 'side' });
  const det = (title: string, open: boolean, ...kids: Node[]) => h('details', { open }, h('summary', {}, title), ...kids);

  // Presets
  const presetSel = h('select', { class: 'field' }) as HTMLSelectElement;
  const fillPresets = () => { presetSel.replaceChildren(h('option', { value: '' }, 'Preset wählen …'), ...presets.map((p) => h('option', { value: p.id }, p.name))); };
  fillPresets();
  presetSel.addEventListener('change', () => {
    const p = presets.find((x) => x.id === presetSel.value); if (!p) return;
    settings = { ...DEFAULT_SETTINGS, ...p.settings }; afterSettingsReplaced(); toast(`Preset „${p.name}“ geladen`);
  });
  const presetBox = det('Presets', false,
    presetSel,
    h('div', { class: 'row', style: { marginTop: '8px' } },
      h('button', { class: 'btn sm primary', onclick: async () => {
        const n = await askText('Preset speichern', presets.find((x) => x.id === presetSel.value)?.name ?? '', 'Name');
        if (!n) return;
        const ex = presets.find((x) => x.name === n);
        const p: Preset = ex ? { ...ex, settings: { ...settings } } : { id: uid(), name: n, settings: { ...settings } };
        await savePreset(p); presets = await allPresets(); fillPresets(); presetSel.value = p.id; toast('Preset gespeichert');
      } }, 'Speichern …'),
      h('button', { class: 'btn sm danger', onclick: async () => {
        const p = presets.find((x) => x.id === presetSel.value); if (!p) return;
        if (!(await confirmBox('Preset löschen', `„${p.name}“ löschen?`))) return;
        await deletePreset(p.id); presets = await allPresets(); fillPresets();
      } }, 'Löschen')));

  // Papier
  const paperChips = h('div', { class: 'chips' });
  const fmtChips = h('div', { class: 'chips', style: { marginTop: '10px' } });
  const paperImgBtn = h('button', { class: 'btn sm', style: { marginTop: '10px' }, onclick: async () => {
    const f = await pickFile('image/png,image/jpeg'); if (!f) return;
    try { settings.paperImage = await shrinkImage(await readDataUrl(f)); settings.paper = 'bild'; applyPaperRec(); afterSettingsReplaced(false); } catch { toast('Bild konnte nicht geladen werden.'); }
  } }, 'Eigenes Hintergrundbild …');
  const syncPaper = () => {
    paperChips.replaceChildren(...PAPERS.map((p) => h('button', { class: 'chip' + (settings.paper === p.id ? ' on' : ''), onclick: () => {
      if (p.id === 'bild' && !settings.paperImage) { paperImgBtn.click(); return; }
      settings.paper = p.id; applyPaperRec(); afterSettingsReplaced(false);
    } }, p.name)));
    fmtChips.replaceChildren(
      ...(['A4', 'A5'] as const).map((f) => h('button', { class: 'chip' + (settings.format === f ? ' on' : ''), onclick: () => { settings.format = f; afterSettingsReplaced(false); } }, f)),
      h('button', { class: 'chip' + (settings.landscape ? ' on' : ''), onclick: () => { settings.landscape = !settings.landscape; afterSettingsReplaced(false); } }, 'Querformat'));
  };
  syncers.push(syncPaper);
  syncPaper();
  const paperBox = det('Papier', true, paperChips, fmtChips, paperImgBtn);

  // Farben
  const swatches = h('div', { class: 'row' });
  const colorInput = h('input', { type: 'color', value: settings.color, 'aria-label': 'Eigene Farbe', style: { width: '44px', height: '44px', border: '0', background: 'none' } }) as HTMLInputElement;
  colorInput.addEventListener('input', () => { settings.color = colorInput.value; settings.customColor = true; saveSettings(); syncColors(); refresh(); });
  const hlInput = h('input', { type: 'color', value: settings.highlightColor, 'aria-label': 'Textmarker-Farbe', style: { width: '44px', height: '44px', border: '0', background: 'none' } }) as HTMLInputElement;
  hlInput.addEventListener('input', () => { settings.highlightColor = hlInput.value; saveSettings(); refresh(); });
  const syncColors = () => {
    const mk = (c: string, label: string, auto = false) => h('button', { class: 'swatch' + ((auto ? !settings.customColor : settings.customColor && settings.color.toLowerCase() === c) ? ' on' : ''), title: label, 'aria-label': label,
      style: { background: auto ? 'conic-gradient(#1c3f94 0 50%, #f2f2f7 0)' : c }, onclick: () => { if (auto) { settings.customColor = false; settings.color = DEFAULT_SETTINGS.color; } else { settings.color = c; settings.customColor = true; } saveSettings(); syncColors(); refresh(); } });
    swatches.replaceChildren(mk('', 'Automatisch (Blau, auf dunklem Papier Weiß)', true), mk('#1c3f94', 'Blau'), mk('#1a1a1a', 'Schwarz'), mk('#b3261e', 'Rot'), colorInput);
    colorInput.value = settings.color; hlInput.value = settings.highlightColor;
  };
  syncers.push(syncColors); syncColors();
  const colorBox = det('Stiftfarbe', false, swatches, h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'pill' }, 'Textmarker-Farbe'), hlInput));

  const groups = Object.entries(SLIDERS).map(([title, defs]) => {
    const els = defs.map(slider); els.forEach((e) => syncers.push((e as any).sync));
    return det(title, title === 'Abstände', ...els);
  });

  // Zufall
  const seedLabel = h('b', {}, String(settings.seed));
  syncers.push(() => { seedLabel.textContent = String(settings.seed); });
  const randBox = det('Zufall & Optionen', false,
    h('div', { class: 'row' }, h('span', { class: 'pill' }, 'Seed:'), seedLabel, h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm primary', onclick: () => { settings.seed = Math.floor(Math.random() * 1e6); seedLabel.textContent = String(settings.seed); saveSettings(); refresh(); } }, '🎲 Neu würfeln')),
    toggle('Buchstabenpaare bevorzugen', () => settings.usePairs, (v) => { settings.usePairs = v; saveSettings(); refresh(); }),
    toggle('Fehlende Zeichen markieren', () => settings.showMissing, (v) => { settings.showMissing = v; saveSettings(); refresh(); }));

  side.append(presetBox, paperBox, groups[0], colorBox, ...groups.slice(1), randBox);
  return side;
}
function toggle(label: string, get: () => boolean, set: (v: boolean) => void) {
  const i = h('input', { type: 'checkbox' }) as HTMLInputElement; i.checked = get();
  i.addEventListener('change', () => set(i.checked));
  return h('label', { class: 'tog' }, h('span', {}, label), i);
}
function applyPaperRec() {
  const d = paperDef(settings);
  settings.xh = d.rec.xh; settings.lineSpacing = d.ruling ? d.rec.skip : 3;
  settings.marginL = Math.max(settings.marginL, Math.ceil(d.minLeft / (72 / 25.4)));
  toast('Schriftgröße und Zeilenabstand ans Papier angepasst');
}
function afterSettingsReplaced(save = true) {
  syncers.forEach((s) => s()); saveSettings(); void save; refresh();
}
async function shrinkImage(url: string): Promise<string> {
  const img = await getImage(url);
  const max = 2200, r = Math.min(1, max / Math.max(img.width, img.height));
  const c = h('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

// ---------- Texteingabe ----------
const textarea = h('textarea', { placeholder: 'Hier Text tippen oder einfügen …', spellcheck: false, 'aria-label': 'Text' }) as HTMLTextAreaElement;
textarea.addEventListener('input', () => { text = textarea.value; saveText(); refresh(); });
function wrapSel(m: string) {
  const a = textarea.selectionStart, b = textarea.selectionEnd;
  if (a === b) { toast('Erst eine Textstelle markieren'); return; }
  textarea.setRangeText(m + textarea.value.slice(a, b) + m, a, b, 'select');
  text = textarea.value; saveText(); refresh();
}
const textPanel = h('div', { class: 'textpanel card' },
  h('div', { class: 'row' },
    h('b', {}, 'Text'), h('span', { class: 'spacer' }),
    h('button', { class: 'btn sm', onclick: () => wrapSel('**') }, '𝐔 Unterstreichen'),
    h('button', { class: 'btn sm', onclick: () => wrapSel('==') }, '🖍 Textmarker'),
    h('button', { class: 'btn sm primary', onclick: () => textPanel.classList.remove('open') }, 'Fertig')),
  textarea,
  h('div', { class: 'pill' }, '**Text** wird unterstrichen · ==Text== wird mit Textmarker hervorgehoben'));

// ---------- Export ----------
function openExport() {
  sheet('Exportieren', (close) => {
    const run = (fn: () => Promise<void>) => async () => {
      if (!rendered) return;
      toast('Wird erstellt …', 20000);
      try { await fn(); toast('Fertig'); close(); } catch (e) { console.error(e); toast('Fehler: ' + (e as Error).message, 5000); }
    };
    const pdf = async () => { const bytes = await makePdf(rendered!, withPaperExport); await deliver([new File([bytes as BlobPart], 'Handschrift.pdf', { type: 'application/pdf' })]); };
    return [
      toggle('Papierhintergrund mitexportieren', () => withPaperExport, (v) => { withPaperExport = v; }),
      h('button', { class: 'btn', onclick: run(pdf) }, '📄 PDF (alle Seiten)'),
      h('button', { class: 'btn', onclick: run(async () => {
        const blobs = await makePngs(rendered!, withPaperExport);
        const files = blobs.map((b, i) => new File([b], `Handschrift-Seite-${i + 1}.png`, { type: 'image/png' }));
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        if (files.length > 1 && !nav.canShare?.({ files })) {
          const z = await zipFiles(files.map((f, i) => ({ name: f.name, blob: blobs[i] })));
          await deliver([new File([z as BlobPart], 'Handschrift-PNG.zip', { type: 'application/zip' })]);
        } else await deliver(files);
      }) }, '🖼 PNG pro Seite (300 dpi)'),
      h('button', { class: 'btn primary', onclick: run(async () => {
        try {
          const bytes = await makeGoodnotes(rendered!, withPaperExport, 'Handschrift');
          await deliver([new File([bytes as BlobPart], 'Handschrift.goodnotes', { type: 'application/octet-stream' })]);
        } catch (e) {
          console.error(e); toast('GoodNotes-Export fehlgeschlagen – stattdessen PDF.', 4000); await pdf();
        }
      }) }, '✍️ Als GoodNotes-Datei exportieren'),
      h('p', {}, 'Die GoodNotes-Datei enthält echte Stift-Striche (radieren, mit Lasso verschieben, umfärben). Das Format ist inoffiziell – öffnet sie sich nicht, nimm das PDF und importiere es in GoodNotes.'),
    ];
  });
}

// ---------- Profile & Daten ----------
function openData() {
  sheet('Handschrift & Daten', (close) => {
    const list = h('div', { class: 'chips' });
    const fill = () => list.replaceChildren(...profiles.map((p) => h('button', { class: 'chip' + (p.id === profile.id ? ' on' : ''), onclick: async () => { await setProfile(p); fill(); } }, p.name)));
    fill();
    return [
      h('b', {}, 'Handschrift-Profile'), list,
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: async () => { const n = await askText('Neues Profil', '', 'Name'); if (!n) return; const p = newProfile(n); profiles.push(p); await saveProfile(p); await setProfile(p); close(); } }, '+ Neues Profil'),
        h('button', { class: 'btn sm', onclick: async () => { const n = await askText('Profil umbenennen', profile.name); if (!n) return; profile.name = n; await saveProfile(profile); buildTop(); fill(); } }, 'Umbenennen'),
        h('button', { class: 'btn sm danger', onclick: async () => {
          if (profiles.length < 2) { toast('Mindestens ein Profil muss bleiben.'); return; }
          if (!(await confirmBox('Profil löschen', `„${profile.name}“ mit allen Zeichen löschen?`))) return;
          await deleteProfile(profile.id); profiles = profiles.filter((p) => p.id !== profile.id); await setProfile(profiles[0]); close();
        } }, 'Löschen')),
      h('b', { style: { marginTop: '8px' } }, 'Backup'),
      h('button', { class: 'btn', onclick: async () => { await deliver([new File([await exportBackup()], 'handschrift-backup.json', { type: 'application/json' })]); } }, '⬇︎ Backup exportieren (JSON)'),
      h('button', { class: 'btn', onclick: async () => {
        const f = await pickFile('application/json,.json'); if (!f) return;
        try { const n = await importBackup(await readText(f)); toast(`${n} Profil(e) importiert – App wird neu geladen`); setTimeout(() => location.reload(), 900); }
        catch (e) { toast((e as Error).message || 'Import fehlgeschlagen', 4000); }
      } }, '⬆︎ Backup importieren'),
      h('p', {}, 'Alle Daten liegen nur lokal auf diesem Gerät (IndexedDB). Exportiere regelmäßig ein Backup.'),
    ];
  });
}
async function setProfile(p: Profile) {
  profile = p; await kvSet('activeProfile', p.id);
  buildTop(); tpl.refresh(); void refreshPreview();
}

// ---------- Aufbau ----------
const tpl = createTemplateView({
  profile: () => profile,
  changed: () => { void saveProfile(profile); void refreshPreview(); },
});
let sidebar!: HTMLElement;
const topbar = h('div', { class: 'topbar' });
const main = h('div', { class: 'main' });
function buildTop() {
  const seg = h('div', { class: 'seg', role: 'tablist' },
    h('button', { class: mode === 'write' ? 'on' : '', onclick: () => setMode('write') }, 'Schreiben'),
    h('button', { class: mode === 'template' ? 'on' : '', onclick: () => setMode('template') }, 'Schablone'));
  topbar.replaceChildren(
    h('button', { class: 'btn icon-btn', 'aria-label': 'Regler ein-/ausblenden', onclick: () => sidebar.classList.toggle('closed') }, '☰'),
    h('h1', {}, 'Handschrift'), seg, h('span', { class: 'spacer' }),
    h('button', { class: 'btn', onclick: openData }, '👤 ' + profile.name),
    h('button', { class: 'btn primary', onclick: openExport }, 'Exportieren'));
}
function setMode(m: 'write' | 'template') {
  mode = m; buildTop();
  sidebar.style.display = m === 'write' ? '' : 'none';
  stage.style.display = m === 'write' ? '' : 'none';
  tpl.el.style.display = m === 'template' ? '' : 'none';
  if (m === 'write') void refreshPreview();
}
const stage = h('div', { class: 'stage' },
  h('div', { class: 'stage-bar' },
    h('button', { class: 'btn sm', onclick: () => { pageIdx = Math.max(0, pageIdx - 1); drawCurrent(); } }, '‹'),
    pageInfo,
    h('button', { class: 'btn sm', onclick: () => { pageIdx = Math.min((rendered?.pages.length ?? 1) - 1, pageIdx + 1); drawCurrent(); } }, '›'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn sm', 'aria-label': 'Verkleinern', onclick: () => { zoom = Math.max(0.4, zoom - 0.25); drawCurrent(); } }, '−'),
    h('button', { class: 'btn sm', 'aria-label': 'Einpassen', onclick: () => { zoom = 1; drawCurrent(); } }, 'Einpassen'),
    h('button', { class: 'btn sm', 'aria-label': 'Vergrößern', onclick: () => { zoom = Math.min(3, zoom + 0.25); drawCurrent(); } }, '+'),
    h('button', { class: 'btn sm primary', onclick: () => { textPanel.classList.toggle('open'); if (textPanel.classList.contains('open')) textarea.focus(); } }, '✎ Text')),
  notice, pagesEl, textPanel);

async function boot() {
  profiles = await allProfiles();
  if (!profiles.length) { const p = newProfile('Meine Handschrift'); await saveProfile(p); profiles = [p]; }
  const act = await kvGet<string>('activeProfile');
  profile = profiles.find((p) => p.id === act) ?? profiles[0];
  settings = { ...DEFAULT_SETTINGS, ...((await kvGet<Settings>('settings')) ?? {}) };
  text = (await kvGet<string>('text')) ?? SAMPLE;
  presets = await allPresets();
  textarea.value = text;
  sidebar = buildSidebar();
  tpl.refresh();
  main.append(sidebar, stage, tpl.el);
  document.getElementById('app')!.append(topbar, main);
  if (matchMedia('(max-width: 900px)').matches) sidebar.classList.add('closed');
  buildTop(); setMode(profile && Object.keys(profile.glyphs).length ? 'write' : 'template');
  new ResizeObserver(() => { if (mode === 'write') drawCurrent(); }).observe(pagesEl);
  navigator.storage?.persist?.().catch(() => {});
  void pageSize;
}
void boot();
