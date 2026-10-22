import { ClipboardList, MessagesSquare } from 'lucide-react';
import { type TouchEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnamnesisPanel } from './components/AnamnesisPanel';
import { Conversation } from './components/Conversation';
import { Dock } from './components/Dock';
import { LanguageRail, NavBar } from './components/NavBar';
import { AccessGate, FaceToFace, Toast, TypeSheet } from './components/Overlays';
import { IntroVideo } from './components/IntroVideo';
import { HistorySheet } from './components/sheets/HistorySheet';
import { LanguageSheet } from './components/sheets/LanguageSheet';
import { SettingsSheet } from './components/sheets/SettingsSheet';
import { Splash } from './components/Splash';
import { Tour } from './components/Tour';
import { SummarySheet } from './components/sheets/SummarySheet';
import { Segmented } from './components/ui';
import * as api from './lib/api';
import { applyRetention } from './lib/history';
import { applyTheme, getAccessCode, loadSettings, saveSettings, type Theme } from './lib/settings';
import type { TutorialKind } from '../shared/types';
import { useStore } from './lib/store';
import { engine } from './live/engine';

type SheetName = 'languages' | 'settings' | 'history' | 'summary' | 'type' | 'tour' | 'face' | 'intro';
type Pane = 'dialogue' | 'anamnesis';

const WIDE = '(min-width: 1024px), (min-width: 768px) and (orientation: landscape)';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => matchMedia(query).matches,
  );
}

function PaneHeader({ icon, title, meta, extra }: { icon: React.ReactNode; title: string; meta?: string; extra?: string }) {
  return (
    <div className="flex items-center gap-2 px-5 h-12 min-w-0">
      {icon}
      <h2 className="text-[15px] font-semibold tracking-[-0.016em] whitespace-nowrap">{title}</h2>
      {meta && <span className="text-[13px] text-label-2 tabular whitespace-nowrap">{meta}</span>}
      {extra && <span className="ml-auto text-[13px] text-label-2 truncate">{extra}</span>}
    </div>
  );
}

