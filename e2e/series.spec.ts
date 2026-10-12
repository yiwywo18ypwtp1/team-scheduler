import { expect, test } from "@playwright/test";
import { addDays, mondayInWeeks, scrollGridTo, weekUrl } from "./helpers";

test("'this and following' on a series changes later occurrences and keeps earlier ones", async ({ page, request }) => {
  const monday = mondayInWeeks(4);
  // Daily, 5 times, Mon-Fri 06:00-06:30 Kyiv.
  const created = await request.post("/api/events", {
    data: {
      title: "E2E series",
      description: "",
      allDay: false,
      startDate: monday,
      startTime: "06:00",
      endDate: monday,
      endTime: "06:30",
      timezone: "Europe/Kyiv",
      attendeeIds: ["mem_01"],
      location: { kind: "none" },
      recurrence: { freq: "daily", interval: 1, weekdays: [], monthlyMode: "dayOfMonth", end: "count", count: 5, until: "", custom: "" },
    },
  });
  expect(created.status()).toBe(201);

  await page.goto(weekUrl(monday));
  await scrollGridTo(page, 5);
  const occurrences = page.getByRole("link", { name: /^E2E series, / });
  await expect(occurrences).toHaveCount(5);

  // Wednesday's occurrence -> 07:00, this and following.
  await page.getByRole("gridcell", { name: /^Wednesday/ }).getByRole("link", { name: /^E2E series, 06:00/ }).click();
  const dialog = page.getByRole("dialog", { name: "Event" });
  await dialog.getByLabel("Start time").fill("07:00");
  await dialog.getByLabel("End time").fill("07:30");
  await dialog.getByRole("button", { name: "Save" }).click();
  await dialog.getByRole("radio", { name: "This and following events" }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  const byDay = async () =>
    occurrences.evaluateAll((links) =>
      links
        .map((link) => `${link.closest('[role="gridcell"]')?.getAttribute("aria-label")?.split(",")[0]} ${link.getAttribute("aria-label")?.split(", ")[1]?.slice(0, 5)}`)
        .sort(),
    );
  await expect.poll(byDay).toEqual(["Friday 07:00", "Monday 06:00", "Thursday 07:00", "Tuesday 06:00", "Wednesday 07:00"]);

  // Same through the API: the past part is untouched, the following part moved.
  const list = await request.get(`/api/events?from=${monday}&to=${addDays(monday, 6)}&tz=Europe/Kyiv&members[]=mem_01`);
  const times = ((await list.json()).events as { title: string; start: string }[])
    .filter((event) => event.title === "E2E series")
    .map((event) => event.start.slice(0, 16));
  expect(times).toEqual([
    `${monday}T06:00`,
    `${addDays(monday, 1)}T06:00`,
    `${addDays(monday, 2)}T07:00`,
    `${addDays(monday, 3)}T07:00`,
    `${addDays(monday, 4)}T07:00`,
  ]);
});
