// @ts-check
const { test, expect } = require("@playwright/test");
const path = require("node:path");

// Exercises the golden path against a real running server: load the app,
// switch to English, solve the seeded sample project, and confirm the Gantt
// actually rendered a schedule (not just "200 OK" — solver correctness is
// covered by the Python test suite; this only guards the UI wiring).
test("loads, solves the sample project, and renders a schedule", async ({ page }) => {
  // skip the first-visit onboarding tour, which otherwise blocks all clicks
  await page.addInitScript(() => localStorage.setItem("labplanner.onboarded", "1"));
  await page.goto("/");
  await expect(page.locator('[data-tab="schedule"]')).toBeVisible();

  await page.locator("#langBtn").click();
  await page.locator(".lang-item", { hasText: "English" }).click();

  await page.locator('[data-tab="schedule"]').click();
  await page.locator("#btnSolve").click();
  await expect(page.locator("#status .badge.ok")).toHaveText(/OPTIMAL|FEASIBLE/, {
    timeout: 30_000,
  });
  await expect(page.locator("#ganttwrap svg")).toBeVisible();

  await page.screenshot({
    path: path.join(__dirname, "..", "docs", "screenshot.png"),
    clip: { x: 0, y: 0, width: 1280, height: 800 },
  });
});
