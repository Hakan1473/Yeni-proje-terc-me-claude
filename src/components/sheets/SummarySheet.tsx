import {
  Check,
  CheckCircle2,
  ChevronRight,
  Coffee,
  Copy,
  FileText,
  HeartPulse,
  Info,
  ListChecks,
  type LucideIcon,
  Pill,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import type { TermQuery } from '../../../shared/medical/terms';
import type { FactCategory } from '../../../shared/types';
import { useStore } from '../../lib/store';
import { engine } from '../../live/engine';
import { TermSheet } from '../TermSheet';
import { copyText, Sheet } from '../ui';

function parseSummaryTerm(item: string, defaultCategory: FactCategory): TermQuery {
  let clean = item.split(' · ')[0].trim();
  if (defaultCategory === 'medication') {
    clean = clean.replace(/\s+\d[\d.,]*\s*(?:mg|mcg|µg|g|ml|ünite|iu|u|%)\b.*$/iu, '').trim();
    return {
      term: clean,
      kind: 'drug',
      category: 'medication',
    };
  }
  if (defaultCategory === 'complaint') {
    clean = clean.replace(/\s*\([^)]*\)/g, '').trim();
    return {
      term: clean,
      kind: 'symptom',
      category: 'complaint',
    };
  }
  if (defaultCategory === 'chronic') {
    return {
      term: clean,
      kind: 'condition',
      category: 'chronic',
    };
  }
  return {
    term: clean,
    kind: defaultCategory === 'instruction' ? 'procedure' : 'condition',
    category: defaultCategory,
  };
}

