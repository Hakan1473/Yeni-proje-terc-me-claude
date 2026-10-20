import { CircleCheck, FlaskConical, type LucideIcon, Quote, RefreshCw, ShieldAlert, Sparkles, Tag } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { TermInfo, TermKind, TermQuery } from '../../shared/medical/terms';
import type { Fact } from '../../shared/types';
import { cachedTerm, fetchTerm } from '../lib/terms';
import { Sheet } from './ui';

const KIND_LABEL: Record<TermKind, string> = {
  drug: 'İlaç',
  condition: 'Hastalık',
  symptom: 'Belirti',
  procedure: 'Cerrahi işlem',
  allergen: 'Alerjen',
};

const POINTS_TITLE: Record<TermKind, string> = {
  drug: 'Kullanım alanları',
  condition: 'Tipik bulgular',
  symptom: 'Nasıl görülür',
  procedure: 'Neden yapılır',
  allergen: 'Bulunduğu yerler',
};

function useTerm(q: TermQuery) {
  const [info, setInfo] = useState<TermInfo | null>(() => cachedTerm(q));
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    fetchTerm(q)
      .then(setInfo)
      .catch(() => setFailed(true));
  }, [q]);
  useEffect(() => {
    if (!info) load();
  }, [info, load]);
  return { info, failed, retry: load };
}

function Skeleton() {
  return (
    <div className="space-y-5 pt-1" aria-label="Yükleniyor">
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
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="w-[18px] h-[18px] text-label-2 shrink-0" strokeWidth={2} />
      <span className="text-[15px] text-label-2 shrink-0">{label}</span>
      <span className="ml-auto text-[15px] font-medium text-right">{value}</span>
    </div>
  );
}

export function TermSheet({
  query,
  fact,
  glyph,
  icon: Icon,
  onClose,
}: {
  query: TermQuery;
  fact: Fact;
  glyph: string;
  icon: LucideIcon;
  onClose: () => void;
}) {
  const { info, failed, retry } = useTerm(query);
  const allergy = fact.category === 'allergy' && !fact.negated;
  const kind = info?.kind ?? query.kind;

  return (
    <Sheet
      onClose={onClose}
      width="sm:max-w-[460px]"
      leading={
        <span className={`glyph w-10 h-10 rounded-[11px] ${glyph}`}>
          <Icon className="w-[21px] h-[21px]" strokeWidth={2.1} />
        </span>
      }
      title={query.term}
      subtitle={KIND_LABEL[kind]}
    >
      {allergy && (
        <div className="mb-4 flex items-start gap-2.5 rounded-[14px] bg-sys-red/10 px-3.5 py-3 text-sys-red anim-fade">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-px" strokeWidth={2.1} />
          <p className="text-[14px] leading-snug font-medium">Hasta bu maddeye alerjisi olduğunu bildirdi. Uygulamadan önce hekimle doğrulayın.</p>
        </div>
      )}

      {!info && !failed && <Skeleton />}

      {failed && !info && (
        <div className="py-8 flex flex-col items-center text-center gap-3 anim-fade">
          <p className="text-[15px] text-label-2">Bilgi şu anda alınamadı.</p>
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
        <div className="space-y-5 anim-fade">
          <p className="text-[17px] leading-[1.45] tracking-[-0.015em] pretty">{info.summary}</p>

          {(info.activeIngredient || info.drugClass) && (
            <div className="group-list">
              {info.activeIngredient && <Row icon={FlaskConical} label="Etken madde" value={info.activeIngredient} />}
              {info.drugClass && <Row icon={Tag} label="İlaç grubu" value={info.drugClass} />}
            </div>
          )}

          {info.points && info.points.length > 0 && (
            <section>
              <h3 className="px-1 mb-2 text-[13px] font-medium text-label-2">{POINTS_TITLE[kind]}</h3>
              <div className="flex flex-wrap gap-1.5">
                {info.points.map((p) => (
                  <span key={p} className="px-3 py-1.5 rounded-full bg-fill text-[14px] leading-tight">
                    {p}
                  </span>
                ))}
              </div>
            </section>
          )}

          {info.nursing && info.nursing.length > 0 && (
            <section className="rounded-[16px] bg-accent-soft px-4 py-3.5">
              <h3 className="mb-2 text-[13px] font-semibold text-accent-ink">Hemşire için</h3>
              <ul className="space-y-2">
                {info.nursing.map((n) => (
                  <li key={n} className="flex items-start gap-2 text-[15px] leading-snug">
                    <CircleCheck className="w-[17px] h-[17px] text-accent shrink-0 mt-[2px]" strokeWidth={2.1} />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {fact.evidence && (
        <figure className="mt-5 flex items-start gap-2.5 text-label-2">
          <Quote className="w-4 h-4 shrink-0 mt-0.5 text-label-3" strokeWidth={2.25} />
          <blockquote dir="auto" className="text-[14px] italic leading-snug">
            {fact.evidence}
          </blockquote>
        </figure>
      )}

      <p className="mt-6 flex items-center gap-1.5 text-[12px] text-label-3">
        <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
        Yapay zekâ özeti · Klinik karar ve prospektüs yerine geçmez
      </p>
    </Sheet>
  );
}
