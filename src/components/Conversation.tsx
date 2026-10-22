import {
  ArrowDown,
  Check,
  Copy,
  Globe,
  LoaderCircle,
  MessagesSquare,
  Play,
  RotateCcw,
  RotateCw,
  ScanText,
  Square,
  Volume2,
} from 'lucide-react';
import { memo, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DRUGS } from '../../shared/medical/lexicon';
import { TUTORIAL_VIDEOS } from '../../shared/tutorials';
import { escapeRegExp } from '../../shared/text';
import type { ConversationItem, Language, TutorialKind, Turn } from '../../shared/types';
import { useStore } from '../lib/store';
import { engine } from '../live/engine';
import { copyText, Flag } from './ui';

// ───────────────────────── highlighting ─────────────────────────

const DOSE = String.raw`\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ml|gr|g|ünite|IU|°C|mmHg|kg|cm|%)(?![\p{L}])|\d{2,3}\/\d{2,3}|%\s?\d+|\d+\s?[x×]\s?\d+`;
const DRUG_NAMES = Array.from(new Set(DRUGS.flatMap((d) => [d.name, ...d.aliases]).filter((a) => a.length >= 4)))
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join('|');
const HIGHLIGHT = new RegExp(`(${DOSE})|(?<![\\p{L}])(${DRUG_NAMES})(?=['’]?\\p{L}{0,6}(?![\\p{L}]))`, 'giu');

/** Doses and numbers in orange, known drug names underlined: the parts a nurse double-checks. */
function RichText({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: ReactNode[] = [];
    let last = 0;
    for (const m of text.matchAll(HIGHLIGHT)) {
      const i = m.index ?? 0;
      if (i > last) out.push(text.slice(last, i));
      out.push(
        <span key={i} className={m[1] ? 'mark-dose' : 'mark-drug'}>
          {m[0]}
        </span>,
      );
      last = i + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }, [text]);
  return <>{parts}</>;
}

// ───────────────────────── tutorial video ─────────────────────────

/** H.264 for Safari and Chrome; VP9 WebM for browsers without H.264 (Firefox on Linux, Chromium). */
export function VideoSources({ kind }: { kind: TutorialKind }) {
  const v = TUTORIAL_VIDEOS[kind];
  return (
    <>
      <source src={v.url} type='video/mp4; codecs="avc1.64001F"' />
      <source src={v.webm} type='video/webm; codecs="vp9"' />
    </>
  );
}

const PLAYS = 3;

/**
 * Teaching video under the sentence that triggered it: a glass media card that
 * plays muted three times, then folds into a compact row. "Hastaya göster"
 * opens it full size on the patient-facing screen.
 */
function VideoCard({ kind, onPresent }: { kind: TutorialKind; onPresent?: (kind: TutorialKind) => void }) {
  const video = TUTORIAL_VIDEOS[kind];
  const [plays, setPlays] = useState(0);
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLVideoElement>(null);
  const done = plays >= PLAYS;

  const present = onPresent && (
    <button type="button" onClick={() => onPresent(kind)} aria-label="Hastaya göster" className="video-action pressable cursor-pointer">
      <ScanText className="w-4 h-4" strokeWidth={2.25} />
      <span className="hidden sm:inline">Hastaya göster</span>
    </button>
  );

  if (done) {
    return (
      <div className="video-row mt-3 anim-fade">
        <span className="video-row-thumb">
          <Play className="w-4 h-4 fill-current ml-0.5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-label-2">Eğitim videosu</span>
          <span className="block text-[14px] font-semibold leading-snug truncate">{video.title}</span>
        </span>
        <button type="button" onClick={() => setPlays(0)} aria-label="Tekrar oynat" title="Tekrar oynat" className="pressable icon-btn !w-9 !h-9 cursor-pointer">
          <RotateCcw className="w-4 h-4" strokeWidth={2.25} />
        </button>
        {onPresent && (
          <button type="button" onClick={() => onPresent(kind)} aria-label="Hastaya göster" title="Hastaya göster" className="pressable icon-btn !w-9 !h-9 cursor-pointer text-accent">
            <ScanText className="w-4 h-4" strokeWidth={2.25} />
          </button>
        )}
      </div>
    );
  }
  return (
    <figure className="video-card mt-3 anim-rise">
      <video
        ref={ref}
        autoPlay
        muted
        playsInline
        disablePictureInPicture
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
        onEnded={() => {
          setPlays((p) => p + 1);
          if (plays < PLAYS - 1) void ref.current?.play().catch(() => {});
        }}
        className="w-full max-h-[360px] aspect-video object-cover block pointer-events-none"
      >
        <VideoSources kind={kind} />
      </video>
      <figcaption className="video-caption">
        <span className="min-w-0">
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/70">Eğitim videosu · {plays + 1}/{PLAYS}</span>
          <span className="block text-[15px] font-semibold text-white leading-snug truncate">{video.title}</span>
        </span>
        {present}
      </figcaption>
      <span className="video-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${(plays + progress) / PLAYS})` }} />
      </span>
    </figure>
  );
}

