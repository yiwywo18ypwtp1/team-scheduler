import { expect, test } from "@playwright/test";
import { addDays, columnOf, mondayInWeeks, scrollGridTo, weekUrl } from "./helpers";

test("create an event by dragging, move it to another day, reload: it stays there", async ({ page }) => {
  const monday = mondayInWeeks(3);
  const saturday = addDays(monday, 5);
  await page.goto(weekUrl(monday));
  await scrollGridTo(page, 19);

  // Drag over the empty grid on Saturday, 20:00-21:00.
  const satColumn = page.locator('[role="gridcell"]').filter({ has: page.locator("[data-create-area]") }).nth(5);
  const area = await satColumn.locator("[data-create-area]").boundingBox();
  if (!area) throw new Error("no grid");
  const y20 = area.y + 20 * 48 + 2;
  await page.mouse.move(area.x + 40, y20);
  await page.mouse.down();
  for (let step = 1; step <= 6; step++) await page.mouse.move(area.x + 40, y20 + step * 8);
  await page.mouse.up();

  const dialog = page.getByRole("dialog", { name: "New event" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Start", { exact: true })).toHaveValue(saturday);
  await expect(dialog.getByLabel("Start time")).toHaveValue("20:00");
  await dialog.getByLabel("Title").fill("E2E drag-created");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  const block = page.getByRole("link", { name: /^E2E drag-created, 20:00/ });
  await expect(block).toBeVisible();
  expect(await columnOf(page, "E2E drag-created")).toMatch(/^Saturday/);

  // Drag it one column to the right (Sunday).
  await scrollGridTo(page, 19);
  const box = await block.boundingBox();
  const columnWidth = area.width;
  if (!box) throw new Error("no block");
  await page.mouse.move(box.x + 10, box.y + 6);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) await page.mouse.move(box.x + 10 + (columnWidth * step) / 10, box.y + 6);
  await page.mouse.up();
  await expect.poll(() => columnOf(page, "E2E drag-created")).toMatch(/^Sunday/);

  await page.reload();
  await expect(page.getByRole("link", { name: /^E2E drag-created, 20:00/ })).toBeAttached();
  expect(await columnOf(page, "E2E drag-created")).toMatch(/^Sunday/);
});
