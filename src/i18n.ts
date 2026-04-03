import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "@/locales/en/translation.json";
import de from "@/locales/de/translation.json";

i18n
  .use(LanguageDetector) // detect user language
  .use(initReactI18next) // pass i18n instance to react-i18next
  .init({
    fallbackLng: "en",
    debug: import.meta.env.DEV,
    interpolation: {
      escapeValue: false, // react already safes from xss
    },
    resources: {
      en: { translation: en },
      de: { translation: de },
    },
  });
export default i18n;
