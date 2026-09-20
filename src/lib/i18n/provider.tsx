"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  localeFor,
  translate,
  type Lang,
  type MessageKey,
} from "@/lib/i18n/messages";

type Ctx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  locale: string;
};

const LanguageContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "tdt-lang";

async function resolveDefaultLang(): Promise<Lang> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "it" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  // Public GitHub checkouts: English. Author machines: owner-prefs.json → it.
  try {
    const res = await fetch("/owner-prefs.json", { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { defaultLang?: string };
      if (data.defaultLang === "it" || data.defaultLang === "en") {
        return data.defaultLang;
      }
    }
  } catch {
    /* missing = public */
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void resolveDefaultLang().then((next) => {
      setLangState(next);
      document.documentElement.lang = next;
      setReady(true);
    });
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = next;
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      translate(lang, key, vars),
    [lang],
  );

  const value = useMemo(
    () => ({ lang, setLang, t, locale: localeFor(lang) }),
    [lang, setLang, t],
  );

  // Avoid flashing English on the author's machine before owner-prefs loads.
  if (!ready) return null;

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang requires LanguageProvider");
  return ctx;
}
