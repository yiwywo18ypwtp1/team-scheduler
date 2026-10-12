/**
 * Timezones offered in pickers. Hand-picked instead of Intl.supportedValuesOf,
 * which returns legacy names ("Europe/Kiev", "Asia/Calcutta") and omits "UTC".
 * Any other valid IANA name still works when passed via the URL.
 */
export const TIME_ZONE_OPTIONS = [
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Kyiv",
  "Europe/Istanbul",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Pacific/Honolulu",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "America/Santiago",
] as const;

/**
 * Renamed IANA zones that browsers still report (Chrome returns
 * "Asia/Calcutta" for a guest in India). Both names work for maths; this only
 * makes the detected zone match the names used everywhere else.
 */
const LEGACY_TIME_ZONES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Europe/Kiev": "Europe/Kyiv",
  "Europe/Uzhgorod": "Europe/Kyiv",
  "Europe/Zaporozhye": "Europe/Kyiv",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "America/Godthab": "America/Nuuk",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "Atlantic/Faeroe": "Atlantic/Faroe",
};

export function canonicalTimeZone(timeZone: string): string {
  return LEGACY_TIME_ZONES[timeZone] ?? timeZone;
}
