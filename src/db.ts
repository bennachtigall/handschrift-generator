import { openDB, type IDBPDatabase } from 'idb';
import type { Profile, Preset, Settings } from './types';

let dbp: Promise<IDBPDatabase> | null = null;
function db() {
  dbp ??= openDB('handschrift', 1, {
    upgrade(d) {
      d.createObjectStore('profiles', { keyPath: 'id' });
      d.createObjectStore('presets', { keyPath: 'id' });
      d.createObjectStore('kv');
    },
  });
  return dbp;
}
export const uid = () => crypto.randomUUID();

export async function allProfiles(): Promise<Profile[]> { return (await db()).getAll('profiles'); }
export async function saveProfile(p: Profile) { p.updated = Date.now(); await (await db()).put('profiles', p); }
export async function deleteProfile(id: string) { await (await db()).delete('profiles', id); }
export async function allPresets(): Promise<Preset[]> { return (await db()).getAll('presets'); }
export async function savePreset(p: Preset) { await (await db()).put('presets', p); }
export async function deletePreset(id: string) { await (await db()).delete('presets', id); }
export async function kvGet<T>(k: string): Promise<T | undefined> { return (await db()).get('kv', k); }
export async function kvSet(k: string, v: unknown) { await (await db()).put('kv', v, k); }

export function newProfile(name: string): Profile {
  return { id: uid(), name, glyphs: {}, spaceWidth: 0.7, created: Date.now(), updated: Date.now() };
}

export const DEFAULT_SETTINGS: Settings = {
  paper: 'liniert', format: 'A4', landscape: false,
  xh: 3.2, letterSpacing: 0.04, wordSpacing: 1, lineSpacing: 1,
  jitterBase: 0.12, jitterRot: 1.5, jitterSize: 0.05, jitterDistort: 0.25,
  slant: 0, lineDrift: 0, lineWobble: 0.15,
  penWidth: 1.0, pressure: 0.35, color: '#1c3f94', customColor: false, highlightColor: '#ffe600',
  marginL: 20, marginR: 15, marginT: 20, marginB: 15, seed: 1234, showMissing: true, usePairs: true,
};

// Backup: gesamte Handschrift (Profile + Presets + Einstellungen) als JSON
export async function exportBackup(): Promise<Blob> {
  const data = { app: 'handschrift-generator', version: 1, exported: new Date().toISOString(),
    profiles: await allProfiles(), presets: await allPresets(), settings: await kvGet('settings'), activeProfile: await kvGet('activeProfile') };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}
export async function importBackup(text: string): Promise<number> {
  const d = JSON.parse(text);
  if (d?.app !== 'handschrift-generator' || !Array.isArray(d.profiles)) throw new Error('Keine gültige Backup-Datei.');
  for (const p of d.profiles as Profile[]) await saveProfile(p);
  for (const p of (d.presets ?? []) as Preset[]) await savePreset(p);
  if (d.settings) await kvSet('settings', d.settings);
  if (d.activeProfile) await kvSet('activeProfile', d.activeProfile);
  return d.profiles.length;
}
