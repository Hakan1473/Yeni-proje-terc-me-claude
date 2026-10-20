import { ArrowUpRight, Check, ChevronLeft, Clock, Copy, Search, Sparkles, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getLanguage } from '../../../shared/languages';
import { factText } from '../../../shared/medical/anamnesis';
import { fold } from '../../../shared/text';
import type { ConversationRecord, Turn } from '../../../shared/types';
import { clearConversations, deleteConversation, listConversations } from '../../lib/history';
import { useStore } from '../../lib/store';
import { engine } from '../../live/engine';
import { copyText, Flag, SectionHeader, Sheet } from '../ui';

const date = (ts: number) =>
  new Date(ts).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function useHistory() {
  const [records, setRecords] = useState<ConversationRecord[]>([]);
  useEffect(() => {
    const load = () => void listConversations().then(setRecords);
    load();
    window.addEventListener('history-changed', load);
    return () => window.removeEventListener('history-changed', load);
  }, []);
  return records;
}

function transcript(r: ConversationRecord): string {
  const lang = getLanguage(r.languageCode);
  const lines = [`HASTA GÖRÜŞME KAYDI (${lang.nameTr} · ${date(r.createdAt)})`, ''];
  if (r.summary) lines.push('— ÖZET —', r.summary.briefSummaryTr, '');
  if (r.facts?.length) {
    lines.push('— ANAMNEZ —');
    for (const f of r.facts) lines.push(`• ${factText(f)}`);
    lines.push('');
  }
  lines.push('— DİYALOG —');
  for (const t of r.items.filter((i): i is Turn => i.kind === 'turn')) {
    lines.push(`[${t.speaker === 'nurse' ? 'Hemşire (TR)' : `Hasta (${lang.nameTr})`}] ${t.source}`);
    if (t.translation) lines.push(`   → ${t.translation}`);
  }
  return lines.join('\n');
}

