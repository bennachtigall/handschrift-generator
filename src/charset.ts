export const LOWER = 'abcdefghijklmnopqrstuvwxyz'.split('');
export const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
export const UMLAUT = ['ä', 'ö', 'ü', 'Ä', 'Ö', 'Ü', 'ß'];
export const DIGITS = '0123456789'.split('');
export const PUNCT = ['.', ',', ';', ':', '!', '?', '-', '–', '"', "'", '(', ')', '/', '&', '%', '€', '@', '+', '='];
export const DEFAULT_PAIRS = ['ch', 'ck', 'sch', 'tt', 'll', 'ss', 'ei', 'ie', 'en', 'er', 'nn', 'mm', 'st', 'de', 'ge', 'un', 'an', 'in'];

export const GROUPS: { id: string; title: string; chars: string[] }[] = [
  { id: 'lower', title: 'Kleinbuchstaben', chars: LOWER },
  { id: 'upper', title: 'Großbuchstaben', chars: UPPER },
  { id: 'umlaut', title: 'Umlaute & ß', chars: UMLAUT },
  { id: 'digits', title: 'Ziffern', chars: DIGITS },
  { id: 'punct', title: 'Satzzeichen & Symbole', chars: PUNCT },
];

// Zeichen, die auf der Grundlinie sitzen (für die automatische Grundlinien-Korrektur)
export const ON_BASELINE = new Set('abcdefhiklmnorstuvwxzABCDEFGHIJKLMNOPQRSTUVWXYZäöüÄÖÜß0123456789'.split(''));
// Zeichen, die oberhalb schweben (Anführungszeichen, Apostroph) bzw. am Boden sitzen (Punkt)
export const HIGH = new Set(['"', "'", '°']);

export const MIN_VARIANTS = 3;
export const MAX_VARIANTS = 6;
