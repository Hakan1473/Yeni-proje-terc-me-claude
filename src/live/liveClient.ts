import type { Pace, VoiceName } from '../../shared/types';
import { getAccessCode } from '../lib/settings';

export interface LiveOptions {
  lang: string;
  voice: VoiceName;
  pace: Pace;
}

export interface LiveEvents {
  ready(info: { resumed: boolean; mock: boolean }): void;
  input(text: string): void;
  output(text: string): void;
  audio(pcm: ArrayBuffer): void;
  turnComplete(): void;
  interrupted(): void;
  reconnecting(): void;
  error(message: string): void;
}

/**
 * WebSocket to the server's /live bridge. Reconnects with backoff while the
 * session is active and detects dead connections with an app-level ping.
 */
export class LiveClient {
  private ws: WebSocket | null = null;
  private active = false;
  private opts: LiveOptions | null = null;
  private attempts = 0;
  private retryTimer: number | null = null;
  private pingTimer: number | null = null;
  private lastPong = 0;

  constructor(private readonly events: LiveEvents) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  open(opts: LiveOptions) {
    this.opts = opts;
    this.active = true;
    this.attempts = 0;
    this.connect();
  }

  private connect() {
    if (!this.active || !this.opts) return;
    this.closeSocket();
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const code = encodeURIComponent(getAccessCode());
    const ws = new WebSocket(`${proto}//${location.host}/live${code ? `?code=${code}` : ''}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.lastPong = Date.now();
      ws.send(JSON.stringify({ t: 'start', ...this.opts }));
      this.startPing();
    };
    ws.onmessage = (e: MessageEvent) => {
      if (this.ws !== ws) return;
      if (e.data instanceof ArrayBuffer) {
        this.events.audio(e.data);
        return;
      }
      let msg: { t: string; text?: string; resumed?: boolean; mock?: boolean; message?: string; s?: string };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      switch (msg.t) {
        case 'ready':
          this.events.ready({ resumed: !!msg.resumed, mock: !!msg.mock });
          break;
        case 'in':
          if (msg.text) this.events.input(msg.text);
          break;
        case 'out':
          if (msg.text) this.events.output(msg.text);
          break;
        case 'turn':
          this.events.turnComplete();
          break;
        case 'interrupted':
          this.events.interrupted();
          break;
        case 'status':
          this.events.reconnecting();
          break;
        case 'error':
          this.events.error(msg.message ?? 'Bağlantı hatası');
          break;
        case 'pong':
          this.lastPong = Date.now();
          break;
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopPing();
      if (!this.active) return;
      this.events.reconnecting();
      const delay = Math.min(4000, 400 * 2 ** this.attempts++);
      this.retryTimer = window.setTimeout(() => this.connect(), delay);
    };
    ws.onerror = () => ws.close();
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = window.setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      // No pong for 25 s: the connection is dead even if the socket looks open
      if (Date.now() - this.lastPong > 25_000) {
        this.ws.close();
        return;
      }
      this.ws.send('{"t":"ping"}');
    }, 10_000);
  }

  private stopPing() {
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  sendAudio(pcm: Int16Array<ArrayBuffer>) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm);
  }

  /**
   * Language, voice or pace changed: the server switches without a gap.
   * reset starts a fresh interpreter context (new or restored conversation).
   */
  update(opts: LiveOptions, reset = false) {
    this.opts = opts;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'config', ...opts, reset: reset || undefined }));
  }

  endAudio() {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('{"t":"mute"}');
  }

  private closeSocket() {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close();
  }

  close() {
    this.active = false;
    this.closeSocket();
  }
}
