import { Check, CheckCircle2, Coffee, Copy, FileText, HeartPulse, ListChecks, type LucideIcon, Pill, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../../lib/store';
import { engine } from '../../live/engine';
import { copyText, Sheet } from '../ui';

function Section({ title, items, glyph, Icon, empty, chips }: { title: string; items: string[]; glyph: string; Icon: LucideIcon; empty?: string; chips?: boolean }) {
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
              <span key={i} className="px-2.5 py-1 rounded-full bg-sys-orange/12 text-[13px] font-medium tabular">
                {i}
              </span>
            ))}
          </div>
        ) : (
          <ul className="pl-4">
            {items.map((i, idx) => (
              <li key={i} className={`pr-4 py-2.5 text-[15px] leading-snug ${idx ? 'hairline-t' : ''}`}>
                {i}
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

  const copy = async () => {
    if (!summary) return;
    const lines = [`KONUŞMA ÖZETİ (Türkçe ⇄ ${language.nameTr})`, `Tarih: ${new Date(summary.timestamp).toLocaleString('tr-TR')}`, '', summary.briefSummaryTr, ''];
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

  return (
    <Sheet
      onClose={onClose}
      title="Konuşma Özeti"
      subtitle={`Yapay zekâ · Türkçe ⇄ ${language.nameTr}`}
      width="sm:max-w-xl"
      trailing={
        summary && !loading ? (
          <button type="button" onClick={copy} className={`pressable h-[30px] px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium cursor-pointer ${copied ? 'bg-sys-green/15 text-sys-green' : 'btn-tinted'}`}>
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
          <button type="button" onClick={onClose} className="pressable btn-primary h-9 px-5 rounded-full text-[15px] font-semibold cursor-pointer">
            Bitti
          </button>
        </>
      }
    >
      {loading ? (
        <div className="py-20 flex flex-col items-center text-center anim-fade">
          <Sparkles className="w-8 h-8 text-accent mb-4 animate-pulse" strokeWidth={2} />
          <p className="text-[17px] font-semibold shimmer-text">Özet hazırlanıyor</p>
          <p className="text-[14px] text-label-2 max-w-xs mt-1">Görüşme taranıyor: şikayetler, istekler, talimatlar ve değerler çıkarılıyor.</p>
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
          <Section title="Şikayetler & Belirtiler" items={summary.patientChiefComplaints} glyph="bg-sys-pink" Icon={HeartPulse} empty="Belirtilen bir şikayet yok." />
          <Section title="İstek & Talepler" items={summary.patientNeedsAndRequests} glyph="bg-sys-orange" Icon={Coffee} empty="Özel bir istek yok." />
          <Section title="İletilen Bilgi & Talimatlar" items={summary.clinicalInstructions} glyph="bg-sys-green" Icon={CheckCircle2} empty="Kayıtlı talimat yok." />
          <Section title="Ölçüm, İlaç & Değerler" items={summary.vitalSignsAndDosages} glyph="bg-sys-yellow" Icon={Pill} chips />
          <Section title="Takip Adımları" items={summary.actionItems} glyph="bg-sys-indigo" Icon={ListChecks} />
        </div>
      ) : (
        <div className="py-16 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-[20px] bg-accent-soft text-accent flex items-center justify-center mb-4">
            <FileText className="w-7 h-7" strokeWidth={2} />
          </div>
          <p className="text-[18px] font-semibold">Henüz özet yok</p>
          <p className="text-[14px] text-label-2 max-w-xs mt-1 mb-5">Konuşmayı yapay zekâ ile analiz ederek özet çıkarın.</p>
          <button type="button" onClick={() => void engine.generateSummary()} className="pressable btn-primary h-11 px-6 rounded-full inline-flex items-center gap-2 text-[15px] font-semibold cursor-pointer">
            <Sparkles className="w-4 h-4" strokeWidth={2.25} />
            Özeti Oluştur
          </button>
        </div>
      )}
    </Sheet>
  );
}
