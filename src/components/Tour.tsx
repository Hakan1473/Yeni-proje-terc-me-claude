import { ArrowRight, Check } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Live walkthrough on the real screen (coach marks): the screen dims, the
 * control being explained stays lit, and a callout next to it says what it
 * does. Targets are found by their data-tour attribute; a step whose target is
 * not on screen (e.g. a desktop-only control on a phone) is skipped.
 */

interface Step {
  target: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    target: 'orb',
    title: 'Tercümanı başlatın',
    body: 'Küreye dokunun; tercüman dinlemeye başlar. Türkçe konuşmanızı hastanın diline, hastanın sözlerini Türkçeye çevirip seslendirir. Durdurmak için yeniden dokunun.',
  },
  {
    target: 'language',
    title: 'Hastanın dili',
    body: 'Hastanın konuştuğu dili buradan seçin. Sık kullandığınız diller hemen altında tek dokunuşla değiştirilebilir.',
  },
  {
    target: 'mute',
    title: 'Mikrofonu kapatın',
    body: 'Hastaya çevrilmemesi gereken bir şey konuşacaksanız mikrofonu kapatın. Kapalıyken tercüman hiçbir şey duymaz; açmak için yeniden dokunun.',
  },
  {
    target: 'conversation',
    title: 'Canlı konuşma',
    body: 'Her cümle burada yazılı olarak görünür: söylenen ve çevirisi. Hoparlör simgesiyle bir çeviriyi hastaya yeniden dinletebilirsiniz.',
  },
  {
    target: 'anamnesis',
    title: 'Özet ve anamnez',
    body: 'Şikâyetler, ilaçlar, alerjiler ve kronik hastalıklar konuşurken kendiliğinden buraya yazılır. Bir maddeye dokunun, bilgi kartı açılır; yanlış bir maddeyi sola kaydırarak silin.',
  },
  {
    target: 'face',
    title: 'Hastaya göster',
    body: 'Ekranı ikiye böler: üst yarı hastaya döner ve çeviriyi büyük yazıyla gösterir. Masanın karşısındaki hastayla konuşurken kullanın.',
  },
  {
    target: 'type',
    title: 'Yazarak çeviri',
    body: 'Konuşmak yerine yazmak isterseniz buraya dokunun. Yazdığınız cümle hastanın diline çevrilir.',
  },
  {
    target: 'summary',
    title: 'Görüşme özeti',
    body: 'Görüşme bitince tek dokunuşla özet hazırlanır; kopyalayıp kendi notlarınıza ekleyebilirsiniz.',
  },
  {
    target: 'new',
    title: 'Yeni hasta',
    body: 'Sıradaki hastaya geçerken dokunun. Bu görüşme cihazdaki geçmişe kaydedilir ve temiz bir konuşma başlar.',
  },
  {
    target: 'history',
    title: 'Geçmiş görüşmeler',
    body: 'Önceki görüşmeler yalnızca bu cihazda saklanır. Buradan açıp konuşmaya, anamneze ve özete yeniden bakabilirsiniz.',
  },
  {
    target: 'settings',
    title: 'Ayarlar',
    body: 'Tercümanın sesi, konuşma hızı ve görünüm burada. Bu rehberi ve tanıtım videosunu da buradan yeniden açabilirsiniz.',
  },
];

const GAP = 14;
const CARD_W = 320;

interface Shape {
  rect: DOMRect;
  /** Corner radii: top-left, top-right, bottom-right, bottom-left. */
  radii: [number, number, number, number];
}

/**
 * The visible elements for a step. Phone and desktop layouts may each have one;
 * a desktop pane is its header and its body together.
 */
function findTargets(name: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  });
}

function cornerRadii(el: Element, rect: DOMRect): [number, number, number, number] {
  const cs = getComputedStyle(el);
  const max = Math.min(rect.width, rect.height) / 2;
  const px = (v: string) => {
    const n = Number.parseFloat(v) || 0;
    return Math.min(max, v.endsWith('%') ? (n / 100) * Math.min(rect.width, rect.height) : n);
  };
  return [px(cs.borderTopLeftRadius), px(cs.borderTopRightRadius), px(cs.borderBottomRightRadius), px(cs.borderBottomLeftRadius)];
}

/**
 * The exact outline of what is being explained: the control's visible shape
 * (a dock key's circle, not its label) with its own corner radii. A pane inside
 * a card takes the card's rounded corners where it touches them.
 */
