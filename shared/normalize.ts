import { getLanguage } from './languages';
import { capitalizeTr } from './text';

/**
 * Transcript normalizer. Pure and idempotent: normalize(normalize(x)) === normalize(x).
 *
 * All word boundaries are Unicode-aware lookarounds. JavaScript's \b treats
 * ç, ğ, ı, ö, ş, ü as non-word characters, so `\bağrısı\b` never matches.
 */

const L = '\\p{L}';
const NOT_BEFORE = `(?<!${L})`;
const NOT_AFTER = `(?!${L})`;

const FILLER = new RegExp(
  `${NOT_BEFORE}(?:ı{2,}|e{3,}|a{3,}|hı+m*|hm+|ım+|uh+m*|um+|erm+|ähm*|euh+)${NOT_AFTER}[,.]?`,
  'giu',
);

// Runs of three or more identical words are recognizer stutter. Two are kept:
// Turkish reduplication ("yavaş yavaş", "çok çok") is grammatical.
const STUTTER = new RegExp(`${NOT_BEFORE}(${L}{2,})(?:\\s+\\1){2,}${NOT_AFTER}`, 'giu');

// Medical and everyday compounds that recognizers glue together.
const COMPOUNDS: [string, string][] = [
  ['kan', 'basınc'], ['kan', 'şeker'], ['kan', 'sulandır'], ['nefes', 'darlığ'], ['nefes', 'darlık'],
  ['şeker', 'hastalığ'], ['şeker', 'hastas'], ['yüksek', 'tansiyon'], ['düşük', 'tansiyon'],
  ['kalp', 'kriz'], ['kalp', 'atış'], ['safra', 'kese'], ['açık', 'kalp'], ['göğüs', 'ağrı'],
  ['baş', 'ağrı'], ['baş', 'dönme'], ['mide', 'bulantı'], ['mide', 'koruyucu'], ['boğaz', 'ağrı'],
  ['bel', 'ağrı'], ['sırt', 'ağrı'], ['karın', 'ağrı'], ['diş', 'ağrı'], ['kulak', 'ağrı'],
  ['ağrı', 'kesic'], ['hasta', 'yakın'], ['hasta', 'yatağ'], ['acil', 'servis'], ['yoğun', 'bakım'],
  ['damar', 'yol'], ['oksijen', 'satürasyon'], ['solunum', 'sayıs'], ['solunum', 'cihaz'],
  ['solunum', 'egzersiz'], ['vücut', 'ısıs'], ['çağrı', 'buton'], ['çağrı', 'zil'], ['sağlık', 'persone'],
  ['geçmiş', 'olsun'], ['teşekkür', 'eder'], ['hoş', 'geldin'], ['hoş', 'bulduk'], ['özür', 'diler'],
  ['kusura', 'bakma'], ['yardımcı', 'ol'], ['iyi', 'günler'], ['iyi', 'akşamlar'], ['iyi', 'geceler'],
  ['kolay', 'gelsin'], ['derin', 'nefes'], ['nefes', 'al'], ['nefes', 'ver'], ['nefes', 'tut'],
  ['aç', 'karn'], ['tok', 'karn'], ['sabah', 'akşam'], ['bir', 'şey'], ['her', 'şey'], ['hiçbir', 'şey'],
  ['bir', 'daha'], ['bir', 'kere'], ['pek', 'çok'], ['hemen', 'şimdi'], ['ilaç', 'kullan'],
  ['sigara', 'kullan'], ['sigara', 'iç'], ['alkol', 'kullan'], ['ameliyat', 'ol'], ['taburcu', 'ol'],
  ['muayene', 'ol'], ['reçete', 'yaz'], ['pansuman', 'yap'], ['serum', 'tak'], ['dikiş', 'al'],
];
const COMPOUND_RES = COMPOUNDS.map(
  ([a, b]) => new RegExp(`${NOT_BEFORE}(${a})(${b}${L}*)${NOT_AFTER}`, 'giu'),
);

