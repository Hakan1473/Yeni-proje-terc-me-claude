import { Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export const INTRO_VIDEO = { src: '/videos/intro.mp4', poster: '/videos/intro-poster.jpg', length: '1:42' };

/**
 * The product introduction, shown once on first launch (and again on request
 * from Settings). Playback starts from a tap, since browsers only allow sound
 * after a user gesture; closing or finishing it is remembered by the caller.
 */
export function IntroVideo({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const play = () => {
    const v = video.current;
    if (!v) return;
    setStarted(true);
    v.muted = false;
    void v.play().catch(() => {
      // Sound refused (e.g. silent mode policies): play muted with controls to unmute
      v.muted = true;
      void v.play().catch(() => {});
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Tanıtım videosu" className="intro-backdrop fixed inset-0 z-[70] flex items-center justify-center px-4 anim-fade">
      <div className="w-full anim-pop" style={{ maxWidth: 'min(1100px, calc((100dvh - 200px) * 16 / 9))' }}>
        <div className="flex items-end justify-between gap-4 mb-3.5 text-white">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-white/60">Hoş geldiniz · {INTRO_VIDEO.length} dakikalık tanıtım</p>
            <h2 className="text-[21px] sm:text-[24px] font-semibold tracking-[-0.025em] leading-tight">Canlı Sesli Tercüman’ı tanıyın</h2>
          </div>
          <button type="button" onClick={onClose} className="intro-skip pressable h-9 pl-3 pr-3.5 rounded-full inline-flex items-center gap-1.5 text-[14px] font-semibold shrink-0 cursor-pointer">
            <X className="w-4 h-4" strokeWidth={2.5} />
            {started ? 'Kapat' : 'Geç'}
          </button>
        </div>

        <div className="video-stage aspect-video">
          {/* biome-ignore lint/a11y/useMediaCaption: narrated product tour; the same content is in the quick-start guide */}
          <video
            ref={video}
            src={INTRO_VIDEO.src}
            poster={INTRO_VIDEO.poster}
            preload="metadata"
            playsInline
            controls={started}
            onEnded={() => window.setTimeout(onClose, 600)}
            className="absolute inset-0 w-full h-full object-contain"
          />
          {!started && (
            // The key sits on the poster's sphere, clear of the title below it
            <button type="button" onClick={play} className="intro-play absolute inset-0 cursor-pointer" aria-label="Tanıtım videosunu oynat">
              <span className="intro-play-key">
                <Play className="w-[42%] h-[42%] translate-x-[6%]" fill="currentColor" strokeWidth={0} />
              </span>
            </button>
          )}
        </div>

        <p className="mt-3.5 text-center text-[12.5px] text-white/55 leading-snug balance">
          Bu tanıtım yalnızca ilk açılışta gösterilir. Daha sonra Ayarlar → Rehber bölümünden yeniden izleyebilirsiniz.
        </p>
      </div>
    </div>
  );
}
