import type { Fact, Speaker } from '../types';
import { canonicalKey, drugIdentity, drugMentions } from './extract';

/**
 * Drug-name agreement between what was said and how it was translated.
 *
 * Speech recognition and translation can swap a rare brand for a better-known
 * one that sounds alike ("Alipsa", a statin, became "Eliquis", an
 * anticoagulant). A wrong drug in the anamnesis is a patient-safety error, so
 * every turn is checked: each drug in the translation must be the drug that
 * was said, and the anamnesis always takes the name from the speaker's own
 * words, never from the translation.
 */

export interface DrugMismatch {
  /** The drug as the speaker said it (absent if no name could be found). */
  said?: string;
  /** Lexicon label of the said drug, when known: "Alipza (pitavastatin)". */
  saidLabel?: string;
  saidIdentity?: string;
  /** The drug as it appears in the translation (absent if it was dropped). */
  translated?: string;
  translatedLabel?: string;
  translatedIdentity?: string;
}

export function checkDrugNames(source: string, translation: string): DrugMismatch[] {
  if (!source.trim() || !translation.trim()) return [];
  const said = drugMentions(source);
  // The translation is written by the model, so its drug names are spelled out; only speech is misheard
  const heard = drugMentions(translation, false);
  const saidIds = new Set(said.map((d) => d.identity));
  const heardIds = new Set(heard.map((d) => d.identity));
  const onlySaid = said.filter((d) => !heardIds.has(d.identity));
  const onlyHeard = heard.filter((d) => !saidIds.has(d.identity));
  const out: DrugMismatch[] = [];

  // One recognised drug was said and a different one translated ("Alipsa" → "Eliquis").
  // A name the recogniser spelled oddly ("Bellocq" for Beloc) is not a mismatch.
  while (onlySaid.length && onlyHeard.length) {
    const a = onlySaid.shift() as (typeof said)[number];
    const b = onlyHeard.shift() as (typeof heard)[number];
    out.push({ said: a.surface, saidLabel: a.label, saidIdentity: a.identity, translated: b.surface, translatedLabel: b.label, translatedIdentity: b.identity });
  }
  return out;
}

export function describeDrugMismatch(m: DrugMismatch, speaker: Speaker): string {
  const who = speaker === 'patient' ? 'Hasta' : 'Hemşire';
  if (m.said && m.translated) return `${who} “${m.said}” dedi, çeviride “${m.translated}” geçiyor`;
  if (m.translated) return `Çeviride “${m.translated}” geçiyor ama konuşmada bu ilaç adı duyulmadı`;
  return `${who} “${m.said}” dedi, çeviride bu ilaç geçmiyor`;
}

/**
 * Put the speaker's own drug name into medication and allergy facts that were
 * read from a mistranslated turn, and mark them for confirmation. Facts that
 * already carry the said name keep the mark on later passes.
 */
export function applyDrugCheck<T extends Pick<Fact, 'key' | 'category' | 'text' | 'verify'>>(facts: T[], mismatches: DrugMismatch[]): (T & { verify?: string })[] {
  const wrong = mismatches.filter((m) => m.translatedIdentity);
  if (!wrong.length) return facts;
  return facts.map((f) => {
    if (f.category !== 'medication' && f.category !== 'allergy') return f;
    const id = drugIdentity(f.text);
    const m = wrong.find((w) => w.translatedIdentity === id) ?? wrong.find((w) => w.saidIdentity && w.saidIdentity === id);
    if (!m) return f;
    if (m.translatedIdentity !== id) return { ...f, verify: verifyText(m) };
    const label = m.saidLabel ?? m.said;
    const rest = m.translatedLabel && f.text.startsWith(m.translatedLabel) ? f.text.slice(m.translatedLabel.length) : '';
    const text = label ? `${label}${rest}` : f.text;
    return { ...f, text, key: canonicalKey(f.category, text), verify: verifyText(m) };
  });
}

function verifyText(m: DrugMismatch): string {
  return m.said
    ? `Hasta “${m.said}” dedi; çeviride “${m.translated}” olarak geçti. İlaç adını hastayla teyit edin.`
    : `Çeviride “${m.translated}” geçiyor ama hastanın sözlerinde bu ilaç adı duyulmadı. Hastayla teyit edin.`;
}
