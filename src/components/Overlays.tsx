import { ArrowLeftRight, Check, ChevronLeft, CircleAlert, Hash, Lock, MicOff, RotateCw, Send, WifiOff, X } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { LANGUAGES } from '../../shared/languages';
import type { Turn } from '../../shared/types';
import { checkAccess } from '../lib/api';
import { setAccessCode } from '../lib/settings';
import { useStore } from '../lib/store';
import { engine } from '../live/engine';
import { Flag, Sheet } from './ui';
import { Orb, OrbArt } from './Orb';

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

// ───────────────────────── Splash ─────────────────────────

/** Brief launch moment; any tap skips it. */
export function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  const finish = (delay: number) => {
    setLeaving(true);
    setTimeout(() => done.current(), delay);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    const t = setTimeout(() => finish(450), 1100);
    return () => clearTimeout(t);
  }, []);
  const names = LANGUAGES.slice(0, 24).map((l) => l.native);

  return (
    <button
      type="button"
      onClick={() => finish(250)}
      aria-label="Uygulamaya geç"
      className={`fixed inset-0 z-[70] flex items-center justify-center bg-bg cursor-pointer overflow-hidden transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        leaving ? 'opacity-0 scale-[1.02] pointer-events-none' : ''
      }`}
    >
      <div aria-hidden="true" className="absolute inset-0 flex flex-wrap content-center justify-center gap-x-8 gap-y-4 p-6 opacity-[0.06] [mask-image:radial-gradient(ellipse_70%_50%_at_center,transparent_45%,#000_100%)]">
        {names.map((n) => (
          <span key={n} className="text-[34px] font-semibold tracking-[-0.03em] whitespace-nowrap">
            {n}
          </span>
        ))}
      </div>
      <div className="relative flex flex-col items-center text-center px-8 anim-pop">
        <div className="relative">
          <img src="/logo.png" alt="" className="relative w-[108px] h-[108px] rounded-[26px] bg-white shadow-[0_20px_50px_-12px_rgb(0_0_0/0.3)]" />
        </div>
        <h1 className="mt-7 text-[30px] font-semibold tracking-[-0.03em]">Canlı Sesli Tercüman</h1>
        <p className="mt-2 text-[16px] text-label-2">Sağlık personeli ve hasta için iki yönlü iletişim.</p>
        <span className="mt-7 w-24 h-[3px] rounded-full bg-fill overflow-hidden">
          <span className="block w-full h-full bg-accent anim-progress" />
        </span>
        <p className="mt-7 text-[12px] text-label-3">{LANGUAGES.length} dilde anlık tercüme · Hakan Karaarslan tarafından oluşturulmuştur</p>
      </div>
    </button>
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
export function FaceToFace({ onClose }: { onClose: () => void }) {
  const items = useStore(engine.store, (s) => s.items);
  const language = useStore(engine.store, (s) => s.language);
  const [flipped, setFlipped] = useState(true);
  const last = [...items].reverse().find((i): i is Turn => i.kind === 'turn' && !!(i.source || i.translation));

  // The patient half always shows the patient's language, the staff half Turkish
  const patientText = last ? (last.speaker === 'nurse' ? last.translation : last.source) : undefined;
  const staffText = last ? (last.speaker === 'nurse' ? last.source : last.translation) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const half = (text: string | undefined, label: ReactNode, placeholder: string, tone: string) => (
    <div className="flex-1 min-h-0 flex flex-col px-6 sm:px-12 py-6">
      <div className="text-[13px] font-semibold text-label-2 flex items-center gap-2">{label}</div>
      <div className="flex-1 min-h-0 flex items-center overflow-y-auto">
        <p dir="auto" className={`w-full text-[clamp(26px,5.2vw,52px)] leading-[1.18] font-semibold tracking-[-0.025em] balance ${text ? tone : 'text-label-3'}`}>
          {text ?? placeholder}
        </p>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col pt-safe pb-safe anim-fade" role="dialog" aria-modal="true" aria-label="Hastaya göster">
      <div className={`flex-1 min-h-0 flex flex-col ${flipped ? 'rotate-180' : ''} transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]`}>
        {half(
          patientText,
          <>
            <Flag iso={language.flag} label={language.nameTr} size="xs" />
            <span dir="auto">{language.native}</span>
          </>,
          '…',
          'text-patient',
        )}
      </div>
      <div className="relative shrink-0 h-[60px] flex items-center justify-center gap-3 px-4">
        <span className="absolute inset-x-0 top-1/2 h-px bg-separator" aria-hidden="true" />
        <button type="button" onClick={onClose} aria-label="Kapat" className="pressable relative w-11 h-11 rounded-full bg-surface shadow-card flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
        </button>
        <Orb size={56} />
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-pressed={flipped}
          aria-label="Üst yarıyı karşıya çevir"
          title="Üst yarıyı karşıya çevir"
          className={`pressable relative w-11 h-11 rounded-full flex items-center justify-center cursor-pointer ${flipped ? 'bg-accent text-white' : 'bg-surface shadow-card'}`}
        >
          <RotateCw className="w-5 h-5" strokeWidth={2.25} />
        </button>
      </div>
      {half(
        staffText,
        <>
          <Flag iso="tr" label="Türkçe" size="xs" />
          Türkçe · Personel
        </>,
        'Konuştuğunuzda çeviri burada büyük yazıyla görünür; üst yarı hastaya döner.',
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
    body: 'Şikayetler, ilaçlar (dozuyla), alerjiler, kronik hastalıklar, ameliyatlar, alışkanlıklar ve istekler konuşurken ayrıştırılır. "Alerjim yok" gibi yanıtlar ayrı gösterilir; tek dokunuşla HBYS’ye kopyalanır.',
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

