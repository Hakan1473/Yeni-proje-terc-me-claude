import { describe, expect, it } from 'vitest';
import { cardTypeOf, termKey, termOf } from '../shared/medical/terms';
import type { FactCategory } from '../shared/types';

const q = (category: FactCategory, text: string, key = `${category}:x`) => termOf({ category, text, key });

describe('termOf', () => {
  it('strips doses and frequency from medications', () => {
    expect(q('medication', 'Beloc (metoprolol) 50 mg · sabahları')).toEqual({ term: 'Beloc (metoprolol)', kind: 'drug', category: 'medication' });
    expect(q('medication', 'Glifor (metformin) 1000 mg · günde iki kez')).toEqual({ term: 'Glifor (metformin)', kind: 'drug', category: 'medication' });
  });

  it('strips durations and years but keeps explanatory parentheses', () => {
    expect(q('complaint', 'Göğüs ağrısı (iki gündür)')).toEqual({ term: 'Göğüs ağrısı', kind: 'symptom', category: 'complaint' });
    expect(q('surgery', 'Kolesistektomi (safra kesesi ameliyatı) (2018)')).toEqual({
      term: 'Kolesistektomi (safra kesesi ameliyatı)',
      kind: 'procedure',
      category: 'surgery',
    });
    expect(q('chronic', 'Diyabet (şeker hastalığı)')).toEqual({ term: 'Diyabet (şeker hastalığı)', kind: 'condition', category: 'chronic' });
  });

  it('reads family history as the condition and drug allergies as drugs', () => {
    expect(q('family', 'Baba: Kalp krizi')).toEqual({ term: 'Kalp krizi', kind: 'condition', category: 'family' });
    expect(q('allergy', 'Penisilin')).toEqual({ term: 'Penisilin', kind: 'drug', category: 'allergy' });
    expect(q('allergy', 'Lateks')).toEqual({ term: 'Lateks', kind: 'allergen', category: 'allergy' });
  });

  it('has nothing to explain for negatives, scores, habits and instructions', () => {
    expect(q('allergy', 'Bilinen alerji yok', 'allergy:__none__')).toBeNull();
    expect(q('complaint', 'Ağrı şiddeti: 7/10', 'complaint:pain-score')).toBeNull();
    expect(q('habit', 'Sigara kullanmıyor')).toBeNull();
    expect(q('instruction', 'Kolunuzu düz tutun.')).toBeNull();
  });

  it('builds spelling-independent cache keys', () => {
    expect(termKey({ term: 'Hipertansiyon', kind: 'condition' })).toBe(termKey({ term: 'hipertansiyon ', kind: 'condition' }));
  });
});

describe('card types', () => {
  it('gives every anamnesis category its own card', () => {
    expect(cardTypeOf({ kind: 'drug', category: 'allergy' })).toBe('allergy');
    expect(cardTypeOf({ kind: 'drug', category: 'medication' })).toBe('drug');
    expect(cardTypeOf({ kind: 'condition', category: 'chronic' })).toBe('condition');
    expect(cardTypeOf({ kind: 'condition', category: 'family' })).toBe('condition');
    expect(cardTypeOf({ kind: 'symptom', category: 'complaint' })).toBe('symptom');
    expect(cardTypeOf({ kind: 'procedure', category: 'surgery' })).toBe('procedure');
    expect(cardTypeOf({ kind: 'allergen' })).toBe('allergy');
  });
});
