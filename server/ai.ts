import { GoogleGenAI, Modality, type Schema, ThinkingLevel } from '@google/genai';
import { config } from './config';

export const ai = new GoogleGenAI({
  apiKey: config.apiKey || 'missing',
  httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
});

export function parseJson<T>(text: string | undefined): T | null {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

interface JsonRequest {
  models: string[];
  system: string;
  /** Untrusted content goes in its own part, never concatenated into the instruction. */
  input: unknown;
  schema: Schema;
  timeoutMs: number;
  temperature?: number;
  /** Quick lookups (translation, term cards) need no reasoning; clinical analysis keeps the model's default. */
  minimalThinking?: boolean;
}

/** Models that answered 429 / RESOURCE_EXHAUSTED rest until this time, so the next model answers at once. */
const quotaCooldown = new Map<string, number>();
const COOLDOWN_MS = 60_000;

function isQuotaError(msg: string): boolean {
  return /429|RESOURCE_EXHAUSTED|quota/i.test(msg);
}

/** Models to try in order: those not resting first; if all rest, the one that recovers soonest. */
function modelsToTry(models: string[]): string[] {
  const unique = Array.from(new Set(models));
  const now = Date.now();
  const ready = unique.filter((m) => (quotaCooldown.get(m) ?? 0) <= now);
  if (ready.length) return ready;
  return [...unique].sort((a, b) => (quotaCooldown.get(a) ?? 0) - (quotaCooldown.get(b) ?? 0)).slice(0, 1);
}

/** One model call with a timeout; records quota errors. Returns null on failure. */
async function callModel(model: string, timeoutMs: number, run: (signal: AbortSignal) => Promise<string | undefined>, label: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch (err) {
    const msg = (err as Error).message || '';
    console.warn(`[ai] ${label} ${model} failed:`, msg.slice(0, 200));
    if (isQuotaError(msg)) quotaCooldown.set(model, Date.now() + COOLDOWN_MS);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Structured generation with a per-model timeout and a model fallback chain. */
export async function generateJson<T>(req: JsonRequest): Promise<T | null> {
  for (const model of modelsToTry(req.models)) {
    const text = await callModel(
      model,
      req.timeoutMs,
      async (signal) =>
        (
          await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: JSON.stringify(req.input) }] }],
            config: {
              systemInstruction: req.system,
              responseMimeType: 'application/json',
              responseSchema: req.schema,
              temperature: req.temperature ?? 0.2,
              ...(req.minimalThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
              abortSignal: signal,
            },
          })
        ).text,
      'json',
    );
    const parsed = parseJson<T>(text ?? undefined);
    if (parsed) return parsed;
  }
  return null;
}

export interface WebSource {
  title: string;
  url: string;
}

/**
 * JSON answer grounded in a live Google Search. Search grounding cannot be
 * combined with a response schema, so the instruction spells out the JSON shape
 * and the reply is parsed leniently. Returns the pages the answer was built on.
 */
export async function generateGroundedJson<T>(req: Omit<JsonRequest, 'schema'>): Promise<{ data: T; sources: WebSource[] } | null> {
  for (const model of modelsToTry(req.models)) {
    let sources: WebSource[] = [];
    const text = await callModel(
      model,
      req.timeoutMs,
      async (signal) => {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(req.input) }] }],
          config: {
            systemInstruction: req.system,
            tools: [{ googleSearch: {} }],
            temperature: req.temperature ?? 0.2,
            ...(req.minimalThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
            abortSignal: signal,
          },
        });
        const seen = new Set<string>();
        sources = [];
        for (const chunk of res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
          const title = chunk.web?.title?.trim();
          const url = chunk.web?.uri;
          if (!title || !url || seen.has(title)) continue;
          seen.add(title);
          sources.push({ title, url });
        }
        return res.text;
      },
      'grounded',
    );
    const data = parseJson<T>(text ?? undefined);
    if (data) return { data, sources: sources.slice(0, 4) };
  }
  return null;
}

/** Wrap raw 16-bit mono PCM in a WAV container so browsers can decode it. */
export function pcmToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function toWavBase64(b64: string, mimeType?: string): string {
  const buf = Buffer.from(b64, 'base64');
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF') return b64;
  const rate = Number(/rate=(\d+)/i.exec(mimeType ?? '')?.[1]) || 24000;
  return pcmToWav(buf, rate).toString('base64');
}

const ttsCache = new Map<string, string>();

/** Text to speech with the selected voice. Cached; returns base64 WAV or null. */
export async function synthesize(text: string, voice: string): Promise<string | null> {
  const cacheKey = `${voice}:${text}`;
  const cached = ttsCache.get(cacheKey);
  if (cached) {
    // Refresh recency for the LRU
    ttsCache.delete(cacheKey);
    ttsCache.set(cacheKey, cached);
    return cached;
  }
  for (const [model, timeoutMs] of [
    [config.models.tts, 6000],
    [config.models.ttsFallback, 8000],
  ] as const) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          abortSignal: controller.signal,
        },
      });
      const inline = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
      if (inline?.data) {
        const wav = toWavBase64(inline.data, inline.mimeType);
        ttsCache.set(cacheKey, wav);
        if (ttsCache.size > 200) ttsCache.delete(ttsCache.keys().next().value as string);
        return wav;
      }
    } catch (err) {
      console.warn(`[tts] ${model} failed:`, (err as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}
