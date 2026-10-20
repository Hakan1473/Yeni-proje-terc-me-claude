import { BookOpen, Check, ChevronRight, Clock, Hash, Lock, Monitor, Moon, Play, ShieldCheck, Square, Sun, Wind, Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TUTORIAL_VIDEOS } from '../../../shared/tutorials';
import type { Pace, TutorialKind, VoiceName } from '../../../shared/types';
import { clearConversations } from '../../lib/history';
import { loadSettings, saveSettings, type Theme } from '../../lib/settings';
import { useStore } from '../../lib/store';
import { VideoSources } from '../Conversation';
import { engine } from '../../live/engine';
import { SectionFooter, SectionHeader, Segmented, Sheet } from '../ui';

const VOICES: { id: VoiceName; female: boolean; tone: string; about: string }[] = [
  { id: 'Zephyr', female: true, tone: 'Açık, şefkatli, akıcı', about: 'Sıcak ve sakinleştirici; hasta başında varsayılan.' },
  { id: 'Kore', female: true, tone: 'Sakin, dengeli', about: 'Tane tane konuşan, profesyonel ses.' },
  { id: 'Aoede', female: true, tone: 'Yumuşak, melodik', about: 'Duyguyu en doğal aktaran ses.' },
  { id: 'Puck', female: false, tone: 'Samimi, enerjik', about: 'Anlaşılırlığı yüksek genç erkek sesi.' },
  { id: 'Charon', female: false, tone: 'Derin, net', about: 'Klinik bilgiyi açıkça aktaran tok ses.' },
  { id: 'Fenrir', female: false, tone: 'İfadeli, belirgin', about: 'Gürültülü ortamda bile belirgin.' },
];

const PACE: { id: Pace; label: string; about: string }[] = [
  { id: 'fast', label: 'Hızlı', about: 'Kısa sessizlikte çevirir. Akıcı konuşan hastalar için en hızlı yanıt.' },
  { id: 'balanced', label: 'Dengeli', about: 'Çoğu görüşme için önerilen ayar.' },
  { id: 'patient', label: 'Sabırlı', about: 'Uzun duraklamaları bekler. Yaşlı, ağrılı veya nefesi kesilen hastalar için.' },
];

type Tab = 'voice' | 'appearance' | 'privacy' | 'guide';

