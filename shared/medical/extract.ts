import { capitalizeTr, editDistance, escapeRegExp, fold, lowerTr, words } from '../text';
import type { Fact, FactCategory, Speaker } from '../types';
import {
  ALLERGENS,
  CANCER_RE,
  CONDITIONS,
  DRUGS,
  type DrugEntry,
  drugLabel,
  FAMILY_EVENTS,
  FAMILY_MEMBERS,
  NEEDS,
  PAIN_SITES,
  PAIN_WORDS,
  SURGERIES,
  SYMPTOMS,
} from './lexicon';

/**
 * Deterministic clinical fact extraction from one utterance (Turkish text).
 *
 * Pipeline per utterance:
 *   1. split into clauses (sentence → adversative → comma groups with their own predicate)
 *   2. per clause: question? future? negated (outside the entity's own words)?
 *   3. match lexicon entities with Turkish suffix tolerance
 *   4. route each entity to a category by clause cues (allergy cue, family member…)
 *   5. use the nurse's previous question to interpret short answers ("Evet, penisilin.")
 */

export interface Utterance {
  id: string;
  speaker: Speaker;
  /** Turkish text: the nurse's own words, or the Turkish translation of the patient. */
  text: string;
  at: number;
}

type Topic = 'allergy' | 'medication' | 'surgery' | 'chronic' | 'smoking' | 'alcohol' | 'family' | 'pain_score';

interface Subject {
  category: FactCategory;
  key: string;
  label: string;
}

interface PendingQuestion {
  topic: Topic;
  subject?: Subject;
  at: number;
}

/** Remembers the nurse's last question so the patient's short answer can be read. */
export class DialogueState {
  pending?: PendingQuestion;
}

// ───────────────────────────── matching ─────────────────────────────

const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';

interface Matcher {
  alias: string;
  re: RegExp;
  /** Alias without spaces is short and ambiguous: only exact or apostrophe-suffixed matches. */
  short: boolean;
}

function compile(alias: string, strictShort: boolean): Matcher {
  const parts = alias.trim().split(/\s+/).map(escapeRegExp);
  const short = strictShort && alias.replace(/\s/g, '').length <= 4;
  const suffix = short ? "(?:['’]\\p{L}{1,6})?" : "(?:['’]?\\p{L}{0,7})";
  return { alias, re: new RegExp(`${B}${parts.join('\\s+')}${suffix}${E}`, 'gu'), short };
}

interface Compiled<T> {
  entry: T;
  matchers: Matcher[];
}

function compileAll<T extends { aliases: string[] }>(entries: T[], strictShort = false): Compiled<T>[] {
  return entries.map((entry) => ({ entry, matchers: entry.aliases.map((a) => compile(a, strictShort)) }));
}

// Short drug names ("ator", "kemo") must match exactly; other short terms only appear with strong cues.
const DRUG_M = compileAll(DRUGS, true);
const CONDITION_M = compileAll(CONDITIONS);
const SURGERY_M = compileAll(SURGERIES);
const ALLERGEN_M = compileAll(ALLERGENS);
const FAMILY_EVENT_M = compileAll(FAMILY_EVENTS);
const SYMPTOM_RE = SYMPTOMS.map((s) => ({ label: s.label, re: new RegExp(`${B}(?:${s.pattern})`, 'gu') }));
const NEED_RE = NEEDS.map((n) => ({ label: n.label, re: new RegExp(`${B}(?:${n.pattern})`, 'u') }));
const PAIN_RE = PAIN_SITES.map(([label, site]) => ({
  label,
  re: new RegExp(`${B}(?:${site})\\s+${PAIN_WORDS}`, 'gu'),
}));
const GENERIC_PAIN = new RegExp(`${B}ağrı(?:m|yor|yorum|sı|m var)?${E}`, 'u');
const FAMILY_RE = FAMILY_MEMBERS.map(([label, pattern]) => ({ label, re: new RegExp(`${B}(?:${pattern})${E}`, 'gu') }));

/** Family members mentioned in a clause, with positions. */
function familyMentions(text: string): { label: string; start: number }[] {
  const out: { label: string; start: number }[] = [];
  for (const f of FAMILY_RE) {
    f.re.lastIndex = 0;
    for (const m of text.matchAll(f.re)) out.push({ label: f.label, start: m.index ?? 0 });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The member a disease belongs to: the nearest mention before it, else the first after. */
function memberFor(mentions: { label: string; start: number }[], at: number): string | undefined {
  const before = mentions.filter((m) => m.start <= at).pop();
  return (before ?? mentions.find((m) => m.start > at))?.label;
}

interface Hit<T> {
  entry: T;
  alias?: string;
  start: number;
  end: number;
}

function findHits<T>(text: string, compiled: Compiled<T>[]): Hit<T>[] {
  const hits: Hit<T>[] = [];
  for (const { entry, matchers } of compiled) {
    for (const { re, alias } of matchers) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const start = m.index ?? 0;
        hits.push({ entry, alias, start, end: start + m[0].length });
      }
    }
  }
  // Prefer the longest match when aliases overlap ("tip 2 diyabet" over "diyabet")
  hits.sort((a, b) => b.end - b.start - (a.end - a.start));
  const kept: Hit<T>[] = [];
  for (const h of hits) {
    if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  }
  return kept.sort((a, b) => a.start - b.start);
}

