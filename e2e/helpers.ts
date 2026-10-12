import type { Page } from "@playwright/test";

/** yyyy-MM-dd of `date` + `days` (UTC calendar arithmetic is enough for test dates). */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Monday of the week `weeksAhead` weeks from now. */
export function mondayInWeeks(weeksAhead: number): string {
  const today = new Date().toISOString().slice(0, 10);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, ((8 - weekday) % 7 || 7) + 7 * (weeksAhead - 1));
}

export const weekUrl = (date: string) => `/calendar?view=week&date=${date}&tz=Europe%2FKyiv`;

/** Scrolls the week grid so that `hour` is at the top. */
export async function scrollGridTo(page: Page, hour: number) {
  await page.locator("[data-scroll-container]").evaluate((element, top) => (element.scrollTop = top), hour * 48);
}

/** "Wednesday, October 14" label of the day column an event block is in. */
export function columnOf(page: Page, label: string) {
  return page
    .locator(`[role="gridcell"] a[aria-label^="${label}"]`)
    .first()
    .evaluate((element) => element.closest('[role="gridcell"]')?.getAttribute("aria-label"));
}
