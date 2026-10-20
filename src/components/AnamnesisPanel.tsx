import {
  Activity,
  BadgeCheck,
  Check,
  Cigarette,
  ClipboardList,
  Copy,
  HandHeart,
  HeartPulse,
  type LucideIcon,
  Pill,
  Scissors,
  Stethoscope,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { CATEGORY_TITLES, factText, formatAnamnesisReport, groupFacts } from '../../shared/medical/anamnesis';
import type { Fact, FactCategory } from '../../shared/types';
import { useStore } from '../lib/store';
import { engine } from '../live/engine';
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

function FactRow({ fact, critical, first }: { fact: Fact; critical: boolean; first: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={`pr-4 ${first ? '' : 'hairline-t'}`}>
      <button
        type="button"
        onClick={() => fact.evidence && setOpen((o) => !o)}
        aria-expanded={fact.evidence ? open : undefined}
        className={`w-full text-left py-2.5 flex items-start gap-2 ${fact.evidence ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span
          className={`flex-1 text-[15px] leading-snug tracking-[-0.012em] ${
            fact.negated ? 'text-label-2' : critical ? 'text-sys-red font-semibold' : 'text-label'
          }`}
        >
          {factText(fact)}
        </span>
        {fact.origin === 'ai' && <BadgeCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" strokeWidth={2} aria-label="Yapay zekâ doğruladı" />}
      </button>
      {open && fact.evidence && (
        <p dir="auto" className="-mt-1 pb-2.5 text-[13px] italic text-label-2 leading-snug anim-fade">
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
  const groups = groupFacts(facts);
  const total = facts.length;

  const copy = async () => {
    if (await copyText(formatAnamnesisReport(facts, language.nameTr))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="@container h-full overflow-y-auto overscroll-contain px-3 sm:px-5 py-4">
      <div className="flex items-center justify-between gap-3 px-1 mb-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-[-0.016em] truncate">
            Anlık Klinik Anamnez <span className="font-normal text-label-2 tabular">{total} bilgi</span>
          </h3>
          <p className="text-[12px] text-label-2 truncate">
            <SyncStatus />
          </p>
        </div>
        {total > 0 && (
          <button
            type="button"
            onClick={copy}
            className={`pressable h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium cursor-pointer shrink-0 ${
              copied ? 'bg-sys-green/15 text-sys-green' : 'btn-tinted'
            }`}
            title="HBYS'ye yapıştırmak için kopyala"
          >
            {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Copy className="w-3.5 h-3.5" strokeWidth={2} />}
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </button>
        )}
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center px-8 py-14 text-center anim-fade">
          <div className="w-16 h-16 rounded-[20px] bg-sys-indigo/12 text-sys-indigo flex items-center justify-center mb-4">
            <ClipboardList className="w-7 h-7" strokeWidth={2} />
          </div>
          <p className="text-[20px] font-semibold tracking-[-0.022em]">Anamnez Bekleniyor</p>
          <p className="mt-1.5 text-[15px] text-label-2 max-w-[320px] leading-relaxed balance">
            Şikayetler, ilaçlar, alerjiler, kronik hastalıklar, ameliyatlar ve istekler konuşmada geçtikçe burada listelenir.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 @lg:grid-cols-2 gap-3 pb-2">
          {groups.map(({ category, facts: list }) => {
            const style = STYLE[category];
            const Icon = style.icon;
            const critical = category === 'allergy' && list.some((f) => !f.negated);
            return (
              <section
                key={category}
                className={`anim-rise rounded-[18px] overflow-hidden ${style.wide ? '@lg:col-span-2' : ''} ${
                  critical ? 'bg-sys-red/8 ring-1 ring-sys-red/30' : 'bg-surface shadow-card'
                }`}
              >
                <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-1.5">
                  <span className={`glyph w-[26px] h-[26px] rounded-[7px] ${style.glyph}`}>
                    <Icon className="w-[15px] h-[15px]" strokeWidth={2.25} />
                  </span>
                  <h4 className={`text-[15px] font-semibold tracking-[-0.016em] ${critical ? 'text-sys-red' : ''}`}>{CATEGORY_TITLES[category]}</h4>
                  <span className="ml-auto text-[13px] text-label-2 tabular">{list.filter((f) => !f.negated).length || ''}</span>
                </header>
                <ul className="pl-4 pb-1">
                  {list.map((f, i) => (
                    <FactRow key={f.key} fact={f} critical={critical && !f.negated} first={i === 0} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {total > 0 && (
        <p className="px-2 pt-2 pb-4 text-[12px] text-label-3 leading-snug">
          Satıra dokunarak dayandığı konuşmayı görebilirsiniz. Otomatik çıkarımdır; klinik doğrulama gerektirir.
        </p>
      )}
    </div>
  );
}
