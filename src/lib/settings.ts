import { DEFAULT_LANGUAGE, LANGUAGES } from '../../shared/languages';
import type { Pace, VoiceName } from '../../shared/types';
import { VOICES } from '../../shared/types';

// Every read and write is guarded: private windows and blocked storage must not break the app.
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable
  }
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  voice: VoiceName;
  pace: Pace;
  languageCode: string;
  onboardingDone: boolean;
  /** Days to keep conversations; 0 keeps them until deleted. */
  retentionDays: number;
}

export function loadSettings(): Settings {
  const theme = read('tr.theme');
  const voice = read('tr.voice') as VoiceName | null;
  const pace = read('tr.pace');
  const lang = read('tr.language');
  return {
    theme: theme === 'light' || theme === 'dark' ? theme : 'system',
    voice: voice && VOICES.includes(voice) ? voice : 'Zephyr',
    pace: pace === 'fast' || pace === 'patient' ? pace : 'balanced',
    languageCode: lang && LANGUAGES.some((l) => l.code === lang) ? lang : DEFAULT_LANGUAGE.code,
    onboardingDone: read('tr.onboarded') === '1',
    retentionDays: Number(read('tr.retention') ?? '0') || 0,
  };
}

export function saveSettings(s: Partial<Settings>) {
  if (s.theme) write('tr.theme', s.theme);
  if (s.voice) write('tr.voice', s.voice);
  if (s.pace) write('tr.pace', s.pace);
  if (s.languageCode) write('tr.language', s.languageCode);
  if (s.onboardingDone !== undefined) write('tr.onboarded', s.onboardingDone ? '1' : null);
  if (s.retentionDays !== undefined) write('tr.retention', String(s.retentionDays));
}

/** Usage counts drive the quick language rail. */
export function recordLanguageUse(code: string) {
  const counts = languageUsage();
  counts[code] = (counts[code] ?? 0) + 1;
  write('tr.languageUsage', JSON.stringify(counts));
}

export function languageUsage(): Record<string, number> {
  try {
    return JSON.parse(read('tr.languageUsage') ?? '{}');
  } catch {
    return {};
  }
}

export function getAccessCode(): string {
  return read('tr.access') ?? '';
}

export function setAccessCode(code: string) {
  write('tr.access', code || null);
}

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
