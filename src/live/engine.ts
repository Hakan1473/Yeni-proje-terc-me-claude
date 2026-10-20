import { getLanguage, TURKISH_BCP47 } from '../../shared/languages';
import { appendFragment, normalizeTranscript } from '../../shared/normalize';
import { checkNumbers } from '../../shared/numbers';
import { fuseSpeaker } from '../../shared/speaker';
import { detectTutorial } from '../../shared/tutorials';
import type {
  ConversationItem,
  ConversationRecord,
  ConversationSummary,
  Fact,
  Language,
  Pace,
  Speaker,
  Turn,
  VoiceName,
} from '../../shared/types';
import { Microphone } from '../audio/microphone';
import { speaker } from '../audio/speaker';
import * as api from '../lib/api';
import { saveConversation } from '../lib/history';
import { loadSettings, recordLanguageUse, saveSettings } from '../lib/settings';
import { createSignal, createStore } from '../lib/store';
import { type AiStatus, AnamnesisSync } from './anamnesis';
import { LiveClient } from './liveClient';

export type SessionState = 'idle' | 'connecting' | 'listening' | 'hearing' | 'translating' | 'speaking' | 'reconnecting';

export type ToastKind = 'error' | 'mic' | 'offline' | 'info';

export interface AppState {
  session: SessionState;
  muted: boolean;
  language: Language;
  voice: VoiceName;
  pace: Pace;
  items: ConversationItem[];
  facts: Fact[];
  aiStatus: AiStatus;
  aiSyncedAt: number | null;
  conversationId: string;
  summary: ConversationSummary | null;
  summaryLoading: boolean;
  playingTurnId: string | null;
  translatingTurnId: string | null;
  mock: boolean;
  online: boolean;
  toast: { kind: ToastKind; text: string; id: number } | null;
}

/** Book-keeping for the utterance currently in flight. */
interface OpenTurn {
  id: string;
  source: string;
  translation: string;
  hadOutput: boolean;
  closed: boolean;
  closedAt: number;
  fallbackTimer: number | null;
  fallback: AbortController | null;
}

// No live output this long after the speaker stopped: translate over REST instead
const FALLBACK_AFTER_MS = 3500;
// Late input transcription for a finished turn still belongs to it
const LATE_INPUT_MS = 500;

let idCounter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

function textLang(speakerName: Speaker, side: 'source' | 'translation', target: string): string {
  const turkish = (speakerName === 'nurse') === (side === 'source');
  return turkish ? 'tr' : target;
}

class Engine {
  readonly store;
  /** Microphone and interpreter voice levels, 0–1, for the orb. */
  readonly micLevel = createSignal();
  readonly outLevel = createSignal();

  private active = false;
  private liveReady = false;
  private current: OpenTurn | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;
  private saveTimer: number | null = null;
  private levelLoop: number | null = null;
  private toastId = 0;

  private readonly mic = new Microphone({
    frame: (pcm) => {
      // Half duplex: never feed the interpreter its own voice back
      if (!this.active || this.store.get().muted || speaker.isPlaying()) return;
      this.live.sendAudio(pcm);
    },
    level: (v) => this.micLevel.set(Math.min(1, v * 7)),
  });

  private readonly live = new LiveClient({
    ready: ({ mock }) => {
      this.liveReady = true;
      this.store.set({ mock });
      if (this.active && ['connecting', 'reconnecting'].includes(this.store.get().session)) this.setSession('listening');
    },
    input: (text) => this.onInput(text),
    output: (text) => this.onOutput(text),
    audio: (pcm) => this.onAudio(pcm),
    turnComplete: () => {
      speaker.endLive();
      this.onTurnComplete();
    },
    interrupted: () => {
      if (speaker.current === 'live') speaker.stop();
    },
    reconnecting: () => {
      this.liveReady = false;
      if (this.active) this.setSession('reconnecting');
    },
    error: (message) => this.toast('error', message),
  });

  private readonly anamnesis = new AnamnesisSync({
    turns: () => this.turns(),
    languageName: () => this.store.get().language.nameTr,
    publish: (facts, aiStatus, aiSyncedAt) => {
      this.store.set({ facts, aiStatus, aiSyncedAt });
      this.scheduleSave();
    },
  });

