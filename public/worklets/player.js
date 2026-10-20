// Live interpreter playback on the audio thread.
// PCM16 at 24 kHz goes into a ring buffer; playback starts once a small cushion
// has built up, so uneven network delivery does not chop the voice. If the
// stream runs dry mid-sentence the player waits for a slightly larger cushion
// instead of stuttering through every late packet. Main-thread work (UI,
// rendering) cannot interrupt the sound, because nothing is scheduled there.

const SOURCE_RATE = 24000;
const START_MS = 140; // cushion before the first word
const MAX_START_MS = 420; // cap after repeated underruns
const STEP_MS = 70; // cushion added after each underrun
const FADE = 96; // samples of fade-in after a (re)start, avoids clicks

class LivePlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(SOURCE_RATE * 30);
    this.read = 0;
    this.write = 0;
    this.size = 0;
    this.pos = 0; // fractional read position between this.read and the next sample
    this.step = SOURCE_RATE / sampleRate;
    this.startMs = START_MS;
    this.state = 'idle'; // idle | buffering | playing
    this.ended = false; // the server said the reply is complete
    this.fade = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(msg) {
    if (msg.type === 'pcm') {
      const pcm = new Int16Array(msg.data);
      for (let i = 0; i < pcm.length; i++) {
        if (this.size === this.buf.length) break; // 30 s backlog: drop rather than wrap
        this.buf[this.write] = pcm[i] / 32768;
        this.write = (this.write + 1) % this.buf.length;
        this.size++;
      }
      this.ended = false;
      if (this.state === 'idle') this.setState('buffering');
    } else if (msg.type === 'end') {
      this.ended = true;
      if (this.state === 'buffering') this.setState(this.size > 0 ? 'playing' : 'idle');
    } else if (msg.type === 'clear') {
      this.read = this.write = this.size = 0;
      this.pos = 0;
      this.ended = false;
      this.startMs = START_MS;
      this.setState('idle');
    }
  }

  setState(state) {
    if (state === this.state) return;
    if (state === 'playing') this.fade = 0;
    this.state = state;
    this.port.postMessage({ type: 'state', state });
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    if (this.state === 'buffering' && this.size >= (this.startMs / 1000) * SOURCE_RATE) this.setState('playing');
    if (this.state !== 'playing') {
      out.fill(0);
      return true;
    }
    for (let i = 0; i < out.length; i++) {
      if (this.size < 2) {
        out.fill(0, i);
        if (this.ended) {
          this.startMs = START_MS;
          this.setState('idle');
        } else {
          // Ran dry mid-reply: wait for a bigger cushion next time
          this.startMs = Math.min(MAX_START_MS, this.startMs + STEP_MS);
          this.setState('buffering');
        }
        break;
      }
      // Linear interpolation covers output devices that do not run at 24 kHz
      const a = this.buf[this.read];
      const b = this.buf[(this.read + 1) % this.buf.length];
      let v = a + (b - a) * this.pos;
      if (this.fade < FADE) v *= ++this.fade / FADE;
      out[i] = v;
      this.pos += this.step;
      while (this.pos >= 1) {
        this.pos -= 1;
        this.read = (this.read + 1) % this.buf.length;
        this.size--;
      }
    }
    return true;
  }
}

registerProcessor('live-player', LivePlayer);
