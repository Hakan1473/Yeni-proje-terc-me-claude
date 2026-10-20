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
  TriangleAlert,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

function FactRow({
  fact,
  critical,
  first,
  onExplain,
}: {
  fact: Fact;
  critical: boolean;
  first: boolean;
  onExplain?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tappable = !!onExplain || !!fact.evidence;
  return (
    <li className={first ? '' : 'hairline-t-inset'}>
      <button
        type="button"
        onClick={() => (onExplain ? onExplain() : fact.evidence && setOpen((o) => !o))}
        aria-expanded={!onExplain && fact.evidence ? open : undefined}
        aria-haspopup={onExplain ? 'dialog' : undefined}
        className={`row-press w-full text-left pl-4 pr-3 py-[11px] flex items-center gap-2 ${tappable ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span
          className={`flex-1 text-[15px] leading-snug tracking-[-0.012em] ${
            fact.negated ? 'text-label-2' : critical ? 'text-sys-red font-semibold' : 'text-label'
          }`}
        >
          {factText(fact)}
        </span>
        {fact.origin === 'ai' && <BadgeCheck className="w-[17px] h-[17px] text-accent shrink-0" strokeWidth={2} aria-label="Yapay zekâ doğruladı" />}
        {onExplain && <ChevronRight className="w-4 h-4 text-label-3 shrink-0 -mr-0.5" strokeWidth={2.5} aria-hidden="true" />}
      </button>
      {open && fact.evidence && (
        <p dir="auto" className="-mt-1 pl-4 pr-4 pb-2.5 text-[13px] italic text-label-2 leading-snug anim-fade">
          “{fact.evidence}”
        </p>
      )}
    </li>
  );
}

export function AnamnesisPanel() {
  const facts = useStore(engine.store, (s) => s.facts);
  const language = useStore(engine.store, (s) => s.language);
  const [copied, setCopied] = useState(false);
  const [explain, setExplain] = useState<{ fact: Fact; query: TermQuery } | null>(null);
  const closeExplain = useCallback(() => setExplain(null), []);
  const groups = groupFacts(facts);
  const total = facts.length;

  // Positive medical terms get a card; warm the cache so a tap opens instantly
  const terms = useMemo(() => new Map(facts.filter((f) => !f.negated).map((f) => [f.key, termOf(f)] as const)), [facts]);
  useEffect(() => {
    prefetchTerms(Array.from(terms.values()).filter((q): q is TermQuery => !!q));
  }, [terms]);

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
              title="HBYS'ye yapıştırmak için kopyala"
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
                          onExplain={query ? () => setExplain({ fact: f, query }) : undefined}
                        />
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          <div className="mt-2 mb-4 flex items-start gap-2.5 rounded-[14px] bg-fill-2 px-3.5 py-3">
            <Info className="w-4 h-4 text-label-2 shrink-0 mt-[1px]" strokeWidth={2.25} />
            <p className="text-[12.5px] text-label-2 leading-snug">
              <span className="font-semibold text-label">Yapay zekâ hata yapabilir.</span> Alerji, ilaç ve doz bilgilerini uygulamadan önce
              hastayla doğrulayın. Tıbbi terime dokunarak kısa bilgi kartını açabilirsiniz.
            </p>
          </div>
        </>
      )}

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
