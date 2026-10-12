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