export default function App() {
  const [splash, setSplash] = useState(true);
  const [locked, setLocked] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => loadSettings().theme);
  const [sheet, setSheet] = useState<SheetName | null>(null);
  const [pane, setPane] = useState<Pane>('dialogue');
  const [faceVideo, setFaceVideo] = useState<TutorialKind | null>(null);
  const wide = useMediaQuery(WIDE);
  const language = useStore(engine.store, (s) => s.language);
  const turnCount = useStore(engine.store, (s) => s.items.filter((i) => i.kind === 'turn').length);
  const factCount = useStore(engine.store, (s) => s.facts.filter((f) => !f.negated).length);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  useEffect(() => {
    void applyRetention(loadSettings().retentionDays);
    void api
      .health()
      .then((h) => setLocked(h.accessRequired && !getAccessCode()))
      .catch(() => {});
  }, []);

  const closeSheet = useCallback(() => setSheet(null), []);

  const finishSplash = useCallback(() => {
    setSplash(false);
    const s = loadSettings();
    // First launch: the introduction video once, then the quick-start guide
    if (!s.introSeen) setSheet('intro');
    else if (!s.onboardingDone) setSheet('tour');
  }, []);

  const closeIntro = useCallback(() => {
    saveSettings({ introSeen: true });
    setSheet(loadSettings().onboardingDone ? null : 'tour');
  }, []);

  const changeTheme = (t: Theme) => {
    setTheme(t);
    saveSettings({ theme: t });
  };

  const openSummary = () => {
    const s = engine.store.get();
    const lastTurnAt = s.items.at(-1)?.createdAt ?? 0;
    // Regenerate only when the conversation moved on since the last summary
    if (!s.summary || s.summary.timestamp < lastTurnAt) void engine.generateSummary();
    setSheet('summary');
  };

  // A tutorial video shown full size to the patient, on the face-to-face screen
  const presentVideo = useCallback((kind: TutorialKind) => {
    setFaceVideo(kind);
    setSheet('face');
  }, []);

  const onTouchStart = (e: TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current.x;
    const dy = e.changedTouches[0].clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) setPane(dx < 0 ? 'anamnesis' : 'dialogue');
  };

  return (
    <div className="relative isolate h-[100dvh] w-full flex flex-col overflow-hidden text-label">
      <div className="ambient" aria-hidden="true" />
      <NavBar onLanguages={() => setSheet('languages')} onHistory={() => setSheet('history')} onSettings={() => setSheet('settings')} />
      <LanguageRail onAll={() => setSheet('languages')} />

      <main className="flex-1 min-h-0 w-full max-w-[1600px] mx-auto px-3 sm:px-5 pt-2.5 pb-3 flex flex-col">
        {!wide && (
          <div className="pb-2.5 shrink-0">
            <Segmented
              label="Görünüm"
              value={pane}
              onChange={setPane}
              items={[
                { id: 'dialogue', tour: 'conversation', label: 'Canlı Konuşma', badge: turnCount ? <span className="text-[12px] text-label-2 tabular">{turnCount}</span> : undefined },
                {
                  id: 'anamnesis',
                  tour: 'anamnesis',
                  label: 'Özet & Anamnez',
                  badge: factCount ? (
                    <span className="inline-flex items-center gap-1 text-[12px] text-label-2 tabular">
                      <span className="w-1.5 h-1.5 rounded-full bg-sys-green" />
                      {factCount}
                    </span>
                  ) : undefined,
                },
              ]}
            />
          </div>
        )}

        <section className="card flex-1 min-h-0 overflow-hidden flex flex-col">
          {wide ? (
            <>
              <div className="hairline-b grid grid-cols-2 shrink-0">
                <PaneHeader
                  icon={
                    <span className="glyph w-6 h-6 rounded-[7px] bg-accent">
                      <MessagesSquare className="w-3.5 h-3.5" strokeWidth={2.25} />
                    </span>
                  }
                  title="Canlı Konuşma"
                  meta={turnCount ? `${turnCount} konuşma` : undefined}
                />
                <div className="hairline-l">
                  <PaneHeader
                    icon={
                      <span className="glyph w-6 h-6 rounded-[7px] bg-sys-indigo">
                        <ClipboardList className="w-3.5 h-3.5" strokeWidth={2.25} />
                      </span>
                    }
                    title="Anlık Özet & Anamnez"
                    meta={factCount ? `${factCount} bilgi` : undefined}
                    extra={`Türkçe ⇄ ${language.nameTr}`}
                  />
                </div>
              </div>
              <div className="flex-1 min-h-0 grid grid-cols-2">
                <div className="min-h-0" data-tour="conversation">
                  <Conversation onPresentVideo={presentVideo} />
                </div>
                <div className="min-h-0 hairline-l" data-tour="anamnesis">
                  <AnamnesisPanel />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 min-h-0 overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              <div
                className="w-[200%] h-full flex transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
                style={{ transform: pane === 'dialogue' ? 'translateX(0)' : 'translateX(-50%)' }}
              >
                <div className="w-1/2 h-full min-h-0" aria-hidden={pane !== 'dialogue'} inert={pane !== 'dialogue'}>
                  <Conversation onPresentVideo={presentVideo} />
                </div>
                <div className="w-1/2 h-full min-h-0" aria-hidden={pane !== 'anamnesis'} inert={pane !== 'anamnesis'}>
                  <AnamnesisPanel />
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      <Dock onType={() => setSheet('type')} onFaceToFace={() => setSheet('face')} onSummary={openSummary} />

      {sheet === 'languages' && <LanguageSheet onClose={closeSheet} />}
      {sheet === 'settings' && (
        <SettingsSheet onClose={closeSheet} theme={theme} onTheme={changeTheme} onGuide={() => setSheet('tour')}
          onIntro={() => setSheet('intro')}
          onHistory={() => setSheet('history')}
        />
      )}
      {sheet === 'history' && <HistorySheet onClose={closeSheet} />}
      {sheet === 'summary' && <SummarySheet onClose={closeSheet} />}
      {sheet === 'type' && <TypeSheet onClose={closeSheet} />}
      {sheet === 'face' && (
        <FaceToFace
          initialVideo={faceVideo}
          onClose={() => {
            setFaceVideo(null);
            closeSheet();
          }}
        />
      )}
      {sheet === 'intro' && <IntroVideo onClose={closeIntro} />}
      {sheet === 'tour' && (
        <Tour
          onClose={() => {
            saveSettings({ onboardingDone: true });
            closeSheet();
          }}
        />
      )}

      <Toast />
      {locked && <AccessGate onUnlocked={() => setLocked(false)} />}
      {splash && <Splash onDone={finishSplash} />}
    </div>
  );
}
