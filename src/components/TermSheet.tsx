import {
  AlertTriangle,
  Ban,
  CircleCheck,
  FlaskConical,
  Globe,
  Layers,
  type LucideIcon,
  Quote,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Tag,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { TermInfo, TermKind, TermQuery } from '../../shared/medical/terms';
import type { Fact, FactCategory } from '../../shared/types';
import { cachedTerm, fetchTerm } from '../lib/terms';
import { Sheet } from './ui';

const CATEGORY_LABEL: Record<FactCategory, string> = {
  allergy: 'Alerji & Çapraz Reaksiyon',
  medication: 'İlaç Bilgi Kartı',
  chronic: 'Kronik Hastalık Bilgi Kartı',
  complaint: 'Şikâyet & Belirti Bilgi Kartı',
  surgery: 'Cerrahi İşlem Bilgi Kartı',
  family: 'Aile Öyküsü & Kalıtsal Risk',
  habit: 'Alışkanlık & Yaşam Tarzı',
  need: 'Hasta Gereksinimi & Talep',
  instruction: 'Klinik Talimat & Bilgilendirme',
};

const KIND_LABEL: Record<TermKind, string> = {
  drug: 'İlaç',
  condition: 'Hastalık',
  symptom: 'Belirti',
  procedure: 'Cerrahi işlem',
  allergen: 'Alerjen',
};

const POINTS_TITLE: Record<TermKind, string> = {
  drug: 'Kullanım alanları',
  condition: 'Tipik bulgular & Riskler',
  symptom: 'Nasıl görülür & Özellikleri',
  procedure: 'Neden yapılır & Amacı',
  allergen: 'Bulunduğu yerler & Kaynaklar',
};

function useTerm(q: TermQuery) {
  const [info, setInfo] = useState<TermInfo | null>(() => cachedTerm(q));
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    fetchTerm(q)
      .catch(() => fetchTerm(q))
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
  fact?: Fact;
  glyph: string;
  icon: LucideIcon;
  onClose: () => void;
}) {
  const { info, failed, retry } = useTerm(query);
  const isAllergy =
    (fact?.category === 'allergy' && !fact?.negated) ||
    query.category === 'allergy' ||
    query.kind === 'allergen' ||
    info?.category === 'allergy';

  const kind = info?.kind ?? query.kind;
  const category = (info?.category || fact?.category || query.category) as FactCategory | undefined;
  const subtitle = isAllergy
    ? 'Alerji & Çapraz Reaksiyon Kartı'
    : category
      ? CATEGORY_LABEL[category]
      : KIND_LABEL[kind];

  return (
    <Sheet
      onClose={onClose}
      width="sm:max-w-[480px]"
      leading={
        <span className={`glyph w-10 h-10 rounded-[11px] ${isAllergy ? 'bg-sys-red' : glyph}`}>
          {isAllergy ? <ShieldAlert className="w-[21px] h-[21px] text-white" strokeWidth={2.1} /> : <Icon className="w-[21px] h-[21px]" strokeWidth={2.1} />}
        </span>
      }
      title={query.term}
      subtitle={subtitle}
    >
      {/* ALLERGY EMERGENCY ALERT BANNER */}
      {isAllergy && (
        <div className="mb-4 flex items-start gap-2.5 rounded-[16px] bg-sys-red/10 border border-sys-red/20 px-4 py-3 text-sys-red anim-fade shadow-sm">
          <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" strokeWidth={2.2} />
          <div className="min-w-0 text-[13.5px] leading-snug">
            <p className="font-semibold text-sys-red">ALERJİ & ÇAPRAZ REAKSİYON UYARISI</p>
            <p className="mt-0.5 opacity-90">
              Hasta bu etkene karşı alerji bildirdi. İlaç, antibiyotik veya gıda çapraz reaksiyonlarını uygulamadan önce mutlaka hekimle doğrulayın.
            </p>
          </div>
        </div>
      )}

      {!info && !failed && <Skeleton />}

      {failed && !info && (
        <div className="py-8 flex flex-col items-center text-center gap-3 anim-fade">
          <p className="text-[15px] text-label-2">Bilgi şu anda alınamadı.</p>
          <button
            type="button"
            onClick={retry}
            className="pressable btn-tinted h-9 px-4 rounded-full inline-flex items-center gap-1.5 text-[14px] font-medium cursor-pointer"
          >
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
          {/* SUMMARY PARAGRAPH */}
          <div className="rounded-[16px] bg-fill-2 p-3.5">
            <p className="text-[16px] leading-[1.48] tracking-[-0.012em] pretty text-label">
              {info.summary}
            </p>
          </div>

          {/* ACTIVE INGREDIENT & DRUG / ALLERGEN CLASS */}
          {(info.activeIngredient || info.drugClass) && (
            <div className="group-list">
              {info.activeIngredient && <Row icon={FlaskConical} label="Etken madde" value={info.activeIngredient} />}
              {info.drugClass && (
                <Row
                  icon={Tag}
                  label={isAllergy ? 'Alerjen sınıfı' : 'Farmakolojik grup'}
                  value={info.drugClass}
                />
              )}
            </div>
          )}

          {/* ALLERGY SPECIALIZED SECTION 1: CROSS REACTIONS */}
          {isAllergy && info.crossReactions && info.crossReactions.length > 0 && (
            <section className="rounded-[16px] border border-sys-orange/25 bg-sys-orange/10 p-4 anim-rise">
              <header className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-sys-orange shrink-0" strokeWidth={2.3} />
                <h3 className="text-[14px] font-semibold text-sys-orange">
                  Çapraz Reaksiyon Riski Olan Diğer İlaçlar / Benzer Türler
                </h3>
              </header>
              <p className="text-[12.5px] text-label-2 mb-3 leading-snug">
                Aynı moleküler yapıyı veya benzer proteinleri paylaşan, hastada benzer alerjik reaksiyon tetikleyebilecek türler:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {info.crossReactions.map((cr) => (
                  <span
                    key={cr}
                    className="px-3 py-1.5 rounded-full bg-surface text-sys-orange border border-sys-orange/30 text-[13.5px] font-medium leading-tight shadow-xs flex items-center gap-1.5"
                  >
                    <TriangleAlert className="w-3.5 h-3.5 shrink-0" strokeWidth={2.2} />
                    <span>{cr}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ALLERGY SPECIALIZED SECTION 2: AVOID LIST */}
          {isAllergy && info.avoidList && info.avoidList.length > 0 && (
            <section className="rounded-[16px] bg-sys-red/8 p-4 anim-rise border border-sys-red/15">
              <header className="flex items-center gap-2 mb-2">
                <Ban className="w-4 h-4 text-sys-red shrink-0" strokeWidth={2.3} />
                <h3 className="text-[14px] font-semibold text-sys-red">
                  Kaçınılması Gereken Maddeler & Preparatlar
                </h3>
              </header>
              <ul className="space-y-1.5">
                {info.avoidList.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-[13.5px] leading-snug text-label">
                    <span className="w-1.5 h-1.5 rounded-full bg-sys-red shrink-0 mt-1.5" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ALLERGY SPECIALIZED SECTION 3: REACTION & ANAPHYLAXIS SIGNS */}
          {isAllergy && info.reactionSigns && info.reactionSigns.length > 0 && (
            <section className="rounded-[16px] bg-fill p-4 anim-rise">
              <header className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-sys-yellow shrink-0" strokeWidth={2.3} />
                <h3 className="text-[13.5px] font-semibold text-label">
                  Olası Reaksiyonlar & Anafilaksi Belirtileri
                </h3>
              </header>
              <div className="flex flex-wrap gap-1.5">
                {info.reactionSigns.map((rs) => (
                  <span
                    key={rs}
                    className="px-2.5 py-1 rounded-full bg-surface text-[13px] leading-tight text-label-2 border border-black/5 dark:border-white/10"
                  >
                    {rs}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* GENERAL POINTS FOR NON-ALLERGY (DRUG USES, CHRONIC SIGNS, SYMPTOM CHARACTERISTICS) */}
          {!isAllergy && info.points && info.points.length > 0 && (
            <section>
              <h3 className="px-1 mb-2 text-[13px] font-medium text-label-2">
                {POINTS_TITLE[kind]}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {info.points.map((p) => (
                  <span key={p} className="px-3 py-1.5 rounded-full bg-fill text-[14px] leading-tight">
                    {p}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* SPECIALIZED NURSING CARE & PROTOCOL */}
          {info.nursing && info.nursing.length > 0 && (
            <section
              className={`rounded-[18px] p-4 ${
                isAllergy ? 'bg-sys-red/10 border border-sys-red/25' : 'bg-accent-soft'
              }`}
            >
              <header className="flex items-center gap-2 mb-2.5">
                {isAllergy ? (
                  <ShieldAlert className="w-[18px] h-[18px] text-sys-red" strokeWidth={2.3} />
                ) : (
                  <Stethoscope className="w-[18px] h-[18px] text-accent" strokeWidth={2.3} />
                )}
                <h3
                  className={`text-[14px] font-semibold ${
                    isAllergy ? 'text-sys-red' : 'text-accent-ink'
                  }`}
                >
                  {isAllergy ? 'Hemşire Yaklaşımı & Acil Önlemler' : 'Hemşire için İzlem & Uygulama'}
                </h3>
              </header>
              <ul className="space-y-2">
                {info.nursing.map((n) => (
                  <li key={n} className="flex items-start gap-2.5 text-[14.5px] leading-snug">
                    <CircleCheck
                      className={`w-[17px] h-[17px] shrink-0 mt-[2px] ${
                        isAllergy ? 'text-sys-red' : 'text-accent'
                      }`}
                      strokeWidth={2.2}
                    />
                    <span className="text-label">{n}</span>
                  </li>
                ))}
              </ul>
            </section>
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

      <p className="mt-6 flex items-center gap-1.5 text-[12px] text-label-3">
        {info?.origin === 'web' ? (
          <Globe className="w-3.5 h-3.5" strokeWidth={2} />
        ) : (
          <Sparkles className="w-3.5 h-3.5" strokeWidth={2} />
        )}
        {info?.origin === 'web'
          ? 'İnternet kaynaklarıyla doğrulanmış yapay zekâ özeti · Klinik karar ve prospektüs yerine geçmez'
          : info?.origin === 'demo'
            ? 'Simülasyon örneği · Gerçek bilgi değildir'
            : 'Yapay zekâ özeti · Klinik karar ve prospektüs yerine geçmez'}
      </p>
    </Sheet>
  );
}
