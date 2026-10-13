import i18n, { type ResourceLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { getTelegramLanguageCode } from './hooks/useTelegramSDK';

const localeLoaders: Record<string, () => Promise<{ default: ResourceLanguage }>> = {
  fa: () => import('./locales/fa.json'),
  ru: () => import('./locales/ru.json'),
  en: () => import('./locales/en.json'),
  zh: () => import('./locales/zh.json'),
};

// همه دیکشنری‌ها در کد می‌مانند، ولی فقط این‌ها روشن‌اند.
// برای روشن کردن دوباره یک زبان، کافیست کدش را اینجا اضافه کنی.
export const ENABLED_LANGS = ['fa'] as const;
export type EnabledLang = (typeof ENABLED_LANGS)[number];

// همه زبان‌های موجود در کد (خاموش‌ها هم چانک‌شان بیلد می‌شود).
export const ALL_LANGS = Object.keys(localeLoaders);
const FALLBACK_LNG: EnabledLang = 'fa';
const LANGUAGE_STORAGE_KEY = 'cabinet_language';

function normalizeLang(lng: string | undefined | null): EnabledLang {
  const code = (lng || '').split('-')[0];
  return (ENABLED_LANGS as readonly string[]).includes(code)
    ? (code as EnabledLang)
    : FALLBACK_LNG;
}

// مهاجرت کاربرانی که قبلا ru/en/zh داشتند: مقدار خاموش را همان اول به fa برگردان
// تا LanguageDetector دوباره همان زبان خاموش را برندارد.
try {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && normalizeLang(stored) !== stored.split('-')[0]) {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, FALLBACK_LNG);
  }
} catch {
  // Хранилище заблокировано — i18next сам упадёт на fallback.
}

const loadedLanguages = new Set<string>();

async function loadLanguage(lng: string): Promise<void> {
  if (loadedLanguages.has(lng)) return;

  const loader = localeLoaders[lng];
  if (!loader) return;

  const mod = await loader();
  i18n.addResourceBundle(lng, 'translation', mod.default, true, true);
  loadedLanguages.add(lng);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: FALLBACK_LNG,
    supportedLngs: [...ENABLED_LANGS],
    partialBundledLanguages: true,

    detection: {
      // تک‌زبانه: navigator عمدا کنار گذاشته شده تا مرورگر ru/en کاربر تازه
      // زبان رابط را از fa منحرف نکند. برای چندزبانه کردن دوباره، برگردان به
      // ['localStorage', 'navigator'].
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'cabinet_language',
    },

    interpolation: {
      escapeValue: false,
    },

    react: {
      useSuspense: false,
    },
  });

// Load detected language + fallback on startup.
// چون فقط fa روشن است، عملا فقط همان لود می‌شود؛ اگر detector چیزی خاموش
// برگرداند، normalize به fa برمی‌گرداند تا چانک اضافی ru/en/zh لود نشود.
const detectedLng = normalizeLang(i18n.language);
const langsToLoad = [...new Set([FALLBACK_LNG, detectedLng])];

// Сколько ждать словари, прежде чем рисовать без них. Белый экран хуже
// непереведённого текста: если чанк локали не приехал (сеть отвалилась, прокси
// отдал 502), приложение обязано появиться.
const READY_TIMEOUT_MS = 5000;

/**
 * Резолвится, когда словари активного языка зарегистрированы в i18next.
 *
 * Локали лежат в отдельных ленивых чанках (~75 КБ gzip), а `useSuspense`
 * выключен — значит react-i18next не приостановит отрисовку и `t('auth.login')`
 * вернёт сам ключ. С прогретым кэшем чанк приходил раньше первой отрисовки и
 * этого не было видно; на холодном интерфейс успевал нарисоваться с сырыми
 * ключами. Точка входа ждёт этот промис перед `createRoot().render()`.
 *
 * Никогда не реджектится и не висит дольше READY_TIMEOUT_MS.
 */
export const i18nReady: Promise<void> = Promise.race([
  Promise.all(langsToLoad.map(loadLanguage)).then(() => undefined),
  new Promise<void>((resolve) => setTimeout(resolve, READY_TIMEOUT_MS)),
]).catch(() => undefined);

// Keep <html lang> + dir in sync with i18n so screen readers pronounce
// content correctly, browsers don't offer to translate it, and RTL
// languages (fa) flip layout direction. index.html ships with lang="fa"
// for the first paint; runtime updates take over from there.
const RTL_LANGS = new Set(['fa', 'ar', 'he', 'ur']);
function syncHtmlLang(lng: string): void {
  const code = lng.split('-')[0];
  if (typeof document === 'undefined') return;
  if (document.documentElement.lang !== code) {
    document.documentElement.lang = code;
  }
  const dir = RTL_LANGS.has(code) ? 'rtl' : 'ltr';
  if (document.documentElement.dir !== dir) {
    document.documentElement.dir = dir;
  }
}
syncHtmlLang(detectedLng);

// Lazy-load on language change.
// نگهبان تک‌زبانه: اگر جایی (کش قدیمی، فراخوانی دستی) زبان خاموش ست شد،
// برگردان به fa تا رابط همیشه فارسی بماند.
i18n.on('languageChanged', (lng: string) => {
  const code = lng.split('-')[0];
  if (!(ENABLED_LANGS as readonly string[]).includes(code)) {
    if (code !== FALLBACK_LNG) void i18n.changeLanguage(FALLBACK_LNG);
    syncHtmlLang(FALLBACK_LNG);
    return;
  }
  loadLanguage(code);
  syncHtmlLang(code);
});

/**
 * On first run inside Telegram (no explicit stored choice), adopt the user's
 * Telegram client language. Must be called after the Telegram SDK is initialised
 * (e.g. from main.tsx), since launch params are unavailable before init().
 */
export function applyTelegramLanguage(): Promise<void> {
  try {
    if (localStorage.getItem(LANGUAGE_STORAGE_KEY)) return Promise.resolve(); // explicit choice wins
  } catch {
    return Promise.resolve();
  }
  const code = getTelegramLanguageCode();
  if (
    code &&
    (ENABLED_LANGS as readonly string[]).includes(code) &&
    normalizeLang(i18n.language) !== code
  ) {
    i18n.changeLanguage(code);
    // Возвращаем именно загрузку словаря, а не changeLanguage: обработчик
    // languageChanged тянет чанк отдельно, и без этого ожидания точка входа
    // нарисовала бы новый язык до его словаря — те же сырые ключи.
    return loadLanguage(code).catch(() => undefined);
  }
  return Promise.resolve();
}

export default i18n;
