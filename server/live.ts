import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  ActivityHandling,
  EndSensitivity,
  type LiveConnectConfig,
  type LiveServerMessage,
  Modality,
  type Session,
  StartSensitivity,
} from '@google/genai';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import { getLanguage } from '../shared/languages';
import { DRUGS } from '../shared/medical/lexicon';
import type { Language, Pace, VoiceName } from '../shared/types';
import { PACE_SILENCE_MS, VOICES } from '../shared/types';
import { ai } from './ai';
import { config } from './config';
import { DEMO_SCRIPT, mockPcm } from './mock';
import { liveInstruction } from './prompts';
import { clientIp, hasAccess } from './security';

/**
 * Browser ⇄ server ⇄ Gemini Live bridge.
 *
 * Wire protocol with the browser:
 *   binary frames  client→server: PCM16 mono 16 kHz microphone audio
 *                  server→client: PCM16 mono 24 kHz interpreter speech
 *   JSON frames    control and transcripts ({ t: 'ready' | 'in' | 'out' | 'turn' | … })
 *
 * Binary audio avoids base64 + JSON on every 40 ms frame.
 */

interface LiveOptions {
  lang: Language;
  voice: VoiceName;
  pace: Pace;
}

interface UpstreamEvents {
  input(text: string, finished?: boolean): void;
  output(text: string): void;
  audio(pcm: Buffer): void;
  interrupted(): void;
  turnComplete(): void;
  resumptionHandle(handle: string): void;
  goAway(): void;
  closed(reason: string): void;
}

interface Upstream {
  sendAudio(pcm: Buffer): void;
  endAudio(): void;
  sendText(text: string): void;
  close(): void;
}

// ───────────────────────── Gemini upstream ─────────────────────────

// Speech-recognition hints for drug names. Sent only when LIVE_VOCABULARY=1;
// dropped automatically if the model rejects the field.
const VOCABULARY = Array.from(new Set(DRUGS.map((d) => d.name).concat(['Triflow', 'Clexane', 'serum', 'damar yolu', 'tansiyon'])));
let vocabularySupported = config.liveVocabulary;
interface Features {
  vocabulary: boolean;
}

function liveConfig(opts: LiveOptions, handle: string | undefined, features: Features): LiveConnectConfig {
  const withVocabulary = features.vocabulary;
  return {
    responseModalities: [Modality.AUDIO],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice } } },
    systemInstruction: liveInstruction(opts.lang),
    inputAudioTranscription: withVocabulary ? { customVocabulary: VOCABULARY } : {},
    outputAudioTranscription: {},
    realtimeInputConfig: {
      automaticActivityDetection: {
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        // Only the unhurried pace waits through long pauses; the others hand over quickly
        endOfSpeechSensitivity: opts.pace === 'patient' ? EndSensitivity.END_SENSITIVITY_LOW : EndSensitivity.END_SENSITIVITY_HIGH,
        silenceDurationMs: PACE_SILENCE_MS[opts.pace],
        prefixPaddingMs: 150,
      },
      activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
    },
    // Resumption keeps the conversation context across reconnects and server GoAway
    sessionResumption: handle ? { handle } : {},
    // Sliding window lifts the audio session length limit for long consultations
    contextWindowCompression: { slidingWindow: {} },
  };
}

async function openGemini(opts: LiveOptions, events: UpstreamEvents, handle?: string): Promise<Upstream> {
  const attempt = async (features: Features): Promise<Session> => {
    let opened = false;
    let failEarly: (err: Error) => void = () => {};
    const early = new Promise<never>((_, reject) => {
      failEarly = reject;
    });
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('live connect timeout')), 10_000));
    const connecting = ai.live.connect({
      model: config.models.live,
      config: liveConfig(opts, handle, features),
      callbacks: {
        onmessage: (msg: LiveServerMessage) => handleMessage(msg, events),
        onerror: (e: ErrorEvent) => console.warn('[live] upstream error:', e?.message),
        onclose: (e: CloseEvent) => {
          // A rejected setup closes the socket before setupComplete; the SDK would wait forever
          if (!opened) failEarly(new Error(`closed during setup: ${e?.code} ${e?.reason ?? ''}`));
          else events.closed(`${e?.code ?? ''} ${e?.reason ?? ''}`.trim());
        },
      },
    });
    const session = await Promise.race([connecting, early, timeout]);
    opened = true;
    return session;
  };

  let session: Session;
  try {
    session = await attempt({ vocabulary: vocabularySupported });
  } catch (err) {
    if (!vocabularySupported) throw err;
    console.warn('[live] connect with vocabulary failed, retrying without:', (err as Error).message);
    vocabularySupported = false;
    session = await attempt({ vocabulary: false });
  }

  return {
    sendAudio: (pcm) => session.sendRealtimeInput({ audio: { data: pcm.toString('base64'), mimeType: 'audio/pcm;rate=16000' } }),
    endAudio: () => session.sendRealtimeInput({ audioStreamEnd: true }),
    sendText: (text) => session.sendClientContent({ turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true }),
    close: () => {
      try {
        session.close();
      } catch {
        // already closed
      }
    },
  };
}

