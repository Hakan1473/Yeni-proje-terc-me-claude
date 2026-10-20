import { FileText, Keyboard, Mic, MicOff, ScanText } from 'lucide-react';
import type { ReactNode } from 'react';
import { useStore } from '../lib/store';
import { engine, type SessionState } from '../live/engine';
import { Orb } from './Orb';

const CAPTION: Record<SessionState, { title: string; tone: string }> = {
  idle: { title: 'Tercümanı başlatmak için dokunun', tone: 'bg-label-3' },
  connecting: { title: 'Bağlanıyor…', tone: 'bg-sys-orange' },
  reconnecting: { title: 'Bağlantı yenileniyor…', tone: 'bg-sys-orange' },
  listening: { title: 'Dinliyorum · Türkçe veya hasta dilinde konuşun', tone: 'bg-sys-green' },
  hearing: { title: 'Konuşma algılanıyor', tone: 'bg-sys-green' },
  translating: { title: 'Çevriliyor…', tone: 'bg-accent' },
  speaking: { title: 'Seslendiriliyor · Geçmek için dokunun', tone: 'bg-accent' },
};

function DockButton({
  icon,
  label,
  onClick,
  active,
  danger,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className="pressable group flex flex-col items-center gap-1 w-[64px] cursor-pointer disabled:opacity-40 disabled:cursor-default"
    >
      <span
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
          danger ? 'bg-sys-red/15 text-sys-red' : active ? 'bg-accent text-white' : 'bg-fill text-label group-hover:bg-surface-3'
        }`}
      >
        {icon}
      </span>
      <span className={`text-[11px] font-medium leading-none ${danger ? 'text-sys-red' : 'text-label-2'}`}>{label}</span>
    </button>
  );
}

export function Dock({ onType, onFaceToFace, onSummary }: { onType: () => void; onFaceToFace: () => void; onSummary: () => void }) {
  const session = useStore(engine.store, (s) => s.session);
  const muted = useStore(engine.store, (s) => s.muted);
  const hasTurns = useStore(engine.store, (s) => s.items.some((i) => i.kind === 'turn'));
  const caption = muted && session !== 'idle' ? { title: 'Mikrofon kapalı · Ses algılanmıyor', tone: 'bg-sys-red' } : CAPTION[session];

  return (
    <footer className="relative z-20 material hairline-t pb-safe shrink-0 select-none">
      <p className="flex items-center justify-center gap-2 pt-2.5 px-4 text-[13px] text-label-2 text-center" aria-live="polite">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${caption.tone} ${session === 'listening' || session === 'hearing' ? 'animate-pulse' : ''}`} />
        <span className="truncate">{caption.title}</span>
      </p>
      <div className="flex items-center justify-center gap-1 sm:gap-4 pt-2 pb-2">
        <DockButton icon={<Keyboard className="w-5 h-5" strokeWidth={2} />} label="Yaz" onClick={onType} />
        <DockButton
          icon={muted ? <MicOff className="w-5 h-5" strokeWidth={2} /> : <Mic className="w-5 h-5" strokeWidth={2} />}
          label={muted ? 'Sessizde' : 'Sessiz'}
          danger={muted}
          onClick={() => engine.setMuted(!muted)}
        />
        <div className="mx-2 sm:mx-4">
          <Orb />
        </div>
        <DockButton icon={<ScanText className="w-5 h-5" strokeWidth={2} />} label="Hastaya" onClick={onFaceToFace} />
        <DockButton icon={<FileText className="w-5 h-5" strokeWidth={2} />} label="Özet" onClick={onSummary} disabled={!hasTurns} />
      </div>
      <p className="pb-1.5 text-center text-[10.5px] text-label-3">
        <span className="font-semibold text-sys-orange">Demo</span> · Hakan Karaarslan tarafından oluşturulmuştur
      </p>
    </footer>
  );
}