  constructor() {
    const s = loadSettings();
    this.store = createStore<AppState>({
      session: 'idle',
      muted: false,
      language: getLanguage(s.languageCode),
      voice: s.voice,
      pace: s.pace,
      items: [],
      facts: [],
      aiStatus: 'idle',
      aiSyncedAt: null,
      conversationId: newId('c'),
      summary: null,
      summaryLoading: false,
      playingTurnId: null,
      translatingTurnId: null,
      mock: false,
      online: navigator.onLine,
      toast: null,
    });

    speaker.onPlayingChange = (kind) => {
      if (!kind) this.store.set({ playingTurnId: null });
      if (!this.active) return;
      if (kind) this.setSession('speaking');
      else if (this.store.get().session === 'speaking') this.setSession(this.current && !this.current.closed ? 'hearing' : 'listening');
    };

    window.addEventListener('online', () => this.store.set({ online: true }));
    window.addEventListener('offline', () => this.store.set({ online: false }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.active) {
        void this.mic.revive();
        void this.acquireWakeLock();
      }
    });
    void api.health().then((h) => this.store.set({ mock: h.mock })).catch(() => {});
  }

  // ───────────────────────── session ─────────────────────────

  get isActive() {
    return this.active;
  }

  async start() {
    if (this.active) return;
    if (!navigator.onLine) {
      this.toast('offline', 'İnternet bağlantısı gerekli.');
      return;
    }
    // Inside the tap handler: iOS only allows audio that starts from a gesture
    speaker.unlock();
    this.active = true;
    this.liveReady = false;
    this.setSession('connecting');
    const { language, voice, pace } = this.store.get();
    // Microphone permission and the live connection are set up in parallel
    this.live.open({ lang: language.code, voice, pace });
    try {
      await this.mic.start();
      this.mic.setMuted(this.store.get().muted);
    } catch (err) {
      const denied = (err as DOMException)?.name === 'NotAllowedError' || (err as DOMException)?.name === 'SecurityError';
      this.toast(
        denied ? 'mic' : 'error',
        denied
          ? 'Tercüman için mikrofon izni gerekiyor. Tarayıcı ayarlarından mikrofona izin verin.'
          : 'Mikrofon başlatılamadı. Başka bir uygulama kullanıyor olabilir.',
      );
      await this.stop();
      return;
    }
    if (this.liveReady) this.setSession('listening');
    void this.acquireWakeLock();
    this.startLevelLoop();
  }

  async stop() {
    if (!this.active && this.store.get().session === 'idle') return;
    this.active = false;
    this.liveReady = false;
    this.live.close();
    await this.mic.stop();
    speaker.stop();
    this.stopLevelLoop();
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
    const cur = this.current;
    // An utterance cut off by Stop still gets a written translation (not spoken)
    if (cur && !cur.hadOutput && cur.source.trim()) void this.fallback(cur, false);
    else if (cur) this.finalize(cur);
    this.current = null;
    this.setSession('idle');
  }

  toggle() {
    return this.active ? this.stop() : this.start();
  }

  setMuted(muted: boolean) {
    this.store.set({ muted });
    this.mic.setMuted(muted);
    if (muted && this.active) this.live.endAudio();
  }

  /** Tap on the orb while the interpreter talks: stop the voice, keep the session. */
  skipSpeech() {
    speaker.stop();
  }

  private setSession(session: SessionState) {
    if (this.store.get().session !== session) this.store.set({ session });
  }

  private async acquireWakeLock() {
    // Keep the screen on at the bedside while the interpreter runs
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
      this.wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      this.wakeLock = null;
    }
  }

  private startLevelLoop() {
    const tick = () => {
      this.outLevel.set(speaker.level());
      this.levelLoop = requestAnimationFrame(tick);
    };
    this.levelLoop ??= requestAnimationFrame(tick);
  }

  private stopLevelLoop() {
    if (this.levelLoop !== null) cancelAnimationFrame(this.levelLoop);
    this.levelLoop = null;
    this.outLevel.set(0);
  }

  // ───────────────────────── live events ─────────────────────────

  private turns(): Turn[] {
    return this.store.get().items.filter((i): i is Turn => i.kind === 'turn');
  }

  private updateTurn(id: string, patch: Partial<Turn>) {
    this.store.set((s) => ({ items: s.items.map((i) => (i.id === id && i.kind === 'turn' ? { ...i, ...patch } : i)) }));
    this.scheduleSave();
  }

  private beginTurn(): OpenTurn {
    const open: OpenTurn = {
      id: newId('t'),
      source: '',
      translation: '',
      hadOutput: false,
      closed: false,
      closedAt: 0,
      fallbackTimer: null,
      fallback: null,
    };
    const turn: Turn = { kind: 'turn', id: open.id, speaker: 'nurse', speakerConfidence: 0.5, source: '', status: 'capturing', createdAt: Date.now() };
    this.store.set((s) => ({ items: [...s.items, turn] }));
    this.current = open;
    return open;
  }

  /** Re-derive speaker and display text from the raw transcripts. */
  private refresh(open: OpenTurn, final: boolean, patch: Partial<Turn> = {}) {
    const target = this.store.get().language.code;
    const guess = fuseSpeaker(open.source, open.translation || undefined, target);
    const source = normalizeTranscript(open.source, textLang(guess.speaker, 'source', target), { final });
    const translation = open.translation
      ? normalizeTranscript(open.translation, textLang(guess.speaker, 'translation', target), { final })
      : undefined;
    this.updateTurn(open.id, { speaker: guess.speaker, speakerConfidence: guess.confidence, source, translation, ...patch });
  }

  private onInput(fragment: string) {
    if (!this.active) return;
    const cur = this.current;
    // Transcription can trail the reply; the microphone is closed while the
    // interpreter talks, so input that arrives then belongs to the last turn
    const belongs = cur && (!cur.closed || speaker.isPlaying() || Date.now() - cur.closedAt < LATE_INPUT_MS);
    const open = belongs && cur ? cur : this.beginTurn();
    open.source = appendFragment(open.source, fragment);
    this.refresh(open, open.closed, open.closed ? {} : { status: open.hadOutput ? 'translating' : 'capturing' });
    if (open.closed) this.finalize(open);
    if (!speaker.isPlaying() && !open.hadOutput) this.setSession('hearing');
    if (!open.hadOutput) this.armFallback(open);
  }

  private onOutput(fragment: string) {
    if (!this.active) return;
    let open = this.current;
    if (!open || (open.closed && !speaker.isPlaying())) open = this.beginTurn();
    open.hadOutput = true;
    this.cancelFallback(open);
    open.translation = appendFragment(open.translation, fragment);
    this.refresh(open, false, { status: 'translating', via: 'live' });
    if (!speaker.isPlaying()) this.setSession('translating');
  }

  private onAudio(pcm: ArrayBuffer) {
    if (!this.active) return;
    const open = this.current;
    if (open) {
      open.hadOutput = true;
      this.cancelFallback(open);
      // Audio arrives every few tens of ms: only touch the store (and React) on change
      if (this.store.get().playingTurnId !== open.id) this.store.set({ playingTurnId: open.id });
    }
    speaker.playPcm(pcm);
  }

  private onTurnComplete() {
    const open = this.current;
    if (!open || open.closed) return;
    open.closed = true;
    open.closedAt = Date.now();
    if (open.translation) this.finalize(open);
    // The model stayed silent (noise, or it declined): translate over REST
    else if (open.source.trim()) void this.fallback(open, true);
    if (this.active && !speaker.isPlaying()) this.setSession('listening');
  }

  private armFallback(open: OpenTurn) {
    this.cancelFallback(open);
    open.fallbackTimer = window.setTimeout(() => {
      if (!open.hadOutput) void this.fallback(open, true);
    }, FALLBACK_AFTER_MS);
  }

  private cancelFallback(open: OpenTurn) {
    if (open.fallbackTimer !== null) clearTimeout(open.fallbackTimer);
    open.fallbackTimer = null;
    if (open.fallback) {
      open.fallback.abort();
      open.fallback = null;
    }
  }

  private async fallback(open: OpenTurn, speak: boolean) {
    if (open.fallback || open.hadOutput) return;
    const controller = new AbortController();
    open.fallback = controller;
    const { language } = this.store.get();
    const turn = this.turns().find((t) => t.id === open.id);
    try {
      const res = await api.translate(turn?.source || open.source, language.code, turn?.speaker, controller.signal);
      // Live output won the race: discard
      if (controller.signal.aborted || open.hadOutput) return;
      open.translation = res.translation;
      open.closed = true;
      this.refresh(open, true, { via: 'rest' });
      this.finalize(open, res.speaker);
      if (speak && this.active && !speaker.isPlaying()) void this.speakTurn(open.id);
    } catch {
      if (!controller.signal.aborted) this.updateTurn(open.id, { status: 'failed' });
    } finally {
      if (open.fallback === controller) open.fallback = null;
    }
  }

  /** Final clean-up of a turn: final punctuation, speaker, number guard, tutorial, anamnesis. */
  private finalize(open: OpenTurn, speakerHint?: Speaker) {
    this.cancelFallback(open);
    const target = this.store.get().language.code;
    let guess = fuseSpeaker(open.source, open.translation || undefined, target);
    if (speakerHint && guess.confidence < 0.9) guess = { ...guess, speaker: speakerHint, confidence: 0.9 };
    const who = guess.speaker;
    const srcLang = textLang(who, 'source', target);
    const trLang = textLang(who, 'translation', target);
    const source = normalizeTranscript(open.source, srcLang, { final: true });
    const translation = open.translation ? normalizeTranscript(open.translation, trLang, { final: true }) : undefined;
    const turn: Partial<Turn> = {
      speaker: who,
      speakerConfidence: guess.confidence,
      source,
      translation,
      status: translation ? 'done' : 'failed',
      numberCheck: translation && source ? checkNumbers(source, srcLang, translation, trLang) : undefined,
      tutorial: who === 'nurse' ? detectTutorial(source, translation) : undefined,
    };
    this.updateTurn(open.id, turn);
    const full = this.turns().find((t) => t.id === open.id);
    if (full?.status === 'done') this.anamnesis.onTurn(full);
  }

  // ───────────────────────── user actions ─────────────────────────

  setLanguage(language: Language) {
    recordLanguageUse(language.code);
    if (language.code === this.store.get().language.code) return;
    saveSettings({ languageCode: language.code });
    this.store.set((s) => ({
      language,
      items: s.items.length
        ? [...s.items, { kind: 'note', id: newId('n'), text: `${language.nameTr} diline geçildi`, createdAt: Date.now() }]
        : s.items,
    }));
    this.pushConfig();
  }

  setVoice(voice: VoiceName) {
    saveSettings({ voice });
    this.store.set({ voice });
    this.pushConfig();
  }

  setPace(pace: Pace) {
    saveSettings({ pace });
    this.store.set({ pace });
    this.pushConfig();
  }

  private pushConfig(reset = false) {
    if (!this.active) return;
    const { language, voice, pace } = this.store.get();
    this.live.update({ lang: language.code, voice, pace }, reset);
  }

  /** Read a turn aloud (translation by default) in the selected voice. */
  async speakTurn(turnId: string, side: 'translation' | 'source' = 'translation') {
    const turn = this.turns().find((t) => t.id === turnId);
    if (!turn) return;
    if (this.store.get().playingTurnId === turnId) {
      speaker.stop();
      return;
    }
    const text = side === 'translation' ? (turn.translation ?? turn.source) : turn.source;
    if (!text) return;
    speaker.unlock();
    speaker.stop();
    this.store.set({ playingTurnId: turnId });
    const turkish = textLang(turn.speaker, side === 'translation' && turn.translation ? 'translation' : 'source', 'x') === 'tr';
    try {
      const audio = await api.tts(text, this.store.get().voice);
      if (this.store.get().playingTurnId !== turnId) return;
      if (audio) {
        await speaker.playClip(audio);
        return;
      }
    } catch {
      // fall through to the browser voice
    }
    if (this.store.get().playingTurnId !== turnId) return;
    await this.browserSpeak(text, turkish ? TURKISH_BCP47 : this.store.get().language.bcp47);
    if (this.store.get().playingTurnId === turnId) this.store.set({ playingTurnId: null });
  }

  private browserSpeak(text: string, lang: string): Promise<void> {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }

  /** Translate (again) over REST, e.g. after a failed or doubtful live translation. */
  async retranslate(turnId: string) {
    const turn = this.turns().find((t) => t.id === turnId);
    if (!turn?.source) return;
    this.store.set({ translatingTurnId: turnId });
    try {
      const res = await api.translate(turn.source, this.store.get().language.code, turn.speaker);
      const open: OpenTurn = {
        id: turnId,
        source: turn.source,
        translation: res.translation,
        hadOutput: true,
        closed: true,
        closedAt: Date.now(),
        fallbackTimer: null,
        fallback: null,
      };
      this.updateTurn(turnId, { via: 'rest' });
      this.finalize(open, res.speaker);
    } catch {
      this.toast('error', 'Çeviri alınamadı. Bağlantıyı kontrol edip tekrar deneyin.');
    } finally {
      this.store.set({ translatingTurnId: null });
    }
  }

  /** Typed message: translated and read aloud, without the microphone. */
  async sendTyped(text: string) {
    const clean = text.trim();
    if (!clean) return;
    speaker.unlock();
    const open = this.beginTurn();
    open.source = clean;
    open.closed = true;
    this.refresh(open, true, { status: 'translating' });
    this.current = null;
    try {
      const turn = this.turns().find((t) => t.id === open.id);
      const res = await api.translate(clean, this.store.get().language.code, turn?.speaker);
      open.translation = res.translation;
      open.hadOutput = true;
      this.updateTurn(open.id, { via: 'rest' });
      this.finalize(open, res.speaker);
      void this.speakTurn(open.id);
    } catch {
      this.updateTurn(open.id, { status: 'failed' });
      this.toast('error', 'Çeviri alınamadı. Bağlantıyı kontrol edin.');
    }
  }

  async generateSummary() {
    const { language } = this.store.get();
    const turns = this.turns().filter((t) => t.status === 'done');
    if (turns.length === 0) return;
    this.store.set({ summaryLoading: true });
    try {
      const summary = await api.summary(
        language.nameTr,
        turns.map(({ id, speaker: who, source, translation }) => ({ id, speaker: who, source, translation })),
      );
      this.store.set({ summary });
      this.scheduleSave();
    } catch {
      this.toast('error', 'Özet oluşturulamadı. Tekrar deneyin.');
    } finally {
      this.store.set({ summaryLoading: false });
    }
  }

  // ───────────────────────── conversations ─────────────────────────

  private record(): ConversationRecord | null {
    const s = this.store.get();
    const turns = s.items.filter((i): i is Turn => i.kind === 'turn' && !!(i.source || i.translation));
    if (turns.length === 0) return null;
    const preview = turns
      .slice(0, 2)
      .map((t) => `${t.speaker === 'nurse' ? 'Hemşire' : 'Hasta'}: ${t.speaker === 'nurse' ? t.source : (t.translation ?? t.source)}`)
      .join(' · ');
    return {
      id: s.conversationId,
      createdAt: s.items[0]?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      languageCode: s.language.code,
      items: s.items,
      summary: s.summary,
      facts: s.facts,
      preview: preview.length > 160 ? `${preview.slice(0, 157)}…` : preview,
    };
  }

  private scheduleSave() {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      const r = this.record();
      if (r) void saveConversation(r).then(() => window.dispatchEvent(new Event('history-changed')));
    }, 800);
  }

  private flushSave() {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const r = this.record();
    if (r) void saveConversation(r).then(() => window.dispatchEvent(new Event('history-changed')));
  }

  newConversation() {
    this.flushSave();
    this.resetConversation();
  }

  /** Start fresh without saving (used after the current conversation was deleted). */
  resetConversation() {
    if (this.current) this.cancelFallback(this.current);
    this.current = null;
    speaker.stop();
    this.store.set({ items: [], facts: [], summary: null, conversationId: newId('c'), playingTurnId: null });
    this.anamnesis.reset();
    this.pushConfig(true);
  }

  restore(record: ConversationRecord) {
    this.flushSave();
    if (this.current) this.cancelFallback(this.current);
    this.current = null;
    speaker.stop();
    const language = getLanguage(record.languageCode);
    this.store.set({
      items: record.items,
      facts: record.facts ?? [],
      summary: record.summary ?? null,
      conversationId: record.id,
      language,
    });
    const last = record.items.at(-1)?.createdAt ?? 0;
    this.anamnesis.reset(record.facts ?? [], last);
    this.pushConfig(true);
  }

  // ───────────────────────── toasts ─────────────────────────

  toast(kind: ToastKind, text: string) {
    this.store.set({ toast: { kind, text, id: ++this.toastId } });
  }

  dismissToast() {
    this.store.set({ toast: null });
  }
}

export const engine = new Engine();
