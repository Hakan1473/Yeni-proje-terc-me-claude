import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const apiKey = process.env.GEMINI_API_KEY?.trim() ?? '';
const hasRealKey = apiKey.length > 0 && apiKey !== 'MY_GEMINI_API_KEY';

export const config = {
  port: Number(process.env.PORT) || 3000,
  isProduction: process.env.NODE_ENV === 'production',
  apiKey,
  /** Simulation mode: explicit, or automatic when no API key is configured. */
  mock: process.env.MOCK_AI === '1' || !hasRealKey,
  accessCode: process.env.APP_ACCESS_CODE?.trim() || '',
  liveVocabulary: process.env.LIVE_VOCABULARY === '1',
  models: {
    live: process.env.LIVE_MODEL || 'gemini-3.8-live',
    fast: process.env.FAST_MODEL || 'gemini-3.1-flash-lite',
    smart: process.env.SMART_MODEL || 'gemini-3.8-flash',
    tts: process.env.TTS_MODEL || 'gemini-3.8-flash-lite-tts',
    ttsFallback: process.env.TTS_FALLBACK_MODEL || 'gemini-3.8-flash-tts',
  },
  limits: {
    /** Concurrent live interpreter sessions per client IP and in total. */
    livePerIp: 4,
    liveTotal: 40,
  },
};
