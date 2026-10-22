import {
  Activity,
  Ban,
  CircleAlert,
  CircleCheck,
  FlaskConical,
  Globe,
  HeartPulse,
  type LucideIcon,
  Pill,
  Quote,
  RefreshCw,
  Scissors,
  ShieldAlert,
  Siren,
  Sparkles,
  Tag,
  UtensilsCrossed,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { type CardType, cardTypeOf, type TermInfo, type TermQuery } from '../../shared/medical/terms';
import type { Fact } from '../../shared/types';
import { cachedTerm, fetchTerm } from '../lib/terms';
import { Sheet } from './ui';

const TYPE: Record<CardType, { label: string; glyph: string; icon: LucideIcon }> = {
  allergy: { label: 'Alerji kartı', glyph: 'bg-sys-red', icon: ShieldAlert },
  drug: { label: 'İlaç kartı', glyph: 'bg-sys-green', icon: Pill },
  condition: { label: 'Hastalık kartı', glyph: 'bg-sys-purple', icon: HeartPulse },
  symptom: { label: 'Şikâyet ve belirti kartı', glyph: 'bg-sys-pink', icon: Activity },
  procedure: { label: 'Ameliyat ve işlem kartı', glyph: 'bg-sys-teal', icon: Scissors },
};

// Titles of the shared fields, which mean something different on each card
const POINTS_TITLE: Record<CardType, string> = {
  allergy: '',
  drug: 'Kullanım alanları',
  condition: 'Tipik bulgular',
  symptom: 'Olası nedenler',
  procedure: 'Ne için yapılır',
};
const RED_FLAGS_TITLE: Record<CardType, string> = {
  allergy: '',
  drug: '',
  condition: 'Hemen bildirilecek belirtiler',
  symptom: 'Acil uyarı belirtileri',
  procedure: 'Komplikasyon belirtileri',
};

function useTerm(q: TermQuery) {
  const [info, setInfo] = useState<TermInfo | null>(() => cachedTerm(q));
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    setLoading(true);
    // One quiet retry before showing an error: a web lookup can fail on a slow network
    fetchTerm(q)
      .catch(() => fetchTerm(q))
      .then(setInfo)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [q]);
  useEffect(() => {
    if (!info) load();
    // biome-ignore lint/correctness/useExhaustiveDependencies: load once per term
  }, []);
  return { info, failed, loading, retry: load };
}

function Skeleton() {
  return (
    <div className="space-y-5 pt-1" aria-label="Yükleniyor">
      <p className="flex items-center gap-2 text-[14px] font-medium">
        <Globe className="w-4 h-4 text-accent animate-pulse" strokeWidth={2.2} />
        <span className="shimmer-text">İnternette araştırılıyor…</span>
      </p>
      <div className="space-y-2.5">
        <div className="skeleton h-[18px] w-[94%]" />
        <div className="skeleton h-[18px] w-[78%]" />
      </div>
      <div className="group-list">
        <div className="px-4 py-3.5">
          <div className="skeleton h-[14px] w-[46%]" />
        </div>
        <div className="px-4 py-3.5">
          <div className="skeleton h-[14px] w-[38%]" />
        </div>
      </div>
      <div className="space-y-2.5">
        <div className="skeleton h-[14px] w-[60%]" />
        <div className="skeleton h-[14px] w-[70%]" />
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className="w-[18px] h-[18px] text-label-2 shrink-0 mt-px" strokeWidth={2} />
      <span className="text-[15px] text-label-2 shrink-0">{label}</span>
      <span className="ml-auto text-[15px] font-medium text-right">{value}</span>
    </div>
  );
}

function Chips({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <section>
      <h3 className="px-1 mb-2 text-[13px] font-medium text-label-2">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {items.map((p) => (
          <span key={p} className="px-3 py-1.5 rounded-full bg-fill text-[14px] leading-tight">
            {p}
          </span>
        ))}
      </div>
    </section>
  );
}

type Tone = 'red' | 'orange' | 'neutral';
const TONE: Record<Tone, { box: string; title: string; dot: string }> = {
  red: { box: 'bg-sys-red/8', title: 'text-sys-red', dot: 'bg-sys-red' },
  orange: { box: 'bg-sys-orange/10', title: 'text-sys-orange', dot: 'bg-sys-orange' },
  neutral: { box: 'bg-fill-2', title: 'text-label', dot: 'bg-label-3' },
};