const MED_CONTEXT = new RegExp(
  `${B}(?:ilaç\\p{L}*|hap\\p{L}*|tablet\\p{L}*|kapsül\\p{L}*|şurup\\p{L}*|iğne\\p{L}*|damla\\p{L}*|sprey\\p{L}*|mg|miligram|doz\\p{L}*|reçete\\p{L}*|kullan\\p{L}*|içiyor\\p{L}*|içtim|alıyor\\p{L}*|aldım|başladım|veriyor\\p{L}*)${E}`,
  'u',
);

const FUZZY_DRUG_ALIASES = DRUGS.flatMap((d) =>
  d.aliases.filter((a) => !a.includes(' ') && a.length >= 6).map((a) => ({ alias: a, entry: d })),
);

// Frequent words that sit within one edit of a drug name.
const FUZZY_STOP = new Set(['kullan', 'kalbim', 'parola', 'paralar', 'zaman', 'insanlar']);
// Word stems that sit within one edit of a drug name in any inflection ("kolesterolüm" ~ "kolestor").
const FUZZY_STOP_STEM = /^(?:kolesterol|cholesterol)/;

/** Spelling-independent key: brand names are often written as heard ("ogmentin", "voltaren"). */
function phonetic(text: string): string {
  return fold(text)
    .replace(/au/g, 'o')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/qu/g, 'k')
    .replace(/[qc](?=[aou])/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/w/g, 'v')
    .replace(/(.)\1/g, '$1');
}

/** Recognizer misspellings of drug names ("ogmentin", "pantpaz"), only inside a medication context. */
function fuzzyDrugHits(text: string, taken: Hit<DrugEntry>[], anyContext = false): Hit<DrugEntry>[] {
  if (!anyContext && !MED_CONTEXT.test(text)) return [];
  const out: Hit<DrugEntry>[] = [];
  for (const m of text.matchAll(/\p{L}{6,}/gu)) {
    const token = m[0];
    const start = m.index ?? 0;
    if (FUZZY_STOP.has(token) || FUZZY_STOP_STEM.test(token) || taken.some((t) => start < t.end && t.start < start + token.length)) continue;
    const p = phonetic(token);
    for (const { alias, entry } of FUZZY_DRUG_ALIASES) {
      const a = phonetic(alias);
      if (a[0] !== p[0]) continue;
      const max = a.length >= 9 ? 2 : 1;
      // Compare with the Turkish suffix trimmed to the alias length (±1)
      const d = Math.min(
        editDistance(p.slice(0, a.length), a, max),
        editDistance(p.slice(0, a.length + 1), a, max),
        editDistance(p.slice(0, Math.max(1, a.length - 1)), a, max),
      );
      if (d <= max) {
        out.push({ entry, start, end: start + token.length });
        break;
      }
    }
  }
  return out;
}

// ───────────────────────────── clauses ─────────────────────────────

interface Clause {
  text: string;
  question: boolean;
}

const PREDICATE = /(?<!\p{L})(?:var|yok|değil\p{L}*|oldu\p{L}*|olmadı\p{L}*)(?!\p{L})|\p{L}{2,}(?:[ıiuü]yor|[dt][ıiuü]|m[ıiuü]ş|[ae]c[ae]k|m[ae]z|[ae]r|[ıiuü]r|[dt][ıiuü]m)\p{L}{0,6}(?!\p{L})/u;
const QUESTION = /(?<!\p{L})(?:m[ıiuü](?:s[ıiuü]n[ıiuü]z|s[ıiuü]n|y[ıiuü]m|y[ıiuü]z|yd[ıiuü])?|nasıl\p{L}*|nere\p{L}*|neden|niye|kaç|hangi\p{L}*|ne zaman)(?!\p{L})/u;

function splitClauses(text: string): Clause[] {
  const out: Clause[] = [];
  for (const m of text.matchAll(/([^.!?;]+)([.!?;]*)/g)) {
    const sentence = m[1].trim();
    if (!sentence) continue;
    const endsWithQuestion = m[2].includes('?');
    const parts = sentence.split(/\s+(?:ama|fakat|ancak|lakin|yalnız)\s+/u);
    parts.forEach((part, pi) => {
      // Comma groups without their own predicate belong to the next group ("Parol, Beloc kullanmıyorum")
      let carry = '';
      const pieces = part.split(/\s*,\s*/);
      pieces.forEach((piece, i) => {
        const merged = carry ? `${carry}, ${piece}` : piece;
        const last = i === pieces.length - 1;
        if (PREDICATE.test(piece) || last) {
          // "Nefes alamıyorum, su verebilir misiniz?" is a statement followed by a question
          const question = QUESTION.test(piece) || (last && pi === parts.length - 1 && endsWithQuestion);
          if (merged.trim()) out.push({ text: merged.trim(), question });
          carry = '';
        } else carry = merged;
      });
    });
  }
  return out;
}

