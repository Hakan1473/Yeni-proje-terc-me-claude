// Small text helpers that understand Turkish casing.

/** Turkish-aware lowercase: I → ı, İ → i. Use only on Turkish text. */
export function lowerTr(text: string): string {
  return text.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
}

/** Language-neutral lowercase that still maps İ to a plain i (no combining dot). */
export function lowerNeutral(text: string): string {
  return text.replace(/İ/g, 'i').toLowerCase();
}

/** Turkish-aware uppercase of the first letter. */
export function capitalizeTr(text: string): string {
  if (!text) return text;
  const first = text.charAt(0);
  const upper = first === 'i' ? 'İ' : first === 'ı' ? 'I' : first.toUpperCase();
  return upper + text.slice(1);
}

/** Accent-insensitive key: "Şeker Hastalığı" → "seker hastaligi". */
export function fold(text: string): string {
  return lowerTr(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[’ʻʼ`]/g, "'");
}

const WORD = /[\p{L}\p{M}\p{N}]+(?:['’ʻʼ][\p{L}\p{M}]+)*/gu;

/** Words with internal apostrophes kept ("parol'ü", "oʻz"). */
export function words(text: string): string[] {
  return text.match(WORD) ?? [];
}

/** Escape a literal for use inside a RegExp. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Optimal string alignment distance (Damerau–Levenshtein with adjacent
 * transpositions), bailing out early once `max` is exceeded.
 */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Number.POSITIVE_INFINITY;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[i - 2][j - 2] + 1);
      }
      d[i][j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}