function ListBox({ title, icon: Icon, items, tone, children }: { title: string; icon: LucideIcon; items?: string[]; tone: Tone; children?: (item: string) => React.ReactNode }) {
  if (!items?.length) return null;
  const t = TONE[tone];
  return (
    <section className={`rounded-[16px] px-4 py-3.5 ${t.box}`}>
      <h3 className={`mb-2.5 flex items-center gap-2 text-[14px] font-semibold ${t.title}`}>
        <Icon className="w-4 h-4 shrink-0" strokeWidth={2.3} />
        {title}
      </h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-[14.5px] leading-snug">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[7px] ${t.dot}`} />
            <span className="flex-1 min-w-0">{children ? children(item) : item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "Sefalosporinler (Sefazolin) — düşük-orta risk": the drug, with its risk level as a badge. */
function CrossReaction({ item }: { item: string }) {
  const m = item.match(/^(.*?)\s+[—–-]\s+(\S[^—–]*risk\S*)$/iu);
  if (!m) return <>{item}</>;
  const level = m[2].toLocaleLowerCase('tr');
  const tone = /yüksek/.test(level) ? 'bg-sys-red/15 text-sys-red' : /orta/.test(level) ? 'bg-sys-orange/15 text-sys-orange' : 'bg-fill text-label-2';
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{m[1]}</span>
      <span className={`px-2 py-0.5 rounded-full text-[11.5px] font-semibold ${tone}`}>{m[2].replace(/\s*risk\s*/iu, ' risk').trim()}</span>
    </span>
  );
}

function Nursing({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <section className="rounded-[16px] bg-accent-soft px-4 py-3.5">
      <h3 className="mb-2 text-[13px] font-semibold text-accent-ink">Hemşire için</h3>
      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n} className="flex items-start gap-2 text-[15px] leading-snug">
            <CircleCheck className="w-[17px] h-[17px] text-accent shrink-0 mt-[2px]" strokeWidth={2.1} />
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AllergyCard({ info }: { info: TermInfo }) {
  return (
    <>
      {(info.drugClass || info.activeIngredient) && (
        <div className="group-list">
          {info.drugClass && <Row icon={Tag} label="Alerjen grubu" value={info.drugClass} />}
          {info.activeIngredient && <Row icon={FlaskConical} label="Etken madde" value={info.activeIngredient} />}
        </div>
      )}
      <ListBox title="Çapraz reaksiyon riski olan ilaçlar" icon={Pill} items={info.crossReactions} tone="orange">
        {(item) => <CrossReaction item={item} />}
      </ListBox>
      <ListBox title="Kaçınılacak yiyecek ve içecekler" icon={UtensilsCrossed} items={info.foodsAndDrinks} tone="orange" />
      <ListBox title="Diğer kaçınılacaklar" icon={Ban} items={info.avoidList} tone="neutral" />
      <ListBox title="Reaksiyon belirtileri" icon={Siren} items={info.reactionSigns} tone="red" />
    </>
  );
}

function DrugCard({ info }: { info: TermInfo }) {
  return (
    <>
      {(info.activeIngredient || info.drugClass) && (
        <div className="group-list">
          {info.activeIngredient && <Row icon={FlaskConical} label="Etken madde" value={info.activeIngredient} />}
          {info.drugClass && <Row icon={Tag} label="İlaç grubu" value={info.drugClass} />}
        </div>
      )}
      <Chips title={POINTS_TITLE.drug} items={info.points} />
      <ListBox title="Önemli yan etkiler ve etkileşimler" icon={CircleAlert} items={info.sideEffects} tone="orange" />
    </>
  );
}

function ClinicalCard({ info, type }: { info: TermInfo; type: CardType }) {
  return (
    <>
      <Chips title={POINTS_TITLE[type]} items={info.points} />
      <ListBox title={RED_FLAGS_TITLE[type]} icon={Siren} items={info.redFlags} tone="red" />
    </>
  );
}

export function TermSheet({
  query,
  fact,
  onClose,
}: {
  query: TermQuery;
  fact?: Fact;
  glyph?: string;
  icon?: LucideIcon;
  onClose: () => void;
}) {
  const { info, failed, loading, retry } = useTerm(query);
  const type = cardTypeOf({ kind: query.kind, category: query.category ?? fact?.category });
  const style = TYPE[type];
  const Icon = style.icon;

  return (
    <Sheet
      onClose={onClose}
      width="sm:max-w-[480px]"
      leading={
        <span className={`glyph w-10 h-10 rounded-[11px] ${style.glyph}`}>
          <Icon className="w-[21px] h-[21px]" strokeWidth={2.1} />
        </span>
      }
      title={query.term}
      subtitle={style.label}
    >
      {type === 'allergy' && (
        <div className="mb-4 flex items-start gap-2.5 rounded-[14px] bg-sys-red/10 px-3.5 py-3 text-sys-red anim-fade">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-px" strokeWidth={2.1} />
          <p className="text-[14px] leading-snug font-medium">Hasta bu maddeye alerjisi olduğunu bildirdi. İlaç ve beslenme planını hekimle doğrulayın.</p>
        </div>
      )}

      {!info && !failed && <Skeleton />}

      {failed && !info && (
        <div className="py-8 flex flex-col items-center text-center gap-3 anim-fade">
          <p className="text-[15px] text-label-2 max-w-[300px]">Bilgi şu anda alınamadı. Bağlantı yavaş ya da yapay zekâ kotası geçici olarak dolu olabilir.</p>
          <button type="button" onClick={retry} className="pressable btn-tinted h-9 px-4 rounded-full inline-flex items-center gap-1.5 text-[14px] font-medium cursor-pointer">
            <RefreshCw className="w-4 h-4" strokeWidth={2.25} />
            Tekrar dene
          </button>
        </div>
      )}

      {info && !info.known && (
        <p className="py-6 text-[15px] text-label-2 leading-relaxed anim-fade">
          Bu terim için güvenilir bir bilgi bulunamadı. Yazımı, konuşmadaki söylenişten farklı olabilir.
        </p>
      )}

      {info?.known && (
        <div className="space-y-4 anim-fade">
          <p className="text-[17px] leading-[1.45] tracking-[-0.015em] pretty">{info.summary}</p>
          {type === 'allergy' ? <AllergyCard info={info} /> : type === 'drug' ? <DrugCard info={info} /> : <ClinicalCard info={info} type={type} />}
          <Nursing items={info.nursing} />

          {info.origin === 'reference' && (
            <div className="flex items-center gap-3 rounded-[14px] bg-fill-2 px-3.5 py-3">
              <p className="flex-1 text-[13px] text-label-2 leading-snug">Yapay zekâya şu an ulaşılamadı; uygulamadaki doğrulanmış temel bilgi gösteriliyor.</p>
              <button
                type="button"
                onClick={retry}
                disabled={loading}
                className="pressable btn-tinted h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium shrink-0 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2.25} />
                Yenile
              </button>
            </div>
          )}
        </div>
      )}

      {fact?.evidence && (
        <figure className="mt-5 flex items-start gap-2.5 text-label-2">
          <Quote className="w-4 h-4 shrink-0 mt-0.5 text-label-3" strokeWidth={2.25} />
          <blockquote dir="auto" className="text-[14px] italic leading-snug">
            {fact.evidence}
          </blockquote>
        </figure>
      )}

      {info?.known && info.sources && info.sources.length > 0 && (
        <section className="mt-5 anim-fade">
          <h3 className="px-1 mb-2 text-[13px] font-medium text-label-2">Kaynaklar</h3>
          <div className="flex flex-wrap gap-1.5">
            {info.sources.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="pressable max-w-full h-8 px-3 rounded-full bg-fill text-[13px] text-accent inline-flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
                <span className="truncate">{s.title}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {info?.known && (
      <p className="mt-6 flex items-center gap-1.5 text-[12px] text-label-3">
        {info?.origin === 'web' ? <Globe className="w-3.5 h-3.5 shrink-0" strokeWidth={2} /> : <Sparkles className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />}
        {info?.origin === 'web'
          ? 'İnternet kaynaklarıyla doğrulanmış yapay zekâ özeti · Klinik karar ve prospektüs yerine geçmez'
          : info?.origin === 'demo'
            ? 'Simülasyon örneği · Gerçek bilgi değildir'
            : 'Yapay zekâ özeti · Klinik karar ve prospektüs yerine geçmez'}
      </p>
      )}
    </Sheet>
  );
}
