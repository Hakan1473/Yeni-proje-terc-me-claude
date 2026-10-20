/**
 * Microphone → 16 kHz PCM16 frames (40 ms), produced off the main thread by
 * an AudioWorklet. Tries a 16 kHz AudioContext first (the browser's own
 * high-quality resampler); Firefox refuses to mix sample rates with a
 * microphone, so it falls back to the device rate and resamples in the worklet.
 */

export interface MicrophoneEvents {
  frame(pcm: Int16Array<ArrayBuffer>): void;
  level(value: number): void;
}

type AudioContextCtor = typeof AudioContext;

function audioContextClass(): AudioContextCtor {
  return window.AudioContext ?? (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext;
}

export class Microphone {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private muted = false;

  constructor(private readonly events: MicrophoneEvents) {}

  get active(): boolean {
    return this.stream !== null;
  }

  async start(): Promise<void> {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    try {
      await this.buildGraph(16000);
    } catch {
      await this.teardownGraph();
      await this.buildGraph(undefined);
    }
    this.setMuted(this.muted);
  }

  private async buildGraph(sampleRate: number | undefined) {
    const Ctor = audioContextClass();
    const ctx = sampleRate ? new Ctor({ sampleRate }) : new Ctor();
    this.ctx = ctx;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
    const stream = this.stream;
    if (!stream) throw new Error('no stream');
    this.source = ctx.createMediaStreamSource(stream);
    // Keep the graph pulled without making any sound
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.sink.connect(ctx.destination);

    if (ctx.audioWorklet) {
      await ctx.audioWorklet.addModule('/worklets/capture.js');
      const node = new AudioWorkletNode(ctx, 'capture-16k', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
      node.port.onmessage = (e: MessageEvent) => {
        if (e.data instanceof ArrayBuffer) {
          if (!this.muted) this.events.frame(new Int16Array(e.data));
        } else if (typeof e.data?.level === 'number') {
          this.events.level(this.muted ? 0 : e.data.level);
        }
      };
      this.node = node;
    } else {
      this.node = this.scriptProcessorFallback(ctx);
    }
    this.source.connect(this.node);
    this.node.connect(this.sink);
  }

  /** Older browsers without AudioWorklet: simple averaging decimator on the main thread. */
  private scriptProcessorFallback(ctx: AudioContext): ScriptProcessorNode {
    const node = ctx.createScriptProcessor(2048, 1, 1);
    const ratio = ctx.sampleRate / 16000;
    let carry: number[] = [];
    node.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      this.events.level(this.muted ? 0 : Math.sqrt(sum / input.length));
      if (this.muted) return;
      for (let pos = 0; pos + ratio <= input.length; pos += ratio) {
        let acc = 0;
        let n = 0;
        for (let i = Math.floor(pos); i < Math.floor(pos + ratio); i++, n++) acc += input[i];
        carry.push(n ? acc / n : 0);
      }
      while (carry.length >= 640) {
        const frame = new Int16Array(640);
        for (let i = 0; i < 640; i++) {
          const s = Math.max(-1, Math.min(1, carry[i]));
          frame[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        carry = carry.slice(640);
        this.events.frame(frame);
      }
    };
    return node;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !muted;
    if (muted) this.events.level(0);
  }

  /** Browsers suspend audio in the background; resume when the page is visible again. */
  async revive() {
    if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => {});
  }

  private async teardownGraph() {
    if (this.node && 'port' in this.node) this.node.port.onmessage = null;
    this.node?.disconnect();
    this.source?.disconnect();
    this.sink?.disconnect();
    this.node = null;
    this.source = null;
    this.sink = null;
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close().catch(() => {});
    this.ctx = null;
  }

  async stop() {
    await this.teardownGraph();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.events.level(0);
  }
}
