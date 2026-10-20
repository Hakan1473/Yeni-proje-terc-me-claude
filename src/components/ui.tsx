import { Languages, X } from 'lucide-react';
import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// ───────────────────────── Flag ─────────────────────────

const FLAG_SIZES = {
  xs: 'w-[20px] h-[15px] rounded-[3px]',
  sm: 'w-[24px] h-[18px] rounded-[4px]',
  md: 'w-[30px] h-[22px] rounded-[5px]',
  lg: 'w-[44px] h-[33px] rounded-[7px]',
};

/** Bundled flag artwork (no third-party CDN). Kurdish has no state flag: a neutral tile instead. */
export function Flag({ iso, label, size = 'sm' }: { iso: string | null; label: string; size?: keyof typeof FLAG_SIZES }) {
  const cls = `${FLAG_SIZES[size]} shrink-0 overflow-hidden shadow-[0_0_0_0.5px_rgb(0_0_0/0.18)] dark:shadow-[0_0_0_0.5px_rgb(255_255_255/0.2)]`;
  if (!iso) {
    return (
      <span role="img" aria-label={label} title={label} className={`${cls} inline-flex items-center justify-center bg-surface-3 text-label-2`}>
        <Languages className="w-[62%] h-[62%]" strokeWidth={2.25} />
      </span>
    );
  }
  return <img src={`/flags/${iso}.svg`} alt="" title={label} loading="lazy" draggable={false} className={`${cls} inline-block object-cover`} />;
}

// ───────────────────────── Segmented control ─────────────────────────

export interface Segment<T extends string> {
  id: T;
  label: ReactNode;
  badge?: ReactNode;
}

export function Segmented<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: Segment<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  const index = Math.max(0, items.findIndex((i) => i.id === value));
  return (
    <div role="tablist" aria-label={label} className="segmented">
      <span
        aria-hidden="true"
        className="segmented-thumb"
        style={{ width: `calc((100% - 4px) / ${items.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {items.map((item) => (
        <button key={item.id} type="button" role="tab" aria-selected={item.id === value} onClick={() => onChange(item.id)} className="segmented-item">
          <span className="truncate">{item.label}</span>
          {item.badge}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────── Sheet ─────────────────────────

interface SheetProps {
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  width?: string;
  tall?: boolean;
  bodyClass?: string;
  overlayStyle?: CSSProperties;
  panelStyle?: CSSProperties;
}

/** Bottom sheet on phones, centred card on tablets and desktops. Esc and backdrop close it. */
export function Sheet({
  onClose,
  title,
  subtitle,
  leading,
  trailing,
  footer,
  children,
  width = 'sm:max-w-lg',
  tall = false,
  bodyClass = 'px-4 sm:px-6 pb-6',
  overlayStyle,
  panelStyle,
}: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useRef(`sheet-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  // Portalled so a sheet opened from inside a transformed pane still covers the screen
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-black/30 dark:bg-black/60 anim-fade cursor-default" />
      <div
        ref={panel}
        tabIndex={-1}
        style={panelStyle}
        className={`sheet relative w-full ${width} flex flex-col overflow-hidden rounded-t-[22px] sm:rounded-[24px] shadow-float pb-safe sm:pb-0 outline-none ${
          tall ? 'h-[94dvh] sm:h-[84vh] sm:max-h-[860px]' : 'max-h-[94dvh] sm:max-h-[86vh]'
        }`}
      >
        <div className="sm:hidden pt-1.5 flex justify-center shrink-0" aria-hidden="true">
          <span className="w-9 h-[5px] rounded-full bg-label-3" />
        </div>
        <div className="flex items-center gap-3 px-4 sm:px-6 pt-2.5 sm:pt-5 pb-3 shrink-0">
          {leading}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[17px] sm:text-[19px] font-semibold tracking-[-0.022em] truncate">
              {title}
            </h2>
            {subtitle && <div className="text-[13px] text-label-2 truncate mt-0.5">{subtitle}</div>}
          </div>
          {trailing}
          <button type="button" onClick={onClose} aria-label="Kapat" className="pressable w-[30px] h-[30px] rounded-full bg-fill text-label-2 hover:text-label flex items-center justify-center shrink-0 cursor-pointer">
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${bodyClass}`}>{children}</div>
        {footer && <div className="hairline-t px-4 sm:px-6 py-3 shrink-0 flex items-center gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function SectionHeader({ children }: { children: ReactNode }) {
  return <h3 className="px-4 mb-1.5 text-[13px] font-medium text-label-2 uppercase tracking-[0.02em]">{children}</h3>;
}

export function SectionFooter({ children }: { children: ReactNode }) {
  return <p className="px-4 mt-2 text-[13px] leading-snug text-label-2">{children}</p>;
}

/** Copy to clipboard with a short-lived "copied" state. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
