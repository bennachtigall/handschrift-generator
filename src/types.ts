// Datenmodell. Alle Koordinaten eines Glyphen sind in "x-Höhen" (1 = Abstand Grundlinie→Mittellinie),
// Ursprung: x = linke Kante der Tinte, y = 0 auf der Grundlinie, nach unten positiv.
export type Pt = [number, number, number]; // x, y, Druck 0..1
export interface Stroke { pts: Pt[] }
export interface Variant {
  strokes: Stroke[];
  w: number; // Tintenbreite
  top: number; // minimales y
  bottom: number; // maximales y
}
export interface Profile {
  id: string;
  name: string;
  glyphs: Record<string, Variant[]>;
  spaceWidth: number; // in x-Höhen
  created: number;
  updated: number;
}

export type PaperId = 'weiss' | 'liniert' | 'kariert' | 'punkte' | 'college' | 'grundschule' | 'dunkel' | 'bild';

export interface Settings {
  paper: PaperId;
  format: 'A4' | 'A5';
  landscape: boolean;
  xh: number; // x-Höhe in mm
  letterSpacing: number; // in x-Höhen, auch negativ
  wordSpacing: number; // Faktor auf Leerzeichenbreite
  lineSpacing: number; // freies Papier: Vielfaches der x-Höhe; liniertes: übersprungene Zeilen
  jitterBase: number; // Grundlinien-Versatz
  jitterRot: number; // Rotation in Grad
  jitterSize: number; // Größenvariation
  jitterDistort: number; // Strich-Verzerrung
  slant: number; // Grad, positiv = nach rechts geneigt
  lineDrift: number; // Grad, Ansteigen/Abfallen der Zeilen
  lineWobble: number; // zufälliges Wandern der Zeilen
  penWidth: number; // pt
  pressure: number; // 0..1
  color: string;
  customColor: boolean;
  highlightColor: string;
  marginL: number; marginR: number; marginT: number; marginB: number; // mm
  seed: number;
  showMissing: boolean;
  usePairs: boolean;
  paperImage?: string; // data-URL
}
export interface Preset { id: string; name: string; settings: Settings }
