import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../shared/languages';
import { PATIENT_HINT_CODES, patientHint } from '../src/lib/patientHints';

describe('patientHint', () => {
  it('has a hint in every patient language', () => {
    expect(LANGUAGES.map((l) => l.code).filter((c) => !PATIENT_HINT_CODES.includes(c))).toEqual([]);
  });

  it('falls back to English', () => {
    expect(patientHint('xx')).toBe(patientHint('en'));
  });
});