const PARTICLE = '(m[ıiuü])(s[ıiuü]n[ıiuü]z|s[ıiuü]n|y[ıiuü]m|y[ıiuü]z|yd[ıiuü])?';
// "ağrınızvar" → "ağrınız var" (possessive + var/yok)
const POSSESSIVE_VAR = new RegExp(
  `${NOT_BEFORE}(${L}{2,}(?:[ıiuü]m|[ıiuü]n[ıiuü]z|[ıiuü]m[ıiuü]z|s[ıiuü]))(var|yok)(?=m[ıiuü]|${NOT_AFTER})`,
  'giu',
);
// "varmı" → "var mı", "değilmi" → "değil mi"
const PREDICATE_PARTICLE = new RegExp(
  `${NOT_BEFORE}(var|yok|değil|iyi|tamam|doğru|emin|rahat|hazır|aç|tok)${PARTICLE}${NOT_AFTER}`,
  'giu',
);
// "geldimi" → "geldi mi", "ağrıyormu" → "ağrıyor mu", "alırmısınız" → "alır mısınız"
const VERB_PARTICLE = new RegExp(
  `${NOT_BEFORE}(${L}{2,}(?:[ıiuü]yor|[dt][ıiuü]|m[ıiuü]ş|[ae]c[ae]k|[aeıiuü]r))${PARTICLE}${NOT_AFTER}`,
  'giu',
);
// Real nouns that look like verb + particle
const PARTICLE_EXCEPTIONS = new Set(['yardımı', 'yardımımı', 'yudumu', 'kadimi', 'ödümü']);

// Turkish words written without Turkish letters by some recognizers.
const ASCII_FIXES: Record<string, string> = {
  tansyon: 'tansiyon', tansyonum: 'tansiyonum', tansyonu: 'tansiyonu', seker: 'şeker', sekerim: 'şekerim',
  sekeri: 'şekeri', agri: 'ağrı', agrim: 'ağrım', agrisi: 'ağrısı', agriniz: 'ağrınız', agriyor: 'ağrıyor',
  agrimiyor: 'ağrımıyor', ates: 'ateş', atesim: 'ateşim', atesi: 'ateşi', ateslendim: 'ateşlendim',
  bulanti: 'bulantı', bulantim: 'bulantım', carpinti: 'çarpıntı', carpintim: 'çarpıntım', usume: 'üşüme',
  usuyorum: 'üşüyorum', usudum: 'üşüdüm', apandist: 'apandisit', baypas: 'bypass', sezeryan: 'sezaryen',
  kolestrol: 'kolesterol', kolestrolum: 'kolesterolüm', hemsire: 'hemşire', hemsirem: 'hemşirem', ilac: 'ilaç',
  ilaci: 'ilacı', ilacim: 'ilacım', ilaclar: 'ilaçlar', ilaclarim: 'ilaçlarım', gecmis: 'geçmiş',
  gecirdim: 'geçirdim', gecirmedim: 'geçirmedim', kullaniyorum: 'kullanıyorum', kullanmiyorum: 'kullanmıyorum',
  igne: 'iğne', oksuruk: 'öksürük', oksuruyorum: 'öksürüyorum', bogaz: 'boğaz', bogazim: 'boğazım',
  gogus: 'göğüs', gogsum: 'göğsüm', sikayet: 'şikayet', sikayetim: 'şikayetim', sikayetiniz: 'şikayetiniz',
  darligi: 'darlığı', bayildim: 'bayıldım', uyusma: 'uyuşma', karincalanma: 'karıncalanma', kasinti: 'kaşıntı',
  icmiyorum: 'içmiyorum', iciyorum: 'içiyorum', dogum: 'doğum', hastasiyim: 'hastasıyım', basim: 'başım',
  sersemlk: 'sersemlik', bulganti: 'bulantı',
};
const ASCII_WORD = /(?<![\p{L}])[a-z]{3,}(?![\p{L}])/gu;

// Hesitation "şey" at the start of an utterance ("şey, başım dönüyor")
const LEADING_SEY = /^şey(?:,\s*|\s+)(?=\p{L})/iu;

const SPACE_BEFORE_PUNCT = /\s+([,.;:!?])/g;
const SPACE_BEFORE_PUNCT_FR = /\s+([,.])/g;
const SPACE_AFTER_PUNCT = /(?<=\p{L}{2}|\p{N})([,;:!?])(?=\p{L})/gu;
const SPACE_AFTER_PERIOD = /(?<=\p{L}{3})\.(?=\p{L}{2})/gu;
const UNIT_GLUE = /(\d)\s?(mg|mcg|µg|ml|gr|kg|cm|mmhg|cc|iu|ünite)(?!\p{L})/giu;
const UNIT_THEN_WORD = /(\d)\s?(mg|mcg|ml)(?=\p{L}{3,})/giu;
const BODY_TEMP = /(?<![\d.,])(3[4-9]|4[0-3])(?:([.,])(\d))?\s*(?:derece|°\s?c|°)(?!\p{L})/giu;

const TR_QUESTION = new RegExp(
  `${NOT_BEFORE}(?:${PARTICLE}|nasıl${L}*|nere${L}*|neden|niye|niçin|kaç(?:ta|ıncı|ı)?|hangi${L}*|kim(?:e|i|in|den)?|ne zaman)${NOT_AFTER}`,
  'iu',
);
const TR_QUESTION_END = /(?<!\p{L})ne$/iu;
const EN_QUESTION_START = /^(?:do|does|did|are|is|am|can|could|will|would|have|has|should|what|where|when|why|how|who|which)\b/i;

