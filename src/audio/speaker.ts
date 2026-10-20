/**
 * Single audio output for everything the app says: the live interpreter's
 * PCM stream, fallback TTS clips and manual replays. One queue means two
 * voices can never talk over each other.
 */

type AudioContextCtor = typeof AudioContext;

const JITTER_BUFFER_S = 0.12; // fallback path only: cushion at the start of a reply
const TAIL_S = 0.15; // room echo after playback before the microphone reopens
const STREAM_IDLE_MS = 700; // no audio for this long: the reply is over even without turnComplete

type LiveState = 'idle' | 'buffering' | 'playing';

export type PlaybackSource = 'live' | 'clip';

export class Speaker {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private playingSource: PlaybackSource | null = null;
  private watch: number | null = null;
  private levelData: Float32Array<ArrayBuffer> | null = null;
  private player: AudioWorkletNode | null = null;
  private playerLoad: Promise<void> | null = null;
  private playerFailed = false;
  private backlog: ArrayBuffer[] = [];
  private liveState: LiveState = 'idle';
  private liveEndedAt = 0;
  private streamIdle: number | null = null;
  onPlayingChange: (playing: PlaybackSource | null) => void = () => {};

  /** Must be called from a user gesture: iOS only starts audio that way. */
  unlock() {
    const ctx = this.context();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = silent;
    src.connect(ctx.destination);
    src.start();
  }