const NEG_WORD = /(?<!\p{L})(?:yok|yoktur|yokmuş|değil\p{L}*|hayır|hiç|asla|hiçbir)(?!\p{L})/u;
const NEG_VERB = /(?<!\p{L})(\p{L}{2,}?)(?:m[ıiuü]yor|m[ae]d[ıi]|m[ae]m[ıi]ş|m[ae]z|m[ae]m)\p{L}*/gu;
// Negated verbs that assert a symptom persists: "ağrım geçmiyor", "ateşim düşmüyor"
const PERSIST_STEMS = ['geç', 'dur', 'din', 'kesil', 'azal', 'bit', 'git', 'hafifle', 'düş', 'in', 'yatış', 'rahatla', 'kes'];

/** Negation anywhere in the clause except inside the entity's own words. */
function isNegated(clause: string, exclude?: { start: number; end: number }): boolean {
  const text = exclude ? clause.slice(0, exclude.start) + ' '.repeat(exclude.end - exclude.start) + clause.slice(exclude.end) : clause;
  if (NEG_WORD.test(text)) return true;
  NEG_VERB.lastIndex = 0;
  for (const m of text.matchAll(NEG_VERB)) {
    const stem = m[1];
    if (!PERSIST_STEMS.some((p) => stem.endsWith(p))) return true;
  }
  return false;
}

const FUTURE = /(?<!\p{L})(?:yarın|ileride|olacak\p{L}*|yapılacak\p{L}*)(?!\p{L})|\p{L}(?:[ae]c[ae][kğ])\p{L}*/u;
const QUIT = /(?<!\p{L})bırak(?:tım|mıştım|alı|tı)\p{L}*/u;

// ───────────────────────────── details ─────────────────────────────

const NUM_WORD = '(?:\\d+|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|yarım)';
const DOSE = /(\d+(?:[.,]\d+)?)\s?(mg|mcg|µg|gr|g|ml|ünite|iu)(?![\p{L}])/iu;
const FREQUENCY = new RegExp(
  `(?:günde\\s+${NUM_WORD}\\s*(?:kez|kere|defa|tane|tablet)?|${NUM_WORD}\\s*[x×]\\s*${NUM_WORD}|sabah(?:ları)?\\s+akşam(?:ları)?|sabahları|akşamları|gece yatarken|aç karnına|tok karnına|haftada\\s+${NUM_WORD}\\s*(?:kez|kere|gün)?|ihtiyaç (?:halinde|olunca)|ağrı olunca|lüzum halinde)`,
  'iu',
);
const DURATION = new RegExp(
  `(?<!\\p{L})(?:${NUM_WORD}\\s+(?:gündür|saattir|haftadır|aydır|yıldır|senedir|dakikadır)|(?:dünden|sabahtan|akşamdan|geceden|dün geceden|dün akşamdan)\\s+beri|${NUM_WORD}\\s+(?:gün|saat|hafta|ay)\\s+(?:önce|evvel)\\s+başla\\p{L}*)`,
  'iu',
);
const YEAR = new RegExp(`(?<!\\d)((?:19|20)\\d{2})(?!\\d)|(${NUM_WORD})\\s+(yıl|sene|ay)\\s+önce`, 'iu');
const PAIN_SCORE = /(?<!\d)(\d{1,2})\s*\/\s*10(?!\d)|(?:10|on)\s+üzerinden\s+(\d{1,2}|\p{L}+)|(\d{1,2})\s+(?:puan|üzerinden)|şiddeti\s+(\d{1,2})/iu;
const TR_DIGITS: Record<string, number> = { sıfır: 0, bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10 };

function parseSmallNumber(raw?: string): number | undefined {
  if (!raw) return undefined;
  const n = /^\d+$/.test(raw) ? Number(raw) : TR_DIGITS[raw];
  return n !== undefined && n >= 0 && n <= 10 ? n : undefined;
}

// ───────────────────────────── categories ─────────────────────────────

const ALLERGY_CUE = /(?<!\p{L})(?:alerj\p{L}*|dokun(?:uyor|du|ur)\p{L}*|reaksiyon\p{L}*|aşırı duyarlı\p{L}*)/u;
const SMOKING = /(?<!\p{L})(?:sigara\p{L}*|tütün\p{L}*|puro\p{L}*|nargile\p{L}*|elektronik sigara)/u;
const ALCOHOL = /(?<!\p{L})(?:alkol\p{L}*|içki\p{L}*|rakı\p{L}*|bira\p{L}*|şarap\p{L}*|votka\p{L}*|viski\p{L}*)/u;
const SUBSTANCE = /(?<!\p{L})(?:uyuşturucu\p{L}*|esrar\p{L}*|madde kullan\p{L}*)/u;
const SMOKE_AMOUNT = new RegExp(`(?:günde\\s+)?(${NUM_WORD})\\s+(paket|tane|adet|dal)`, 'iu');
const SINCE_YEARS = new RegExp(`(${NUM_WORD})\\s+(?:yıl|sene)(?:dır|dir|dan beri|den beri)`, 'iu');
const ALCOHOL_FREQ = /(sosyal\p{L}*|ara sıra|nadiren|hafta sonları|her gün|günde\s+\p{L}+|haftada\s+\p{L}+(?:\s+(?:kez|kere|gün))?|düzenli)/iu;

