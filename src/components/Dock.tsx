import { ChatsCircle, ClipboardText, type Icon as PhosphorIcon, Keyboard, Microphone, MicrophoneSlash } from '@phosphor-icons/react';
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
  speaking: { title: 'Seslendiriliyor · Geçmek için küreye dokunun', tone: 'var(--accent)' },
};

/** A key in the dock: a glass button with a filled glyph over a short label. */
export function DockKey({
  icon: Icon,
  label,
  onClick,
  tone,
  disabled,
  pressed,
}: {
  icon: PhosphorIcon;
  label: string;
  onClick: () => void;
  tone?: 'danger' | 'accent';
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={pressed} data-tone={tone} className="dock-key cursor-pointer disabled:cursor-default">
      <span className="dock-key-face">
        <Icon size={22} weight={tone ? 'fill' : 'duotone'} />
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
          <DockKey icon={Keyboard} label="Yaz" onClick={onType} />
          <DockKey
            icon={muted ? MicrophoneSlash : Microphone}
            label={muted ? 'Sessizde' : 'Sessiz'}
            tone={muted ? 'danger' : undefined}
            pressed={muted}
            onClick={() => engine.setMuted(!muted)}
          />
          <span className="dock-orb">
            <Orb size={72} />
          </span>
          <DockKey icon={ChatsCircle} label="Hastaya" onClick={onFaceToFace} />
          <DockKey icon={ClipboardText} label="Özet" onClick={onSummary} disabled={!hasTurns} />
        </nav>
        <p className="pt-1 text-center text-[10.5px] leading-[14px] text-label-3">
          <span className="font-semibold text-sys-orange">Demo</span> · Hakan Karaarslan tarafından oluşturulmuştur
        </p>
      </div>
    </footer>
  );
}
