import { fold } from '../text';
import type { Fact, FactCategory } from '../types';
import { DRUGS } from './lexicon';

/** What a term card describes. Decides which fields the card shows. */
export type TermKind = 'drug' | 'condition' | 'symptom' | 'procedure' | 'allergen';

/** Short reference card for a medical term in the anamnesis or summary. */
export interface TermInfo {
  term: string;
  kind: TermKind;
  /** One or two plain sentences: what it is, or what the drug is for. */
  summary: string;
  /** Drugs and drug allergies. */
  activeIngredient?: string;
  /** Drug group, or allergen group on an allergy card. */
  drugClass?: string;
  /** Drug: uses. Condition: typical signs. Symptom: possible causes. Procedure: why it is done. */
  points?: string[];
  /** Drug: important side effects and interactions. */
  sideEffects?: string[];
  /** Condition, symptom, procedure: warning signs to report at once. */
  redFlags?: string[];
  /** What the nurse should watch for and do. */
  nursing?: string[];
  /** Allergy: drugs that may cross-react with the allergen. */
  crossReactions?: string[];
  /** Allergy: foods and drinks to avoid or check (allergen itself, cross-reacting foods, hidden sources). */
  foodsAndDrinks?: string[];
  /** Allergy: other products to avoid (ointments, vaccines, medical supplies…). */
  avoidList?: string[];
  /** Allergy: signs of a reaction, mild to anaphylaxis. */
  reactionSigns?: string[];
  /** Fact category from anamnesis/summary */
  category?: FactCategory;
  /** False when the model did not recognise the term. */
  known: boolean;
  /**
   * "web": checked against a live web search; "ai": model knowledge (with an encyclopedia extract when found);
   * "reference": built only from the app's own drug list and allergy reference while the AI was unreachable,
   * not stored so the full card replaces it; "demo": simulation sample, never stored.
   */
  origin?: 'web' | 'ai' | 'reference' | 'demo';
  /** Pages the web answer was built on. */
  sources?: { title: string; url: string }[];
}

/** The kind of card a term gets: each answers different questions at the bedside. */
export type CardType = 'allergy' | 'drug' | 'condition' | 'symptom' | 'procedure';

export function cardTypeOf(q: Pick<TermQuery, 'kind' | 'category'>): CardType {
  if (q.category === 'allergy' || q.kind === 'allergen') return 'allergy';
  if (q.category === 'medication' || q.kind === 'drug') return 'drug';
  if (q.category === 'complaint' || q.kind === 'symptom') return 'symptom';
  if (q.category === 'surgery' || q.kind === 'procedure') return 'procedure';
  return 'condition';
}

export interface TermQuery {
  term: string;
  kind: TermKind;
  category?: FactCategory;
}

const KIND: Partial<Record<FactCategory, TermKind>> = {
  medication: 'drug',
  allergy: 'allergen',
  chronic: 'condition',
  family: 'condition',
  surgery: 'procedure',
  complaint: 'symptom',
};

/**
 * The bare term behind an anamnesis line, or null when there is nothing to
 * look up ("Bilinen alerji yok", a pain score, a nurse instruction).
 * "Beloc (metoprolol) 50 mg · sabahları" → "Beloc (metoprolol)"
 * "Göğüs ağrısı (iki gündür)" → "Göğüs ağrısı"
 * "Baba: Kalp krizi" → "Kalp krizi"
 */
export function termOf(fact: Pick<Fact, 'category' | 'text' | 'key'>): TermQuery | null {
  let kind = KIND[fact.category];
  if (!kind || fact.key.endsWith('__none__') || fact.key === 'complaint:pain-score') return null;
  let term = fact.text;
  if (fact.category === 'family') term = term.replace(/^[^:]{1,20}:\s*/u, '');
  term = term.split(' · ')[0];
  if (fact.category === 'medication') {
    term = term.replace(/\s+\d[\d.,]*\s*(?:mg|mcg|µg|g|ml|ünite|iu|u|%)\b.*$/iu, '');
  } else {
    // Durations and years in parentheses are about the patient, not the term
    term = term.replace(/\s*\((?:[^)]*\d[^)]*|[^)]*(?:gündür|haftadır|aydır|yıldır|saattir|önce))\)/gu, '');
  }
  term = term.replace(/\s+/g, ' ').trim();
  if (term.length < 3) return null;
  // An allergen that is a drug reads better as a drug card
  if (kind === 'allergen' && DRUGS.some((d) => fold(term).startsWith(fold(d.name)) || (d.generic && fold(term).includes(fold(d.generic))))) {
    kind = 'drug';
  }
  return { term, kind, category: fact.category };
}

/** Cache key shared by client and server. */
export function termKey(q: TermQuery): string {
  const cat = q.category ? `${q.category}:` : '';
  return `${cat}${q.kind}:${fold(q.term).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;
}
