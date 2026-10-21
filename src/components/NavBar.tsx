import { ArrowLeftRight, ChevronDown, Clock, Plus, Settings, SquarePen } from 'lucide-react';
import { useMemo } from 'react';
import { LANGUAGES } from '../../shared/languages';
import type { Language } from '../../shared/types';
import { languageUsage } from '../lib/settings';
import { useStore } from '../lib/store';
import { engine } from '../live/engine';
import { Flag } from './ui';

export function NavBar({ onLanguages, onHistory, onSettings }: { onLanguages: () => void; onHistory: () => void; onSettings: () => void }) {
  const language = useStore(engine.store, (s) => s.language);
  const session = useStore(engine.store, (s) => s.session);
  const hasItems = useStore(engine.store, (s) => s.items.length > 0);

  return (
    <header className="relative z-20 pt-safe-nav shrink-0 select-none px-3 sm:px-5">
      <div className="glass h-[58px] rounded-[29px] flex items-center gap-2 pl-2.5 pr-2.5 sm:pl-3 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-2 min-w-0 sm:w-[220px]">
          <button type="button" onClick={onHistory} aria-label="Geçmiş konuşmalar" title="Geçmiş konuşmalar" className="pressable icon-btn !w-10 !h-10 cursor-pointer sm:hidden">
            <Clock className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
          <div className="hidden sm:flex items-center gap-2.5 min-w-0">
            <span className="relative shrink-0">
              <img src="/logo.png" alt="" className="w-9 h-9 rounded-[11px] bg-white shadow-card" />
              {session !== 'idle' && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sys-green ring-2 ring-bg" />}
            </span>
            <span className="leading-tight min-w-0">
              <span className="block text-[16px] font-semibold tracking-[-0.02em]">Tercüman</span>
              <span className="block text-[12px] text-label-2 truncate">Sağlık personeli ↔ hasta</span>
            </span>
          </div>
        </div>

        <div className="flex-1 flex justify-center min-w-0">
          <button
            type="button"
            onClick={onLanguages}
            className="pressable btn-gray h-10 pl-3 pr-2.5 rounded-full inline-flex items-center gap-2 text-[14px] font-semibold cursor-pointer min-w-0"
            title="Hastanın dilini değiştir"
          >
            <Flag iso="tr" label="Türkçe" size="xs" />
            <span className="hidden min-[400px]:inline">Türkçe</span>
            <ArrowLeftRight className="w-3.5 h-3.5 text-label-2 shrink-0" strokeWidth={2.5} />
            <Flag iso={language.flag} label={language.nameTr} size="xs" />
            <span className="truncate">{language.nameTr}</span>
            <ChevronDown className="w-4 h-4 text-label-2 shrink-0" strokeWidth={2.25} />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 sm:w-[220px]">
          <button type="button" onClick={onHistory} aria-label="Geçmiş konuşmalar" title="Geçmiş konuşmalar" className="pressable icon-btn !w-10 !h-10 cursor-pointer hidden sm:inline-flex">
            <Clock className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => engine.newConversation()}
            disabled={!hasItems}
            aria-label="Yeni konuşma"
            title="Konuşmayı arşive kaydet ve yenisini başlat"
            className="pressable icon-btn !w-10 !h-10 cursor-pointer text-accent disabled:opacity-35 disabled:cursor-default"
          >
            <SquarePen className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
          <button type="button" onClick={onSettings} aria-label="Ayarlar" title="Ayarlar" className="pressable icon-btn !w-10 !h-10 cursor-pointer">
            <Settings className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>
      </div>
    </header>
  );
}

/** Most used languages first, the active one always visible. */
export function frequentLanguages(active: Language, limit = 10): Language[] {
  const usage = languageUsage();
  const ranked = [...LANGUAGES].sort((a, b) => (usage[b.code] ?? 0) - (usage[a.code] ?? 0) || LANGUAGES.indexOf(a) - LANGUAGES.indexOf(b));
  return [active, ...ranked.filter((l) => l.code !== active.code)].slice(0, limit);
}

export function LanguageRail({ onAll }: { onAll: () => void }) {
  const language = useStore(engine.store, (s) => s.language);
  // Ranked once per launch: chips must not jump around while the nurse taps them
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally stable order
  const ranking = useMemo(() => frequentLanguages(language), []);
  const list = ranking.some((l) => l.code === language.code) ? ranking : [language, ...ranking.slice(0, -1)];
  return (
    <nav aria-label="Sık kullanılan diller" className="shrink-0 w-full max-w-[1600px] mx-auto select-none">
      <div className="fade-x flex items-center gap-2 overflow-x-auto no-scrollbar px-3 sm:px-5 pt-3 pb-2">
        {list.map((lang) => {
          const selected = lang.code === language.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => engine.setLanguage(lang)}
              aria-pressed={selected}
              className={`pressable h-9 pl-2.5 pr-3.5 rounded-full text-[13.5px] whitespace-nowrap inline-flex items-center gap-1.5 shrink-0 cursor-pointer ${
                selected ? 'chip-selected font-semibold' : 'bg-surface text-label font-medium shadow-card hover:bg-surface-2'
              }`}
            >
              <Flag iso={lang.flag} label={lang.nameTr} size="xs" />
              {lang.nameTr.split(' ')[0]}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onAll}
          className="pressable h-9 px-3.5 rounded-full text-[13.5px] font-semibold btn-tinted shadow-card whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
          Tüm Diller
        </button>
      </div>
    </nav>
  );
}
