import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Lang, TranslationKey, translations } from '../i18n/translations';

const STORAGE_KEY = 'rpg_lang';

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

// ─── Safe fallback used when hook is called outside the provider ──────────────
function makeFallback(): LanguageContextType {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  const lang: Lang = (stored === 'en' || stored === 'id') ? stored : 'id';
  return {
    lang,
    setLang: () => {},
    t: (key: TranslationKey) => translations[key]?.[lang] ?? key,
  };
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored === 'en' || stored === 'id') ? stored : 'id';
  });

  const setLang = useCallback((newLang: Lang) => {
    localStorage.setItem(STORAGE_KEY, newLang);
    setLangState(newLang);
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    return translations[key][lang];
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) return makeFallback();
  return ctx;
}