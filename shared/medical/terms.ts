import { fold } from '../text';
import type { Fact, FactCategory } from '../types';
import { DRUGS } from './lexicon';

/** What a term card describes. Decides which fields the card shows. */
export type TermKind = 'drug' | 'condition' | 'symptom' | 'procedure' | 'allergen';

/** Short reference card for a medical term in the anamnesis. */
export interface TermInfo {
  term: string;
  kind: TermKind;
  /** One or two plain sentences: what it is, or what the drug is for. */
  summary: string;
  /** Drugs only. */
  activeIngredient?: string;
  drugClass?: string;
  /** Typical uses (drugs) or typical signs (conditions, symptoms). */
  points?: string[];
  /** What the nurse should watch for. */
  nursing?: string[];
  /** False when the model did not recognise the term. */
  known: boolean;
}

export interface TermQuery {
  term: string;
  kind: TermKind;
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
  return { term, kind };
}

/** Cache key shared by client and server. */
export function termKey(q: TermQuery): string {
  return `${q.kind}:${fold(q.term).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;
}