const CASED_SCRIPTS = new Set(['latin', 'cyrillic', 'greek', 'armenian']);

export interface NormalizeOptions {
  /** Final text gets terminal punctuation; streaming text does not. */
  final?: boolean;
}

function fixTurkish(text: string): string {
  let out = text.replace(ASCII_WORD, (w) => ASCII_FIXES[w] ?? w);
  for (const re of COMPOUND_RES) out = out.replace(re, '$1 $2');
  out = out.replace(POSSESSIVE_VAR, '$1 $2');
  out = out.replace(PREDICATE_PARTICLE, (_m, word, q, person = '') => `${word} ${q}${person}`);
  out = out.replace(VERB_PARTICLE, (m, word, q, person = '') =>
    PARTICLE_EXCEPTIONS.has(m.toLowerCase()) ? m : `${word} ${q}${person}`,
  );
  out = out.replace(BODY_TEMP, (_m, whole, sep, dec) => (dec ? `${whole}${sep}${dec} °C` : `${whole} °C`));
  return out;
}

function capitalizeSentences(text: string, lang: string): string {
  const upper = (ch: string) => (lang === 'tr' ? capitalizeTr(ch) : ch.toLocaleUpperCase(lang));
  const out = text.replace(/([.!?]\s+)(\p{Ll})/gu, (_m, p, ch) => p + upper(ch));
  return out ? upper(out.charAt(0)) + out.slice(1) : out;
}

function isQuestion(text: string, lang: string): boolean {
  const last = text.split(/[.!?]\s+/).pop() ?? text;
  if (lang === 'tr') return TR_QUESTION.test(last) || TR_QUESTION_END.test(last.trim());
  if (lang === 'en') return EN_QUESTION_START.test(last.trim());
  return false;
}

/** Clean a recognized utterance. `lang` is "tr" or the patient language code. */
export function normalizeTranscript(input: string, lang: string, options: NormalizeOptions = {}): string {
  let text = input.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  const isTurkish = lang === 'tr';
  const scripts = isTurkish ? ['latin'] : getLanguage(lang).scripts;
  const spaced = scripts.some((s) => s !== 'han' && s !== 'kana' && s !== 'thai');

  text = text.replace(FILLER, ' ').replace(STUTTER, '$1').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  if (isTurkish) text = fixTurkish(text.replace(LEADING_SEY, ''));

  text = text.replace(UNIT_THEN_WORD, '$1 $2 ');
  text = text.replace(UNIT_GLUE, (_m, d, u) => `${d} ${u.toLowerCase() === 'mmhg' ? 'mmHg' : u}`);

  if (spaced) {
    text = text.replace(lang === 'fr' ? SPACE_BEFORE_PUNCT_FR : SPACE_BEFORE_PUNCT, '$1');
    text = text.replace(SPACE_AFTER_PUNCT, '$1 ').replace(SPACE_AFTER_PERIOD, '. ');
  }
  text = text.replace(/\s{2,}/g, ' ').trim();

  if (isTurkish || scripts.some((s) => CASED_SCRIPTS.has(s))) {
    text = capitalizeSentences(text, isTurkish ? 'tr' : lang);
  }

  if (options.final && spaced && /[\p{L}\p{N}]$/u.test(text)) {
    text += isQuestion(text, isTurkish ? 'tr' : lang) ? '?' : '.';
  }
  return text;
}

/**
 * Append a streamed transcript fragment. The service sometimes splits at a
 * word boundary without a space ("Ağrınız" + "var"), so a space is inserted
 * between two letters. Some deployments resend the whole text so far; that
 * cumulative form replaces the current text instead of duplicating it.
 */
export function appendFragment(current: string, fragment: string): string {
  if (!current) return fragment.trimStart();
  if (!fragment.trim()) return current;
  const incoming = fragment.trim();
  if (incoming.length >= current.length && incoming.toLowerCase().startsWith(current.trim().toLowerCase())) {
    return incoming;
  }
  if (/^\s/.test(fragment)) return current.trimEnd() + ' ' + incoming;
  // Scripts without spaces (Chinese, Japanese, Thai) never get one
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]$/u.test(current)) return current + incoming;
  const afterWord = /[\p{L}\p{N},!?;:]$/u.test(current) || (/\.$/.test(current) && /^\p{L}/u.test(incoming));
  return afterWord && /^[\p{L}\p{N}]/u.test(incoming) ? `${current} ${incoming}` : current + incoming;
}
