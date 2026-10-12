import type { Weekday } from "@/types/domain";

type WeekInfo = { firstDay: number };
type LocaleWithWeekInfo = Intl.Locale & { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo };

/**
 * First day of the week for a locale: Sunday for en-US, Monday for uk-UA,
 * Saturday for ar-EG. Uses Intl week data (`getWeekInfo()` in newer engines,
 * the older `weekInfo` getter in Node 22); falls back to Monday.
 */
export function firstDayOfWeek(locale: string | undefined): Weekday {
  if (!locale) return 1;
  try {
    const intlLocale = new Intl.Locale(locale) as LocaleWithWeekInfo;
    const info = intlLocale.getWeekInfo?.() ?? intlLocale.weekInfo;
    // Intl numbers days 1 (Monday) .. 7 (Sunday); ours are 0 (Sunday) .. 6.
    return info ? ((info.firstDay % 7) as Weekday) : 1;
  } catch {
    return 1;
  }
}

/** The preferred locale from an Accept-Language header ("uk-UA,uk;q=0.9,en;q=0.8" -> "uk-UA"). */
export function localeFromAcceptLanguage(header: string | null): string | undefined {
  const first = header?.split(",")[0]?.split(";")[0]?.trim();
  return first && first !== "*" ? first : undefined;
}
