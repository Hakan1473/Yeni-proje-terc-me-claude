import { ArrowsClockwise, CaretLeft } from '@phosphor-icons/react';
import { ArrowLeftRight, Check, ChevronLeft, CircleAlert, Hash, Lock, MicOff, Send, WifiOff, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { LANGUAGES } from '../../shared/languages';
import { TUTORIAL_VIDEOS } from '../../shared/tutorials';
import type { TutorialKind, Turn } from '../../shared/types';
import { checkAccess } from '../lib/api';
import { patientHint } from '../lib/patientHints';
import { setAccessCode } from '../lib/settings';
import { useStore } from '../lib/store';
import { engine } from '../live/engine';
import { VideoSources } from './Conversation';
import { DockKey } from './Dock';
import { Orb, OrbArt } from './Orb';
import { Flag, Sheet } from './ui';

// ───────────────────────── Toast ─────────────────────────

export function Toast() {
  const toast = useStore(engine.store, (s) => s.toast);
  const online = useStore(engine.store, (s) => s.online);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => engine.dismissToast(), toast.kind === 'mic' ? 9000 : 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const shown = !online ? { kind: 'offline' as const, text: 'İnternet bağlantısı yok. Tercüme için bağlantı gerekli.', id: -1 } : toast;
  if (!shown) return null;
  const Icon = shown.kind === 'offline' ? WifiOff : shown.kind === 'mic' ? MicOff : CircleAlert;
  const tint = shown.kind === 'offline' ? 'bg-sys-orange' : shown.kind === 'info' ? 'bg-accent' : 'bg-sys-red';
  return (
    <div role="alert" key={shown.id} className="anim-toast fixed left-1/2 z-[60] w-[calc(100%-24px)] max-w-md" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 10px)', transform: 'translateX(-50%)' }}>
      <div className="flex items-center gap-3 pl-3 pr-2 py-2 rounded-[18px] material shadow-float">
        <span className={`glyph w-8 h-8 rounded-full ${tint}`}>
          <Icon className="w-4 h-4" strokeWidth={2.25} />
        </span>
        <p className="flex-1 text-[13px] leading-snug font-medium">{shown.text}</p>
        {shown.id !== -1 && (
          <button type="button" onClick={() => engine.dismissToast()} aria-label="Kapat" className="pressable w-7 h-7 rounded-full bg-fill text-label-2 flex items-center justify-center shrink-0 cursor-pointer">
            <X className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Typed message ─────────────────────────

export function TypeSheet({ onClose }: { onClose: () => void }) {
  const language = useStore(engine.store, (s) => s.language);
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    void engine.sendTyped(text);
    setText('');
    onClose();
  };
  return (
    <Sheet onClose={onClose} title="Yazarak Çevir" subtitle={`Türkçe yazın → ${language.nameTr} · veya hastanın dilinde yazın → Türkçe`} width="sm:max-w-lg">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <textarea
          // biome-ignore lint/a11y/noAutofocus: the sheet exists only to type
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) submit(e);
          }}
          rows={4}
          dir="auto"
          placeholder="Örn. İlacınızı yemekten sonra alın."
          className="field w-full p-3 text-[17px] leading-snug resize-none"
        />
        <button type="submit" disabled={!text.trim()} className="pressable btn-primary h-11 rounded-[12px] inline-flex items-center justify-center gap-2 text-[15px] font-semibold cursor-pointer disabled:opacity-40">
          <Send className="w-4 h-4" strokeWidth={2.25} />
          Çevir ve Seslendir
        </button>
        <p className="text-[13px] text-label-2 leading-snug">Gürültülü ortamlarda veya mikrofon kullanılamadığında: çeviri karta eklenir ve seçili sesle okunur.</p>
      </form>
    </Sheet>
  );
}

// ───────────────────────── Face to face ─────────────────────────

/**
 * Two halves facing each other across the bed, like Apple Translate's
 * face-to-face mode: the top half is turned towards the patient.
 */
