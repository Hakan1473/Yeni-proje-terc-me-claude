import type { DrugMismatch } from './medical/drugcheck';
// Types shared by the browser client and the Node server.

export type Speaker = 'nurse' | 'patient';

export type Script =
  | 'latin'
  | 'cyrillic'
  | 'arabic'
  | 'han'
  | 'kana'
  | 'hangul'
  | 'devanagari'
  | 'bengali'
  | 'gurmukhi'
  | 'tamil'
  | 'thai'
  | 'georgian'
  | 'armenian'
  | 'greek'
  | 'hebrew'
  | 'ethiopic';

export interface Language {
  code: string;
  /** English name, also used in prompts. */
  name: string;
  /** Turkish display name. */
  nameTr: string;
  /** Endonym shown to the patient. */
  native: string;
  country: string;
  /** ISO 3166 code used for the flag artwork, or null when no national flag fits. */
  flag: string | null;
  /** BCP-47 tag for browser speech synthesis. */
  bcp47: string;
  scripts: Script[];
  rtl?: boolean;
  /** How to address the patient politely in this language. */
  register?: string;
}

export type TutorialKind = 'nurse_call' | 'triflow';

export type TurnStatus = 'capturing' | 'translating' | 'done' | 'failed';

export interface NumberCheck {
  /** Numbers that appear in the source but not in the translation. */
  missing: number[];
  /** Numbers that appear in the translation but not in the source. */
  extra: number[];
}

export interface Turn {
  kind: 'turn';
  id: string;
  speaker: Speaker;
  /** 0.5 – 1. How sure the classifier is about the speaker. */
  speakerConfidence: number;
  source: string;
  translation?: string;
  status: TurnStatus;
  /** Which path produced the translation. */
  via?: 'live' | 'rest';
  createdAt: number;
  tutorial?: TutorialKind;
  numberCheck?: NumberCheck;
  /** Drug names that differ between what was said and the translation. */
  drugCheck?: DrugMismatch[];
}

export interface Note {
  kind: 'note';
  id: string;
  text: string;
  createdAt: number;
}

export type ConversationItem = Turn | Note;

export type FactCategory =
  | 'complaint'
  | 'need'
  | 'medication'
  | 'allergy'
  | 'chronic'
  | 'surgery'
  | 'habit'
  | 'family'
  | 'instruction';

export interface Fact {
  /** Stable dedupe key: category + canonical name. */
  key: string;
  category: FactCategory;
  /** Clean Turkish display text, e.g. "Parol (parasetamol) 500 mg — günde 3 kez". */
  text: string;
  /** True for pertinent negatives such as "Bilinen alerji yok". */
  negated?: boolean;
  /** Short quote from the conversation the fact is based on. */
  evidence?: string;
  turnId?: string;
  origin: 'local' | 'ai';
  /** Safety-critical facts (explicit allergy statements) the AI layer may not silently drop. */
  pinned?: boolean;
  /** Why this fact must be confirmed with the patient (e.g. the drug name differed between speech and translation). */
  verify?: string;
  at: number;
}

export interface ConversationSummary {
  briefSummaryTr: string;
  patientChiefComplaints: string[];
  patientNeedsAndRequests: string[];
  clinicalInstructions: string[];
  vitalSignsAndDosages: string[];
  actionItems: string[];
  targetLanguage: string;
  timestamp: number;
}

export interface ConversationRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  languageCode: string;
  items: ConversationItem[];
  summary?: ConversationSummary | null;
  facts?: Fact[];
  /** Facts the nurse removed after checking with the patient; never re-added. */
  rejected?: Fact[];
  preview: string;
}

/** Wire format for the anamnesis endpoint. */
export interface AnamnesisRequest {
  languageName: string;
  /** Facts known so far (local + previous AI pass). */
  facts: Pick<Fact, 'category' | 'text' | 'negated'>[];
  /** Turns not yet seen by the AI, plus a little preceding context. */
  turns: { id: string; speaker: Speaker; source: string; translation?: string; context?: boolean }[];
  /** Facts the nurse removed after checking with the patient. */
  rejected?: Pick<Fact, 'category' | 'text'>[];
}

export interface AnamnesisResponse {
  facts: Pick<Fact, 'key' | 'category' | 'text' | 'negated' | 'evidence' | 'turnId' | 'verify'>[];
  /** Facts the conversation explicitly corrected or denied. */
  retracted: string[];
}

export interface TranslateResponse {
  translation: string;
  speaker: Speaker;
}

export const VOICES = ['Zephyr', 'Puck', 'Aoede', 'Charon', 'Fenrir', 'Kore'] as const;
export type VoiceName = (typeof VOICES)[number];

/** End-of-speech patience. Maps to the Live API silence window. */
export type Pace = 'fast' | 'balanced' | 'patient';

export const PACE_SILENCE_MS: Record<Pace, number> = {
  fast: 450,
  balanced: 700,
  patient: 1100,
};
