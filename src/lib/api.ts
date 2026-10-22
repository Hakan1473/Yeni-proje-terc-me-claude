import type { TermInfo, TermQuery } from '../../shared/medical/terms';
import type { AnamnesisRequest, AnamnesisResponse, ConversationSummary, Speaker, TranslateResponse } from '../../shared/types';
import { getAccessCode } from './settings';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-access-code': getAccessCode() },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new ApiError(res.status, `${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export interface Health {
  ok: boolean;
  mock: boolean;
  /** Free-tier economy mode: fewer AI calls (see server/config.ts). */
  economy?: boolean;
  accessRequired: boolean;
}

export async function health(): Promise<Health> {
  const res = await fetch('/api/health');
  return res.json();
}

export async function checkAccess(code: string): Promise<boolean> {
  return (await post<{ ok: boolean }>('access', { code })).ok;
}

export function translate(text: string, language: string, speaker?: Speaker, signal?: AbortSignal) {
  return post<TranslateResponse>('translate', { text, language, speaker }, signal);
}

export async function tts(text: string, voice: string, signal?: AbortSignal): Promise<string | null> {
  return (await post<{ audio: string | null }>('tts', { text, voice }, signal)).audio;
}

export function anamnesis(req: AnamnesisRequest, signal?: AbortSignal) {
  return post<AnamnesisResponse>('anamnesis', req, signal);
}

export function summary(
  languageName: string,
  turns: { id: string; speaker: Speaker; source: string; translation?: string }[],
) {
  return post<ConversationSummary>('summary', { languageName, turns });
}

export function term(q: TermQuery, signal?: AbortSignal) {
  return post<TermInfo>('term', q, signal);
}