export function HistorySheet({ onClose }: { onClose: () => void }) {
  const records = useHistory();
  const currentId = useStore(engine.store, (s) => s.conversationId);
  const [selected, setSelected] = useState<ConversationRecord | null>(null);
  const [query, setQuery] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const q = fold(query.trim());
  const filtered = q
    ? records.filter((r) => {
        const lang = getLanguage(r.languageCode);
        const hay = [lang.nameTr, lang.name, r.preview, r.summary?.briefSummaryTr ?? '', ...(r.facts ?? []).map((f) => f.text)];
        for (const i of r.items) if (i.kind === 'turn') hay.push(i.source, i.translation ?? '');
        return hay.some((h) => fold(h).includes(q));
      })
    : records;

  const remove = async (id: string) => {
    await deleteConversation(id);
    window.dispatchEvent(new Event('history-changed'));
    if (id === currentId) engine.resetConversation();
    setConfirmId(null);
    if (selected?.id === id) setSelected(null);
  };

  if (selected) {
    const lang = getLanguage(selected.languageCode);
    const turns = selected.items.filter((i): i is Turn => i.kind === 'turn');
    return (
      <Sheet
        onClose={onClose}
        width="sm:max-w-2xl"
        tall
        leading={
          <button type="button" onClick={() => setSelected(null)} aria-label="Listeye dön" className="pressable -ml-1 w-[30px] h-[30px] rounded-full bg-fill text-accent flex items-center justify-center shrink-0 cursor-pointer">
            <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
          </button>
        }
        title={`${lang.nameTr} görüşmesi`}
        subtitle={<span className="tabular">{date(selected.createdAt)} · {turns.length} konuşma</span>}
        trailing={
          <button
            type="button"
            onClick={async () => {
              if (await copyText(transcript(selected))) {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }
            }}
            className={`pressable h-[30px] px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium cursor-pointer ${copied ? 'bg-sys-green/15 text-sys-green' : 'btn-tinted'}`}
          >
            {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} /> : <Copy className="w-3.5 h-3.5" strokeWidth={2} />}
            <span className="hidden sm:inline">{copied ? 'Kopyalandı' : 'Kopyala'}</span>
          </button>
        }
      >
        <div className="anim-fade space-y-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                engine.restore(selected);
                onClose();
              }}
              className="pressable btn-primary flex-1 h-11 rounded-[12px] inline-flex items-center justify-center gap-2 text-[15px] font-semibold cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4" strokeWidth={2.5} />
              Ekrana Yükle
            </button>
            <button type="button" onClick={() => void remove(selected.id)} className="pressable h-11 px-4 rounded-[12px] bg-sys-red/10 text-sys-red inline-flex items-center gap-2 text-[15px] font-medium cursor-pointer">
              <Trash2 className="w-4 h-4" strokeWidth={2} />
              Sil
            </button>
          </div>

          {selected.summary && (
            <div>
              <SectionHeader>Özet</SectionHeader>
              <p className="group-list px-4 py-3 text-[15px] leading-relaxed">{selected.summary.briefSummaryTr}</p>
            </div>
          )}

          {!!selected.facts?.length && (
            <div>
              <SectionHeader>Anamnez</SectionHeader>
              <ul className="group-list">
                {selected.facts.map((f) => (
                  <li key={f.key} className={`px-4 py-2.5 text-[15px] ${f.negated ? 'text-label-2' : f.category === 'allergy' ? 'text-sys-red font-semibold' : ''}`}>
                    {factText(f)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <SectionHeader>Diyalog</SectionHeader>
            <div className="space-y-2.5">
              {turns.map((t) => {
                const nurse = t.speaker === 'nurse';
                return (
                  <div key={t.id} className={`flex flex-col ${nurse ? 'items-end' : 'items-start'}`}>
                    <span className="flex items-center gap-1.5 mb-1 px-2 text-[12px] font-medium text-label-2">
                      <Flag iso={nurse ? 'tr' : lang.flag} label={nurse ? 'Türkçe' : lang.nameTr} size="xs" />
                      {nurse ? 'Hemşire' : 'Hasta'}
                    </span>
                    <div className={`max-w-[88%] rounded-[18px] px-4 py-2.5 ${nurse ? 'bg-accent text-white rounded-br-[6px]' : 'bg-surface rounded-bl-[6px] shadow-card'}`}>
                      <p dir="auto" className="text-[15px] leading-snug">
                        {t.source}
                      </p>
                      {t.translation && (
                        <p dir="auto" className={`mt-1.5 pt-1.5 text-[14px] leading-snug border-t ${nurse ? 'border-white/25 text-white/85' : 'border-separator text-label-2'}`}>
                          {t.translation}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      onClose={onClose}
      title="Geçmiş Konuşmalar"
      subtitle={`${records.length} görüşme · yalnızca bu cihazda`}
      width="sm:max-w-2xl"
      tall
      footer={
        records.length > 0 ? (
          confirmAll ? (
            <div className="w-full flex items-center gap-2 anim-fade">
              <span className="flex-1 text-[13px] text-sys-red font-medium">Tümü kalıcı olarak silinsin mi?</span>
              <button type="button" onClick={() => setConfirmAll(false)} className="pressable btn-gray h-8 px-3.5 rounded-full text-[13px] font-medium cursor-pointer">
                Vazgeç
              </button>
              <button
                type="button"
                onClick={async () => {
                  await clearConversations();
                  window.dispatchEvent(new Event('history-changed'));
                  engine.resetConversation();
                  setConfirmAll(false);
                }}
                className="pressable h-8 px-3.5 rounded-full text-[13px] font-semibold bg-sys-red text-white cursor-pointer"
              >
                Hepsini Sil
              </button>
            </div>
          ) : (
            <div className="w-full flex items-center justify-between">
              <span className="text-[13px] text-label-2 tabular">{records.length} kayıt</span>
              <button type="button" onClick={() => setConfirmAll(true)} className="pressable h-8 px-3 rounded-full text-[13px] font-medium text-sys-red hover:bg-sys-red/10 inline-flex items-center gap-1.5 cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                Tümünü Temizle
              </button>
            </div>
          )
        ) : undefined
      }
    >
      {records.length > 0 && (
        <div className="sheet-sticky sticky top-0 z-10 pb-3">
          <label className="relative flex items-center">
            <Search className="w-4 h-4 text-label-2 absolute left-3 pointer-events-none" strokeWidth={2.25} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Metin, şikayet, ilaç veya dil ara"
              className="field w-full h-10 pl-9 pr-9 text-[16px]"
              aria-label="Geçmişte ara"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Aramayı temizle" className="absolute right-2.5 w-5 h-5 rounded-full bg-label-3 text-bg flex items-center justify-center cursor-pointer">
                <X className="w-3 h-3" strokeWidth={3} />
              </button>
            )}
          </label>
        </div>
      )}

      {records.length === 0 ? (
        <div className="py-16 flex flex-col items-center text-center px-6">
          <div className="w-16 h-16 rounded-[20px] bg-sys-indigo/12 text-sys-indigo flex items-center justify-center mb-4">
            <Clock className="w-7 h-7" strokeWidth={2} />
          </div>
          <p className="text-[18px] font-semibold">Kayıtlı görüşme yok</p>
          <p className="text-[14px] text-label-2 max-w-xs mt-1 leading-relaxed">Hastayla konuştuğunuzda görüşmeler burada otomatik olarak arşivlenir.</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-12 text-[14px] text-label-2">“{query}” ile eşleşen görüşme yok.</p>
      ) : (
        <div className="group-list">
          {filtered.map((r) => {
            const lang = getLanguage(r.languageCode);
            const turns = r.items.filter((i) => i.kind === 'turn').length;
            return (
              <div key={r.id} className="flex items-start gap-3 pl-4 pr-2 py-3 hover:bg-fill-2">
                <button type="button" onClick={() => setSelected(r)} className="flex items-start gap-3 flex-1 min-w-0 text-left cursor-pointer">
                  <span className="mt-0.5">
                    <Flag iso={lang.flag} label={lang.nameTr} size="md" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[16px] font-semibold truncate">
                        {lang.nameTr}
                        {r.id === currentId && <span className="ml-2 text-[12px] font-medium text-accent">Açık</span>}
                      </span>
                      <span className="text-[13px] text-label-2 tabular shrink-0">{date(r.updatedAt)}</span>
                    </span>
                    <span className="block text-[14px] text-label-2 leading-snug line-clamp-2 mt-0.5">{r.preview}</span>
                    <span className="mt-1 flex items-center gap-2 text-[12px] text-label-3">
                      <span className="tabular">{turns} konuşma</span>
                      {!!r.facts?.length && <span className="tabular">· {r.facts.length} anamnez bilgisi</span>}
                      {r.summary && (
                        <span className="inline-flex items-center gap-1 text-accent-ink font-medium">
                          <Sparkles className="w-3 h-3" strokeWidth={2.25} />
                          Özet
                        </span>
                      )}
                    </span>
                  </span>
                </button>
                {confirmId === r.id ? (
                  <span className="flex items-center gap-1 anim-fade pt-0.5">
                    <button type="button" onClick={() => setConfirmId(null)} className="pressable h-7 px-2.5 rounded-full btn-gray text-[12px] font-medium cursor-pointer">
                      Vazgeç
                    </button>
                    <button type="button" onClick={() => void remove(r.id)} className="pressable h-7 px-2.5 rounded-full bg-sys-red text-white text-[12px] font-semibold cursor-pointer">
                      Sil
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(r.id)}
                    aria-label="Bu görüşmeyi sil"
                    className="pressable w-8 h-8 rounded-full text-label-3 hover:text-sys-red hover:bg-sys-red/10 flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={2} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
