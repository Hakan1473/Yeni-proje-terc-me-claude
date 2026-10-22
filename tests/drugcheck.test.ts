import { describe, expect, it } from 'vitest';
import { applyDrugCheck, checkDrugNames, describeDrugMismatch } from '../shared/medical/drugcheck';
import { drugMentions } from '../shared/medical/extract';

describe('drug-name agreement', () => {
  it('flags a statin said as Alipsa but translated as Eliquis', () => {
    const m = checkDrugNames('I take Alipsa for my cholesterol.', 'Kolesterolüm için Eliquis kullanıyorum.');
    expect(m).toHaveLength(1);
    expect(m[0].said).toBe('Alipsa');
    expect(m[0].translated).toBe('Eliquis');
    expect(describeDrugMismatch(m[0], 'patient')).toContain('Alipsa');
  });

  it('accepts the same drug under brand or generic name', () => {
    expect(checkDrugNames('I take Alipza every night.', 'Her gece Alipza kullanıyorum.')).toEqual([]);
    expect(checkDrugNames('I use Coumadin.', 'Coumadin kullanıyorum.')).toEqual([]);
  });

  it('does not flag a name the recogniser spelled oddly', () => {
    expect(checkDrugNames('Yes, hypertension, diabetes, Bellocq, Avril, decort, Eliquis.', 'Evet, tansiyonum ve şeker hastalığım var. Beloc, Avil, Dekort ve Eliquis kullanıyorum.')).toEqual([]);
  });

  it('finds misheard names only in a medication context', () => {
    expect(drugMentions('I take alipsa').map((d) => d.identity)).toContain('pitavastatin');
  });

  it('puts the said drug into the fact and asks for confirmation', () => {
    const m = checkDrugNames('I take Alipsa for my cholesterol.', 'Kolesterolüm için Eliquis kullanıyorum.');
    const [f] = applyDrugCheck([{ key: 'x', category: 'medication' as const, text: 'Eliquis (apiksaban)' }], m);
    expect(f.text).toContain('pitavastatin');
    expect(f.verify).toContain('Alipsa');
  });
});

describe('drug-name agreement on later passes', () => {
  it('keeps the confirmation mark on a fact that already carries the said name', () => {
    const m = checkDrugNames('I take Alipsa for my cholesterol.', 'Kolesterolüm için Eliquis kullanıyorum.');
    const [f] = applyDrugCheck([{ key: 'y', category: 'medication' as const, text: 'Alipza (pitavastatin)' }], m);
    expect(f.text).toBe('Alipza (pitavastatin)');
    expect(f.verify).toContain('Eliquis');
  });
});
