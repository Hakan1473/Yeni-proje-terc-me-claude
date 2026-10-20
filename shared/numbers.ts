import { lowerNeutral, lowerTr, words } from './text';
import type { NumberCheck } from './types';

/**
 * Numeric consistency guard: doses, vitals, times and counts must survive
 * translation unchanged. Numbers are read from digits in any language and from
 * number words in Turkish and English. Spoken number words are only trusted
 * next to a unit or another number, because "yedi" also means "ate" and
 * "on" is an English preposition.
 */

const TR_UNITS: Record<string, number> = {
  sıfır: 0, bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9,
};
const TR_TENS: Record<string, number> = {
  on: 10, yirmi: 20, otuz: 30, kırk: 40, elli: 50, altmış: 60, yetmiş: 70, seksen: 80, doksan: 90,
};
const EN_SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90,
};

// Words that make an adjacent number word clinically meaningful.
const TR_CONTEXT = new Set(
  words(`mg miligram gram gr ml mililitre cc ünite damla tablet tableti kapsül hap ölçek puf doz kez kere defa
  saat saatte saati gün günde gündür hafta haftada haftadır ay aydır yıl yıldır yaş yaşında yaşındayım derece
  dakika dakikada kilo kg santim cm nabız tansiyon şeker mmhg yüzde paket adet şişe bardak sefer`),
);
const EN_CONTEXT = new Set(
  words(`mg milligram milligrams gram grams ml milliliter milliliters cc unit units drop drops tablet tablets
  capsule capsules pill pills puff puffs dose doses times time hour hours day days week weeks month months
  year years old degree degrees minute minutes kilo kilos kg cm pulse pressure sugar mmhg percent pack packs
  glass glasses o'clock am pm`),
);

const DIGITS = /\d+(?:[.,]\d+)?/g;
const CLOCK = /\b(\d{1,2})[:.](\d{2})\b/g;

function parseDigits(text: string): number[] {
  const out: number[] = [];
  // Clock times: "08:00" is the hour 8, "08:30" is 8 and 30
  const withoutClock = text.replace(CLOCK, (_m, h, m) => {
    out.push(Number(h));
    if (m !== '00') out.push(Number(m));
    return ' ';
  });
  for (const raw of withoutClock.match(DIGITS) ?? []) {
    // "1.000" style thousands vs "38.5" style decimals
    const thousands = /^\d{1,3}([.,]\d{3})+$/.test(raw) && !/^\d+[.,]\d{1,2}$/.test(raw);
    const value = thousands ? Number(raw.replace(/[.,]/g, '')) : Number(raw.replace(',', '.'));
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

interface WordNumber {
  value: number;
  start: number;
  end: number;
}

function parseTurkishWords(tokens: string[]): WordNumber[] {
  const found: WordNumber[] = [];
  let i = 0;
  while (i < tokens.length) {
    let total = 0;
    let current = 0;
    let used = 0;
    let j = i;
    while (j < tokens.length) {
      const t = tokens[j];
      if (t in TR_UNITS) current += TR_UNITS[t];
      else if (t in TR_TENS) current += TR_TENS[t];
      else if (t === 'yüz') current = (current || 1) * 100;
      else if (t === 'bin') {
        total += (current || 1) * 1000;
        current = 0;
      } else if (t === 'buçuk' && used > 0) current += 0.5;
      else if (t === 'yarım') current += 0.5;
      else break;
      used++;
      j++;
    }
    if (used > 0) {
      found.push({ value: total + current, start: i, end: j });
      i = j;
    } else i++;
  }
  return found;
}

function parseEnglishWords(tokens: string[]): WordNumber[] {
  const found: WordNumber[] = [];
  let i = 0;
  while (i < tokens.length) {
    let total = 0;
    let current = 0;
    let used = 0;
    let j = i;
    while (j < tokens.length) {
      const t = tokens[j];
      if (t in EN_SMALL) current += EN_SMALL[t];
      else if (t === 'hundred') current = (current || 1) * 100;
      else if (t === 'thousand') {
        total += (current || 1) * 1000;
        current = 0;
      } else if (t === 'half' && (used > 0 || tokens[j - 1] === 'a')) current += 0.5;
      else if ((t === 'and' || t === 'a') && used > 0 && j + 1 < tokens.length && /^(half|a)$/.test(tokens[j + 1])) {
        j++;
        continue;
      } else break;
      used++;
      j++;
    }
    if (used > 0) {
      found.push({ value: total + current, start: i, end: j });
      i = j;
    } else i++;
  }
  return found;
}

/** All clinically meaningful numbers in `text`, as a sorted list. */
export function extractNumbers(text: string, lang: string): number[] {
  const values = parseDigits(text);
  if (lang === 'tr' || lang === 'en') {
    const tokens = words(lang === 'tr' ? lowerTr(text) : lowerNeutral(text));
    const context = lang === 'tr' ? TR_CONTEXT : EN_CONTEXT;
    const parsed = lang === 'tr' ? parseTurkishWords(tokens) : parseEnglishWords(tokens);
    for (const n of parsed) {
      const multiWord = n.end - n.start > 1;
      const near = context.has(tokens[n.end] ?? '') || context.has(tokens[n.start - 1] ?? '');
      // A lone "bir"/"one" is usually an article ("bir tablet" = "a tablet")
      if ((multiWord || near) && !(n.value === 1 && !multiWord)) values.push(n.value);
    }
  }
  return values.sort((a, b) => a - b);
}

function canRead(text: string, lang: string): boolean {
  return lang === 'tr' || lang === 'en' || /\d/.test(text);
}

function multisetDiff(a: number[], b: number[]): number[] {
  const rest = [...b];
  const out: number[] = [];
  for (const v of a) {
    const idx = rest.indexOf(v);
    if (idx === -1) out.push(v);
    else rest.splice(idx, 1);
  }
  return out;
}

/**
 * Compare numbers between an utterance and its translation. Returns undefined
 * when they agree or when one side cannot be read (e.g. Russian number words).
 */
export function checkNumbers(
  source: string,
  sourceLang: string,
  translation: string,
  translationLang: string,
): NumberCheck | undefined {
  if (!canRead(source, sourceLang) || !canRead(translation, translationLang)) return undefined;
  const a = extractNumbers(source, sourceLang);
  const b = extractNumbers(translation, translationLang);
  if (a.length === 0 && b.length === 0) return undefined;
  // Number words in a language we cannot parse: only digits on one side is not a mismatch
  if (a.length === 0 && !canParseWords(sourceLang)) return undefined;
  if (b.length === 0 && !canParseWords(translationLang)) return undefined;
  const missing = multisetDiff(a, b);
  const extra = multisetDiff(b, a);
  if (missing.length === 0 && extra.length === 0) return undefined;
  return { missing, extra };
}

function canParseWords(lang: string): boolean {
  return lang === 'tr' || lang === 'en';
}

/** "500 mg → 50" style description for the UI. */
export function describeNumberCheck(check: NumberCheck): string {
  const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  if (check.missing.length && check.extra.length) {
    return `Kaynakta ${check.missing.map(fmt).join(', ')}, çeviride ${check.extra.map(fmt).join(', ')} geçiyor`;
  }
  if (check.missing.length) return `Çeviride eksik sayı: ${check.missing.map(fmt).join(', ')}`;
  return `Çeviride fazladan sayı: ${check.extra.map(fmt).join(', ')}`;
}
