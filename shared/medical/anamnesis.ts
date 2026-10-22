import type { Fact, FactCategory } from '../types';
import { fold, words } from '../text';
import { canonicalKey, drugIdentity } from './extract';

export const CATEGORY_ORDER: FactCategory[] = [
  'complaint',
  'allergy',
  'medication',
  'chronic',
  'surgery',
  'habit',
  'family',
  'need',
  'instruction',
];

export const CATEGORY_TITLES: Record<FactCategory, string> = {
  complaint: 'Aktif Şikayetler & Belirtiler',
  allergy: 'Alerjiler',
  medication: 'Kullanılan İlaçlar',
  chronic: 'Kronik Hastalıklar',
  surgery: 'Geçirilmiş Operasyonlar',
  habit: 'Alışkanlıklar & Yaşam Tarzı',
  family: 'Aile Öyküsü',
  need: 'Hastanın İstek & İhtiyaçları',
  instruction: 'Hemşirelik Notu & Talimatlar',
};

const REPORT_TITLES: Record<FactCategory, string> = {
  complaint: 'BAŞVURU ŞİKAYETLERİ & BELİRTİLER',
  allergy: 'ALERJİLER',
  medication: 'KULLANILAN İLAÇLAR',
  chronic: 'KRONİK HASTALIKLAR',
  surgery: 'GEÇİRİLMİŞ OPERASYONLAR / CERRAHİ ÖYKÜ',
  habit: 'ALIŞKANLIKLAR & YAŞAM TARZI',
  family: 'AİLE ÖYKÜSÜ',
  need: 'HASTANIN İSTEK VE TALEPLERİ',
  instruction: 'HEMŞİRELİK TALİMATLARI',
};

/** Negatives that already read as a sentence ("Bilinen alerji yok", "Sigara kullanmıyor"). */
function isSelfDescribing(f: Fact): boolean {
  return f.key.endsWith('__none__') || f.category === 'habit';
}

/** Text for display: negated entities read "Ateş — yok". */
export function factText(f: Fact): string {
  if (!f.negated || isSelfDescribing(f)) return f.text;
  return `${f.text} — yok`;
}

/** Fold new local facts into the existing set. The latest statement about a key wins. */
export function mergeFacts(existing: Fact[], incoming: Fact[]): Fact[] {
  const byKey = new Map(existing.map((f) => [f.key, f]));
  for (const f of incoming) {
    const prev = byKey.get(f.key);
    // A dose or frequency detail is never lost to a later, vaguer mention
    if (prev && !f.negated && !prev.negated && prev.text.length > f.text.length && prev.text.startsWith(f.text)) {
      byKey.set(f.key, { ...prev, at: f.at });
      continue;
    }
    byKey.set(f.key, prev?.pinned && !f.negated ? { ...f, pinned: true } : f);
  }
  return Array.from(byKey.values());
}

/**
 * A fact the nurse removed: the same entry, or the same drug in the same
 * category under another wording ("Eliquis" and "Eliquis (apiksaban) 5 mg").
 */
export function isRejected(fact: Pick<Fact, 'key' | 'category' | 'text'>, rejected: Pick<Fact, 'category' | 'text'>[]): boolean {
  const key = canonicalKey(fact.category, fact.text);
  const id = drugIdentity(fact.text);
  return rejected.some(
    (r) => r.category === fact.category && (canonicalKey(r.category, r.text) === key || fact.key === canonicalKey(r.category, r.text) || (!!id && drugIdentity(r.text) === id)),
  );
}

// Items that hold one current value: the latest statement replaces the previous one
const isSlot = (key: string) => key === 'complaint:pain-score' || key.startsWith('habit:') || key.endsWith('__none__');

/** Word stems for comparing two wordings of the same item. */
function stems(text: string): Set<string> {
  return new Set(
    words(fold(text.replace(/[()]/g, ' ')))
      .filter((w) => w.length >= 3 || /\d/.test(w))
      .map((w) => w.slice(0, 5)),
  );
}

/** `b` says everything `a` says, and more ("Diyabet" → "Tip 2 diyabet"). */
function richer(a: string, b: string): boolean {
  const sa = stems(a);
  const sb = stems(b);
  return b.length > a.length && sa.size > 0 && [...sa].every((w) => sb.has(w));
}

/** The same clinical item, possibly worded differently ("Beloc" / "Beloc (metoprolol) 50 mg"). */
export function sameItem(a: Pick<Fact, 'key' | 'category' | 'text'>, b: Pick<Fact, 'key' | 'category' | 'text'>): boolean {
  if (a.category !== b.category) return false;
  // Left and right are different findings, even under one key
  const side = (t: string) => {
    const s = stems(t);
    return (s.has('sol') ? 'L' : '') + (s.has('sag') ? 'R' : '');
  };
  const la = side(a.text);
  const lb = side(b.text);
  if (la && lb && la !== lb) return false;
  if (a.key === b.key) return true;
  const da = drugIdentity(a.text);
  const db = drugIdentity(b.text);
  if (da || db) return da === db;
  if (isSlot(a.key) || isSlot(b.key)) return false;
  const sa = stems(a.text);
  const sb = stems(b.text);
  if (!sa.size || !sb.size) return false;
  // The recognised term of one is named in the other ("Şeker hastalığı (diyabet)" / "Tip 2 diyabet")
  const term = (f: Pick<Fact, 'category' | 'text'>) => stems(canonicalKey(f.category, f.text).split(':')[1] ?? '');
  const within = (t: Set<string>, s: Set<string>) => t.size > 0 && [...t].every((w) => s.has(w));
  if (within(term(a), sb) || within(term(b), sa)) return true;
  const [small, big] = sa.size <= sb.size ? [sa, sb] : [sb, sa];
  const common = [...small].filter((w) => big.has(w)).length;
  return common === small.size || common / (sa.size + sb.size - common) >= 0.6;
}

