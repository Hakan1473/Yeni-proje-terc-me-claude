import { describe, expect, it } from 'vitest';
import { combineLayers, factText, formatAnamnesisReport, mergeFacts } from '../shared/medical/anamnesis';
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

describe('combineLayers', () => {
  const local = [
    fact('medication:parasetamol', 'Parol (parasetamol)', 1),
    fact('allergy:penisilin', 'Penisilin', 1, { pinned: true }),
    fact('complaint:bulanti', 'Bulantı', 5),
    fact('chronic:astim', 'Astım', 1),
  ];

  it('returns local facts while no AI pass exists', () => {
    expect(combineLayers(local, null)).toHaveLength(4);
  });

  it('trusts the AI for reviewed facts but keeps newer local ones and pinned allergies', () => {
    const ai = {
      facts: [{ ...fact('medication:parasetamol', 'Parol 500 mg', 3), origin: 'ai' as const }],
      retracted: [],
      watermark: 3,
    };
    const out = combineLayers(local, ai);
    expect(out.map((f) => f.text)).toEqual(['Bulantı', 'Penisilin', 'Parol 500 mg']);
  });

  it('drops a pinned allergy only when the AI explicitly retracts it', () => {
    const ai = { facts: [], retracted: ['allergy:penisilin'], watermark: 3 };
    expect(combineLayers(local, ai).some((f) => f.key === 'allergy:penisilin')).toBe(false);
  });

  it('never lists an allergy drug as a medication too', () => {
    const ai = {
      facts: [
        { ...fact('medication:amlodipin', 'Amlodis (amlodipin)', 3), origin: 'ai' as const },
        { ...fact('medication:feniramin', 'Avil (feniramin)', 3), origin: 'ai' as const },
        { ...fact('medication:metformin', 'Glifor (metformin)', 3), origin: 'ai' as const },
      ],
      retracted: [],
      watermark: 3,
    };
    const allergies = [fact('allergy:amlodis', 'Amlodis (amlodipin)', 2, { pinned: true }), fact('allergy:avil', 'Avil', 2, { pinned: true })];
    expect(combineLayers(allergies, ai).map((f) => `${f.category}: ${f.text}`)).toEqual([
      'allergy: Amlodis (amlodipin)',
      'allergy: Avil',
      'medication: Glifor (metformin)',
    ]);
  });

  it('hides a generic negative once a positive exists', () => {
    const out = combineLayers(
      [fact('allergy:__none__', 'Bilinen alerji yok', 1, { negated: true }), fact('allergy:lateks', 'Lateks', 2)],
      null,
    );
    expect(out.map((f) => f.text)).toEqual(['Lateks']);
  });
});

describe('report', () => {
  it('formats sections for HBYS', () => {
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
