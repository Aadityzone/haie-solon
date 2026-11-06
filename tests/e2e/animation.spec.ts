import { test, expect } from "@playwright/test";

/**
 * Animation integration cover.
 *
 * The public site splits motion between two libraries on purpose: GSAP owns
 * the cinematic hero entrance and the scroll-triggered section reveals, and
 * Motion for React owns local component transitions (the mobile menu, the
 * booking dialog, the gallery lightbox). These tests assert the boundary
 * holds — that GSAP content settles, that the visitor's reduced-motion
 * preference reaches both systems, and that navigation is never gated by an
 * animation.
 *
 * The spec runs in both configured Playwright projects (`desktop-chromium` and
 * `mobile-chromium`), so the same behaviour is verified at desktop and phone
 * sizes without hardcoding viewports.
 */
test.describe("animation integration", () => {
  test("the cinematic hero entrance settles into a stable, interactive state", async ({ page }) => {
    await page.goto("/");

    const hero = page.locator("#home");
    const title = hero.getByRole("heading", { level: 1 });
    await expect(title).toBeVisible();
    // GSAP leaves the copy fully opaque once the timeline completes.
    await expect(title).toHaveCSS("opacity", "1");

    // The primary booking action is a real destination, never held back for an
    // animation to finish.
    const book = hero.getByRole("link", { name: /book an appointment/i });
    await expect(book).toBeVisible();
    await book.click();
    await expect(page).toHaveURL(/\/book$/);
  });

  test("scroll-triggered gallery reveals settle the tiles into view", async ({ page }) => {
    await page.goto("/");

    const gallery = page.locator("#gallery");
    const firstTile = gallery.locator("button").first();
    await firstTile.scrollIntoViewIfNeeded();
    await expect(firstTile).toBeVisible();
    // The reveal is scoped to the tiles and ends at full opacity.
    await expect(firstTile).toHaveCSS("opacity", "1");
  });

  test("reduced motion skips the GSAP entrance and keeps booking immediate", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");

    const copy = page.locator("#home [data-hero-copy]");
    await expect(copy.first()).toBeVisible();

    // Under reduced motion the GSAP effect returns early, so it writes no
    // inline opacity/transform onto the hero copy.
    const inlineStyles = await copy.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("style") ?? "")
    );
    expect(inlineStyles.length).toBeGreaterThan(0);
    for (const style of inlineStyles) {
      expect(style).not.toMatch(/opacity|transform/);
    }

    // The booking action is present and usable without any entrance animation.
    const book = page.locator("#home").getByRole("link", { name: /book an appointment/i });
    await expect(book).toBeVisible();

    await context.close();
  });

  test("navigation transitions never block reaching a section", async ({ page }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: /open navigation menu/i });
    if (await toggle.isVisible()) {
      // Phone/tablet: the Motion-driven full-screen menu opens, navigates, and
      // closes itself.
      await toggle.click();
      const menu = page.getByRole("dialog", { name: /mobile navigation/i });
      await expect(menu).toBeVisible();
      await menu.getByRole("link", { name: /^services$/i }).click();
      await expect(menu).toBeHidden();
      await expect(page).toHaveURL(/#services$/);
    } else {
      // Desktop: the inline navigation is present and reaches the section.
      await page.getByRole("banner").getByRole("link", { name: /^services$/i }).click();
      await expect(page).toHaveURL(/#services$/);
    }
  });

  test("the entrance and scroll reveals raise no console errors", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(String(error)));

    await page.goto("/");
    await expect(page.locator("#home h1")).toBeVisible();
    await page.locator("#gallery button").first().scrollIntoViewIfNeeded();
    // Let the ScrollTrigger reveal run to completion before checking.
    await page.waitForTimeout(1200);

    expect(problems).toEqual([]);
  });
});
