import {
  Activity,
  BadgeCheck,
  Check,
  Cigarette,
  ChevronRight,
  ClipboardList,
  Copy,
  HandHeart,
  HeartPulse,
  Info,
  type LucideIcon,
  Pill,
  Scissors,
  Stethoscope,
  Trash2,
  TriangleAlert,
  Undo2,
  Users,
} from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_TITLES, factText, formatAnamnesisReport, groupFacts } from '../../shared/medical/anamnesis';
import { type TermQuery, termOf } from '../../shared/medical/terms';
import type { Fact, FactCategory } from '../../shared/types';
import { useStore } from '../lib/store';
import { prefetchTerms } from '../lib/terms';
import { engine } from '../live/engine';
import { TermSheet } from './TermSheet';
import { copyText } from './ui';

const STYLE: Record<FactCategory, { icon: LucideIcon; glyph: string; wide?: boolean }> = {
  complaint: { icon: Activity, glyph: 'bg-sys-pink', wide: true },
  allergy: { icon: TriangleAlert, glyph: 'bg-sys-red' },
  medication: { icon: Pill, glyph: 'bg-sys-green' },
  chronic: { icon: HeartPulse, glyph: 'bg-sys-purple' },
  surgery: { icon: Scissors, glyph: 'bg-sys-teal' },
  habit: { icon: Cigarette, glyph: 'bg-sys-gray' },
  family: { icon: Users, glyph: 'bg-sys-indigo' },
  need: { icon: HandHeart, glyph: 'bg-sys-orange', wide: true },
  instruction: { icon: Stethoscope, glyph: 'bg-accent', wide: true },
};

function useNow(interval = 5000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

function SyncStatus() {
  const status = useStore(engine.store, (s) => s.aiStatus);
  const at = useStore(engine.store, (s) => s.aiSyncedAt);
  const now = useNow();
  if (status === 'syncing') return <span className="shimmer-text">Yapay zekâ doğruluyor…</span>;
  if (status === 'error') return <span>Anlık çıkarım · doğrulama sonraki konuşmada</span>;
  if (at) {
    const sec = Math.max(1, Math.round((now - at) / 1000));
    return (
      <span className="inline-flex items-center gap-1">
        <BadgeCheck className="w-3.5 h-3.5 text-accent" strokeWidth={2.25} />
        Yapay zekâ doğruladı · {sec < 60 ? `${sec} sn` : `${Math.round(sec / 60)} dk`} önce
      </span>
    );
  }
  return <span>Konuşma sırasında otomatik çıkarılır</span>;
}

// Swipe distances (px): the delete action's width, and the travel that deletes on release
const ACTION_W = 84;
const COMMIT_RATIO = 0.55;

/**
 * Swipe left to reveal "Sil", or swipe all the way to delete (as in iOS Mail).
 * Vertical drags scroll as usual; a hover button does the same with a mouse.
 */
function FactRow({
  fact,
  critical,
  first,
  revealed,
  onReveal,
  onExplain,
  onDelete,
}: {
  fact: Fact;
  critical: boolean;
  first: boolean;
  revealed: boolean;
  onReveal: (on: boolean) => void;
  onExplain?: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const face = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; base: number; dx: number; swiping: boolean } | null>(null);
  const swiped = useRef(false);
  const tappable = !!onExplain || !!fact.evidence;

  const place = (dx: number, animate: boolean) => {
    const el = face.current;
    const row = el?.parentElement;
    if (!el || !row) return;
    // The red action grows from the right edge as the row slides away
    row.dataset.animate = animate ? '1' : '';
    row.style.setProperty('--reveal', `${Math.max(0, -dx)}px`);
    el.style.transform = dx ? `translate3d(${dx}px,0,0)` : '';
  };

  useEffect(() => {
    if (!drag.current) place(revealed ? -ACTION_W : 0, true);
  }, [revealed]);

  const remove = () => {
    const w = face.current?.offsetWidth ?? 400;
    place(-w, true);
    setLeaving(true);
    window.setTimeout(onDelete, 260);
  };

  const down = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, base: revealed ? -ACTION_W : 0, dx: 0, swiping: false };
    swiped.current = false;
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.swiping) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      if (Math.abs(dx) < 8) return;
      d.swiping = true;
      swiped.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    const w = face.current?.offsetWidth ?? 400;
    // Rubber band past the resting points
    let x = d.base + dx;
    if (x > 0) x = x / 4;
    if (x < -w) x = -w;
    d.dx = x;
    place(x, false);
  };
  const up = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId || !d.swiping) return;
    const w = face.current?.offsetWidth ?? 400;
    if (d.dx < -w * COMMIT_RATIO) remove();
    else {
      const on = d.dx < -ACTION_W / 2;
      place(on ? -ACTION_W : 0, true);
      onReveal(on);
    }
  };

  const tap = () => {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    if (revealed) {
      onReveal(false);
      return;
    }
    if (onExplain) onExplain();
    else if (fact.evidence) setOpen((o) => !o);
  };

  return (
    <li
      className={`swipe-row group ${first ? '' : 'hairline-t-inset'} ${leaving ? 'is-leaving' : ''}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <button type="button" className="swipe-action" onClick={remove} tabIndex={revealed ? 0 : -1} aria-hidden={!revealed}>
        <Trash2 className="w-[18px] h-[18px]" strokeWidth={2.25} />
        <span>Sil</span>
      </button>
      <div ref={face} className="swipe-face">
        <div className="flex items-center">
          <button
            type="button"
            onClick={tap}
            aria-expanded={!onExplain && fact.evidence ? open : undefined}
            aria-haspopup={onExplain ? 'dialog' : undefined}
            className={`row-press flex-1 min-w-0 text-left pl-4 pr-3 py-[11px] flex items-center gap-2 ${tappable ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <span
              className={`flex-1 text-[15px] leading-snug tracking-[-0.012em] ${
                fact.negated ? 'text-label-2' : critical ? 'text-sys-red font-semibold' : 'text-label'
              }`}
            >
              {factText(fact)}
            </span>
            {fact.verify ? (
              <span className="shrink-0 h-[20px] px-1.5 rounded-full bg-sys-orange/15 text-sys-orange text-[11px] font-semibold inline-flex items-center gap-1">
                <TriangleAlert className="w-3 h-3" strokeWidth={2.5} />
                Teyit
              </span>
            ) : (
              fact.origin === 'ai' && <BadgeCheck className="w-[17px] h-[17px] text-accent shrink-0" strokeWidth={2} aria-label="Yapay zekâ doğruladı" />
            )}
            {onExplain && <ChevronRight className="w-4 h-4 text-label-3 shrink-0 -mr-0.5" strokeWidth={2.5} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={remove}
            aria-label={`${factText(fact)} maddesini sil`}
            title="Sil"
            className="swipe-hover-delete pressable w-8 h-8 mr-2 rounded-full text-label-3 hover:text-sys-red hover:bg-sys-red/10 items-center justify-center shrink-0 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        {open && fact.evidence && (
          <p dir="auto" className="-mt-1 pl-4 pr-4 pb-2.5 text-[13px] italic text-label-2 leading-snug anim-fade">
            “{fact.evidence}”
          </p>
        )}
      </div>
    </li>
  );
}