/**
 * Fold a new statement about an existing item into it.
 * `reviewedUpTo` is set for AI facts: the AI may only override what it has read.
 */
function combine(prev: Fact, next: Fact, reviewedUpTo?: number): Fact {
  const fromAi = reviewedUpTo !== undefined;
  const newer = fromAi ? prev.at <= reviewedUpTo : next.at >= prev.at;
  let take: boolean;
  if (!!prev.negated !== !!next.negated || isSlot(prev.key)) {
    // "I have a fever" → "no fever", "7/10" → "4/10": the latest statement holds
    take = newer;
  } else if (fromAi) {
    // A confirmed item keeps its wording unless the AI adds detail; an unconfirmed one takes the AI wording
    take = richer(prev.text, next.text) || (newer && !prev.settled);
  } else {
    // A later local mention wins unless it is a vaguer version ("Beloc" after "Beloc 50 mg")
    take = newer && !richer(next.text, prev.text);
  }
  const base = take
    ? { ...prev, text: next.text, key: next.key, negated: next.negated, evidence: next.evidence ?? prev.evidence, turnId: next.turnId ?? prev.turnId }
    : prev;
  return {
    ...base,
    at: Math.max(prev.at, next.at),
    since: prev.since ?? prev.at,
    origin: fromAi ? 'ai' : prev.origin,
    settled: prev.settled || fromAi || undefined,
    pinned: prev.pinned || next.pinned || undefined,
    verify: next.verify ?? prev.verify,
  };
}

/** Add facts to the ledger: a known item is refined in place, a new one is appended. */
export function addToLedger(ledger: Fact[], incoming: Fact[], reviewedUpTo?: number): Fact[] {
  const out = [...ledger];
  for (const f of incoming) {
    const i = out.findIndex((e) => sameItem(e, f));
    if (i >= 0) out[i] = combine(out[i], f, reviewedUpTo);
    else out.push({ ...f, since: f.since ?? f.at, settled: reviewedUpTo !== undefined || f.settled || undefined });
  }
  return out;
}

/**
 * Apply an AI pass over the conversation to the ledger.
 *
 * The anamnesis must not flicker: an AI pass can add items, add detail and
 * confirm, but leaving an item out of its answer never removes it. Items go
 * away only when
 *   - the conversation explicitly corrected or denied them (`retracted`), or
 *   - they were instant local readings that this pass read and did not
 *     confirm (local misreadings, removed once, before they were settled).
 * The nurse can remove anything by hand (see isRejected).
 */
export function reconcileAi(ledger: Fact[], aiFacts: Fact[], retracted: string[], reviewedUpTo: number): Fact[] {
  const gone = new Set(retracted);
  let out = ledger.filter((f) => !gone.has(f.key) && !gone.has(canonicalKey(f.category, f.text)));
  const confirmed = new Set<Fact>();
  for (const a of aiFacts) {
    const i = out.findIndex((e) => sameItem(e, a));
    if (i >= 0) {
      out[i] = combine(out[i], a, reviewedUpTo);
      confirmed.add(out[i]);
    } else {
      const added: Fact = { ...a, origin: 'ai', settled: true, since: a.since ?? a.at };
      out.push(added);
      confirmed.add(added);
    }
  }
  out = out.filter((f) => confirmed.has(f) || f.settled || f.pinned || f.at > reviewedUpTo);
  return out;
}

/** The list as shown: conflicts resolved, grouped by category, each item in the place it first appeared. */
export function presentFacts(facts: Fact[]): Fact[] {
  let result = [...facts];
  // A drug the patient is allergic to is never also listed as their medication: an
  // answer to "any allergies?" that only names drugs must not read as a drug list
  const allergic = new Set(result.filter((f) => f.category === 'allergy' && !f.negated).map((f) => drugIdentity(f.text)));
  allergic.delete(null);
  if (allergic.size) result = result.filter((f) => !(f.category === 'medication' && !f.negated && allergic.has(drugIdentity(f.text))));

  // "Bilinen alerji yok" is meaningless once an allergy is known
  const positives = new Set(result.filter((f) => !f.negated).map((f) => f.category));
  result = result.filter((f) => !(f.key.endsWith('__none__') && f.negated && positives.has(f.category)));

  const order = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));
  return result.sort((a, b) => {
    const c = (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0);
    if (c !== 0) return c;
    if (!!a.negated !== !!b.negated) return a.negated ? 1 : -1;
    return (a.since ?? a.at) - (b.since ?? b.at);
  });
}

export function groupFacts(facts: Fact[]): { category: FactCategory; facts: Fact[] }[] {
  return CATEGORY_ORDER.map((category) => ({ category, facts: facts.filter((f) => f.category === category) })).filter(
    (g) => g.facts.length > 0,
  );
}

/**
 * Plain-text report the nurse can copy for their own notes. The app has no link
 * to any hospital system and never sends data to one.
 */
export function formatAnamnesisReport(facts: Fact[], languageName: string, now = new Date()): string {
  const lines = [
    '=== KLİNİK ANAMNEZ VE VAKA BİLGİSİ ===',
    `Tarih: ${now.toLocaleString('tr-TR')}`,
    `Görüşme Dili: Türkçe ⇄ ${languageName}`,
    '',
  ];
  for (const { category, facts: group } of groupFacts(facts)) {
    lines.push(`[${REPORT_TITLES[category]}]`);
    for (const f of group) lines.push(`- ${factText(f)}`);
    lines.push('');
  }
  lines.push('Not: Tercüman uygulaması tarafından konuşmadan otomatik çıkarılmıştır; klinik doğrulama gerektirir.');
  return lines.join('\n');
}