// ───────────────────────── turn card ─────────────────────────

function Dots() {
  return (
    <span className="inline-flex items-center gap-[3px] ml-1 align-middle" aria-hidden="true">
      <span className="w-1 h-1 rounded-full bg-current anim-dot" />
      <span className="w-1 h-1 rounded-full bg-current anim-dot" style={{ animationDelay: '0.15s' }} />
      <span className="w-1 h-1 rounded-full bg-current anim-dot" style={{ animationDelay: '0.3s' }} />
    </span>
  );
}

const time = (ts: number) => new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

const TurnCard = memo(function TurnCard({
  turn,
  language,
  playing,
  translating,
  onPresentVideo,
}: {
  turn: Turn;
  language: Language;
  playing: boolean;
  translating: boolean;
  onPresentVideo?: (kind: TutorialKind) => void;
}) {
  const [copied, setCopied] = useState(false);
  const nurse = turn.speaker === 'nurse';
  const live = turn.status === 'capturing' || turn.status === 'translating';
  const unsure = turn.status === 'done' && turn.speakerConfidence < 0.7;

  const copy = async () => {
    if (await copyText(turn.translation ? `${turn.source}\n→ ${turn.translation}` : turn.source)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <article
      className={`anim-rise w-fit min-w-[min(100%,260px)] max-w-[92%] sm:max-w-[84%] rounded-[22px] px-4 pt-3 pb-3.5 ${
        nurse ? 'ml-auto bg-surface shadow-card rounded-br-[8px]' : 'mr-auto bg-patient-soft shadow-card rounded-bl-[8px]'
      }`}
    >
      <header className="flex items-center gap-2 min-h-[30px]">
        <Flag iso={nurse ? 'tr' : language.flag} label={nurse ? 'Türkçe' : language.nameTr} size="xs" />
        <span className={`text-[13px] font-semibold ${nurse ? 'text-label' : 'text-patient'}`}>{nurse ? 'Hemşire' : 'Hasta'}</span>
        <span className="text-[12px] text-label-3 tabular">{time(turn.createdAt)}</span>
        {unsure && (
          <span className="text-[11px] font-medium text-label-2 bg-fill rounded-full px-1.5 py-0.5" title="Konuşmacı dili kesin ayırt edilemedi">
            ?
          </span>
        )}
        <span className="flex-1" />
        {!live && (
          <span className="flex items-center gap-0.5 -mr-1.5">
            <button
              type="button"
              onClick={() => void engine.speakTurn(turn.id)}
              aria-label={playing ? 'Durdur' : 'Çeviriyi sesli dinle'}
              title={playing ? 'Durdur' : 'Sesli dinle'}
              className={`pressable w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${playing ? 'btn-primary' : 'text-label-2 hover:bg-fill'}`}
            >
              {playing ? <Square className="w-3.5 h-3.5 fill-current" /> : <Volume2 className="w-[17px] h-[17px]" strokeWidth={2} />}
            </button>
            <button type="button" onClick={copy} aria-label="Kopyala" title="Kopyala" className="pressable w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-label-2 hover:bg-fill">
              {copied ? <Check className="w-4 h-4 text-sys-green" strokeWidth={2.5} /> : <Copy className="w-4 h-4" strokeWidth={2} />}
            </button>
            <button
              type="button"
              onClick={() => void engine.retranslate(turn.id)}
              disabled={translating}
              aria-label="Yeniden çevir"
              title="Yeniden çevir"
              className="pressable w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-label-2 hover:bg-fill disabled:opacity-60"
            >
              {translating ? <LoaderCircle className="w-4 h-4 animate-spin" strokeWidth={2.25} /> : <RotateCw className="w-4 h-4" strokeWidth={2} />}
            </button>
          </span>
        )}
      </header>

      {turn.source ? (
        <p dir="auto" className={`mt-1 text-[17px] leading-[1.42] tracking-[-0.016em] pretty ${turn.status === 'capturing' ? 'shimmer-text' : ''}`}>
          <RichText text={turn.source} />
        </p>
      ) : (
        <p className="mt-1 text-[14px] text-label-3">Konuşmanın metni alınamadı</p>
      )}

      {turn.translation ? (
        <div className="mt-2.5 pt-2.5 hairline-t">
          <p className="text-[12px] font-medium text-label-2 mb-0.5">{nurse ? language.native : 'Türkçe'}</p>
          <p dir="auto" className={`text-[17px] leading-[1.42] tracking-[-0.016em] font-semibold pretty ${nurse ? 'text-accent-ink' : 'text-label'}`}>
            <RichText text={turn.translation} />
            {turn.status === 'translating' && <Dots />}
          </p>
        </div>
      ) : turn.status === 'capturing' ? (
        <p className="mt-2 text-[12px] font-medium text-sys-green inline-flex items-center">
          Dinleniyor
          <Dots />
        </p>
      ) : turn.status === 'failed' ? (
        <div className="mt-2.5 pt-2.5 hairline-t flex items-center gap-2">
          <span className="text-[13px] text-label-2 flex-1">Çeviri alınamadı.</span>
          <button type="button" onClick={() => void engine.retranslate(turn.id)} className="pressable btn-tinted h-7 px-3 rounded-full text-[13px] font-medium cursor-pointer">
            Tekrar dene
          </button>
        </div>
      ) : null}

      {turn.tutorial && <VideoCard kind={turn.tutorial} onPresent={onPresentVideo} />}
    </article>
  );
});

function NoteRow({ text, at }: { text: string; at: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-1 anim-fade">
      <Globe className="w-3.5 h-3.5 text-label-3" strokeWidth={2} />
      <span className="text-[12px] font-medium text-label-2">{text}</span>
      <span className="text-[12px] text-label-3 tabular">· {time(at)}</span>
    </div>
  );
}

function EmptyState() {
  const mock = useStore(engine.store, (s) => s.mock);
  return (
    <div className="h-full flex flex-col items-center justify-center px-8 py-10 text-center anim-fade">
      <div className="w-16 h-16 rounded-[20px] bg-accent-soft text-accent flex items-center justify-center mb-4">
        <MessagesSquare className="w-7 h-7" strokeWidth={2} />
      </div>
      <p className="text-[20px] font-semibold tracking-[-0.022em]">Canlı Konuşma</p>
      <p className="mt-1.5 text-[15px] text-label-2 max-w-[320px] leading-relaxed balance">
        Mikrofona dokunun ve konuşun. Türkçe konuşulanlar hastanın diline, hastanın söyledikleri Türkçeye çevrilip seslendirilir.
      </p>
      {mock && (
        <p className="mt-5 max-w-[340px] text-[13px] leading-snug rounded-[14px] bg-sys-orange/12 px-4 py-3 text-left">
          <span className="font-semibold">Simülasyon modu.</span> Sunucuda API anahtarı yok; başlattığınızda örnek bir hemşire–hasta görüşmesi oynatılır.
        </p>
      )}
    </div>
  );
}

export function Conversation({ onPresentVideo }: { onPresentVideo?: (kind: TutorialKind) => void }) {
  const items = useStore(engine.store, (s) => s.items);
  const language = useStore(engine.store, (s) => s.language);
  const playingTurnId = useStore(engine.store, (s) => s.playingTurnId);
  const translatingTurnId = useStore(engine.store, (s) => s.translatingTurnId);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);

  // Follow new content only while the reader is at the bottom
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (pinned.current) el.scrollTop = el.scrollHeight;
    else setShowJump(true);
  }, [items]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      pinned.current = atBottom;
      if (atBottom) setShowJump(false);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const jump = () => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    pinned.current = true;
    setShowJump(false);
  };

  if (items.length === 0) return <EmptyState />;

  return (
    <div className="relative h-full min-h-0">
      <div ref={scroller} className="h-full overflow-y-auto overscroll-contain px-3 sm:px-5 py-4 flex flex-col gap-3" role="log" aria-live="polite">
        {items.map((item: ConversationItem) =>
          item.kind === 'note' ? (
            <NoteRow key={item.id} text={item.text} at={item.createdAt} />
          ) : (
            <TurnCard key={item.id} turn={item} language={language} playing={playingTurnId === item.id} translating={translatingTurnId === item.id} onPresentVideo={onPresentVideo} />
          ),
        )}
      </div>
      {showJump && (
        <button
          type="button"
          onClick={jump}
          className="pressable absolute left-1/2 -translate-x-1/2 bottom-3 h-9 pl-3 pr-4 rounded-full material shadow-float inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent cursor-pointer anim-pop"
        >
          <ArrowDown className="w-4 h-4" strokeWidth={2.5} />
          Yeni konuşma
        </button>
      )}
    </div>
  );
}
