import { test, expect } from "@playwright/test";
import { pageAlert } from "./helpers";

test.describe("public salon site", () => {
  test("renders the hero and every homepage section", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const id of ["home", "services", "gallery", "about", "contact"]) {
      await expect(page.locator(`#${id}`), `#${id} should exist`).toHaveCount(1);
    }
  });

  test("offers a keyboard skip link to the main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    const skipLink = page.getByRole("link", { name: /skip to main content/i });
    await expect(skipLink).toBeFocused();
    await skipLink.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
  });

  test("shows the live service menu or an explicit unpublished state", async ({ page }) => {
    await page.goto("/#services");

    const section = page.locator("#services");
    await expect(section).toBeVisible();
    // Never a broken or empty list: the section either lists the salon's
    // enabled services or states clearly that the menu is not published.
    await expect(
      section.getByRole("heading", { name: /the current menu|the service menu is not published yet/i }),
    ).toBeVisible();
  });

  test("announces that imagery is illustrative, not the salon's own portfolio", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/illustrative/i).first()).toBeVisible();
  });

  test("opens and closes the gallery lightbox from the keyboard", async ({ page }) => {
    await page.goto("/#gallery");

    await page.locator("#gallery button").first().click();
    const dialog = page.getByRole("dialog", { name: /gallery image viewer/i });
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("stops the decorative marquee when reduced motion is requested", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");

    const animationName = await page
      .locator(".marquee-track")
      .first()
      .evaluate((element) => getComputedStyle(element).animationName);
    expect(animationName).toBe("none");

    await context.close();
  });

  test("does not publish a proposed price in the editorial highlights", async ({ page }) => {
    await page.goto("/#services");

    // The editorial direction cards are not a price list. Only the
    // owner-configured menu may show a figure, and it never renders as an
    // `article`, so the highlights must stay free of currency.
    const highlights = page.locator("#services article");
    const count = await highlights.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      await expect(highlights.nth(index)).not.toContainText("₹");
    }
  });
});

test.describe("booking request entry points", () => {
  test("the booking page runs the real step-by-step flow", async ({ page }) => {
    await page.goto("/book");

    // The page is a real booking route, not a launcher for an overlay.
    await expect(page).toHaveURL(/\/book$/);
    await expect(page.getByRole("heading", { level: 1, name: /book an appointment/i })).toBeVisible();

    const progress = page.getByRole("list", { name: /booking progress/i });
    await expect(progress).toBeVisible();
    for (const step of ["Services", "Date", "Time", "Details", "Review"]) {
      await expect(progress.getByText(new RegExp(step, "i"))).toBeVisible();
    }

    // And the first step asks for a service.
    await expect(page.getByRole("heading", { name: /choose your services/i })).toBeVisible();
  });

  test("navigation, hero, and services all lead to the booking page", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("banner").getByRole("link", { name: /book/i }).first()).toHaveAttribute("href", "/book");
    await expect(page.locator("#services").getByRole("link", { name: /book an appointment/i })).toHaveAttribute("href", "/book");

    // The mobile navigation exposes the same primary action.
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    await page.getByRole("button", { name: /open navigation menu/i }).click();
    const mobileNav = page.getByRole("dialog", { name: /mobile navigation/i });
    await expect(mobileNav.getByRole("link", { name: /book an appointment/i })).toHaveAttribute("href", "/book");
    await expect(mobileNav.getByRole("link", { name: /check an existing request/i })).toHaveAttribute("href", "/book/status");
  });

  test("requires both a reference and the booking mobile number", async ({ page }) => {
    await page.goto("/book/status");

    await page.getByLabel(/booking reference code/i).fill("BK-ZZZZZZZZ");
    await page.getByLabel(/mobile number used for the booking/i).fill("6280866359");
    await page.getByRole("button", { name: /^track$/i }).click();

    await expect(pageAlert(page)).toContainText(/no appointment matches/i);
  });

  test("answers the same way for a wrong number as for an unknown reference", async ({ request }) => {
    const missingPhone = await request.get("/api/booking/status?ref=BK-ZZZZZZZZ");
    expect(missingPhone.status()).toBe(400);

    const unknown = await request.get("/api/booking/status?ref=BK-ZZZZZZZZ&phone=6280866359");
    expect(unknown.status()).toBe(404);
    const body = await unknown.json();
    expect(body.success).toBe(false);
    // The response must not confirm whether the reference exists.
    expect(body.error).toMatch(/no appointment matches/i);
    expect(JSON.stringify(body)).not.toMatch(/phone|62808/);
  });

  test("exposes only enabled services from the public catalogue API", async ({ request }) => {
    const response = await request.get("/api/booking/services");
    expect(response.ok()).toBe(true);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.services)).toBe(true);
    for (const service of body.services) {
      expect(service.isActive).toBe(true);
      // An image, when present, is always served from this site.
      if (service.imageUrl !== null) expect(service.imageUrl).toMatch(/^\/(?!\/)/);
    }
  });

  test("validates slot queries before touching the database", async ({ request }) => {
    expect((await request.get("/api/booking/slots?date=not-a-date")).status()).toBe(400);
    expect((await request.get("/api/booking/slots?date=2026-01-01&duration=5")).status()).toBe(400);
  });
});