  private context(): AudioContext {
    if (this.ctx && this.ctx.state !== 'closed') return this.ctx;
    const Ctor: AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext;
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ sampleRate: 24000, latencyHint: 'interactive' });
    } catch {
      ctx = new Ctor();
    }
    // Gentle compression evens out loud and quiet phrases without pumping
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    const out = ctx.createGain();
    out.gain.value = 1.6;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    out.connect(comp);
    comp.connect(analyser);
    analyser.connect(ctx.destination);
    this.ctx = ctx;
    this.out = out;
    this.analyser = analyser;
    return ctx;
  }

  /** Is anything audible now (or within the echo tail)? The microphone stays closed meanwhile. */
  isPlaying(): boolean {
    if (!this.ctx) return false;
    if (this.liveState !== 'idle' || this.sources.size > 0) return true;
    const now = this.ctx.currentTime;
    return now < this.nextTime + TAIL_S || now < this.liveEndedAt + TAIL_S;
  }

  /**
   * The live voice plays from an AudioWorklet ring buffer: it keeps a small,
   * adaptive cushion against network jitter and is immune to main-thread jank.
   */
  private ensurePlayer(): Promise<void> | null {
    if (this.playerFailed) return null;
    if (this.playerLoad) return this.playerLoad;
    const ctx = this.context();
    if (!ctx.audioWorklet) {
      this.playerFailed = true;
      return null;
    }
    this.playerLoad = ctx.audioWorklet
      .addModule('/worklets/player.js')
      .then(() => {
        const node = new AudioWorkletNode(ctx, 'live-player', { numberOfInputs: 0, outputChannelCount: [1] });
        node.port.onmessage = (e: MessageEvent<{ type: string; state: LiveState }>) => {
          if (e.data.type === 'state') this.onLiveState(e.data.state);
        };
        node.connect(this.out ?? ctx.destination);
        this.player = node;
        for (const chunk of this.backlog.splice(0)) node.port.postMessage({ type: 'pcm', data: chunk }, [chunk]);
      })
      .catch(() => {
        // Old browser or blocked module: fall back to scheduled buffers
        this.playerFailed = true;
        const pending = this.backlog.splice(0);
        for (const chunk of pending) this.schedulePcm(chunk);
      });
    return this.playerLoad;
  }

  private onLiveState(state: LiveState) {
    const was = this.liveState;
    this.liveState = state;
    if (state === 'idle' && was !== 'idle') {
      this.liveEndedAt = this.ctx?.currentTime ?? 0;
      if (this.playingSource === 'live' && this.sources.size === 0) this.watchEnd();
    }
  }

  get current(): PlaybackSource | null {
    return this.playingSource;
  }

  /** Output level 0–1 for the orb animation. */
  level(): number {
    if (!this.analyser || !this.playingSource) return 0;
    this.levelData ??= new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(this.levelData);
    let sum = 0;
    for (const v of this.levelData) sum += v * v;
    return Math.min(1, Math.sqrt(sum / this.levelData.length) * 4);
  }

  /** Append a chunk of 24 kHz PCM16 from the live interpreter. */
  playPcm(chunk: ArrayBuffer) {
    if (this.playingSource === 'clip') this.stop();
    if (chunk.byteLength < 2) return;
    const ctx = this.context();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    this.setPlaying('live');
    if (this.ensurePlayer()) {
      if (this.player) this.player.port.postMessage({ type: 'pcm', data: chunk }, [chunk]);
      else this.backlog.push(chunk);
      if (this.liveState === 'idle') this.liveState = 'buffering';
      // A reply that simply stops (no turnComplete) must still release the microphone
      if (this.streamIdle !== null) clearTimeout(this.streamIdle);
      this.streamIdle = window.setTimeout(() => this.endLive(), STREAM_IDLE_MS);
      return;
    }
    this.schedulePcm(chunk);
  }

  /** The model finished its reply: play out whatever is buffered without waiting for more. */
  endLive() {
    if (this.streamIdle !== null) clearTimeout(this.streamIdle);
    this.streamIdle = null;
    this.player?.port.postMessage({ type: 'end' });
  }

  private schedulePcm(chunk: ArrayBuffer) {
    const ctx = this.context();
    const pcm = new Int16Array(chunk);
    const buffer = ctx.createBuffer(1, pcm.length, 24000);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) data[i] = pcm[i] / 32768;
    this.schedule(buffer, 'live');
  }

  /** Play a complete clip (WAV/MP3 as base64 or bytes). Resolves when it ends or is stopped. */
  async playClip(audio: string | ArrayBuffer): Promise<void> {
    const ctx = this.context();
    const bytes = typeof audio === 'string' ? Uint8Array.from(atob(audio), (c) => c.charCodeAt(0)).buffer : audio;
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    await new Promise<void>((resolve) => {
      const src = this.schedule(buffer, 'clip');
      src.addEventListener('ended', () => resolve(), { once: true });
    });
  }

  private schedule(buffer: AudioBuffer, kind: PlaybackSource): AudioBufferSourceNode {
    const ctx = this.context();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.out ?? ctx.destination);
    const now = ctx.currentTime;
    const start = this.nextTime > now ? this.nextTime : now + (kind === 'live' ? JITTER_BUFFER_S : 0.01);
    src.start(start);
    this.nextTime = start + buffer.duration;
    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      src.disconnect();
    };
    this.setPlaying(kind);
    this.watchEnd();
    return src;
  }

  private setPlaying(kind: PlaybackSource | null) {
    if (this.playingSource === kind) return;
    this.playingSource = kind;
    this.onPlayingChange(kind);
  }

  private watchEnd() {
    if (this.watch !== null) return;
    const tick = () => {
      if (!this.ctx || this.sources.size > 0 || this.liveState !== 'idle' || this.ctx.currentTime < this.nextTime) {
        this.watch = window.setTimeout(tick, 50);
        return;
      }
      this.watch = null;
      this.setPlaying(null);
    };
    this.watch = window.setTimeout(tick, 50);
  }

  /** Stop everything immediately (skip button, interruption, new conversation). */
  stop() {
    for (const src of this.sources) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // already stopped
      }
      src.dispatchEvent(new Event('ended'));
    }
    this.sources.clear();
    this.nextTime = this.ctx?.currentTime ?? 0;
    this.backlog = [];
    if (this.streamIdle !== null) clearTimeout(this.streamIdle);
    this.streamIdle = null;
    this.player?.port.postMessage({ type: 'clear' });
    this.liveState = 'idle';
    if (this.watch !== null) {
      clearTimeout(this.watch);
      this.watch = null;
    }
    this.setPlaying(null);
  }
}

export const speaker = new Speaker();
