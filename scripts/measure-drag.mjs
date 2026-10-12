// Measures drag-n-drop performance in the week view (spec section 4).
//
// Usage: npm run build && npm start   (in another terminal)
//        npm run measure:drag
//
// Opens a team week (~190 events) in the installed Google Chrome, drags one
// event for 60 steps (one per frame) at normal and 4x throttled CPU, and
// reports frame times (requestAnimationFrame), long tasks and which grid
// elements changed in the DOM during the drag. Escape cancels the drag at the
// end, so no data is modified.
import { chromium } from "playwright-core";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CAL = `${BASE}/calendar?view=week&date=2026-10-14&tz=Europe%2FKyiv&show=team`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const cdp = await page.context().newCDPSession(page);
await page.goto(CAL);
await page.getByRole("grid").waitFor();
const total = await page.locator('[role="gridcell"] a[href^="/calendar/events/"], [role="gridcell"] > div > a').count();
const timed = await page.locator('[role="gridcell"] a.absolute').count();
console.log(`events in week view: ${total} (timed blocks in grid: ${timed})`);

// The current user's own event (draggable): not opacity-faded, blue-toned.
const block = page.locator('[role="gridcell"] a.absolute.cursor-grab').nth(5);
await block.scrollIntoViewIfNeeded();
const box = await block.boundingBox();

for (const rate of [1, 4]) {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  await page.evaluate(() => {
    const w = window;
    w.__frames = []; w.__longTasks = []; w.__mutated = new Set(); w.__recording = true;
    let last = performance.now();
    const tick = (t) => { if (!w.__recording) return; w.__frames.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__longTasks.push(e.duration))).observe({ type: "longtask" });
    const grid = document.querySelector('[role="grid"]');
    w.__observer = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        const owner = el.closest("a[aria-label]") ?? el.closest(".z-30") ?? el;
        w.__mutated.add(owner.getAttribute("aria-label") ?? owner.className.split(" ").slice(0, 3).join("."));
      }
    });
    w.__observer.observe(grid, { subtree: true, childList: true, attributes: true, characterData: true });
  });

  await page.mouse.move(box.x + box.width / 2, box.y + 5);
  await page.mouse.down();
  for (let i = 1; i <= 60; i++) {
    await page.mouse.move(box.x + box.width / 2 + i * 6, box.y + 5 + i * 4);
    await page.waitForTimeout(16);
  }
  await page.keyboard.press("Escape"); // measure the drag itself, don't persist a move
  await page.mouse.up();

  const r = await page.evaluate(() => {
    const w = window; w.__recording = false; w.__observer.disconnect();
    const f = w.__frames.slice(2).sort((a, b) => a - b);
    return {
      frames: f.length,
      p50: f[Math.floor(f.length * 0.5)].toFixed(1),
      p95: f[Math.floor(f.length * 0.95)].toFixed(1),
      max: f.at(-1).toFixed(1),
      over33ms: f.filter((x) => x > 33.4).length,
      longTasks: w.__longTasks.length,
      mutated: [...w.__mutated],
    };
  });
  console.log(`\nCPU x${rate}: frames=${r.frames} p50=${r.p50}ms p95=${r.p95}ms max=${r.max}ms frames>33ms=${r.over33ms} longtasks=${r.longTasks}`);
  console.log(`  elements mutated during drag (${r.mutated.length}):`, r.mutated);
}
await browser.close();