/** One note for the whole drug list, plus the names that differed between speech and translation. */
function VerifyDrugs({ facts }: { facts: Fact[] }) {
  const flagged = facts.filter((f) => f.verify);
  return (
    <div className="mx-3 mb-3 mt-1 rounded-[12px] bg-sys-orange/10 px-3 py-2.5 flex items-start gap-2">
      <TriangleAlert className="w-4 h-4 text-sys-orange shrink-0 mt-px" strokeWidth={2.25} />
      <div className="min-w-0 text-[13px] leading-snug">
        <p>
          <span className="font-semibold">İlaçları hastayla teyit edin.</span> <span className="text-label-2">Ad ve dozları uygulamadan önce doğrulayın.</span>
        </p>
        {flagged.map((f) => (
          <p key={f.key} className="mt-1 text-sys-orange">
            {f.verify}
          </p>
        ))}
      </div>
    </div>
  );
}

/** "Silindi · Geri al" bar after a swipe delete. */
function UndoBar({ fact, onUndo, onDone }: { fact: Fact; onUndo: () => void; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 6000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div role="status" className="sticky bottom-3 z-10 flex justify-center pointer-events-none anim-toast">
      <div className="pointer-events-auto flex items-center gap-3 max-w-full pl-4 pr-1.5 py-1.5 rounded-full material shadow-float">
        <p className="min-w-0 truncate text-[13px] font-medium">
          <span className="text-label-2">Silindi:</span> {factText(fact)}
        </p>
        <button type="button" onClick={onUndo} className="pressable h-8 px-3 rounded-full btn-tinted text-[13px] font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer">
          <Undo2 className="w-3.5 h-3.5" strokeWidth={2.5} />
          Geri al
        </button>
      </div>
    </div>
  );
}