function handleMessage(msg: LiveServerMessage, events: UpstreamEvents): void {
  const sc = msg.serverContent;
  for (const part of sc?.modelTurn?.parts ?? []) {
    if (part.inlineData?.data) events.audio(Buffer.from(part.inlineData.data, 'base64'));
  }
  if (sc?.inputTranscription?.text) events.input(sc.inputTranscription.text, sc.inputTranscription.finished);
  if (sc?.outputTranscription?.text) events.output(sc.outputTranscription.text);
  if (sc?.interrupted) events.interrupted();
  if (sc?.turnComplete) events.turnComplete();
  const update = msg.sessionResumptionUpdate;
  if (update?.resumable && update.newHandle) events.resumptionHandle(update.newHandle);
  if (msg.goAway) events.goAway();
}

// ───────────────────────── Simulation upstream ─────────────────────────

function openMock(events: UpstreamEvents, cursor: { index: number }): Upstream {
  let lastAudioAt = 0;
  let busy = false;
  let idleSince = Date.now();
  let closed = false;
  const timers = new Set<NodeJS.Timeout>();
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!closed) fn();
    }, ms);
    timers.add(t);
  };

  const playTurn = () => {
    busy = true;
    const turn = DEMO_SCRIPT[cursor.index % DEMO_SCRIPT.length];
    cursor.index++;
    const saidWords = turn.said.split(' ');
    saidWords.forEach((w, i) => later(i * 110, () => events.input(i === 0 ? w : ` ${w}`)));
    const start = saidWords.length * 110 + 450;
    const seconds = Math.min(5, 0.6 + turn.heard.length * 0.05);
    const chunks = Math.ceil(seconds / 0.12);
    const pcm = mockPcm(seconds);
    const chunkBytes = Math.ceil(pcm.length / chunks / 2) * 2;
    const heardWords = turn.heard.split(' ');
    for (let c = 0; c < chunks; c++) later(start + c * 100, () => events.audio(pcm.subarray(c * chunkBytes, (c + 1) * chunkBytes)));
    heardWords.forEach((w, i) =>
      later(start + Math.floor((i / heardWords.length) * chunks * 100), () => events.output(i === 0 ? w : ` ${w}`)),
    );
    later(start + chunks * 100 + 150, () => {
      events.turnComplete();
      busy = false;
      idleSince = Date.now();
    });
  };

  const loop = setInterval(() => {
    if (closed || busy) return;
    const micActive = Date.now() - lastAudioAt < 800;
    const gap = cursor.index === 0 ? 1800 : 3200;
    if (micActive && Date.now() - idleSince > gap) playTurn();
  }, 200);

  return {
    sendAudio: () => {
      lastAudioAt = Date.now();
    },
    endAudio: () => {
      lastAudioAt = 0;
    },
    sendText: () => {},
    close: () => {
      closed = true;
      clearInterval(loop);
      for (const t of timers) clearTimeout(t);
    },
  };
}

// ───────────────────────── Client session ─────────────────────────

const MAX_PENDING_BYTES = 16000 * 2 * 3; // 3 s of microphone audio while (re)connecting

class ClientSession {
  private opts: LiveOptions | null = null;
  private upstream: Upstream | null = null;
  private connecting = false;
  private queuedReconnect: { fresh: boolean } | null = null;
  private handle: string | undefined;
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private closed = false;
  private retries = 0;
  private mockCursor = { index: 0 };

  constructor(private readonly ws: WebSocket) {}

