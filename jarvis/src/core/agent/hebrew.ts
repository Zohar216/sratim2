/**
 * Hebrew text helpers used by the command router, the app resolver and contact matching.
 * Pure functions only — no React Native imports — so they are unit-testable in Node.
 */

const NIQQUD = /[֑-ׇ]/g;
const FINAL_LETTERS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

/** Strip niqqud/cantillation, unify quotes and whitespace, trim. Keeps letters as-is. */
export function normalizeText(input: string): string {
  return input
    .replace(NIQQUD, '')
    .replace(/[׳‘’`´]/g, "'")
    .replace(/[״“”]/g, '"')
    .replace(/[‎‏‪-‮]/g, '') // bidi control marks
    .replace(/\s+/g, ' ')
    .trim();
}

/** A looser key for fuzzy comparisons: lowercase, final letters folded, no punctuation/spaces. */
export function looseKey(input: string): string {
  return normalizeText(input)
    .toLowerCase()
    .replace(/[ךםןףץ]/g, (c) => FINAL_LETTERS[c] ?? c)
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Removes polite filler and the assistant's name from the start/end of a command. */
export function stripFiller(input: string): string {
  let s = normalizeText(input);
  s = s.replace(/^(היי|הי|הלו|יו)?\s*(ג'רוויס|גרוויס|jarvis)[,!.\s]*/i, '');
  s = s.replace(/^(בבקשה|תעשה לי טובה|אפשר|תוכל|תוכלי|אתה יכול|את יכולה)\s+(ל)?/, '');
  s = s.replace(/[\s,]*(בבקשה|תודה)[.!?]*$/, '');
  s = s.replace(/[.!?]+$/, '');
  return s.trim();
}

/** Levenshtein distance (small strings only — app names, contact names). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 similarity between two names (1 = identical after loose normalization). */
export function similarity(a: string, b: string): number {
  const ka = looseKey(a);
  const kb = looseKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  if (ka.includes(kb) || kb.includes(ka)) {
    return 0.85 * (Math.min(ka.length, kb.length) / Math.max(ka.length, kb.length)) + 0.1;
  }
  const d = editDistance(ka, kb);
  return Math.max(0, 1 - d / Math.max(ka.length, kb.length));
}

const UNITS: Record<string, number> = {
  אחד: 1, אחת: 1, שניים: 2, שתיים: 2, שני: 2, שתי: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4,
  חמש: 5, חמישה: 5, שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9, עשר: 10, עשרה: 10,
  'אחת עשרה': 11, 'אחד עשר': 11, 'שתים עשרה': 12, 'שנים עשר': 12, 'חמש עשרה': 15, 'חמישה עשר': 15,
  עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, תשעים: 90,
};

/** Parses "5", "חמש", "עשרים", "עשרים וחמש" → number, or null. */
export function parseHebrewNumber(input: string): number | null {
  const s = normalizeText(input);
  if (/^\d+$/.test(s)) return Number(s);
  if (s in UNITS) return UNITS[s];
  const compound = s.match(/^(\S+)\s+ו(\S+)$/);
  if (compound && compound[1] in UNITS && compound[2] in UNITS) {
    return UNITS[compound[1]] + UNITS[compound[2]];
  }
  return null;
}

/**
 * Parses a Hebrew duration ("חצי שעה", "5 דקות", "רבע שעה", "שעתיים", "דקה וחצי") to seconds.
 */
export function parseDurationSeconds(input: string): number | null {
  const s = normalizeText(input).replace(/^(של|ל|למשך)\s*/, '');
  const fixed: Record<string, number> = {
    'חצי שעה': 1800, 'רבע שעה': 900, 'שלושת רבעי שעה': 2700, שעה: 3600, שעתיים: 7200,
    דקה: 60, דקתיים: 120, 'חצי דקה': 30, 'דקה וחצי': 90, 'שעה וחצי': 5400,
  };
  if (s in fixed) return fixed[s];
  const m = s.match(/^(.+?)\s+(שניות|שנייה|שניה|דקות|דקה|שעות|שעה)(\s+וחצי)?$/);
  if (!m) return null;
  const n = parseHebrewNumber(m[1]);
  if (n == null) return null;
  const unit = m[2].startsWith('שני') ? 1 : m[2].startsWith('דק') ? 60 : 3600;
  return n * unit + (m[3] ? unit / 2 : 0);
}

/**
 * Normalizes an Israeli/international phone number to digits with country code
 * (e.g. "050-123 4567" → "972501234567"). Returns null if it does not look like a number.
 */
export function normalizePhone(raw: string, defaultCountry = '972'): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 7) return null;
  if (trimmed.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith(defaultCountry)) return digits;
  if (digits.startsWith('0')) return defaultCountry + digits.slice(1);
  return digits;
}

/** Strips a leading Hebrew preposition letter that is glued to a name ("לאמא" → "אמא"). */
export function stripPrefix(word: string, letters = 'לבמה'): string {
  const w = word.trim();
  if (w.length > 2 && letters.includes(w[0])) return w.slice(1);
  return w;
}
