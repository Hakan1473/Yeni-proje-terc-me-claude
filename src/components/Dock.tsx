import { ClinicalNotes, type DockIcon, Forum, Keyboard, Mic, MicOff } from './icons';
import { useStore } from '../lib/store';
import { engine, type SessionState } from '../live/engine';
import { Orb } from './Orb';

const CAPTION: Record<SessionState, { title: string; tone: string }> = {
  idle: { title: 'Başlatmak için küreye dokunun', tone: 'var(--label-3)' },
  connecting: { title: 'Bağlanıyor', tone: 'var(--orange)' },
  reconnecting: { title: 'Bağlantı yenileniyor', tone: 'var(--orange)' },
  listening: { title: 'Dinliyorum · Türkçe veya hasta dilinde konuşun', tone: 'var(--green)' },
  hearing: { title: 'Konuşma algılanıyor', tone: 'var(--green)' },
  translating: { title: 'Çevriliyor', tone: 'var(--accent)' },
  speaking: { title: 'Seslendiriliyor · Durdurmak için küreye dokunun', tone: 'var(--accent)' },
};

/** A key in the dock: a glass button with a filled Material Symbols glyph over a short label. */
export function DockKey({
  icon: Icon,
  label,
  onClick,
  tone,
  disabled,
  pressed,
  tour,
}: {
  icon: DockIcon;
  label: string;
  onClick: () => void;
  tone?: 'danger' | 'accent';
  disabled?: boolean;
  pressed?: boolean;
  /** Anchor for the live walkthrough. */
  tour?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={pressed} data-tone={tone} data-tour={tour} className="dock-key cursor-pointer disabled:cursor-default">
      <span className="dock-key-face">
        <Icon size={24} />
      </span>
      <span className="dock-key-label">{label}</span>
    </button>
  );
}

function Status() {
  const session = useStore(engine.store, (s) => s.session);
  const muted = useStore(engine.store, (s) => s.muted);
  const caption = muted && session !== 'idle' ? { title: 'Mikrofon kapalı · Ses algılanmıyor', tone: 'var(--red)' } : CAPTION[session];
  const live = session === 'listening' || session === 'hearing';
  const working = session === 'connecting' || session === 'reconnecting' || session === 'translating';
  return (
    <p className="dock-status" aria-live="polite">
      <span className={`dock-status-dot ${live && !muted ? 'is-live' : ''}`} style={{ '--tone': caption.tone } as React.CSSProperties} />
      <span className="truncate">{caption.title}</span>
      {working && <span className="dock-ellipsis" aria-hidden="true" />}
    </p>
  );
}

export function Dock({ onType, onFaceToFace, onSummary }: { onType: () => void; onFaceToFace: () => void; onSummary: () => void }) {
  const muted = useStore(engine.store, (s) => s.muted);
  const hasTurns = useStore(engine.store, (s) => s.items.some((i) => i.kind === 'turn'));

  return (
    <footer className="relative z-20 shrink-0 select-none pb-safe-tight">
      <div className="flex flex-col items-center px-3 pt-1">
        <Status />
        <nav aria-label="Tercüman kontrolleri" className="dock">
          <DockKey icon={Keyboard} label="Yaz" onClick={onType} tour="type" />
          <DockKey
            icon={muted ? MicOff : Mic}
            label={muted ? 'Sessizde' : 'Sessiz'}
            tone={muted ? 'danger' : undefined}
            pressed={muted}
            tour="mute"
            onClick={() => engine.setMuted(!muted)}
          />
          <span className="dock-orb" data-tour="orb">
            <Orb size={72} />
          </span>
          <DockKey icon={Forum} label="Hastaya" onClick={onFaceToFace} tour="face" />
          <DockKey icon={ClinicalNotes} label="Özet" onClick={onSummary} disabled={!hasTurns} tour="summary" />
        </nav>
        <p className="pt-1 text-center text-[10.5px] leading-[14px] text-label-3">
          <span className="font-semibold text-sys-orange">Demo</span> · Hakan Karaarslan tarafından oluşturulmuştur
        </p>
      </div>
    </footer>
  );
}
