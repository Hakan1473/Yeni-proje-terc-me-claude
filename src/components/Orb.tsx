import { AudioLines, LoaderCircle, Mic, MicOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useStore } from '../lib/store';
import { engine } from '../live/engine';

/**
 * The interpreter's main control: a glass sphere filled with slowly drifting
 * pastel light that swells and quickens with the voice. Everything is drawn
 * inside the circle; nothing spills outside.
 */

// Muted pastels: powder blue, lilac, blush, sage mint, apricot
const PALETTE: [number, number, number][] = [
  [128, 172, 240],
  [164, 150, 232],
  [236, 156, 192],
  [124, 202, 184],
  [238, 190, 146],
];

interface Blob {
  rgb: [number, number, number];
  phase: number;
  wx: number;
  wy: number;
  orbit: number;
}

const BLOBS: Blob[] = PALETTE.map((rgb, i) => ({
  rgb,
  phase: (i / PALETTE.length) * Math.PI * 2,
  wx: 0.55 + i * 0.13,
  wy: 0.71 - i * 0.07,
  orbit: 0.38 + (i % 2) * 0.12,
}));

/** `drive`, when given, replaces the interpreter's audio level (used by the launch screen). */
export function useOrbCanvas(canvas: React.RefObject<HTMLCanvasElement | null>, SIZE: number, drive?: { current: number }) {
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    el.width = SIZE * dpr;
    el.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const R = SIZE / 2;
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let energy = 0;
    let dark = document.documentElement.classList.contains('dark');
    let themeCheck = 0;

    const frame = (nowMs: number) => {
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      if (nowMs - themeCheck > 1000) {
        dark = document.documentElement.classList.contains('dark');
        themeCheck = nowMs;
      }

      const s = engine.store.get();
      const active = drive ? true : s.session !== 'idle';
      const busy = !drive && (s.session === 'connecting' || s.session === 'reconnecting');
      const speaking = !drive && s.session === 'speaking';
      const muted = !drive && s.muted;
      const raw = drive ? drive.current : !active || busy ? 0 : speaking ? engine.outLevel.get() : muted ? 0 : engine.micLevel.get();
      // Fast attack, slow release: the light swells with a syllable and settles gently
      energy += (raw - energy) * (raw > energy ? 0.45 : 0.07);

      const speed = reduced.matches ? 0.08 : busy ? 1.4 : active ? 0.35 + energy * 1.8 : 0.22;
      clock += dt * speed;

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R, 0, Math.PI * 2);
      ctx.clip();
      if (muted && !speaking) ctx.filter = 'grayscale(1)';

      // Base: a pale pearl in light mode, deep ink in dark mode
      const base = ctx.createRadialGradient(R, R * 0.8, 0, R, R, R);
      base.addColorStop(0, dark ? '#2a2c48' : '#f6f8ff');
      base.addColorStop(1, dark ? '#14152a' : '#e4e9fb');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Drifting light
      ctx.globalCompositeOperation = dark ? 'screen' : 'source-over';
      const swell = 1 + energy * 0.55;
      const alpha = active ? 0.74 : 0.72;
      for (const b of BLOBS) {
        const x = R + Math.sin(clock * b.wx * 2.4 + b.phase) * R * b.orbit;
        const y = R + Math.cos(clock * b.wy * 2.4 + b.phase * 1.3) * R * b.orbit;
        const r = R * (0.62 + 0.08 * Math.sin(clock * 3 + b.phase)) * swell;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const [cr, cg, cb] = b.rgb;
        g.addColorStop(0, `rgb(${cr} ${cg} ${cb} / ${alpha})`);
        g.addColorStop(0.55, `rgb(${cr} ${cg} ${cb} / ${alpha * 0.4})`);
        g.addColorStop(1, `rgb(${cr} ${cg} ${cb} / 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, SIZE, SIZE);
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';

      // Glass: a soft top highlight and a gently darkened rim give the sphere depth
      const shine = ctx.createRadialGradient(R * 0.72, R * 0.38, 0, R * 0.72, R * 0.38, R * 0.9);
      shine.addColorStop(0, 'rgb(255 255 255 / 0.42)');
      shine.addColorStop(1, 'rgb(255 255 255 / 0)');
      ctx.fillStyle = shine;
      ctx.fillRect(0, 0, SIZE, SIZE);
      const rim = ctx.createRadialGradient(R, R, R * 0.72, R, R, R);
      rim.addColorStop(0, 'rgb(0 0 0 / 0)');
      rim.addColorStop(1, dark ? 'rgb(0 0 0 / 0.35)' : 'rgb(40 50 110 / 0.14)');
      ctx.fillStyle = rim;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(R, R, R - 0.5, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = dark ? 'rgb(255 255 255 / 0.14)' : 'rgb(255 255 255 / 0.7)';
      ctx.stroke();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [canvas, SIZE, drive]);
}

/** Non-interactive sphere, for illustrations such as onboarding. */
export function OrbArt({ size = 64 }: { size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useOrbCanvas(canvas, size);
  return (
    <span className="orb relative block rounded-full mx-auto" style={{ width: size, height: size }}>
      <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 w-full h-full rounded-full" />
      <span className="orb-glyph absolute inset-0 flex items-center justify-center">
        <Mic className="w-[38%] h-[38%]" strokeWidth={2.2} />
      </span>
    </span>
  );
}

export function Orb({ size = 80 }: { size?: number }) {
  const session = useStore(engine.store, (s) => s.session);
  const muted = useStore(engine.store, (s) => s.muted);
  const canvas = useRef<HTMLCanvasElement>(null);
  useOrbCanvas(canvas, size);

  const active = session !== 'idle';
  const busy = session === 'connecting' || session === 'reconnecting';
  const speaking = session === 'speaking';
  const label = !active ? 'Tercümanı başlat' : speaking ? 'Seslendirmeyi geç' : 'Tercümanı durdur';
  const onClick = () => (speaking ? engine.skipSpeech() : void engine.toggle());
  const icon = { width: size * 0.36, height: size * 0.36 };
  const stop = size * 0.27;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="orb relative shrink-0 rounded-full cursor-pointer transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.94]"
      style={{ width: size, height: size }}
    >
      <canvas ref={canvas} aria-hidden="true" className="absolute inset-0 w-full h-full rounded-full" />
      <span className="orb-glyph absolute inset-0 flex items-center justify-center pointer-events-none">
        {busy ? (
          <LoaderCircle key="busy" style={icon} className="animate-spin" strokeWidth={2.4} />
        ) : speaking ? (
          <AudioLines key="speak" style={icon} className="anim-glyph" strokeWidth={2.4} />
        ) : active ? (
          <span key="stop" style={{ width: stop, height: stop, borderRadius: stop * 0.3 }} className="block bg-current anim-glyph" />
        ) : muted ? (
          <MicOff key="muted" style={icon} className="anim-glyph" strokeWidth={2.2} />
        ) : (
          <Mic key="mic" style={icon} className="anim-glyph" strokeWidth={2.2} />
        )}
      </span>
    </button>
  );
}
