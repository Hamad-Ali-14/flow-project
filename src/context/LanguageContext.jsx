import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { translations } from "../i18n/translations";

const LanguageContext = createContext(null);
const LANG_KEY = "flow-lang";
const LANG_EVENT = "flow-lang-changed";

export const AVAILABLE_LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "ur", label: "اردو (Urdu)", native: "اردو" },
];

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "ar") {
        localStorage.setItem(LANG_KEY, "en");
        return "en";
      }
      if (saved && (saved === "en" || saved === "ur")) {
        return saved;
      }
    } catch {
      /* ignore */
    }
    return "en";
  });

  const isRtl = lang === "ur";
  const dir = isRtl ? "rtl" : "ltr";

  // Sync document attributes and body class
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    if (isRtl) {
      document.documentElement.classList.add("rtl");
      document.body.classList.add("rtl");
    } else {
      document.documentElement.classList.remove("rtl");
      document.body.classList.remove("rtl");
    }
  }, [lang, dir, isRtl]);

  const setLang = useCallback((code) => {
    if (code !== "en" && code !== "ur") return;
    try {
      localStorage.setItem(LANG_KEY, code);
      window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: code }));
    } catch {
      /* ignore */
    }
    setLangState(code);
  }, []);

  // Listen to external language changes if any
  useEffect(() => {
    const handler = (e) => {
      if (e.detail && (e.detail === "en" || e.detail === "ur")) {
        setLangState(e.detail);
      }
    };
    window.addEventListener(LANG_EVENT, handler);
    return () => window.removeEventListener(LANG_EVENT, handler);
  }, []);

  const t = useCallback(
    (key, fallback = "") => {
      const dict = translations[lang] || translations.en;
      if (dict && dict[key] !== undefined) return dict[key];
      const enDict = translations.en;
      if (enDict && enDict[key] !== undefined) return enDict[key];
      return fallback || key;
    },
    [lang]
  );

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t,
      dir,
      isRtl,
      languages: AVAILABLE_LANGUAGES,
    }),
    [lang, setLang, t, dir, isRtl]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}
