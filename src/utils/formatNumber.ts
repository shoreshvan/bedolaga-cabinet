import { uiLocale } from './uiLocale';

/**
 * Числа по правилам языка интерфейса: «3 002,00» на русском, «3,002.00» на английском.
 * `toFixed` для экрана не годится — он всегда пишет точку и не делит разряды.
 */

export function formatDecimal(
  value: number,
  decimals: number,
  locale: string = uiLocale(),
): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Самое маленькое ненулевое значение, которое ещё видно с одним знаком после запятой. */
const MIN_VISIBLE_GB = 0.1;

/**
 * Гигабайты в админке: целые — без «,0», дробные — один знак. Ненулевой расход меньше
 * десятой показывается как «0,1», чтобы человек с трафиком не выглядел как «0».
 */
export function formatGb(value: number, locale: string = uiLocale()): string {
  const shown = value > 0 && value < MIN_VISIBLE_GB ? MIN_VISIBLE_GB : value;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(shown);
}

/** «870 / 1 500 ГБ»: лимиты в админке задаются в гигабайтах, единица одна на пару. */
export function formatGbPair(
  usedGb: number,
  limitGb: number,
  unit: string,
  locale: string = uiLocale(),
): string {
  return `${formatGb(usedGb, locale)} / ${formatGb(limitGb, locale)} ${unit}`;
}

/**
 * Подпись лимита трафика тарифа на языке интерфейса («100 گیگ» / «نامحدود»).
 * Сервер присылает готовый `traffic_limit_label` на русском («100 ГБ»),
 * поэтому витрина строит подпись из числового `traffic_limit_gb`.
 * Если числа нет (старые моки), откатывается на серверную строку,
 * чтобы ничего не ломалось.
 */
export function trafficLimitLabel(
  tariff: {
    traffic_limit_gb?: number;
    is_unlimited_traffic?: boolean;
    traffic_limit_label: string;
  },
  t: (key: string) => string,
  language?: string,
): string {
  if (tariff.is_unlimited_traffic || tariff.traffic_limit_gb === 0) {
    return t('subscription.unlimited');
  }
  if (Number.isFinite(tariff.traffic_limit_gb)) {
    return `${formatGb(tariff.traffic_limit_gb as number, uiLocale(language))} ${t('common.units.gb')}`;
  }
  return tariff.traffic_limit_label;
}

/** С какого значения подписи оси сокращаются («12 тыс.», «4 млн»). */
const AXIS_COMPACT_FROM = 10_000;

/**
 * Подпись оси графика. Ширина оси считается по самой длинной подписи, и «4000000»
 * съедало пол-графика на телефоне (а при фиксированной ширине — обрезалось до «00000»).
 * Крупные значения — коротко, по правилам языка: «4 млн», «4M», «400万».
 */
export function formatAxisTick(value: number, locale: string = uiLocale()): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) < AXIS_COMPACT_FROM) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  }
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}
