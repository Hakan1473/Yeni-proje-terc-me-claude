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
  Sparkles,
  Square,
  TriangleAlert,
  Volume2,
} from 'lucide-react';
import { memo, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DRUGS } from '../../shared/medical/lexicon';
import { describeNumberCheck } from '../../shared/numbers';
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

/** Muted reference video under a teaching sentence. Plays three times, then folds away. */
function VideoCard({ kind }: { kind: TutorialKind }) {
  const video = TUTORIAL_VIDEOS[kind];
  const [plays, setPlays] = useState(0);
  const ref = useRef<HTMLVideoElement>(null);
  const done = plays >= 3;

  if (done) {
    return (
      <div className="mt-3 rounded-[14px] bg-surface/70 dark:bg-surface-2 p-2.5 pl-3 flex items-center gap-3 anim-fade">
        <span className="glyph w-8 h-8 rounded-[9px] bg-accent">
          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
        </span>
        <p className="flex-1 min-w-0 text-[14px] font-medium leading-snug">{video.title}</p>
        <button type="button" onClick={() => setPlays(0)} className="pressable btn-tinted h-8 px-3 rounded-full inline-flex items-center gap-1.5 text-[13px] font-medium cursor-pointer">
          <RotateCcw className="w-3.5 h-3.5" strokeWidth={2.25} />
          Tekrar göster
        </button>
      </div>
    );
  }
  return (
    <figure className="mt-3 overflow-hidden rounded-[14px] bg-black anim-rise">
      <video
        ref={ref}
        autoPlay
        muted
        playsInline
        disablePictureInPicture
        onEnded={() => {
          setPlays((p) => p + 1);
          if (plays < 2) void ref.current?.play().catch(() => {});
        }}
        className="w-full max-h-[340px] object-contain block pointer-events-none"
      >
        <VideoSources kind={kind} />
      </video>
      <figcaption className="px-3 py-2 text-[12px] font-medium text-white/80 bg-black">{video.title}</figcaption>
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
}: {
  turn: Turn;
  language: Language;
  playing: boolean;
  translating: boolean;
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
        nurse ? 'ml-auto bg-surface shadow-card rounded-br-[8px]' : 'mr-auto bg-patient-soft rounded-bl-[8px]'
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

      {turn.numberCheck && (
        <div className="mt-2.5 rounded-[12px] bg-sys-orange/12 text-[13px] leading-snug px-3 py-2 flex items-start gap-2">
          <TriangleAlert className="w-4 h-4 text-sys-orange shrink-0 mt-px" strokeWidth={2.25} />
          <span className="flex-1">
            <span className="font-semibold">Sayıları kontrol edin.</span> {describeNumberCheck(turn.numberCheck)}.
          </span>
        </div>
      )}

      {turn.tutorial && <VideoCard kind={turn.tutorial} />}
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

export function Conversation({ onSummary }: { onSummary: () => void }) {
  const items = useStore(engine.store, (s) => s.items);
  const language = useStore(engine.store, (s) => s.language);
  const playingTurnId = useStore(engine.store, (s) => s.playingTurnId);
  const translatingTurnId = useStore(engine.store, (s) => s.translatingTurnId);
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const hasTurns = items.some((i) => i.kind === 'turn');

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
            <TurnCard key={item.id} turn={item} language={language} playing={playingTurnId === item.id} translating={translatingTurnId === item.id} />
          ),
        )}
        {hasTurns && (
          <div className="flex justify-center pt-1 pb-2">
            <button type="button" onClick={onSummary} className="pressable btn-tinted h-9 pl-3 pr-4 rounded-full inline-flex items-center gap-1.5 text-[14px] font-medium cursor-pointer">
              <Sparkles className="w-4 h-4" strokeWidth={2.25} />
              Konuşma Özeti Oluştur
            </button>
          </div>
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
