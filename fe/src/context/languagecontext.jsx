import React, { createContext, useState, useContext, useEffect } from "react";
import { translations } from "../i18n/translations.js";

const LanguageContext = createContext(null);

export const getStoredTranslation = (key, fallback = null) => {
  const savedLanguage = localStorage.getItem("language");
  const language = savedLanguage && translations[savedLanguage] ? savedLanguage : "vi";
  return translations[language]?.[key] ?? (fallback !== null ? fallback : key);
};

export const getStoredLocale = () => {
  const savedLanguage = localStorage.getItem("language");
  if (savedLanguage === "zh") return "zh-CN";
  if (savedLanguage === "en") return "en-US";
  return "vi-VN";
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguageState] = useState(() => {
    const saved = localStorage.getItem("language");
    return saved && translations[saved] ? saved : "vi";
  });

  const setLanguage = (lang) => {
    if (translations[lang]) {
      setLanguageState(lang);
      localStorage.setItem("language", lang);
    }
  };

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
  }, [language]);

  const t = (key, fallback = null) => {
    if (!key) return "";

    // Check local translations first
    const langDict = translations[language];
    if (langDict && langDict[key] !== undefined) {
      return langDict[key];
    }

    return fallback !== null ? fallback : key;
  };

  const locale = language === "zh" ? "zh-CN" : language === "en" ? "en-US" : "vi-VN";

  return (
    <LanguageContext.Provider value={{ language, setLanguage, locale, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
