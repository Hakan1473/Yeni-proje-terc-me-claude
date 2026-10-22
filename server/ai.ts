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

/**
 * Model health, learned from the API's answers:
 *   429 (quota) rests a model for a minute, 503 (overloaded) for 20 s, so the
 *   next model in the chain answers at once; a model that rejects the minimal
 *   thinking level is remembered and gets "low" instead.
 */
const cooldown = new Map<string, number>();
const noMinimalThinking = new Set<string>();
let groundingUntil = 0;

function rest(model: string, msg: string) {
  // On the free tier a 429 usually means the daily quota is spent: rest longer and spare the calls
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) cooldown.set(model, Date.now() + (config.economy ? 5 * 60_000 : 60_000));
  else if (/503|UNAVAILABLE|overloaded|high demand/i.test(msg)) cooldown.set(model, Date.now() + 20_000);
}

/** The requested models, then the general fallbacks; resting ones last, never none. */
function modelsToTry(models: string[]): string[] {
  const unique = Array.from(new Set([...models, ...config.models.fallbacks]));
  const now = Date.now();
  const ready = unique.filter((m) => (cooldown.get(m) ?? 0) <= now);
  const resting = unique.filter((m) => !ready.includes(m)).sort((a, b) => (cooldown.get(a) ?? 0) - (cooldown.get(b) ?? 0));
  return [...ready, ...resting.slice(0, 1)];
}

function thinkingFor(model: string, minimal?: boolean) {
  if (!minimal) return {};
  return { thinkingConfig: { thinkingLevel: noMinimalThinking.has(model) ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL } };
}

/** One model call with a timeout. Returns the text, or null on failure (recorded for the next call). */
async function callModel(
  model: string,
  timeoutMs: number,
  minimal: boolean | undefined,
  run: (signal: AbortSignal, thinking: object) => Promise<string | undefined>,
  label: string,
): Promise<string | null | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await run(controller.signal, thinkingFor(model, minimal));
    } catch (err) {
      const msg = (err as Error).message || '';
      // Some models only accept "low": remember it and retry this model once
      if (attempt === 0 && minimal && /thinking level/i.test(msg) && !noMinimalThinking.has(model)) {
        noMinimalThinking.add(model);
        continue;
      }
      console.warn(`[ai] ${label} ${model} failed:`, msg.slice(0, 160));
      if (label === 'grounded' && /429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
        // Search grounding has its own quota (none on the free tier): skip it for a while
        groundingUntil = Date.now() + 10 * 60_000;
      } else rest(model, msg);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Structured generation with a per-model timeout and a model fallback chain. */
export async function generateJson<T>(req: JsonRequest): Promise<T | null> {
  for (const model of modelsToTry(req.models)) {
    const text = await callModel(
      model,
      req.timeoutMs,
      req.minimalThinking,
      async (signal, thinking) =>
        (
          await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: JSON.stringify(req.input) }] }],
            config: {
              systemInstruction: req.system,
              responseMimeType: 'application/json',
              responseSchema: req.schema,
              temperature: req.temperature ?? 0.2,
              ...thinking,
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
  // Economy mode: search grounding has no free quota, so it is not attempted at all
  if (config.economy || Date.now() < groundingUntil) return null;
  for (const model of modelsToTry(req.models).slice(0, 2)) {
    if (Date.now() < groundingUntil) return null;
    let sources: WebSource[] = [];
    const text = await callModel(
      model,
      req.timeoutMs,
      req.minimalThinking,
      async (signal, thinking) => {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(req.input) }] }],
          config: {
            systemInstruction: req.system,
            tools: [{ googleSearch: {} }],
            temperature: req.temperature ?? 0.2,
            ...thinking,
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