function shapeOf(targets: HTMLElement[]): Shape {
  const parts = targets.map((t) => t.querySelector<HTMLElement>('[data-tour-shape]') ?? t);
  const el = parts[0];
  const rects = parts.map((p) => p.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const rect = new DOMRect(left, top, Math.max(...rects.map((r) => r.right)) - left, Math.max(...rects.map((r) => r.bottom)) - top);
  const radii: Shape['radii'] = parts.length === 1 ? cornerRadii(el, rect) : [0, 0, 0, 0];
  const near = (a: number, b: number) => Math.abs(a - b) < 2;
  let parent = el.parentElement;
  for (let depth = 0; parent && depth < 4; depth++, parent = parent.parentElement) {
    const pr = parent.getBoundingClientRect();
    const [tl, tr, br, bl] = cornerRadii(parent, pr);
    if (!radii[0] && near(pr.left, rect.left) && near(pr.top, rect.top)) radii[0] = tl;
    if (!radii[1] && near(pr.right, rect.right) && near(pr.top, rect.top)) radii[1] = tr;
    if (!radii[2] && near(pr.right, rect.right) && near(pr.bottom, rect.bottom)) radii[2] = br;
    if (!radii[3] && near(pr.left, rect.left) && near(pr.bottom, rect.bottom)) radii[3] = bl;
  }
  return { rect, radii };
}

export function Tour({ onClose }: { onClose: () => void }) {
  const [steps] = useState(() => STEPS.filter((s) => findTargets(s.target).length > 0));
  const [index, setIndex] = useState(0);
  const [shape, setShape] = useState<Shape | null>(null);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const step = steps[index];
  const last = index === steps.length - 1;

  const measure = useCallback(() => {
    setView({ w: window.innerWidth, h: window.innerHeight });
    const els = step ? findTargets(step.target) : [];
    setShape(els.length ? shapeOf(els) : null);
  }, [step]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const next = useCallback(() => {
    if (last) onClose();
    else setIndex((i) => i + 1);
  }, [last, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, onClose]);

  useEffect(() => {
    if (steps.length === 0) onClose();
  }, [steps.length, onClose]);

  if (!step || !shape) return null;

  // Spotlight: exactly the control's outline; small controls get a thin margin of light
  // that keeps their shape (a circle stays a circle), large panes none
  const { rect, radii } = shape;
  const pad = Math.min(rect.width, rect.height) > 120 ? 0 : 5;
  const hole = { x: rect.left - pad, y: rect.top - pad, w: rect.width + pad * 2, h: rect.height + pad * 2 };
  const borderRadius = radii.map((r) => `${r ? r + pad : 0}px`).join(' ');
  // Callout below or above the target (whichever has room); beside a tall target such as a pane
  const cardW = Math.min(CARD_W, view.w - 32);
  const roomBelow = view.h - (hole.y + hole.h);
  const roomAbove = hole.y;
  const vertical = Math.max(roomBelow, roomAbove) >= 220;
  const below = vertical && roomBelow >= roomAbove;
  const toLeft = rect.left + rect.width / 2 > view.w / 2;
  let left = Math.min(Math.max(16, rect.left + rect.width / 2 - cardW / 2), view.w - cardW - 16);
  let position: React.CSSProperties;
  if (vertical) position = below ? { top: hole.y + hole.h + GAP } : { bottom: view.h - hole.y + GAP };
  else {
    const besideLeft = hole.x - GAP - cardW;
    const besideRight = hole.x + hole.w + GAP;
    if (toLeft && besideLeft >= 16) left = besideLeft;
    else if (!toLeft && besideRight + cardW <= view.w - 16) left = besideRight;
    position = { top: Math.min(Math.max(16, rect.top + rect.height / 2 - 110), view.h - 260) };
  }
  const caret = Math.min(Math.max(24, rect.left + rect.width / 2 - left), cardW - 24);
  const placement = vertical ? (below ? 'is-below' : 'is-above') : 'is-beside';

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Clicks never reach the app during the tour */}
      <div className="absolute inset-0" />
      <div className="tour-spotlight" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius }} />
      <div key={index} className={`tour-card ${placement}`} style={{ left, width: cardW, ...position }}>
        {vertical && <span className="tour-caret" style={{ left: caret }} aria-hidden="true" />}
        <div className="flex items-start justify-between gap-3">
          <h2 id="tour-title" className="text-[17px] font-semibold tracking-[-0.02em] leading-snug">
            {step.title}
          </h2>
          <button type="button" onClick={onClose} className="shrink-0 -mt-0.5 -mr-1 px-2 py-1 rounded-full text-[13px] font-medium text-label-2 hover:text-label cursor-pointer">
            Geç
          </button>
        </div>
        <p className="mt-1.5 text-[15px] leading-[1.42] text-label-2">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5" aria-label={`Adım ${index + 1} / ${steps.length}`}>
            {steps.map((s, i) => (
              <span key={s.target} className={`tour-dot ${i === index ? 'is-active' : i < index ? 'is-done' : ''}`} />
            ))}
          </div>
          <button
            type="button"
            onClick={next}
            aria-label={last ? 'Rehberi bitir' : 'İlerle'}
            className={`pressable btn-primary h-11 rounded-full inline-flex items-center justify-center gap-1.5 cursor-pointer ${last ? 'px-5 text-[15px] font-semibold' : 'w-11'}`}
          >
            {last ? (
              <>
                <Check className="w-[18px] h-[18px]" strokeWidth={2.75} />
                Başlayalım
              </>
            ) : (
              <ArrowRight className="w-5 h-5" strokeWidth={2.5} />
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