function Section({
  title,
  items,
  glyph,
  Icon,
  category,
  empty,
  chips,
  onSelect,
}: {
  title: string;
  items: string[];
  glyph: string;
  Icon: LucideIcon;
  category: FactCategory;
  empty?: string;
  chips?: boolean;
  onSelect: (item: string, cat: FactCategory, glyph: string, icon: LucideIcon) => void;
}) {
  if (items.length === 0 && !empty) return null;
  return (
    <section className="group-list anim-rise">
      <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
        <span className={`glyph w-[26px] h-[26px] rounded-[7px] ${glyph}`}>
          <Icon className="w-[15px] h-[15px]" strokeWidth={2.25} />
        </span>
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {items.length > 0 && <span className="ml-auto text-[13px] text-label-2 tabular">{items.length}</span>}
      </header>
      <div style={{ boxShadow: 'none' }}>
        {items.length === 0 ? (
          <p className="px-4 pb-3.5 text-[14px] text-label-3">{empty}</p>
        ) : chips ? (
          <div className="px-4 pb-3.5 flex flex-wrap gap-1.5">
            {items.map((i) => (
              <button
                type="button"
                key={i}
                onClick={() => onSelect(i, category, glyph, Icon)}
                className="pressable px-3 py-1.5 rounded-full bg-sys-orange/12 hover:bg-sys-orange/20 text-label text-[13.5px] font-medium tabular flex items-center gap-1.5 cursor-pointer transition-colors"
                title={`${i} bilgi kartını aç`}
              >
                <span>{i}</span>
                <ChevronRight className="w-3.5 h-3.5 text-label-3" strokeWidth={2.5} />
              </button>
            ))}
          </div>
        ) : (
          <ul className="pl-4">
            {items.map((i, idx) => (
              <li key={i} className={`pr-3 py-2 text-[15px] leading-snug ${idx ? 'hairline-t' : ''}`}>
                <button
                  type="button"
                  onClick={() => onSelect(i, category, glyph, Icon)}
                  className="pressable w-full text-left flex items-center justify-between gap-2.5 py-1 rounded-lg hover:bg-fill/50 px-1 -mx-1 cursor-pointer transition-colors"
                  title={`${i} bilgi kartını aç`}
                >
                  <span className="flex-1 min-w-0">{i}</span>
                  <ChevronRight className="w-4 h-4 text-label-3 shrink-0" strokeWidth={2.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function SummarySheet({ onClose }: { onClose: () => void }) {
  const summary = useStore(engine.store, (s) => s.summary);
  const loading = useStore(engine.store, (s) => s.summaryLoading);
  const language = useStore(engine.store, (s) => s.language);
  const [copied, setCopied] = useState(false);
  const [explain, setExplain] = useState<{ query: TermQuery; glyph: string; icon: LucideIcon } | null>(null);

  const copy = async () => {
    if (!summary) return;
    const lines = [
      `KONUŞMA ÖZETİ (Türkçe ⇄ ${language.nameTr})`,
      `Tarih: ${new Date(summary.timestamp).toLocaleString('tr-TR')}`,
      '',
      summary.briefSummaryTr,
      '',
    ];
    const add = (title: string, items: string[]) => {
      if (!items.length) return;
      lines.push(`— ${title} —`, ...items.map((i) => `• ${i}`), '');
    };
    add('ŞİKAYETLER', summary.patientChiefComplaints);
    add('İSTEK VE TALEPLER', summary.patientNeedsAndRequests);
    add('TALİMAT VE BİLGİLENDİRMELER', summary.clinicalInstructions);
    add('ÖLÇÜM, İLAÇ VE DEĞERLER', summary.vitalSignsAndDosages);
    add('TAKİP ADIMLARI', summary.actionItems);
    if (await copyText(lines.join('\n'))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleSelect = (item: string, cat: FactCategory, glyph: string, icon: LucideIcon) => {
    const query = parseSummaryTerm(item, cat);
    setExplain({ query, glyph, icon });
  };

  return (
    <>
      <Sheet
        onClose={onClose}
        title="Konuşma Özeti"
        subtitle={`Yapay zekâ · Türkçe ⇄ ${language.nameTr}`}
        width="sm:max-w-xl"
        trailing={
          summary && !loading ? (
            <button
              type="button"
              onClick={copy}
              className={`pressable h-[30px] px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium cursor-pointer ${
                copied ? 'bg-sys-green/15 text-sys-green' : 'btn-tinted'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Copy className="w-3.5 h-3.5" strokeWidth={2} />}
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
          ) : undefined
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => void engine.generateSummary()}
              disabled={loading}
              className="pressable btn-gray h-9 px-4 rounded-full inline-flex items-center gap-1.5 text-[14px] font-medium cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2.25} />
              Yeniden Analiz Et
            </button>
            <span className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="pressable btn-primary h-9 px-5 rounded-full text-[15px] font-semibold cursor-pointer"
            >
              Bitti
            </button>
          </>
        }
      >
        {loading ? (
          <div className="py-20 flex flex-col items-center text-center anim-fade">
            <Sparkles className="w-8 h-8 text-accent mb-4 animate-pulse" strokeWidth={2} />
            <p className="text-[17px] font-semibold shimmer-text">Özet hazırlanıyor</p>
            <p className="text-[14px] text-label-2 max-w-xs mt-1">
              Görüşme taranıyor: şikayetler, istekler, talimatlar ve değerler çıkarılıyor.
            </p>
          </div>
        ) : summary ? (
          <div className="space-y-4">
            <section className="rounded-[14px] p-4 bg-accent-soft anim-rise">
              <p className="flex items-center gap-1.5 mb-1.5 text-[13px] font-semibold text-accent-ink">
                <Sparkles className="w-3.5 h-3.5" strokeWidth={2.25} />
                Genel özet
              </p>
              <p className="text-[16px] leading-relaxed">{summary.briefSummaryTr}</p>
            </section>

            <Section
              title="Şikayetler & Belirtiler"
              items={summary.patientChiefComplaints}
              glyph="bg-sys-pink"
              Icon={HeartPulse}
              category="complaint"
              empty="Belirtilen bir şikayet yok."
              onSelect={handleSelect}
            />
            <Section
              title="İstek & Talepler"
              items={summary.patientNeedsAndRequests}
              glyph="bg-sys-orange"
              Icon={Coffee}
              category="need"
              empty="Özel bir istek yok."
              onSelect={handleSelect}
            />
            <Section
              title="İletilen Bilgi & Talimatlar"
              items={summary.clinicalInstructions}
              glyph="bg-sys-green"
              Icon={CheckCircle2}
              category="instruction"
              empty="Kayıtlı talimat yok."
              onSelect={handleSelect}
            />
            <Section
              title="Ölçüm, İlaç & Değerler"
              items={summary.vitalSignsAndDosages}
              glyph="bg-sys-yellow"
              Icon={Pill}
              category="medication"
              chips
              onSelect={handleSelect}
            />
            <Section
              title="Takip Adımları"
              items={summary.actionItems}
              glyph="bg-sys-indigo"
              Icon={ListChecks}
              category="instruction"
              onSelect={handleSelect}
            />

            <div className="mt-2 flex items-start gap-2.5 rounded-[14px] bg-fill-2 px-3.5 py-3">
              <Info className="w-4 h-4 text-label-2 shrink-0 mt-[1px]" strokeWidth={2.25} />
              <p className="text-[12.5px] text-label-2 leading-snug">
                Özet içerisindeki şikâyet, ilaç, değer veya talimatların üzerine dokunarak özel klinik bilgi kartını ve hemşire rehberini inceleyebilirsiniz.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-16 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-[20px] bg-accent-soft text-accent flex items-center justify-center mb-4">
              <FileText className="w-7 h-7" strokeWidth={2} />
            </div>
            <p className="text-[18px] font-semibold">Henüz özet yok</p>
            <p className="text-[14px] text-label-2 max-w-xs mt-1 mb-5">
              Konuşmayı yapay zekâ ile analiz ederek özet çıkarın.
            </p>
            <button
              type="button"
              onClick={() => void engine.generateSummary()}
              className="pressable btn-primary h-11 px-6 rounded-full inline-flex items-center gap-2 text-[15px] font-semibold cursor-pointer"
            >
              <Sparkles className="w-4 h-4" strokeWidth={2.25} />
              Özeti Oluştur
            </button>
          </div>
        )}
      </Sheet>

      {explain && (
        <TermSheet
          query={explain.query}
          glyph={explain.glyph}
          icon={explain.icon}
          onClose={() => setExplain(null)}
        />
      )}
    </>
  );
}
