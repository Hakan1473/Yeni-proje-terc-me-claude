import { AudioLines, LoaderCircle, Mic, MicOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useStore } from '../lib/store';
import { engine } from '../live/engine';

/**
 * The interpreter's main control: a glass sphere filled with slowly drifting
 * pastel light. Voice makes the light swell and drops rings into it like rain
 * on water. Everything is drawn inside the circle; nothing spills outside.
 */

// Soft blue, lavender, rose, mint, peach
const PALETTE: [number, number, number][] = [
  [92, 160, 255],
  [150, 130, 255],
  [255, 128, 180],
  [84, 214, 186],
  [255, 182, 112],
];

interface Blob {
  rgb: [number, number, number];
  phase: number;
  wx: number;
  wy: number;
  orbit: number;
}

interface Ripple {
  x: number;
  y: number;
  born: number;
  strength: number;
}

const BLOBS: Blob[] = PALETTE.map((rgb, i) => ({
  rgb,
  phase: (i / PALETTE.length) * Math.PI * 2,
  wx: 0.55 + i * 0.13,
  wy: 0.71 - i * 0.07,
  orbit: 0.38 + (i % 2) * 0.12,
}));

const RIPPLE_LIFE = 1.7;

function easeOut(t: number) {
  return 1 - (1 - t) ** 3;
}

function useOrbCanvas(canvas: React.RefObject<HTMLCanvasElement | null>, SIZE: number) {
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
    const ripples: Ripple[] = [];
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let energy = 0;
    let slow = 0;
    let acc = 0;
    let lastDrop = 0;
    let dark = document.documentElement.classList.contains('dark');
    let themeCheck = 0;

    const drop = (now: number, strength: number) => {
      // Drops land near the middle more often than at the rim
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * R * 0.5;
      ripples.push({ x: R + Math.cos(a) * d, y: R + Math.sin(a) * d, born: now, strength });
      if (ripples.length > 9) ripples.shift();
      lastDrop = now;
    };

    const frame = (nowMs: number) => {
      const now = nowMs / 1000;
      const dt = Math.min(0.05, (nowMs - last) / 1000);
      last = nowMs;
      if (nowMs - themeCheck > 1000) {
        dark = document.documentElement.classList.contains('dark');
        themeCheck = nowMs;
      }

      const s = engine.store.get();
      const active = s.session !== 'idle';
      const busy = s.session === 'connecting' || s.session === 'reconnecting';
      const speaking = s.session === 'speaking';
      const raw = !active || busy ? 0 : speaking ? engine.outLevel.get() : s.muted ? 0 : engine.micLevel.get();
      // Fast attack, slow release: the light swells with a syllable and settles gently
      energy += (raw - energy) * (raw > energy ? 0.45 : 0.07);
      slow += (energy - slow) * 0.02;

      const speed = reduced.matches ? 0.08 : busy ? 1.4 : active ? 0.35 + energy * 1.8 : 0.22;
      clock += dt * speed;

      if (!reduced.matches && active && !busy) {
        acc += energy * dt * 4.2;
        const onset = energy - slow > 0.16 && now - lastDrop > 0.14;
        if (onset || (acc > 1 && energy > 0.06)) {
          drop(now, Math.min(1, 0.35 + energy * 1.2));
          acc = 0;
        }
      }

      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R, 0, Math.PI * 2);
      ctx.clip();
      if (s.muted && !speaking) ctx.filter = 'grayscale(1)';

      // Base: a pale pearl in light mode, deep ink in dark mode
      const base = ctx.createRadialGradient(R, R * 0.8, 0, R, R, R);
      base.addColorStop(0, dark ? '#2a2c48' : '#f6f8ff');
      base.addColorStop(1, dark ? '#14152a' : '#e4e9fb');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, SIZE, SIZE);

      // Drifting light
      ctx.globalCompositeOperation = dark ? 'screen' : 'source-over';
      const swell = 1 + energy * 0.55;
      const alpha = active ? 0.8 : 0.78;
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

      // Rings spreading from each drop, the second one trailing like on water
      ctx.globalCompositeOperation = 'source-over';
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        const age = (now - rp.born) / RIPPLE_LIFE;
        if (age >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const fade = (1 - age) ** 1.6 * rp.strength;
        if (age < 0.25) {
          const splash = ctx.createRadialGradient(rp.x, rp.y, 0, rp.x, rp.y, R * 0.28);
          splash.addColorStop(0, `rgb(255 255 255 / ${0.45 * (1 - age / 0.25) * rp.strength})`);
          splash.addColorStop(1, 'rgb(255 255 255 / 0)');
          ctx.fillStyle = splash;
          ctx.fillRect(0, 0, SIZE, SIZE);
        }
        for (const [lag, weight] of [
          [0, 1],
          [0.16, 0.55],
        ] as const) {
          const t = age - lag;
          if (t <= 0) continue;
          const radius = 1.5 + easeOut(t / (1 - lag)) * R * 1.25;
          ctx.beginPath();
          ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
          ctx.lineWidth = 0.6 + (1 - t) * 2.2 * rp.strength;
          ctx.strokeStyle = `rgb(255 255 255 / ${fade * weight * 0.6})`;
          ctx.stroke();
        }
      }
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
  }, [canvas, SIZE]);
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
