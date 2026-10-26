import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { en, english } from "./locales/en";
import { es, spanish } from "./locales/es";
import { zh, chinese } from "./locales/zh";
import { zh_tw, traditionalChinese } from "./locales/zh-tw";

export const languages = [english, spanish, chinese, traditionalChinese].sort(
  (a, b) => a.name.localeCompare(b.name),
);

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    resources: {
      en,
      es,
      zh,
      "zh-TW": zh_tw,
    },
  });

export default i18n;