const COURTESY = /^(?:merhaba\p{L}*|günaydın|iyi (?:günler|akşamlar|geceler)|geçmiş olsun|hoş geldiniz|teşekkür\p{L}*|rica ederim|kolay gelsin|ben\s+\p{L}+.*hemşire\p{L}*|merak etmeyin|endişelenmeyin|korkmayın|tamam\p{L}*|peki)/iu;
const IMPERATIVE_END = /\p{L}{2,}(?:[ıiuü]n|y[ıiuü]n|m[ae]y[ıi]n)$/u;
// Nurse sentences that state something about the patient ("Şeker hastasısınız", "Beloc kullanıyorsunuz")
const ABOUT_PATIENT = /(?:s[ıiuü]n[ıiuü]z|[ıiuü]n[ıiuü]z)(?!\p{L})/u;
// "Damar yolu açacağım" (I will…) and "İlacı sabah alacaksınız" (you will…)
const NURSE_FUTURE = /\p{L}(?:[ae]c[ae]ğ(?:im|ım|iz|ız)|[ae]c[ae]ks[ıi]n[ıi]z)(?!\p{L})/u;
const OBLIGATION = /(?<!\p{L})(?:gerek\p{L}*|lazım|zorunda\p{L}*|şart)(?!\p{L})|m[ae]l[ıi]s[ıi]n[ıi]z/u;

