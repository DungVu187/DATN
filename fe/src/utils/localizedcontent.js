export const getLocalizedText = (translations, language, fallback = "") => {
  if (!translations || typeof translations !== "object") return fallback || "";
  return translations[language]
    || translations.vi
    || fallback
    || "";
};