export function FaceToFace({ onClose, initialVideo = null }: { onClose: () => void; initialVideo?: TutorialKind | null }) {
  const items = useStore(engine.store, (s) => s.items);
  const language = useStore(engine.store, (s) => s.language);
  const [flipped, setFlipped] = useState(true);
  const [video, setVideo] = useState<TutorialKind | null>(initialVideo);
  const last = [...items].reverse().find((i): i is Turn => i.kind === 'turn' && !!(i.source || i.translation));

  // The patient half always shows the patient's language, the staff half Turkish
  const patientText = last ? (last.speaker === 'nurse' ? last.translation : last.source) : undefined;
  const staffText = last ? (last.speaker === 'nurse' ? last.source : last.translation) : undefined;

  // Teaching that starts while this screen is open brings its video up for the patient
  const lastTutorial = last?.tutorial && last.status === 'done' ? `${last.id}:${last.tutorial}` : null;
  const seen = useRef(lastTutorial);
  useEffect(() => {
    if (!lastTutorial || lastTutorial === seen.current) return;
    seen.current = lastTutorial;
    setVideo(last?.tutorial ?? null);
  }, [lastTutorial, last?.tutorial]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const half = (text: string | undefined, label: ReactNode, placeholder: string, tone: string) => (
    <div className="flex-1 min-h-0 flex flex-col px-6 sm:px-12 py-6">
      <div className="text-[13px] font-semibold text-label-2 flex items-center gap-2">{label}</div>
      <div className="flex-1 min-h-0 flex items-center overflow-y-auto">
        {text ? (
          <p dir="auto" key={text} className={`w-full text-[clamp(26px,5.2vw,52px)] leading-[1.18] font-semibold tracking-[-0.025em] balance anim-fade ${tone}`}>
            {text}
          </p>
        ) : (
          <p dir="auto" className="w-full max-w-[34ch] text-[clamp(20px,3.2vw,30px)] leading-[1.3] font-medium tracking-[-0.018em] text-label-2 balance">
            {placeholder}
          </p>
        )}
      </div>
    </div>
  );

  const patientLabel = (
    <>
      <Flag iso={language.flag} label={language.nameTr} size="xs" />
      <span dir="auto">{language.native}</span>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 isolate flex flex-col pt-safe pb-safe anim-fade" role="dialog" aria-modal="true" aria-label="Hastaya göster">
      <div className="ambient" aria-hidden="true" />
      <div className={`flex-1 min-h-0 flex flex-col ${flipped ? 'rotate-180' : ''} transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]`}>
        {video ? (
          <div className="flex-1 min-h-0 flex flex-col px-4 sm:px-10 py-4 gap-3 anim-fade">
            <div className="text-[13px] font-semibold text-label-2 flex items-center gap-2">{patientLabel}</div>
            <figure key={video} className="video-stage flex-1 min-h-0">
              <video autoPlay muted loop playsInline disablePictureInPicture className="w-full h-full object-contain pointer-events-none">
                <VideoSources kind={video} />
              </video>
              <figcaption className="video-caption">
                <span className="min-w-0">
                  <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/70">Eğitim videosu</span>
                  <span className="block text-[17px] font-semibold text-white leading-snug truncate">{TUTORIAL_VIDEOS[video].title}</span>
                </span>
                <button type="button" onClick={() => setVideo(null)} aria-label="Videoyu kapat" className="video-close pressable cursor-pointer">
                  <X className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </figcaption>
            </figure>
          </div>
        ) : (
          half(patientText, patientLabel, patientHint(language.code), 'text-patient')
        )}
      </div>

      <div className="relative shrink-0 flex items-center justify-center px-4 py-2">
        <span className="absolute inset-x-0 top-1/2 h-px bg-separator" aria-hidden="true" />
        <nav aria-label="Karşılıklı görünüm kontrolleri" className="dock relative">
          <DockKey icon={CaretLeft} label="Kapat" onClick={onClose} />
          <span className="dock-orb">
            <Orb size={64} />
          </span>
          <DockKey icon={ArrowsClockwise} label="Çevir" tone={flipped ? 'accent' : undefined} pressed={flipped} onClick={() => setFlipped((f) => !f)} />
        </nav>
      </div>
      {half(
        staffText,
        <>
          <Flag iso="tr" label="Türkçe" size="xs" />
          Türkçe · Personel
        </>,
        video
          ? 'Üst yarıda hastaya eğitim videosu oynatılıyor. Videoyu kapatınca çeviriler yeniden görünür.'
          : 'Konuştuğunuzda çeviri burada büyük yazıyla görünür. Üst yarı hastaya döner ve ona aynı açıklamayı kendi dilinde gösterir.',
        'text-label',
      )}
    </div>
  );
}

// ───────────────────────── Onboarding ─────────────────────────

const STEPS: { title: string; body: string; glyph: string; visual: ReactNode }[] = [
  {
    title: 'Hastanın dilini seçin',
    body: 'Üstteki dil çubuğundan tek dokunuşla seçin; listede yoksa "Tüm Diller"den 60 dil arasında arayın. Seçim hatırlanır.',
    glyph: 'bg-accent',
    visual: (
      <div className="flex flex-wrap justify-center gap-2">
        {LANGUAGES.slice(0, 4).map((l, i) => (
          <span key={l.code} className={`h-8 pl-2 pr-3 rounded-full inline-flex items-center gap-1.5 text-[13px] ${i === 0 ? 'bg-label text-bg font-semibold' : 'bg-surface shadow-card font-medium'}`}>
            <Flag iso={l.flag} label={l.nameTr} size="xs" />
            {l.nameTr.split(' ')[0]}
          </span>
        ))}
      </div>
    ),
  },
  {
    title: 'Dokunun ve konuşun',
    body: 'Mikrofona dokunduğunuzda canlı hat açılır. Türkçe konuşan personel, diğer dilde konuşan hasta olarak ayrılır; çeviri doğal bir sesle anında okunur.',
    glyph: 'bg-sys-green',
    visual: (
      <OrbArt size={72} />
    ),
  },
  {
    title: 'Görüşmeyi durdurmadan dil değiştirin',
    body: 'Hasta yakını başka bir dilde konuşursa yeni dile dokunun; hat kesilmeden geçiş yapılır, kayıtlar korunur.',
    glyph: 'bg-sys-orange',
    visual: (
      <div className="flex items-center justify-center gap-3">
        <Flag iso="gb" label="İngilizce" size="lg" />
        <ArrowLeftRight className="w-5 h-5 text-label-3" strokeWidth={2.5} />
        <Flag iso="sa" label="Arapça" size="lg" />
      </div>
    ),
  },
  {
    title: 'Anamnez kendiliğinden oluşur',
    body: 'Şikayetler, ilaçlar (dozuyla), alerjiler, kronik hastalıklar, ameliyatlar, alışkanlıklar ve istekler konuşurken ayrıştırılır. "Alerjim yok" gibi yanıtlar ayrı gösterilir. Yanlış bir maddeyi hastayla teyit edip sola kaydırarak silebilirsiniz.',
    glyph: 'bg-sys-indigo',
    visual: (
      <div className="grid grid-cols-2 gap-2 text-left">
        {[
          ['Alerjiler', 'Penisilin', 'bg-sys-red'],
          ['İlaçlar', 'Beloc (metoprolol) 50 mg', 'bg-sys-green'],
          ['Şikayetler', 'Göğüs ağrısı (2 gündür)', 'bg-sys-pink'],
          ['Kronik', 'Tip 2 diyabet', 'bg-sys-purple'],
        ].map(([k, v, dot]) => (
          <div key={k} className="rounded-[12px] bg-surface shadow-card px-3 py-2">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-label-2">
              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              {k}
            </span>
            <span className="block text-[13px] font-medium leading-snug">{v}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Sayılar iki kez kontrol edilir',
    body: 'Doz, tansiyon, ateş gibi değerler kaynak ve çeviride karşılaştırılır. "500 mg" çeviride "50 mg" olursa kart turuncu uyarı gösterir.',
    glyph: 'bg-sys-orange',
    visual: (
      <div className="rounded-[14px] bg-sys-orange/12 px-4 py-3 text-[14px] text-left flex items-start gap-2">
        <Hash className="w-4 h-4 text-sys-orange mt-0.5 shrink-0" strokeWidth={2.5} />
        <span>
          <b>Sayıları kontrol edin.</b> Kaynakta 500, çeviride 50 geçiyor.
        </span>
      </div>
    ),
  },
  {
    title: 'Videolu eğitim ve Hastaya Göster',
    body: 'Çağrı butonunu veya Triflow cihazını anlattığınızda video kartı açılır. "Hastaya" düğmesi ekranı ikiye böler: üst yarı hastaya dönük büyük yazı gösterir.',
    glyph: 'bg-sys-teal',
    visual: (
      <div className="mx-auto w-[150px] h-[110px] rounded-[16px] bg-surface shadow-card overflow-hidden flex flex-col">
        <span className="flex-1 flex items-center justify-center rotate-180 text-[15px] font-semibold text-patient">Hello</span>
        <span className="h-px bg-separator" />
        <span className="flex-1 flex items-center justify-center text-[15px] font-semibold">Merhaba</span>
      </div>
    ),
  },
];

export function Onboarding({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  return (
    <Sheet
      onClose={onClose}
      title={<span className="text-[13px] font-medium text-label-2">Hızlı Başlangıç · {i + 1}/{STEPS.length}</span>}
      leading={
        i > 0 ? (
          <button type="button" onClick={() => setI(i - 1)} aria-label="Geri" className="pressable -ml-1 w-[30px] h-[30px] rounded-full bg-fill text-accent flex items-center justify-center cursor-pointer">
            <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
          </button>
        ) : undefined
      }
      width="sm:max-w-md"
      bodyClass="px-6 sm:px-8 pb-4"
      footer={
        <div className="w-full flex flex-col items-center gap-3 py-1">
          <button type="button" onClick={() => (last ? onClose() : setI(i + 1))} className="pressable btn-primary w-full h-[50px] rounded-[14px] text-[17px] font-semibold cursor-pointer">
            {last ? 'Başlayın' : 'Devam'}
          </button>
          <div className="flex items-center gap-2">
            {STEPS.map((s, idx) => (
              <button
                key={s.title}
                type="button"
                onClick={() => setI(idx)}
                aria-label={`Adım ${idx + 1}`}
                className={`h-[7px] rounded-full transition-all duration-300 cursor-pointer ${idx === i ? 'w-[22px] bg-label' : 'w-[7px] bg-label-3'}`}
              />
            ))}
          </div>
        </div>
      }
    >
      <div key={i} className="flex flex-col items-center text-center anim-rise">
        <h2 className="mt-1 text-[26px] font-bold tracking-[-0.03em] leading-tight balance">{step.title}</h2>
        <div className="w-full mt-6 rounded-[18px] bg-surface-2 dark:bg-surface-3/40 p-5">{step.visual}</div>
        <p className="mt-5 text-[16px] text-label-2 leading-relaxed text-left pretty">{step.body}</p>
      </div>
    </Sheet>
  );
}

// ───────────────────────── Access gate ─────────────────────────

/** Shown only when the server is configured with APP_ACCESS_CODE. */
export function AccessGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await checkAccess(code).catch(() => false);
    setBusy(false);
    if (ok) {
      setAccessCode(code);
      onUnlocked();
    } else setError(true);
  };
  return (
    <div className="fixed inset-0 z-[80] bg-bg flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm flex flex-col items-center text-center anim-pop">
        <span className="glyph w-14 h-14 rounded-[16px] bg-accent mb-5">
          <Lock className="w-6 h-6" strokeWidth={2.25} />
        </span>
        <h1 className="text-[24px] font-semibold tracking-[-0.025em]">Erişim kodu</h1>
        <p className="mt-1.5 text-[15px] text-label-2">Bu tercümanı kullanmak için kurumunuzun verdiği kodu girin.</p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(false);
          }}
          className={`field mt-6 w-full h-12 px-4 text-center text-[20px] tracking-[0.3em] ${error ? 'ring-2 ring-sys-red' : ''}`}
          aria-label="Erişim kodu"
        />
        {error && <p className="mt-2 text-[13px] text-sys-red">Kod hatalı.</p>}
        <button type="submit" disabled={!code || busy} className="pressable btn-primary mt-4 w-full h-12 rounded-[14px] text-[17px] font-semibold cursor-pointer disabled:opacity-40 inline-flex items-center justify-center gap-2">
          <Check className="w-5 h-5" strokeWidth={2.5} />
          Devam
        </button>
      </form>
    </div>
  );
}

