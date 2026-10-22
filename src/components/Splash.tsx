import { useEffect, useRef, useState } from 'react';
import { LANGUAGES } from '../../shared/languages';
import { useOrbCanvas } from './Orb';

/**
 * Launch sequence (≈3.8 s, any tap skips to the exit):
 *   1. The voice sphere condenses out of a soft blur in the ambient light.
 *   2. Two voice streams flow in from either side — staff and patient — and
 *      "hello" passes through languages, each word swelling the sphere.
 *   3. The title assembles letter by letter.
 *   4. The sphere flies down into its place in the dock while the rest of the
 *      screen dissolves, so the launch hands over to the app in one motion.
 */

const GREETINGS = ['Hello', 'مرحبا', 'Привет', 'Bonjour', 'Hallo', 'Hola', '你好', 'Ciao', 'سلام', 'Γειά σας', 'नमस्ते', '안녕하세요', 'Olá', 'Merhaba'];
const ORB = 136;
const WORD_MS = 165;
const T_ORB = 0;
const T_WORDS = 520;
const T_TITLE = T_WORDS + GREETINGS.length * WORD_MS + 380;
const T_EXIT = T_TITLE + 1050;
const EXIT_MS = 900;

const SPRING = 'cubic-bezier(0.22, 1.25, 0.36, 1)';
const SMOOTH = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** Speech flowing into the sphere from both sides, drawn on one canvas. */
function useVoiceStreams(canvas: React.RefObject<HTMLCanvasElement | null>, level: { current: number }, fade: { current: number }) {
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const strands = [
      { side: -1, from: [92, 160, 255], to: [164, 150, 232], phase: 0, speed: 1, freq: 0.021, alpha: 1, width: 2.6 },
      { side: -1, from: [128, 172, 240], to: [190, 170, 255], phase: 2.1, speed: 1.35, freq: 0.033, alpha: 0.7, width: 1.6 },
      { side: -1, from: [150, 190, 255], to: [210, 190, 255], phase: 4.2, speed: 0.8, freq: 0.014, alpha: 0.45, width: 1.2 },
      { side: 1, from: [124, 202, 184], to: [236, 156, 192], phase: 1, speed: 1.1, freq: 0.023, alpha: 1, width: 2.6 },
      { side: 1, from: [140, 220, 200], to: [238, 190, 146], phase: 3.3, speed: 1.4, freq: 0.031, alpha: 0.7, width: 1.6 },
      { side: 1, from: [160, 225, 210], to: [245, 200, 215], phase: 5.1, speed: 0.75, freq: 0.016, alpha: 0.45, width: 1.2 },
    ];
    // Bright motes riding the streams into the sphere
    const motes = Array.from({ length: 14 }, (_, i) => ({ side: i % 2 ? 1 : -1, u: Math.random(), speed: 0.18 + Math.random() * 0.22, size: 1 + Math.random() * 1.6 }));

    let raf = 0;
    let last = performance.now();
    let t = 0;
    let energy = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      energy += (level.current - energy) * (level.current > energy ? 0.35 : 0.06);
      t += dt * (1 + energy * 2.2);
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const gap = ORB / 2 + 6;
      const dark = document.documentElement.classList.contains('dark');
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      ctx.globalAlpha = fade.current;

      for (const s of strands) {
        const x0 = s.side < 0 ? 0 : cx + gap;
        const x1 = s.side < 0 ? cx - gap : w;
        const span = x1 - x0;
        const grad = ctx.createLinearGradient(x0, 0, x1, 0);
        const [a, b] = s.side < 0 ? [s.from, s.to] : [s.to, s.from];
        grad.addColorStop(0, `rgb(${a[0]} ${a[1]} ${a[2]} / 0)`);
        grad.addColorStop(0.2, `rgb(${a[0]} ${a[1]} ${a[2]} / ${s.alpha})`);
        grad.addColorStop(0.85, `rgb(${b[0]} ${b[1]} ${b[2]} / ${s.alpha})`);
        grad.addColorStop(1, `rgb(${b[0]} ${b[1]} ${b[2]} / 0)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 3) {
          const u = (x - x0) / span;
          // Calm at the screen edge and at the sphere, alive in between
          const env = Math.sin(Math.PI * u) ** 1.4;
          const amp = (7 + energy * 46) * env;
          const travel = s.side < 0 ? -1 : 1;
          const y = cy + amp * Math.sin(x * s.freq + travel * t * 3.2 * s.speed + s.phase) * Math.cos(x * s.freq * 0.37 - t * 0.9 + s.phase);
          if (x === x0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      for (const m of motes) {
        m.u += dt * m.speed * (1 + energy * 1.5);
        if (m.u > 1) m.u -= 1;
        const x = m.side < 0 ? m.u * (cx - gap) : w - m.u * (w - cx - gap);
        const u = m.side < 0 ? x / (cx - gap) : (w - x) / (w - cx - gap);
        const env = Math.sin(Math.PI * Math.min(1, u)) ** 1.4;
        const y = cy + (7 + energy * 46) * env * Math.sin(x * 0.021 + t * 3.2 * m.side * -1);
        const a = Math.sin(Math.PI * m.u) * 0.9;
        const g = ctx.createRadialGradient(x, y, 0, x, y, m.size * 5);
        g.addColorStop(0, `rgb(255 255 255 / ${a})`);
        g.addColorStop(1, 'rgb(255 255 255 / 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - m.size * 5, y - m.size * 5, m.size * 10, m.size * 10);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [canvas, level, fade]);
}

const TITLE = 'Canlı Sesli Tercüman';

export function Splash({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const orbWrap = useRef<HTMLDivElement>(null);
  const orbCanvas = useRef<HTMLCanvasElement>(null);
  const streams = useRef<HTMLCanvasElement>(null);
  const level = useRef(0);
  const fade = useRef(0);
  const [word, setWord] = useState(-1);
  const [title, setTitle] = useState(false);
  const exiting = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  useOrbCanvas(orbCanvas, ORB, level);
  useVoiceStreams(streams, level, fade);

  const exit = () => {
    if (exiting.current) return;
    exiting.current = true;
    const el = root.current;
    const orb = orbWrap.current;
    if (!el || !orb) {
      done.current();
      return;
    }
    el.style.pointerEvents = 'none';
    level.current = 0.15;
    const scene = el.querySelectorAll<HTMLElement>('[data-scene]');
    // Words and light go first; the backdrop opens onto the app a beat later
    for (const s of scene) {
      if (s.classList.contains('splash-bg')) {
        s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: EXIT_MS * 0.7, delay: EXIT_MS * 0.25, easing: SMOOTH, fill: 'forwards' });
      } else {
        s.animate(
          [
            { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' },
            { opacity: 0, filter: 'blur(12px)', transform: 'scale(1.04)' },
          ],
          { duration: EXIT_MS * 0.42, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
        );
      }
    }
    fade.current = 0;

    // Shared-element hand-over: the sphere lands exactly on the dock's sphere
    const target = document.querySelector<HTMLElement>('footer .dock button.orb');
    const from = orb.getBoundingClientRect();
    let anim: Animation;
    if (target) {
      const to = target.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const k = to.width / from.width;
      anim = orb.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.42}px) scale(${(1 + k) / 2 + 0.06})`, opacity: 1, offset: 0.55 },
          { transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 1, offset: 0.92 },
          { transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 0 },
        ],
        { duration: EXIT_MS, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill: 'forwards' },
      );
    } else {
      anim = orb.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: EXIT_MS, easing: SMOOTH, fill: 'forwards' });
    }
    anim.onfinish = () => done.current();
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the timeline runs once
  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    let cancelled = false;
    let begun = false;
    // A home-screen app keeps its launch image up until the page has loaded; a timeline
    // started earlier would play unseen. Start once the page is loaded and painted.
    const begin = () => {
      if (begun || cancelled) return;
      begun = true;
      requestAnimationFrame(() => requestAnimationFrame(() => !cancelled && run()));
    };
    if (document.readyState === 'complete') begin();
    else {
      window.addEventListener('load', begin, { once: true });
      // Never hold the app back on a slow resource
      at(2500, begin);
    }
    return () => {
      cancelled = true;
      window.removeEventListener('load', begin);
      for (const t of timers) clearTimeout(t);
    };

    function run() {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        // Reduce Motion: the same scene, faded in and held, without movement
        orbWrap.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'both' });
        fade.current = 0.6;
        at(300, () => setTitle(true));
        at(2000, exit);
        return;
      }

      orbWrap.current?.animate(
        [
          { transform: 'scale(0.35)', opacity: 0, filter: 'blur(18px)' },
          { transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' },
        ],
        { duration: 900, delay: T_ORB, easing: SPRING, fill: 'both' },
      );
      // Streams fade in as the sphere settles
      const fadeIn = (start: number) => {
        const step = () => {
          fade.current = Math.min(1, (performance.now() - start) / 700);
          if (fade.current < 1 && !exiting.current) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };
      at(T_WORDS - 250, () => fadeIn(performance.now()));
      GREETINGS.forEach((_, i) => {
        at(T_WORDS + i * WORD_MS, () => {
          setWord(i);
          level.current = 0.55 + (i % 3) * 0.15;
          at(WORD_MS * 0.55, () => (level.current = 0.12));
        });
      });
      at(T_TITLE, () => {
        setTitle(true);
        level.current = 0.35;
        at(400, () => (level.current = 0.08));
      });
      at(T_EXIT, exit);
    }
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is not needed for a few seconds of animation
    <div ref={root} onClick={exit} className="splash" role="presentation">
      <div className="splash-bg" data-scene aria-hidden="true" />
      <div className="splash-light" data-scene aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className="relative flex flex-col items-center -mt-[10vh]">
        <div className="relative flex justify-center">
          <canvas ref={streams} data-scene aria-hidden="true" className="absolute top-1/2 left-1/2 w-screen h-[240px] -translate-x-1/2 -translate-y-1/2" />
          <div ref={orbWrap} className="splash-orb" style={{ width: ORB, height: ORB }}>
            <canvas ref={orbCanvas} className="w-full h-full rounded-full" />
          </div>
        </div>

        <div className="relative mt-10 h-[112px] w-[min(92vw,560px)] flex items-start justify-center" data-scene>
          {!title && word > 0 && (
            <p key={`out-${word - 1}`} dir="auto" aria-hidden="true" className="splash-word is-out">
              {GREETINGS[word - 1]}
            </p>
          )}
          {!title && word >= 0 && (
            <p key={word} dir="auto" className="splash-word">
              {GREETINGS[word]}
            </p>
          )}
          {title && (
            <div className="flex flex-col items-center text-center">
              <h1 className="splash-title" aria-label={TITLE}>
                {Array.from(TITLE).map((ch, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static text
                  <span key={i} aria-hidden="true" style={{ animationDelay: `${i * 22}ms` }}>
                    {ch === ' ' ? ' ' : ch}
                  </span>
                ))}
              </h1>
              <p className="splash-sub">{LANGUAGES.length} dilde gerçek zamanlı tıbbi tercüman</p>
            </div>
          )}
        </div>
      </div>

      <p className="splash-credit" data-scene>
        Hakan Karaarslan tarafından oluşturulmuştur
      </p>
    </div>
  );
}
