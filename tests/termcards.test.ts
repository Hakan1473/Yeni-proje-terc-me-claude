import { describe, expect, it } from 'vitest';
import { referenceCard } from '../server/termSearch';

describe('reference cards (AI unreachable)', () => {
  it('builds an allergy card from established cross-reactivity', () => {
    const card = referenceCard('Penisilin', 'drug', 'allergy', 'allergy', null);
    expect(card?.crossReactions?.some((c) => c.includes('Sefalosporin'))).toBe(true);
    expect(card?.reactionSigns?.length).toBeGreaterThan(2);
    expect(card?.origin).toBe('reference');
  });

  it('lists foods for a food or latex allergy', () => {
    expect(referenceCard('Lateks', 'allergen', 'allergy', 'allergy', null)?.foodsAndDrinks?.join(' ')).toContain('Muz');
  });

  it('gives a drug its active ingredient and a group only when certain', () => {
    const card = referenceCard('Beloc (metoprolol)', 'drug', 'drug', 'medication', null);
    expect(card?.activeIngredient).toBe('Metoprolol');
    expect(card?.drugClass).toBe('Beta bloker');
  });

  it('returns nothing rather than filler text', () => {
    expect(referenceCard('Kalp yetmezliği', 'condition', 'condition', 'chronic', null)).toBeNull();
    expect(referenceCard('Bilinmeyen madde', 'allergen', 'allergy', 'allergy', null)).toBeNull();
  });
});
