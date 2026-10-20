import type { Fact, FactCategory } from '../types';

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

export interface AiLayer {
  facts: Fact[];
  /** Keys the conversation explicitly corrected or denied. */
  retracted: string[];
  /** Timestamp of the newest turn the AI pass had seen. */
  watermark: number;
}

/**
 * Combine the instant local layer with the slower AI layer.
 *
 * The AI pass sees the facts known at request time plus the new turns, and
 * returns the full corrected list. So:
 *   - facts in the AI list are authoritative;
 *   - local facts newer than the AI watermark are kept (the AI has not seen them yet);
 *   - older local facts the AI dropped are treated as reviewed and removed,
 *     except pinned allergies, which are only removed when explicitly retracted.
 * A failed AI call never clears anything: the previous layer stays in place.
 */
export function combineLayers(local: Fact[], ai: AiLayer | null): Fact[] {
  let result: Fact[];
  if (!ai) {
    result = [...local];
  } else {
    const byKey = new Map(ai.facts.map((f) => [f.key, f]));
    for (const f of local) {
      if (byKey.has(f.key)) {
        const aiFact = byKey.get(f.key);
        // A newer local statement overrides an older AI conclusion about the same thing
        if (aiFact && f.at > ai.watermark) byKey.set(f.key, f);
        continue;
      }
      if (f.at > ai.watermark || (f.pinned && !ai.retracted.includes(f.key))) byKey.set(f.key, f);
    }
    result = Array.from(byKey.values());
  }

  // "Bilinen alerji yok" is meaningless once an allergy is known
  const positives = new Set(result.filter((f) => !f.negated).map((f) => f.category));
  result = result.filter((f) => !(f.key.endsWith('__none__') && f.negated && positives.has(f.category)));

  const order = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));
  return result.sort((a, b) => {
    const c = (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0);
    if (c !== 0) return c;
    if (!!a.negated !== !!b.negated) return a.negated ? 1 : -1;
    return a.at - b.at;
  });
}

export function groupFacts(facts: Fact[]): { category: FactCategory; facts: Fact[] }[] {
  return CATEGORY_ORDER.map((category) => ({ category, facts: facts.filter((f) => f.category === category) })).filter(
    (g) => g.facts.length > 0,
  );
}

/** Plain-text report for pasting into the hospital information system (HBYS). */
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
