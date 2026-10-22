import { describe, expect, it } from 'vitest';
import { addToLedger, factText, formatAnamnesisReport, mergeFacts, presentFacts, reconcileAi } from '../shared/medical/anamnesis';
import type { Fact } from '../shared/types';

const fact = (key: string, text: string, at: number, extra: Partial<Fact> = {}): Fact => ({
  key,
  category: key.split(':')[0] as Fact['category'],
  text,
  at,
  origin: 'local',
  ...extra,
});

describe('mergeFacts', () => {
  it('lets the latest statement about a key win', () => {
    const merged = mergeFacts([fact('habit:smoking', 'Sigara kullanıyor', 1)], [fact('habit:smoking', 'Sigarayı bırakmış', 2)]);
    expect(merged.map((f) => f.text)).toEqual(['Sigarayı bırakmış']);
  });
  it('keeps the more detailed medication text', () => {
    const merged = mergeFacts(
      [fact('medication:metoprolol', 'Beloc (metoprolol) 50 mg', 1)],
      [fact('medication:metoprolol', 'Beloc (metoprolol)', 2)],
    );
    expect(merged[0].text).toBe('Beloc (metoprolol) 50 mg');
  });
});

describe('anamnesis ledger', () => {
  const ai = (key: string, text: string, extra: Partial<Fact> = {}) => fact(key, text, 10, { origin: 'ai', ...extra });

  it('keeps confirmed medications when a later AI pass leaves them out', () => {
    let ledger = addToLedger([], [fact('medication:metoprolol', 'Beloc (metoprolol)', 1), fact('medication:metformin', 'Glifor (metformin)', 2)]);
    ledger = reconcileAi(ledger, [ai('medication:metoprolol', 'Beloc (metoprolol) 50 mg'), ai('medication:metformin', 'Glifor (metformin)')], [], 2);
    // Next pass forgets one drug: it must stay
    ledger = reconcileAi(ledger, [ai('medication:metoprolol', 'Beloc (metoprolol) 50 mg')], [], 5);
    expect(presentFacts(ledger).map((f) => f.text)).toEqual(['Beloc (metoprolol) 50 mg', 'Glifor (metformin)']);
  });

  it('keeps the confirmed wording when the AI only rephrases it', () => {
    let ledger = reconcileAi([], [ai('chronic:diyabet', 'Tip 2 diyabet')], [], 1);
    ledger = reconcileAi(ledger, [ai('chronic:diyabet', 'Şeker hastalığı (diyabet)')], [], 2);
    expect(presentFacts(ledger).map((f) => f.text)).toEqual(['Tip 2 diyabet']);
    ledger = reconcileAi(ledger, [ai('chronic:diyabet', 'Tip 2 diyabet, 10 yıldır')], [], 3);
    expect(presentFacts(ledger).map((f) => f.text)).toEqual(['Tip 2 diyabet, 10 yıldır']);
  });

  it('keeps left and right findings apart', () => {
    const ledger = addToLedger([], [fact('complaint:diz agrisi', 'Sol diz ağrısı', 1), fact('complaint:diz agrisi', 'Sağ diz ağrısı', 2)]);
    expect(ledger).toHaveLength(2);
  });

  it('removes an unconfirmed local reading once the AI has read it', () => {
    let ledger = addToLedger([], [fact('complaint:bulanti', 'Bulantı', 1), fact('chronic:astim', 'Astım', 4)]);
    ledger = reconcileAi(ledger, [], [], 2);
    // "Bulantı" was read and not confirmed; "Astım" came after the pass and waits for the next one
    expect(presentFacts(ledger).map((f) => f.text)).toEqual(['Astım']);
  });

  it('removes a confirmed item only when the conversation retracts it', () => {
    let ledger = reconcileAi([], [ai('allergy:penisilin', 'Penisilin')], [], 1);
    ledger = reconcileAi(ledger, [], [], 2);
    expect(ledger).toHaveLength(1);
    ledger = reconcileAi(ledger, [ai('allergy:amoksisilin', 'Amoksisilin')], ['allergy:penisilin'], 3);
    expect(presentFacts(ledger).map((f) => f.text)).toEqual(['Amoksisilin']);
  });

  it('refines an item in place and keeps its position', () => {
    let ledger = addToLedger([], [fact('complaint:bas agrisi', 'Baş ağrısı', 1), fact('complaint:bulanti', 'Bulantı', 2)]);
    ledger = reconcileAi(ledger, [ai('complaint:bulanti', 'Bulantı'), ai('complaint:bas agrisi', 'Baş ağrısı (2 gündür)')], [], 2);
    expect(presentFacts(ledger).map((f) => f.text)).toEqual(['Baş ağrısı (2 gündür)', 'Bulantı']);
  });

  it('lets the latest statement win for single-value items', () => {
    let ledger = addToLedger([], [fact('complaint:pain-score', 'Ağrı şiddeti: 7/10', 1)]);
    ledger = addToLedger(ledger, [fact('complaint:pain-score', 'Ağrı şiddeti: 4/10', 2)]);
    expect(ledger.map((f) => f.text)).toEqual(['Ağrı şiddeti: 4/10']);
  });

  it('keeps a dose detail when a later mention is vaguer', () => {
    let ledger = addToLedger([], [fact('medication:metoprolol', 'Beloc (metoprolol) 50 mg', 1)]);
    ledger = addToLedger(ledger, [fact('medication:metoprolol', 'Beloc (metoprolol)', 2)]);
    expect(ledger[0].text).toBe('Beloc (metoprolol) 50 mg');
  });

  it('never lists an allergy drug as a medication too', () => {
    const ledger = reconcileAi(
      addToLedger([], [fact('allergy:amlodis', 'Amlodis (amlodipin)', 2, { pinned: true }), fact('allergy:avil', 'Avil', 2, { pinned: true })]),
      [ai('medication:amlodipin', 'Amlodis (amlodipin)'), ai('medication:feniramin', 'Avil (feniramin)'), ai('medication:metformin', 'Glifor (metformin)')],
      [],
      3,
    );
    expect(presentFacts(ledger).map((f) => `${f.category}: ${f.text}`)).toEqual([
      'allergy: Amlodis (amlodipin)',
      'allergy: Avil',
      'medication: Glifor (metformin)',
    ]);
  });

  it('hides a generic negative once a positive exists', () => {
    const out = presentFacts(addToLedger([], [fact('allergy:__none__', 'Bilinen alerji yok', 1, { negated: true }), fact('allergy:lateks', 'Lateks', 2)]));
    expect(out.map((f) => f.text)).toEqual(['Lateks']);
  });
});

describe('report', () => {
  it('formats sections as a plain-text report', () => {
    const text = formatAnamnesisReport(
      [fact('allergy:penisilin', 'Penisilin', 1), fact('complaint:ates', 'Ateş', 1, { negated: true })],
      'İngilizce',
      new Date(2026, 0, 1),
    );
    expect(text).toContain('[ALERJİLER]\n- Penisilin');
    expect(text).toContain('- Ateş — yok');
    expect(factText(fact('allergy:__none__', 'Bilinen alerji yok', 1, { negated: true }))).toBe('Bilinen alerji yok');
  });
});