  private send(msg: Record<string, unknown>) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  onJson(raw: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.t) {
      case 'start':
      case 'config': {
        const next = readOptions(msg, this.opts);
        const changed =
          !this.opts || next.lang.code !== this.opts.lang.code || next.voice !== this.opts.voice || next.pace !== this.opts.pace;
        this.opts = next;
        // reset: a new conversation must not inherit the previous one's context
        if (changed || !this.upstream || msg.reset === true) this.connect(true);
        else this.send({ t: 'ready', resumed: true, mock: config.mock });
        break;
      }
      case 'mute':
        this.pending = [];
        this.pendingBytes = 0;
        this.safe(() => this.upstream?.endAudio());
        break;
      case 'text':
        if (typeof msg.text === 'string' && msg.text.trim()) this.safe(() => this.upstream?.sendText(String(msg.text).slice(0, 1500)));
        break;
      case 'ping':
        this.send({ t: 'pong' });
        break;
    }
  }

  onAudio(pcm: Buffer) {
    if (this.upstream && !this.connecting) {
      this.safe(() => this.upstream?.sendAudio(pcm));
      return;
    }
    // Keep the newest audio while connecting so the first words are not lost
    this.pending.push(pcm);
    this.pendingBytes += pcm.length;
    while (this.pendingBytes > MAX_PENDING_BYTES && this.pending.length) this.pendingBytes -= this.pending.shift()?.length ?? 0;
  }

  private safe(fn: () => void) {
    try {
      fn();
    } catch (err) {
      console.warn('[live] upstream send failed:', (err as Error).message);
      this.upstream = null;
      this.connect(false);
    }
  }

  /**
   * Open a new upstream. The old one keeps interpreting until the new one is
   * ready (make-before-break), so a voice or language switch has no gap.
   * fresh=false resumes the previous conversation context via its handle.
   */
  private async connect(fresh: boolean) {
    if (this.closed || !this.opts) return;
    if (this.connecting) {
      this.queuedReconnect = { fresh: fresh || !!this.queuedReconnect?.fresh };
      return;
    }
    this.connecting = true;
    const opts = this.opts;
    const handle = fresh ? undefined : this.handle;
    if (fresh) this.handle = undefined;
    let next: Upstream | null = null;
    const isCurrent = () => this.upstream === next;
    const events: UpstreamEvents = {
      input: (text, finished) => isCurrent() && this.send({ t: 'in', text, fin: finished || undefined }),
      output: (text) => isCurrent() && this.send({ t: 'out', text }),
      audio: (pcm) => isCurrent() && this.ws.readyState === WebSocket.OPEN && this.ws.send(pcm),
      interrupted: () => isCurrent() && this.send({ t: 'interrupted' }),
      turnComplete: () => isCurrent() && this.send({ t: 'turn' }),
      resumptionHandle: (h) => {
        if (isCurrent()) this.handle = h;
      },
      goAway: () => {
        if (isCurrent()) this.connect(false);
      },
      closed: (reason) => {
        if (!isCurrent() || this.closed) return;
        console.warn('[live] upstream closed:', reason);
        this.upstream = null;
        this.send({ t: 'status', s: 'reconnecting' });
        const delay = Math.min(4000, 300 * 2 ** this.retries++);
        setTimeout(() => this.connect(false), delay);
      },
    };

    try {
      next = config.mock ? openMock(events, this.mockCursor) : await openGemini(opts, events, handle);
      if (this.closed) {
        next.close();
        return;
      }
      const previous = this.upstream;
      this.upstream = next;
      previous?.close();
      this.retries = 0;
      this.send({ t: 'ready', resumed: !!handle, mock: config.mock });
      for (const chunk of this.pending) this.safe(() => next?.sendAudio(chunk));
      this.pending = [];
      this.pendingBytes = 0;
    } catch (err) {
      console.warn('[live] connect failed:', (err as Error).message);
      this.send({ t: 'error', message: 'Canlı tercüme hattı kurulamadı, yeniden deneniyor.' });
      const delay = Math.min(5000, 500 * 2 ** this.retries++);
      setTimeout(() => {
        if (!this.upstream) this.connect(fresh);
      }, delay);
    } finally {
      this.connecting = false;
      const queued = this.queuedReconnect;
      this.queuedReconnect = null;
      if (queued && !this.closed) this.connect(queued.fresh);
    }
  }

  close() {
    this.closed = true;
    this.upstream?.close();
    this.upstream = null;
  }
}

function readOptions(msg: Record<string, unknown>, prev: LiveOptions | null): LiveOptions {
  const lang = typeof msg.lang === 'string' ? getLanguage(msg.lang) : (prev?.lang ?? getLanguage('en'));
  const voice = VOICES.includes(msg.voice as VoiceName) ? (msg.voice as VoiceName) : (prev?.voice ?? 'Zephyr');
  const pace: Pace = msg.pace === 'fast' || msg.pace === 'patient' || msg.pace === 'balanced' ? msg.pace : (prev?.pace ?? 'balanced');
  return { lang, voice, pace };
}

// ───────────────────────── HTTP upgrade ─────────────────────────

export function attachLive(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  const perIp = new Map<string, number>();
  let total = 0;

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // Other upgrade requests (Vite HMR) are left to their own handlers
    if (!/\/live\/?$/.test(url.pathname)) return;
    const ip = clientIp(req);
    if (!hasAccess(url.searchParams.get('code'))) {
      socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return;
    }
    if ((perIp.get(ip) ?? 0) >= config.limits.livePerIp || total >= config.limits.liveTotal) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      total++;
      perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
      const session = new ClientSession(ws);
      let alive = true;
      const heartbeat = setInterval(() => {
        if (!alive) return ws.terminate();
        alive = false;
        ws.ping();
      }, 20_000);
      ws.on('pong', () => {
        alive = true;
      });
      ws.on('message', (data: RawData, isBinary: boolean) => {
        alive = true;
        if (!isBinary) return session.onJson(data.toString());
        session.onAudio(Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data));
      });
      ws.on('close', () => {
        clearInterval(heartbeat);
        session.close();
        total--;
        const n = (perIp.get(ip) ?? 1) - 1;
        if (n <= 0) perIp.delete(ip);
        else perIp.set(ip, n);
      });
      ws.on('error', () => ws.close());
    });
  });
}