export function SettingsSheet({
  onClose,
  theme,
  onTheme,
  onGuide,
  onHistory,
}: {
  onClose: () => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
  onGuide: () => void;
  onHistory: () => void;
}) {
  const voice = useStore(engine.store, (s) => s.voice);
  const pace = useStore(engine.store, (s) => s.pace);
  const [tab, setTab] = useState<Tab>('voice');
  const [testing, setTesting] = useState<VoiceName | null>(null);
  const [video, setVideo] = useState<TutorialKind | null>(null);
  const [retention, setRetention] = useState(loadSettings().retentionDays);
  const [confirmClear, setConfirmClear] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => audio.current?.pause(), []);

  const preview = (id: VoiceName) => {
    audio.current?.pause();
    if (testing === id) {
      setTesting(null);
      return;
    }
    const a = new Audio(`/audio/voices/${id.toLowerCase()}.m4a`);
    audio.current = a;
    a.onended = () => setTesting(null);
    a.onerror = () => setTesting(null);
    setTesting(id);
    void a.play().catch(() => setTesting(null));
  };

  return (
    <Sheet
      onClose={onClose}
      title="Ayarlar"
      subtitle="Ses, görünüm, gizlilik ve kılavuz"
      width="sm:max-w-2xl"
      tall
      footer={
        <>
          <span className="flex-1 text-[12px] text-label-3">Canlı Sesli Tercüman 3.0</span>
          <button type="button" onClick={onClose} className="pressable btn-primary h-9 px-5 rounded-full text-[15px] font-semibold cursor-pointer">
            Bitti
          </button>
        </>
      }
    >
      <div className="sheet-sticky sticky top-0 z-10 pb-4">
        <Segmented
          label="Ayar bölümleri"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'voice', label: 'Ses' },
            { id: 'appearance', label: 'Görünüm' },
            { id: 'privacy', label: 'Gizlilik' },
            { id: 'guide', label: 'Kılavuz' },
          ]}
        />
      </div>

      {tab === 'voice' && (
        <div className="anim-fade space-y-7">
          <div>
            <SectionHeader>Tercüman sesi</SectionHeader>
            <div className="group-list">
              {VOICES.map((v) => (
                <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                  <button type="button" onClick={() => engine.setVoice(v.id)} aria-pressed={voice === v.id} className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer">
                    <span
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-[16px] font-semibold text-white shrink-0 ${
                        v.female ? 'bg-[linear-gradient(160deg,#ff8fa3,#ff2d55)]' : 'bg-[linear-gradient(160deg,#7ab8ff,#0071e3)]'
                      }`}
                    >
                      {v.id[0]}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-1.5">
                        <span className="text-[16px] font-medium tracking-[-0.016em]">{v.id}</span>
                        <span className="text-[12px] text-label-2">{v.female ? 'Kadın' : 'Erkek'}</span>
                      </span>
                      <span className="block text-[13px] text-label-2 truncate">{v.tone}</span>
                      <span className="block text-[12px] text-label-3 truncate">{v.about}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => preview(v.id)}
                    aria-label={testing === v.id ? 'Örneği durdur' : `${v.id} örneğini dinle`}
                    className={`pressable w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-pointer ${testing === v.id ? 'btn-primary' : 'btn-tinted'}`}
                  >
                    {testing === v.id ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                  </button>
                  <span className="w-5 flex justify-center shrink-0">{voice === v.id && <Check className="w-5 h-5 text-accent" strokeWidth={2.75} />}</span>
                </div>
              ))}
            </div>
            <SectionFooter>Görüşme sırasında değiştirilirse sonraki cümle kesintisiz olarak yeni sesle söylenir.</SectionFooter>
          </div>

          <div>
            <SectionHeader>Yanıt hızı</SectionHeader>
            <div className="group-list p-3">
              <Segmented label="Yanıt hızı" value={pace} onChange={(p) => engine.setPace(p)} items={PACE.map((p) => ({ id: p.id, label: p.label }))} />
              <p className="mt-2.5 px-1 text-[13px] text-label-2 leading-snug">{PACE.find((p) => p.id === pace)?.about}</p>
            </div>
            <SectionFooter>Konuşan sustuktan sonra çevirinin ne kadar beklemeden başlayacağını belirler.</SectionFooter>
          </div>
        </div>
      )}

      {tab === 'appearance' && (
        <div className="anim-fade space-y-7">
          <div>
            <SectionHeader>Görünüm</SectionHeader>
            <div className="group-list px-3 sm:px-6 pt-5 pb-4 grid grid-cols-3 gap-3 sm:gap-6">
              {(
                [
                  ['system', 'Otomatik', Monitor],
                  ['light', 'Açık', Sun],
                  ['dark', 'Koyu', Moon],
                ] as const
              ).map(([id, label, Icon]) => {
                const active = theme === id;
                return (
                  <button key={id} type="button" onClick={() => onTheme(id)} aria-pressed={active} className="group flex flex-col items-center gap-2.5 cursor-pointer">
                    <span
                      className={`relative w-full max-w-[120px] aspect-[3/4] rounded-[16px] overflow-hidden p-2 flex flex-col gap-1.5 ${
                        id === 'dark' ? 'bg-black' : id === 'light' ? 'bg-[#f2f2f7]' : 'bg-[linear-gradient(135deg,#f2f2f7_50%,#000_50%)]'
                      } ${active ? 'ring-[3px] ring-accent' : 'ring-1 ring-separator group-hover:ring-label-3'}`}
                    >
                      <span className="mt-auto mx-auto w-8 h-8 rounded-full bg-[#007aff]" />
                      <span className={`h-6 rounded-[8px] ${id === 'dark' ? 'bg-[#1c1c1e]' : 'bg-white'} ${id === 'system' ? 'opacity-80' : ''}`} />
                    </span>
                    <span className="text-[14px] font-medium inline-flex items-center gap-1.5">
                      <Icon className="w-4 h-4" strokeWidth={2} />
                      {label}
                    </span>
                    <span className={`w-[22px] h-[22px] rounded-full flex items-center justify-center ${active ? 'bg-accent text-white' : 'ring-[1.5px] ring-label-3'}`}>
                      {active && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <SectionFooter>Otomatik, cihazın açık/koyu ayarını izler. Koyu görünüm gece nöbetleri ve loş hasta odaları için idealdir.</SectionFooter>
          </div>
        </div>
      )}

      {tab === 'privacy' && (
        <div className="anim-fade space-y-7">
          <div>
            <SectionHeader>Konuşma geçmişi</SectionHeader>
            <div className="group-list">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onHistory();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-fill-2"
              >
                <span className="glyph w-[29px] h-[29px] bg-sys-indigo">
                  <Clock className="w-4 h-4" strokeWidth={2.25} />
                </span>
                <span className="flex-1 text-[16px]">Geçmiş konuşmaları aç</span>
                <ChevronRight className="w-4 h-4 text-label-3" strokeWidth={2.5} />
              </button>
              <div className="px-4 py-3">
                <p className="text-[16px] mb-2">Otomatik silme</p>
                <Segmented
                  label="Otomatik silme"
                  value={String(retention) as '0' | '1' | '7' | '30'}
                  onChange={(v) => {
                    const days = Number(v);
                    setRetention(days);
                    saveSettings({ retentionDays: days });
                  }}
                  items={[
                    { id: '1', label: '1 gün' },
                    { id: '7', label: '7 gün' },
                    { id: '30', label: '30 gün' },
                    { id: '0', label: 'Asla' },
                  ]}
                />
              </div>
              <div className="px-4 py-3">
                {confirmClear ? (
                  <div className="flex items-center gap-2 anim-fade">
                    <span className="flex-1 text-[14px] text-sys-red font-medium">Tüm kayıtlar kalıcı olarak silinsin mi?</span>
                    <button type="button" onClick={() => setConfirmClear(false)} className="pressable btn-gray h-8 px-3 rounded-full text-[13px] font-medium cursor-pointer">
                      Vazgeç
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await clearConversations();
                        window.dispatchEvent(new Event('history-changed'));
                        engine.resetConversation();
                        setConfirmClear(false);
                      }}
                      className="pressable h-8 px-3 rounded-full text-[13px] font-semibold bg-sys-red text-white cursor-pointer"
                    >
                      Hepsini Sil
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmClear(true)} className="w-full text-center text-[16px] text-sys-red cursor-pointer">
                    Tüm Konuşmaları Sil
                  </button>
                )}
              </div>
            </div>
            <SectionFooter>Konuşmalar yalnızca bu cihazda saklanır. Hasta verisi içerdiği için paylaşımlı cihazlarda kısa bir süre seçin.</SectionFooter>
          </div>

          <div>
            <SectionHeader>Güvenlik</SectionHeader>
            <div className="group-list">
              {(
                [
                  [ShieldCheck, 'bg-sys-green', 'Konuşmanın içindeki komutlar ("talimatları unut" gibi) yapay zekâya talimat olarak değil, çevrilecek söz olarak işlenir.'],
                  [Hash, 'bg-sys-orange', 'Kaynak ve çevirideki sayılar karşılaştırılır; doz veya değer farklıysa kartta uyarı çıkar.'],
                  [Lock, 'bg-accent', 'Ses ve metin yalnızca çeviri için Gemini API’ye gönderilir; kayıtlar sunucuda tutulmaz.'],
                ] as const
              ).map(([Icon, glyph, text]) => (
                <div key={text} className="flex items-start gap-3 px-4 py-3">
                  <span className={`glyph w-[29px] h-[29px] mt-0.5 ${glyph}`}>
                    <Icon className="w-4 h-4" strokeWidth={2.25} />
                  </span>
                  <p className="text-[14px] text-label-2 leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'guide' && (
        <div className="anim-fade space-y-7">
          <div>
            <SectionHeader>Başlarken</SectionHeader>
            <div className="group-list">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onGuide();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-fill-2"
              >
                <span className="glyph w-[29px] h-[29px] bg-accent">
                  <BookOpen className="w-4 h-4" strokeWidth={2.25} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[16px]">Hızlı Başlangıç Rehberi</span>
                  <span className="block text-[13px] text-label-2 truncate">Dil seçimi, iki yönlü konuşma, anamnez, videolar</span>
                </span>
                <ChevronRight className="w-4 h-4 text-label-3" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <div>
            <SectionHeader>Videolu eğitimler</SectionHeader>
            <div className="group-list">
              {(
                [
                  ['nurse_call', Bell, 'bg-sys-red', '"Bir şeye ihtiyacınız olursa çağrı butonuna basın" dendiğinde kullanım videosu açılır.'],
                  ['triflow', Wind, 'bg-sys-teal', '"Triflow ile saatte bir derin nefes çekin" talimatında doğru teknik gösterilir.'],
                ] as const
              ).map(([kind, Icon, glyph, desc]) => (
                <div key={kind} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`glyph w-[29px] h-[29px] ${glyph}`}>
                      <Icon className="w-4 h-4" strokeWidth={2.25} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[16px]">{TUTORIAL_VIDEOS[kind].title}</span>
                      <span className="block text-[13px] text-label-2 leading-snug">{desc}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setVideo(video === kind ? null : kind)}
                      className={`pressable h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium cursor-pointer shrink-0 ${video === kind ? 'btn-gray' : 'btn-tinted'}`}
                    >
                      {video === kind ? 'Kapat' : 'İzle'}
                    </button>
                  </div>
                  {video === kind && (
                    // biome-ignore lint/a11y/useMediaCaption: silent demonstration video
                    <video controls autoPlay playsInline className="anim-fade mt-3 w-full rounded-[12px] bg-black aspect-video object-contain">
                      <VideoSources kind={kind} />
                    </video>
                  )}
                </div>
              ))}
            </div>
            <SectionFooter>Personel cihazı veya butonu anlattığında sistem bunu algılar ve konuşma kartının altında videolu rehber gösterir.</SectionFooter>
          </div>
        </div>
      )}
    </Sheet>
  );
}
