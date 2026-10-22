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

const PAD = 8;
const GAP = 14;
const CARD_W = 320;

/** The visible element for a step (several may exist, e.g. phone and desktop layouts). */
function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) return el;
  }
  return null;
}

export function Tour({ onClose }: { onClose: () => void }) {
  const [steps] = useState(() => STEPS.filter((s) => findTarget(s.target)));
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const step = steps[index];
  const last = index === steps.length - 1;

  const measure = useCallback(() => {
    setView({ w: window.innerWidth, h: window.innerHeight });
    const el = step && findTarget(step.target);
    setRect(el ? el.getBoundingClientRect() : null);
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

  if (!step || !rect) return null;

  // Spotlight: the target with a little air, rounded like the control itself
  const hole = { x: rect.left - PAD, y: rect.top - PAD, w: rect.width + PAD * 2, h: rect.height + PAD * 2 };
  const radius = Math.min(hole.h / 2, 26);
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
      <div className="tour-spotlight" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: radius }} />
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
