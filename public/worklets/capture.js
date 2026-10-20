// Microphone capture on the audio thread.
// Low-pass filters (windowed sinc), resamples to 16 kHz, converts to PCM16 and
// posts 40 ms frames to the main thread, plus a smoothed input level for the UI.

const TARGET_RATE = 16000;
const FRAME = 640; // 40 ms at 16 kHz
const TAPS = 31;

class Capture16k extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / TARGET_RATE;
    this.passthrough = Math.abs(this.step - 1) < 1e-6;
    this.taps = this.passthrough ? null : designLowPass(7000 / sampleRate, TAPS);
    this.history = new Float32Array(TAPS);
    this.hpos = 0;
    this.prev = 0; // previous filtered sample, for interpolation
    this.pos = 0; // fractional read position relative to the current input sample
    this.frame = new Int16Array(FRAME);
    this.fill = 0;
    this.level = 0;
    this.blocks = 0;
  }

  filter(x) {
    const h = this.history;
    h[this.hpos] = x;
    this.hpos = (this.hpos + 1) % TAPS;
    let acc = 0;
    let idx = this.hpos;
    for (let i = 0; i < TAPS; i++) {
      acc += this.taps[i] * h[idx];
      idx = idx + 1 === TAPS ? 0 : idx + 1;
    }
    return acc;
  }

  push(sample) {
    const s = sample < -1 ? -1 : sample > 1 ? 1 : sample;
    this.frame[this.fill++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    if (this.fill === FRAME) {
      this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
      this.frame = new Int16Array(FRAME);
      this.fill = 0;
    }
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;

    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);
    // Fast attack, slow release, like a VU meter
    this.level = rms > this.level ? rms : this.level * 0.92 + rms * 0.08;
    if (++this.blocks % 4 === 0) this.port.postMessage({ level: this.level });

    if (this.passthrough) {
      for (let i = 0; i < input.length; i++) this.push(input[i]);
      return true;
    }
    for (let i = 0; i < input.length; i++) {
      const cur = this.filter(input[i]);
      // Emit every output sample whose position falls between prev and cur
      while (this.pos <= 1) {
        this.push(this.prev + (cur - this.prev) * this.pos);
        this.pos += this.step;
      }
      this.pos -= 1;
      this.prev = cur;
    }
    return true;
  }
}

function designLowPass(cutoff, taps) {
  const out = new Float32Array(taps);
  const mid = (taps - 1) / 2;
  let sum = 0;
  for (let i = 0; i < taps; i++) {
    const n = i - mid;
    const sinc = n === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * n) / (Math.PI * n);
    const blackman = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (taps - 1));
    out[i] = sinc * blackman;
    sum += out[i];
  }
  for (let i = 0; i < taps; i++) out[i] /= sum;
  return out;
}

registerProcessor('capture-16k', Capture16k);
