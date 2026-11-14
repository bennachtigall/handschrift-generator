type Attrs = Record<string, any>;
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k in e && k !== 'list') (e as any)[k] = v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c != null && c !== false) e.append(c);
  return e;
}

let toastTimer = 0;
export function toast(msg: string, ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => t!.classList.remove('show'), ms);
}

export function sheet(title: string, build: (close: () => void) => Node[]): void {
  const back = h('div', { class: 'backdrop' });
  const close = () => { back.classList.remove('in'); setTimeout(() => back.remove(), 200); };
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'btn ghost', onclick: close }, 'Fertig')),
    h('div', { class: 'sheet-body' }, ...build(close)));
  back.append(box);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  requestAnimationFrame(() => back.classList.add('in'));
}

export function askText(title: string, value = '', placeholder = ''): Promise<string | null> {
  return new Promise((res) => {
    const input = h('input', { type: 'text', value, placeholder, class: 'field' });
    let done = false;
    const fin = (v: string | null, close: () => void) => { if (done) return; done = true; close(); res(v); };
    sheet(title, (close) => {
      input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') fin(input.value.trim() || null, close); });
      setTimeout(() => input.focus(), 250);
      return [input, h('div', { class: 'row end' },
        h('button', { class: 'btn', onclick: () => fin(null, close) }, 'Abbrechen'),
        h('button', { class: 'btn primary', onclick: () => fin(input.value.trim() || null, close) }, 'OK'))];
    });
  });
}
export function confirmBox(title: string, text: string, okLabel = 'Löschen'): Promise<boolean> {
  return new Promise((res) => {
    let done = false;
    const fin = (v: boolean, close: () => void) => { if (done) return; done = true; close(); res(v); };
    sheet(title, (close) => [h('p', {}, text), h('div', { class: 'row end' },
      h('button', { class: 'btn', onclick: () => fin(false, close) }, 'Abbrechen'),
      h('button', { class: 'btn danger', onclick: () => fin(true, close) }, okLabel))]);
  });
}
export const debounce = <A extends any[]>(fn: (...a: A) => void, ms: number) => { let t = 0; return (...a: A) => { clearTimeout(t); t = window.setTimeout(() => fn(...a), ms); }; };
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((res) => {
    const i = h('input', { type: 'file', accept });
    i.addEventListener('change', () => res(i.files?.[0] ?? null));
    i.click();
  });
}
export const readText = (f: File) => f.text();
export const readDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(f); });
