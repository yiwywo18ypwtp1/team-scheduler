import { expect, test, type Page } from "@playwright/test";

async function pickFirstSlotAndAnswer(page: Page, name: string) {
  await page.goto("/book/intro-call");
  await page.getByRole("group", { name: "Times" }).getByRole("button").first().click();
  await page.getByLabel(/Your name/).fill(name);
  await page.getByLabel(/^Email/).fill(`${name.toLowerCase()}@example.com`);
  await page.getByLabel(/What is it about/).selectOption("Pricing");
  await page.getByLabel(/prepare/).fill(`Notes from ${name}`);
}

test("two guests race for one slot: the second sees a clear error, alternatives and keeps the answers", async ({ browser }) => {
  const guestA = await (await browser.newContext({ timezoneId: "Asia/Kolkata" })).newPage();
  const guestB = await (await browser.newContext({ timezoneId: "America/Los_Angeles" })).newPage();

  // Both have the same slot selected and the form filled in.
  await pickFirstSlotAndAnswer(guestA, "Alice");
  await pickFirstSlotAndAnswer(guestB, "Bob");

  await guestA.getByRole("button", { name: "Book" }).click();
  await expect(guestA).toHaveURL(/\/confirmed\//);
  await expect(guestA.getByRole("heading", { name: "You're booked" })).toBeVisible();

  await guestB.getByRole("button", { name: "Book" }).click();
  const alert = guestB.getByRole("alert").filter({ hasText: "someone just booked that time" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("button")).not.toHaveCount(0);
  await expect(guestB.getByLabel(/Your name/)).toHaveValue("Bob");
  await expect(guestB.getByLabel(/prepare/)).toHaveValue("Notes from Bob");

  // Taking an alternative books without retyping anything.
  await alert.getByRole("button").first().click();
  await guestB.getByRole("button", { name: "Book" }).click();
  await expect(guestB).toHaveURL(/\/confirmed\//);
  await expect(guestB.locator("dl")).toContainText("Notes from Bob");
});
