import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
const hasRealKey = apiKey.length > 0 && apiKey !== 'MY_GEMINI_API_KEY';

function getPort(): number {
  const portIdx = process.argv.indexOf('--port');
  if (portIdx !== -1 && process.argv[portIdx + 1]) {
    const p = Number(process.argv[portIdx + 1]);
    if (!isNaN(p) && p > 0) return p;
  }
  // In development, AI Studio expects the dev server strictly on port 3000
  if (process.env.NODE_ENV !== 'production') {
    return 3000;
  }
  return Number(process.env.PORT) || 3000;
}

export const config = {
  port: getPort(),
  isProduction: process.env.NODE_ENV === 'production',
  apiKey,
  /** Simulation mode: explicit, or automatic when no API key is configured. */
  mock: process.env.MOCK_AI === '1' || !hasRealKey,
  accessCode: process.env.APP_ACCESS_CODE?.trim() || '',
  /**
   * Economy mode (default on, for the free API tier): no Google Search grounding,
   * fewer anamnesis passes, no background term cards, longer rest for exhausted
   * models. Set ECONOMY_MODE=0 on a paid key.
   */
  economy: process.env.ECONOMY_MODE !== '0',
  liveVocabulary: process.env.LIVE_VOCABULARY === '1',
  models: {
    live: process.env.LIVE_MODEL || 'gemini-3.8-live',
    fast: process.env.FAST_MODEL || 'gemini-3.1-flash-lite',
    smart: process.env.SMART_MODEL || 'gemini-3.8-flash',
    tts: process.env.TTS_MODEL || 'gemini-3.8-flash-lite-tts',
    ttsFallback: process.env.TTS_FALLBACK_MODEL || 'gemini-3.8-flash-tts',
    /** Tried after the requested models when those are overloaded or out of quota. */
    fallbacks: (process.env.FALLBACK_MODELS || 'gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
  },
  limits: {
    /** Concurrent live interpreter sessions per client IP and in total. */
    livePerIp: 4,
    liveTotal: 40,
  },
};