function sentence(text: string): string {
  const t = capitalizeTr(text.trim().replace(/\s+/g, ' '));
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function key(category: FactCategory, label: string): string {
  return `${category}:${fold(label).replace(/\s*\(.*?\)\s*/g, ' ').trim()}`;
}

function quote(text: string): string {
  const t = text.trim();
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

function withDuration(label: string, duration?: string): string {
  return duration ? `${label} (${lowerTr(duration)})` : label;
}

function yearNote(clause: string): string | undefined {
  const m = clause.match(YEAR);
  if (!m) return undefined;
  return m[1] ? m[1] : `${m[2]} ${m[3]} önce`;
}

// ───────────────────────────── main ─────────────────────────────

type Draft = Omit<Fact, 'origin' | 'at' | 'turnId'>;

function detectTopic(text: string): PendingQuestion['topic'] | undefined {
  if (/alerj/u.test(text)) return 'allergy';
  if (SMOKING.test(text)) return 'smoking';
  if (ALCOHOL.test(text)) return 'alcohol';
  if (/ameliyat|operasyon/u.test(text)) return 'surgery';
  if (/(?:ailenizde|ailede|annenizde|babanızda|kardeşlerinizde)/u.test(text)) return 'family';
  if (/(?:1|bir)['’]?\s*(?:den|dan|ile)\s*(?:10|on)|(?:10|on) üzerinden|ağrınız(?:ı)? kaç|kaç puan|puanla\p{L}*/u.test(text)) return 'pain_score';
  if (/(?:ilaç|hap)\p{L}*/u.test(text)) return 'medication';
  if (/(?:kronik|hastalığınız|hastalık\p{L}*\s+var|hastası mısınız|hastalığı var)/u.test(text)) return 'chronic';
  return undefined;
}

const YES = /^(?:evet|var|vardır|tabii|tabi|elbette|aynen|doğru|maalesef var|kullanıyorum|içiyorum|oldum|geçirdim)(?!\p{L})/u;
const NO = /^(?:hayır|yok|yoktur|hiç|kullanmıyorum|içmiyorum|olmadım|geçirmedim|değilim|içmem)(?!\p{L})/u;

export function extractFacts(u: Utterance, state: DialogueState): Fact[] {
  const lower = lowerTr(u.text.trim());
  if (!lower) return [];
  const drafts: Draft[] = [];
  const add = (d: Draft) => {
    if (!drafts.some((x) => x.key === d.key)) drafts.push(d);
  };
  const isPatient = u.speaker === 'patient';
  const clauses = splitClauses(lower);
  const originalClauses = splitClauses(u.text.trim());
  const turnDuration = lower.match(DURATION)?.[0];
  let locatedPain = false;

  clauses.forEach((clause, ci) => {
    const c = clause.text;
    const evidence = quote(originalClauses[ci]?.text ?? clause.text);
    const future = FUTURE.test(c);
    const allergyCue = ALLERGY_CUE.test(c);
    const family = familyMentions(c);

    // Needs are often phrased as questions ("Su verebilir misiniz?")
    if (isPatient) {
      for (const n of NEED_RE) if (n.re.test(c)) add({ key: key('need', n.label), category: 'need', text: n.label, evidence });
    }

    if (clause.question) {
      if (!isPatient) {
        const topic = detectTopic(c);
        if (topic) state.pending = { topic, subject: questionSubject(c, topic), at: u.at };
      }
      return;
    }

    // Nursing instructions: imperative, "I will …" or obligation, not small talk
    if (!isPatient && !COURTESY.test(c) && c.length >= 8) {
      const lastWord = words(c).pop() ?? '';
      if (IMPERATIVE_END.test(lastWord) || NURSE_FUTURE.test(c) || OBLIGATION.test(c)) {
        const text = sentence(originalClauses[ci]?.text ?? c);
        add({ key: key('instruction', text.slice(0, 60)), category: 'instruction', text });
      }
    }

    // Habits
    if (SMOKING.test(c)) {
      const span = c.match(SMOKING);
      if (QUIT.test(c)) add({ key: 'habit:smoking', category: 'habit', text: appendNote('Sigarayı bırakmış', yearNote(c)), evidence });
      else if (isNegated(c, span ? { start: span.index ?? 0, end: (span.index ?? 0) + span[0].length } : undefined)) {
        add({ key: 'habit:smoking', category: 'habit', text: 'Sigara kullanmıyor', negated: true, evidence });
      } else if (!future) {
        const amount = c.match(SMOKE_AMOUNT);
        const years = c.match(SINCE_YEARS) ?? lower.match(SINCE_YEARS);
        const detail = [amount ? `günde ${amount[1]} ${amount[2]}` : '', years ? `${years[1]} yıldır` : ''].filter(Boolean).join(', ');
        add({ key: 'habit:smoking', category: 'habit', text: detail ? `Sigara: ${detail}` : 'Sigara kullanıyor', evidence });
      }
    }
    if (ALCOHOL.test(c) && !SMOKING.test(c)) {
      if (QUIT.test(c)) add({ key: 'habit:alcohol', category: 'habit', text: 'Alkolü bırakmış', evidence });
      else if (isNegated(c)) add({ key: 'habit:alcohol', category: 'habit', text: 'Alkol kullanmıyor', negated: true, evidence });
      else if (!future) {
        const freq = c.match(ALCOHOL_FREQ);
        add({ key: 'habit:alcohol', category: 'habit', text: freq ? `Alkol: ${lowerTr(freq[1])}` : 'Alkol kullanıyor', evidence });
      }
    }
    if (SUBSTANCE.test(c)) {
      add({ key: 'habit:substance', category: 'habit', text: isNegated(c) ? 'Madde kullanmıyor' : 'Madde kullanımı', negated: isNegated(c) || undefined, evidence });
    }

    // Facts about the patient's history come from the patient, or from the nurse restating them
    const history = !future && (isPatient || ABOUT_PATIENT.test(c));

    // Drugs: an allergy cue turns them into allergies, otherwise current medication
    const exactDrugs = findHits(c, DRUG_M);
    const drugHits = [...exactDrugs, ...fuzzyDrugHits(c, exactDrugs)].filter((h) => {
      // Suffixed matches of short names need a medication context ("parola" is a password)
      const surface = c.slice(h.start, h.end);
      const aliasHit = h.entry.aliases.some((a) => fold(surface) === fold(a));
      return aliasHit || /['’]/.test(surface) || MED_CONTEXT.test(c) || allergyCue;
    });
    const allergenHits = findHits(c, ALLERGEN_M);

    if (allergyCue && history) {
      const negated = isNegated(c);
      const items = [
        ...drugHits.map((h) => ({ label: drugLabel(h.entry, h.alias), start: h.start })),
        ...allergenHits
          .filter((a) => !drugHits.some((d) => a.start < d.end && d.start < a.end))
          .map((h) => ({ label: h.entry.label, start: h.start })),
      ];
      if (items.length === 0) {
        add({
          key: 'allergy:__none__',
          category: 'allergy',
          text: negated ? 'Bilinen alerji yok' : 'Alerji var (madde belirtilmedi)',
          negated: negated || undefined,
          pinned: !negated && isPatient,
          evidence,
        });
      }
      for (const item of items) {
        add({ key: key('allergy', item.label), category: 'allergy', text: item.label, negated: negated || undefined, pinned: !negated, evidence });
      }
    } else if (history) {
      drugHits.forEach((h, i) => {
        // Dose and frequency belong to the drug they follow, up to the next drug
        const tail = c.slice(h.end, Math.min(drugHits[i + 1]?.start ?? c.length, h.end + 60));
        const dose = tail.match(DOSE);
        const freq = tail.match(FREQUENCY);
        const label = drugLabel(h.entry, h.alias);
        const detail = [dose ? `${dose[1]} ${dose[2].toLowerCase()}` : '', freq ? lowerTr(freq[0]) : ''].filter(Boolean);
        const negated = isNegated(c, h);
        if (!isPatient && negated) return;
        add({
          key: key('medication', h.entry.generic ?? h.entry.name),
          category: 'medication',
          text: detail.length ? `${label} ${detail.join(' · ')}` : label,
          negated: negated || undefined,
          evidence,
        });
      });
    }

    // Conditions, family history, surgeries
    const conditionHits = findHits(c, CONDITION_M);
    const cancer = c.match(CANCER_RE);
    const familyEvents = family.length ? findHits(c, FAMILY_EVENT_M) : [];
    const diseaseLabels = [
      ...conditionHits.map((h) => ({ label: h.entry.label, start: h.start, end: h.end })),
      ...(cancer ? [{ label: cancerLabel(cancer), start: cancer.index ?? 0, end: (cancer.index ?? 0) + cancer[0].length }] : []),
      ...familyEvents.map((h) => ({ label: h.entry.label, start: h.start, end: h.end })),
    ];
    for (const d of history ? diseaseLabels : []) {
      const negated = isNegated(c, d);
      const member = memberFor(family, d.start);
      if (member) {
        add({ key: key('family', `${member} ${d.label}`), category: 'family', text: `${member}: ${d.label}`, negated: negated || undefined, evidence });
      } else {
        add({ key: key('chronic', d.label), category: 'chronic', text: d.label, negated: negated || undefined, evidence });
      }
    }

    for (const h of history ? findHits(c, SURGERY_M) : []) {
      const negated = isNegated(c, h);
      add({ key: key('surgery', h.entry.label), category: 'surgery', text: appendNote(h.entry.label, yearNote(c)), negated: negated || undefined, evidence });
    }
    const genericSurgery = c.match(/(?<!\p{L})(\p{L}{3,})\s+ameliyatı\s+(?:oldum|geçirdim|olmuştum|yapıldı|oldu|geçirmiştim)/u);
    if (history && genericSurgery && !findHits(c, SURGERY_M).length && !/^(bir|bu|şu|o)$/.test(genericSurgery[1])) {
      const label = `${capitalizeTr(genericSurgery[1])} ameliyatı`;
      add({ key: key('surgery', label), category: 'surgery', text: appendNote(label, yearNote(c)), evidence });
    }

    // Patient complaints
    if (isPatient) {
      for (const p of PAIN_RE) {
        p.re.lastIndex = 0;
        const m = p.re.exec(c);
        if (m) {
          locatedPain = true;
          const span = { start: m.index, end: m.index + m[0].length };
          const negated = isNegated(c, span);
          add({ key: key('complaint', `${p.label} ağrısı`), category: 'complaint', text: withDuration(`${p.label} ağrısı`, negated ? undefined : turnDuration), negated: negated || undefined, evidence });
        }
      }
      for (const s of SYMPTOM_RE) {
        s.re.lastIndex = 0;
        const m = s.re.exec(c);
        if (m) {
          const negated = isNegated(c, { start: m.index, end: m.index + m[0].length });
          add({ key: key('complaint', s.label), category: 'complaint', text: withDuration(s.label, negated ? undefined : turnDuration), negated: negated || undefined, evidence });
        }
      }
      if (!locatedPain && GENERIC_PAIN.test(c) && !/ağrı kesici/u.test(c)) {
        const negated = isNegated(c, matchSpan(c, GENERIC_PAIN));
        add({ key: 'complaint:agri', category: 'complaint', text: withDuration('Ağrı', negated ? undefined : turnDuration), negated: negated || undefined, evidence });
      }
      const score = c.match(PAIN_SCORE);
      const value = score && parseSmallNumber(score[1] ?? score[2] ?? score[3] ?? score[4]);
      if (value !== undefined && value !== null) {
        add({ key: 'complaint:pain-score', category: 'complaint', text: `Ağrı şiddeti: ${value}/10`, evidence });
      }
    }
  });

  if (isPatient) answerPendingQuestion(lower, u, state, drafts, add);

  return drafts.map((d) => ({ ...d, origin: 'local' as const, at: u.at, turnId: u.id }));
}

function appendNote(label: string, note?: string): string {
  return note ? `${label} (${note})` : label;
}

function matchSpan(text: string, re: RegExp) {
  const m = text.match(re);
  return m ? { start: m.index ?? 0, end: (m.index ?? 0) + m[0].length } : undefined;
}

function cancerLabel(m: RegExpMatchArray): string {
  const organ = m[1] && !/^(bir|bu|şu|o|ve)$/u.test(m[1]) ? `${capitalizeTr(m[1])} ` : '';
  const kind = m[2].startsWith('lösemi') ? 'Lösemi' : m[2].startsWith('lenfoma') ? 'Lenfoma' : m[2].startsWith('tümör') ? 'tümörü' : 'kanseri';
  return organ ? `${organ}${kind}` : capitalizeTr(kind === 'kanseri' ? 'Kanser' : kind === 'tümörü' ? 'Tümör' : kind);
}

function questionSubject(text: string, topic: Topic): Subject | undefined {
  if (topic === 'chronic') {
    const h = findHits(text, CONDITION_M)[0];
    if (h) return { category: 'chronic', key: key('chronic', h.entry.label), label: h.entry.label };
  }
  if (topic === 'allergy') {
    const d = findHits(text, DRUG_M)[0];
    if (d) return { category: 'allergy', key: key('allergy', drugLabel(d.entry, d.alias)), label: drugLabel(d.entry, d.alias) };
    const a = findHits(text, ALLERGEN_M)[0];
    if (a) return { category: 'allergy', key: key('allergy', a.entry.label), label: a.entry.label };
  }
  if (topic === 'surgery') {
    const s = findHits(text, SURGERY_M)[0];
    if (s) return { category: 'surgery', key: key('surgery', s.entry.label), label: s.entry.label };
  }
  return undefined;
}

const ANSWER_WINDOW_MS = 120_000;

// Words in a short answer that are not substance names
const ANSWER_FILLER =
  /^(?:evet|var|vardır|tabii|tabi|elbette|aynen|maalesef|bir|de|da|ve|ile|veya|ya|bide|hem|şey|mesela|yani|ama|bu|şu|o|bunlar|onlar|ilaç\p{L}*|alerji\p{L}*|karşı|için|olarak|çok|biraz|bazı|tane|iki|üç)$/u;
// An unsure or narrative reply is not a list of allergens
const ANSWER_DOUBT = /(?<!\p{L})(?:bilmiyorum|emin değilim|sanırım|galiba|herhalde|hatırlamıyorum|olabilir|belki)(?!\p{L})/u;
// Inflected verbs and everyday words that cannot be a drug or allergen name
const NOT_A_NAME =
  /(?:[ıiuü]?yor\p{L}*|m[ıiuü]ş\p{L}*|[dt][ıiuü]m?|acak\p{L}*|ecek\p{L}*|l[ae]r\p{L}*)$|^(?:ben|sen|biz|siz|bana|beni|benim|hep|daha|sonra|önce|kez|defa|her|gün|ay|yıl|hafta|geçen|geçenlerde|doktor\p{L}*|hastane\p{L}*|sabah\p{L}*|akşam\p{L}*|şimdi|hiç|başka|hayır|yok)$/u;

function answerPendingQuestion(
  lower: string,
  u: Utterance,
  state: DialogueState,
  drafts: Draft[],
  add: (d: Draft) => void,
) {
  const q = state.pending;
  state.pending = undefined;
  if (!q || u.at - q.at > ANSWER_WINDOW_MS) return;
  const yes = YES.test(lower);
  const no = NO.test(lower);
  const has = (cat: FactCategory) => drafts.some((d) => d.category === cat && !d.negated);
  const evidence = quote(u.text);

  switch (q.topic) {
    case 'allergy': {
      if (has('allergy')) return;
      if (no) {
        add(q.subject
          ? { key: q.subject.key, category: 'allergy', text: q.subject.label, negated: true, evidence }
          : { key: 'allergy:__none__', category: 'allergy', text: 'Bilinen alerji yok', negated: true, evidence });
        return;
      }
      // "Evet. Amlodis, Avil." answering an allergy question lists allergens, not medications:
      // the patient does not need to repeat "I am allergic to"
      const drugHits = findHits(lower, DRUG_M);
      const fuzzy = fuzzyDrugHits(lower, drugHits, true);
      const allergenHits = findHits(lower, ALLERGEN_M);
      const found: { at: number; label: string }[] = [
        ...drugHits.map((h) => ({ at: h.start, label: drugLabel(h.entry, h.alias) })),
        ...fuzzy.map((h) => ({ at: h.start, label: drugLabel(h.entry) })),
        ...allergenHits.map((h) => ({ at: h.start, label: h.entry.label })),
      ];
      const spans = [...drugHits, ...fuzzy, ...allergenHits];
      const content = words(lower).filter((w) => !ANSWER_FILLER.test(w));
      // Only a short answer that just names substances ("Evet, penisilin.") makes them allergens
      let list = content.length > 0 && content.length <= 6 && !MED_CONTEXT.test(lower) && !ANSWER_DOUBT.test(lower);
      if (list) {
        // Names the lexicon does not know yet ("Evet, Xyzal") are still allergens in this answer
        const unknown: typeof found = [];
        for (const m of u.text.matchAll(/\p{L}[\p{L}-]{2,}/gu)) {
          const w = lowerTr(m[0]);
          const at = lower.indexOf(w);
          if (ANSWER_FILLER.test(w) || spans.some((h) => at >= h.start && at < h.end)) continue;
          if (NOT_A_NAME.test(w)) {
            list = false;
            break;
          }
          unknown.push({ at, label: capitalizeTr(m[0]) });
        }
        if (list) found.push(...unknown);
      }
      const named = found.sort((a, b) => a.at - b.at).map((f) => f.label);
      if (list && named.length) {
        for (let i = drafts.length - 1; i >= 0; i--) if (drafts[i].category === 'medication') drafts.splice(i, 1);
        for (const label of named) add({ key: key('allergy', label), category: 'allergy', text: label, pinned: true, evidence });
      } else if (yes && q.subject) {
        add({ key: q.subject.key, category: 'allergy', text: q.subject.label, pinned: true, evidence });
      } else if (yes) {
        add({ key: 'allergy:__none__', category: 'allergy', text: 'Alerji var (madde belirtilmedi)', pinned: true, evidence });
      }
      return;
    }
    case 'medication':
      if (no && !has('medication')) add({ key: 'medication:__none__', category: 'medication', text: 'Düzenli ilaç kullanmıyor', negated: true, evidence });
      return;
    case 'surgery':
      if (has('surgery')) return;
      if (yes && q.subject) add({ key: q.subject.key, category: 'surgery', text: q.subject.label, evidence });
      else if (no) {
        add(q.subject
          ? { key: q.subject.key, category: 'surgery', text: q.subject.label, negated: true, evidence }
          : { key: 'surgery:__none__', category: 'surgery', text: 'Geçirilmiş ameliyat yok', negated: true, evidence });
      } else if (yes) add({ key: 'surgery:__unspecified__', category: 'surgery', text: 'Geçirilmiş ameliyat var (tür belirtilmedi)', evidence });
      return;
    case 'chronic':
      if (has('chronic')) return;
      if (q.subject && (yes || no)) add({ key: q.subject.key, category: 'chronic', text: q.subject.label, negated: no || undefined, evidence });
      else if (no) add({ key: 'chronic:__none__', category: 'chronic', text: 'Bilinen kronik hastalık yok', negated: true, evidence });
      return;
    case 'smoking':
      if (drafts.some((d) => d.key === 'habit:smoking')) return;
      if (QUIT.test(lower)) add({ key: 'habit:smoking', category: 'habit', text: 'Sigarayı bırakmış', evidence });
      else if (no) add({ key: 'habit:smoking', category: 'habit', text: 'Sigara kullanmıyor', negated: true, evidence });
      else if (yes) {
        const amount = lower.match(SMOKE_AMOUNT);
        add({ key: 'habit:smoking', category: 'habit', text: amount ? `Sigara: günde ${amount[1]} ${amount[2]}` : 'Sigara kullanıyor', evidence });
      }
      return;
    case 'alcohol':
      if (drafts.some((d) => d.key === 'habit:alcohol')) return;
      if (no) add({ key: 'habit:alcohol', category: 'habit', text: 'Alkol kullanmıyor', negated: true, evidence });
      else if (yes) {
        const freq = lower.match(ALCOHOL_FREQ);
        add({ key: 'habit:alcohol', category: 'habit', text: freq ? `Alkol: ${freq[1]}` : 'Alkol kullanıyor', evidence });
      }
      return;
    case 'family': {
      if (has('family')) return;
      // Conditions in the answer belong to the family, not to the patient
      for (let i = drafts.length - 1; i >= 0; i--) {
        const d = drafts[i];
        if (d.category === 'chronic' && !d.negated) {
          drafts.splice(i, 1);
          add({ key: key('family', `Ailede ${d.text}`), category: 'family', text: `Ailede: ${d.text}`, evidence });
        }
      }
      if (no && !has('family')) add({ key: 'family:__none__', category: 'family', text: 'Ailede bilinen hastalık yok', negated: true, evidence });
      return;
    }
    case 'pain_score': {
      if (drafts.some((d) => d.key === 'complaint:pain-score')) return;
      const m = lower.match(/(?<!\d)(\d{1,2})(?!\d)/) ?? lower.match(/(?<!\p{L})(sıfır|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on)(?!\p{L})/u);
      const value = parseSmallNumber(m?.[1]);
      if (value !== undefined) add({ key: 'complaint:pain-score', category: 'complaint', text: `Ağrı şiddeti: ${value}/10`, evidence });
      return;
    }
  }
}

/**
 * Map a free-text fact (e.g. from the AI layer: "Parol 500 mg") onto the same
 * key the local extractor would produce, so both layers deduplicate.
 */
export interface DrugMention {
  /** Folded active ingredient (or brand when unknown): the same drug under any name. */
  identity: string;
  /** Display label, e.g. "Alipza (pitavastatin)". */
  label: string;
  /** The words as they appear in the text. */
  surface: string;
}

/**
 * Drug names in any utterance, in the original or the translated language.
 * With `misheard`, names the recogniser spelled as heard are matched
 * phonetically too, but only when they look like a name (capitalised) or sit in
 * a medication context, to keep everyday words out.
 */
export function drugMentions(text: string, misheard = true): DrugMention[] {
  const lower = lowerTr(text);
  const exact = findHits(lower, DRUG_M);
  const fuzzy = !misheard ? [] : fuzzyDrugHits(lower, exact, true).filter((h) => /^\p{Lu}/u.test(text.slice(h.start, h.end)) || MED_CONTEXT.test(lower));
  return [...exact, ...fuzzy]
    .sort((a, b) => a.start - b.start)
    .map((h) => ({
      identity: fold(h.entry.generic ?? h.entry.name),
      label: drugLabel(h.entry, h.alias),
      surface: text.slice(h.start, h.end),
    }));
}

/** Active ingredient (or brand) a fact names, to spot one drug filed under two categories. */
export function drugIdentity(text: string): string | null {
  const h = findHits(lowerTr(text), DRUG_M)[0];
  return h ? fold(h.entry.generic ?? h.entry.name) : null;
}

export function canonicalKey(category: FactCategory, text: string): string {
  const lower = lowerTr(text);
  switch (category) {
    case 'medication': {
      const h = findHits(lower, DRUG_M)[0];
      if (h) return key('medication', h.entry.generic ?? h.entry.name);
      break;
    }
    case 'allergy': {
      const d = findHits(lower, DRUG_M)[0];
      if (d) return key('allergy', drugLabel(d.entry, d.alias));
      const a = findHits(lower, ALLERGEN_M)[0];
      if (a) return key('allergy', a.entry.label);
      if (/(?:yok|bilinen)/u.test(lower)) return 'allergy:__none__';
      break;
    }
    case 'chronic': {
      const h = findHits(lower, CONDITION_M)[0];
      if (h) return key('chronic', h.entry.label);
      break;
    }
    case 'surgery': {
      const h = findHits(lower, SURGERY_M)[0];
      if (h) return key('surgery', h.entry.label);
      break;
    }
    case 'habit':
      if (SMOKING.test(lower)) return 'habit:smoking';
      if (ALCOHOL.test(lower)) return 'habit:alcohol';
      if (SUBSTANCE.test(lower)) return 'habit:substance';
      break;
    case 'complaint': {
      if (/ağrı şiddeti/u.test(lower)) return 'complaint:pain-score';
      for (const p of PAIN_SITES) if (fold(lower).startsWith(`${fold(p[0])} `) && /ağrı/u.test(lower)) return key('complaint', `${p[0]} ağrısı`);
      for (const sy of SYMPTOMS) if (fold(lower).startsWith(fold(sy.label).slice(0, 5))) return key('complaint', sy.label);
      break;
    }
  }
  return key(category, text.replace(/\s*\(.*?\)\s*/g, ' ').slice(0, 60));
}