export function AnamnesisPanel() {
  const facts = useStore(engine.store, (s) => s.facts);
  const language = useStore(engine.store, (s) => s.language);
  const [copied, setCopied] = useState(false);
  const [explain, setExplain] = useState<{ fact: Fact; query: TermQuery } | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Fact | null>(null);
  const closeExplain = useCallback(() => setExplain(null), []);
  const clearRemoved = useCallback(() => setRemoved(null), []);
  const undo = () => {
    if (removed) engine.restoreFact(removed);
    setRemoved(null);
  };
  const groups = groupFacts(facts);
  const total = facts.length;

  // Positive medical terms get a card; warm the cache so a tap opens instantly
  const terms = useMemo(
    () =>
      new Map<string, TermQuery | null>(
        facts
          .filter((f) => !f.negated)
          .map((f) => {
            const q = termOf(f);
            const res: TermQuery | null = q ? { ...q, category: f.category } : null;
            return [f.key, res];
          }),
      ),
    [facts],
  );
  const economy = useStore(engine.store, (s) => s.economy);
  useEffect(() => {
    // Economy mode: every card loads on tap only
    if (economy) return;
    // Allergy and drug cards are opened most; the rest load on tap, which keeps the AI quota for the anamnesis
    prefetchTerms(Array.from(terms.values()).filter((q): q is TermQuery => q !== null && (q.category === 'allergy' || q.category === 'medication')));
  }, [terms, economy]);

  const copy = async () => {
    if (await copyText(formatAnamnesisReport(facts, language.nameTr))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="@container h-full overflow-y-auto overscroll-contain px-3 sm:px-5 pt-3 pb-4">
      {total === 0 ? (
        <div className="h-full min-h-[320px] flex flex-col items-center justify-center px-8 py-10 text-center anim-fade">
          <div className="empty-icon w-[72px] h-[72px] rounded-[22px] flex items-center justify-center mb-5 text-white">
            <ClipboardList className="w-8 h-8" strokeWidth={1.9} />
          </div>
          <p className="text-[22px] font-semibold tracking-[-0.026em]">Anamnez Bekleniyor</p>
          <p className="mt-2 text-[15px] text-label-2 max-w-[330px] leading-relaxed balance">
            Şikâyetler, ilaçlar, alerjiler ve kronik hastalıklar konuşmada geçtikçe burada belirir. Tıbbi terimlere dokunarak kısa bilgi kartını açabilirsiniz.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 px-1 pb-3">
            <p className="min-w-0 text-[13px] text-label-2 truncate">
              <SyncStatus />
            </p>
            <button
              type="button"
              onClick={copy}
              className={`pressable h-8 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[13px] font-semibold cursor-pointer shrink-0 ${
                copied ? 'bg-sys-green/15 text-sys-green' : 'btn-tinted'
              }`}
              title="Anamnezi panoya kopyala"
            >
              {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2.75} /> : <Copy className="w-3.5 h-3.5" strokeWidth={2.25} />}
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>

          <div className="grid grid-cols-1 @lg:grid-cols-2 gap-3 pb-2 items-start">
            {groups.map(({ category, facts: list }) => {
              const style = STYLE[category];
              const Icon = style.icon;
              const critical = category === 'allergy' && list.some((f) => !f.negated);
              const count = list.filter((f) => !f.negated).length;
              return (
                <section
                  key={category}
                  className={`anim-rise rounded-[20px] overflow-hidden ${style.wide ? '@lg:col-span-2' : ''} ${
                    critical ? 'card-critical' : 'bg-surface shadow-card'
                  }`}
                >
                  <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-1">
                    <span className={`glyph w-[26px] h-[26px] rounded-[7.5px] ${style.glyph}`}>
                      <Icon className="w-[15px] h-[15px]" strokeWidth={2.25} />
                    </span>
                    <h4 className={`text-[15px] font-semibold tracking-[-0.016em] ${critical ? 'text-sys-red' : ''}`}>{CATEGORY_TITLES[category]}</h4>
                    {count > 0 && (
                      <span className={`ml-auto min-w-[22px] h-[22px] px-1.5 rounded-full text-[12px] font-semibold tabular inline-flex items-center justify-center ${critical ? 'bg-sys-red text-white' : 'bg-fill text-label-2'}`}>
                        {count}
                      </span>
                    )}
                  </header>
                  <ul className="pb-1">
                    {list.map((f, i) => {
                      const query = terms.get(f.key);
                      return (
                        <FactRow
                          key={f.key}
                          fact={f}
                          critical={critical && !f.negated}
                          first={i === 0}
                          revealed={revealed === f.key}
                          onReveal={(on) => setRevealed(on ? f.key : null)}
                          onExplain={query ? () => setExplain({ fact: f, query }) : undefined}
                          onDelete={() => {
                            engine.dismissFact(f);
                            setRevealed(null);
                            setRemoved(f);
                          }}
                        />
                      );
                    })}
                  </ul>
                  {category === 'medication' && count > 0 && <VerifyDrugs facts={list} />}
                </section>
              );
            })}
          </div>
          <div className="mt-2 mb-4 flex items-start gap-2.5 rounded-[14px] bg-fill-2 px-3.5 py-3">
            <Info className="w-4 h-4 text-label-2 shrink-0 mt-[1px]" strokeWidth={2.25} />
            <p className="text-[12.5px] text-label-2 leading-snug">
              <span className="font-semibold text-label">Yapay zekâ hata yapabilir.</span> Alerji, ilaç ve doz bilgilerini uygulamadan önce
              hastayla doğrulayın. Yanlış bir maddeyi sola kaydırarak silebilirsiniz; yapay zekâ onu bir daha eklemez. Tıbbi terime dokunarak kısa bilgi kartını açabilirsiniz.
            </p>
          </div>
        </>
      )}

      {removed && <UndoBar key={removed.key} fact={removed} onUndo={undo} onDone={clearRemoved} />}

      {explain && (
        <TermSheet
          query={explain.query}
          fact={explain.fact}
          glyph={STYLE[explain.fact.category].glyph}
          icon={STYLE[explain.fact.category].icon}
          onClose={closeExplain}
        />
      )}
    </div>
  );
}
