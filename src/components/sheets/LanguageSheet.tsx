import { Check, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LANGUAGES } from '../../../shared/languages';
import { fold } from '../../../shared/text';
import type { Language } from '../../../shared/types';
import { useStore } from '../../lib/store';
import { engine } from '../../live/engine';
import { frequentLanguages } from '../NavBar';
import { Flag, SectionHeader, Sheet } from '../ui';

function Row({ lang, selected, onPick }: { lang: Language; selected: boolean; onPick: (l: Language) => void }) {
  return (
    <button type="button" onClick={() => onPick(lang)} aria-pressed={selected} className="w-full flex items-center gap-3 px-4 py-2.5 text-left cursor-pointer transition-colors hover:bg-fill-2 active:bg-fill">
      <Flag iso={lang.flag} label={lang.nameTr} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] tracking-[-0.016em] truncate">
          {lang.nameTr}
          <span className="ml-1.5 text-label-2" dir="auto">
            {lang.native}
          </span>
        </span>
        <span className="block text-[13px] text-label-2 truncate">{lang.country}</span>
      </span>
      {selected && <Check className="w-5 h-5 text-accent shrink-0" strokeWidth={2.5} />}
    </button>
  );
}

export function LanguageSheet({ onClose }: { onClose: () => void }) {
  const current = useStore(engine.store, (s) => s.language);
  const [query, setQuery] = useState('');
  const [viewport, setViewport] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Keep the sheet above the on-screen keyboard (iOS Safari, Android Chrome)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewport(vv.height);
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);

  const q = fold(query.trim());
  const results = useMemo(
    () => (q ? LANGUAGES.filter((l) => [l.name, l.nameTr, l.native, l.country].some((t) => fold(t).includes(q))) : LANGUAGES),
    [q],
  );
  const frequent = useMemo(() => frequentLanguages(current, 5), [current]);

  const pick = (lang: Language) => {
    engine.setLanguage(lang);
    onClose();
  };

  return (
    <Sheet
      onClose={onClose}
      title="Hastanın Dili"
      subtitle={`${LANGUAGES.length} dil · ülke veya dil adıyla arayın`}
      width="sm:max-w-md"
      tall
      bodyClass="px-4 sm:px-5 pb-6"
      overlayStyle={viewport ? { height: viewport } : undefined}
    >
      <div className="sheet-sticky sticky top-0 z-10 pb-3">
        <label className="relative flex items-center">
          <Search className="w-4 h-4 absolute left-3 text-label-2 pointer-events-none" strokeWidth={2.25} />
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            placeholder="Ara: Arapça, Rusya, Deutsch…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="field w-full h-10 pl-9 pr-9 text-[16px]"
            aria-label="Dil ara"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                input.current?.focus();
              }}
              aria-label="Aramayı temizle"
              className="absolute right-2.5 w-5 h-5 rounded-full bg-label-3 text-bg flex items-center justify-center cursor-pointer"
            >
              <X className="w-3 h-3" strokeWidth={3} />
            </button>
          )}
        </label>
      </div>

      {!q && (
        <div className="mb-5">
          <SectionHeader>Sık kullanılanlar</SectionHeader>
          <div className="group-list">
            {frequent.map((l) => (
              <Row key={l.code} lang={l} selected={l.code === current.code} onPick={pick} />
            ))}
          </div>
        </div>
      )}

      {results.length > 0 ? (
        <div>
          {!q && <SectionHeader>Tüm diller</SectionHeader>}
          <div className="group-list">
            {results.map((l) => (
              <Row key={l.code} lang={l} selected={l.code === current.code} onPick={pick} />
            ))}
          </div>
        </div>
      ) : (
        <div className="py-14 text-center">
          <p className="text-[17px] font-semibold">Sonuç yok</p>
          <p className="text-[14px] text-label-2 mt-1">“{query}” için bir dil bulunamadı.</p>
        </div>
      )}
    </Sheet>
  );
}
