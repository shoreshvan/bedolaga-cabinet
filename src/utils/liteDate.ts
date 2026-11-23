import { uiLocale } from './uiLocale';

/**
 * Дата словами: «15 октября», «15 октября 2027 г.» — если год не текущий.
 *
 * Простой экран говорит о подписке фразой, и «работает до 15.10.2026» читается
 * как строка из выписки, а не как ответ человеку. Год в подавляющем
 * большинстве случаев лишний: подписки живут месяцами, и человек и так знает,
 * какой сейчас год. Но у длинных подписок год — единственное, что отличает
 * «15 октября» от «15 октября» через год, поэтому его добавляем, когда он
 * действительно несёт смысл.
 */
export function formatLiteDate(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const locale = uiLocale();
  const year = new Intl.DateTimeFormat(locale, { year: 'numeric' });
  const sameYear = year.format(date) === year.format(now);
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}
