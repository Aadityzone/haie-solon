import { test, expect, type Page } from "@playwright/test";
import { ensurePublishedService, serviceCards, signInAsOwner } from "./helpers";

/**
 * Mobile-first verification.
 *
 * These are the assertions that the one-off mobile audit produced, kept as
 * permanent regression cover: every required viewport is checked for horizontal
 * overflow, clipped text, undersized tap targets, broken images, console errors,
 * and failed requests while the real booking and owner flows are exercised.
 */

const REQUIRED_VIEWPORTS = [
  { name: "narrow phone", width: 320, height: 568 },
  { name: "compact phone", width: 360, height: 800 },
  { name: "common phone", width: 390, height: 844 },
  { name: "large phone", width: 430, height: 932 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "wide desktop", width: 1440, height: 900 },
] as const;

type Defects = {
  overflowPx: number;
  wide: string[];
  smallTargets: string[];
  clipped: string[];
  brokenImages: string[];
};

const COLLECT = (): Defects => {
  const vw = document.documentElement.clientWidth;
  const srOnly = (el: Element) => el.className.toString().includes("sr-only");
  const visible = (el: Element) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const clippedByAncestor = (el: Element) => {
    let node = el.parentElement;
    while (node && node !== document.body) {
      if (["hidden", "clip", "auto", "scroll"].includes(getComputedStyle(node).overflowX)) return true;
      node = node.parentElement;
    }
    return false;
  };
  const label = (el: Element) =>
    `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}[${(el.textContent || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30)}]`;

  const wide: string[] = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (!visible(el) || srOnly(el) || clippedByAncestor(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1) wide.push(`${label(el)} +${Math.round(r.right - vw)}px`);
  }

    const smallTargets: string[] = [];
    for (const el of Array.from(document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]'))) {
      if (!visible(el) || srOnly(el)) continue;
      if (el.tagName === "INPUT" && ["checkbox", "radio", "hidden"].includes((el as HTMLInputElement).type)) continue;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      // Inline links inside prose are conventional and are not primary controls.
      const inlineProse = el.tagName === "A" && s.display.includes("inline") && !s.display.includes("flex") && el.closest("p, li, address") !== null && !el.className.toString().includes("btn");
      if (inlineProse) continue;
      // One sub-pixel of tolerance: a control styled at exactly 44px can measure
      // 43.999 on a device pixel ratio that does not divide evenly.
      if (r.height < 43.5) smallTargets.push(`${label(el)} ${r.height.toFixed(1)}px`);
    }

  const clipped: string[] = [];
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    if (!visible(el) || srOnly(el)) continue;
    if (!["hidden", "clip"].includes(getComputedStyle(el).overflowX)) continue;
    if (clippedByAncestor(el)) continue;
    if (el.scrollWidth > el.clientWidth + 2 && (el.textContent || "").trim().length > 0) {
      clipped.push(`${label(el)} ${el.scrollWidth}>${el.clientWidth}`);
    }
  }

  const brokenImages = Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.currentSrc || i.src);

  return { overflowPx: document.documentElement.scrollWidth - vw, wide, smallTargets, clipped, brokenImages };
};

/** Watch a page for console errors and failed requests for the life of a test. */
function watch(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 160)}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 160)}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url().slice(0, 120)}`));
  return problems;
}

function expectClean(defects: Defects, where: string, problems: string[]) {
  expect(defects.overflowPx, `${where}: horizontal overflow`).toBeLessThanOrEqual(1);
  expect(defects.wide, `${where}: elements past the viewport`).toEqual([]);
  expect(defects.smallTargets, `${where}: tap targets under 44px`).toEqual([]);
  expect(defects.clipped, `${where}: clipped text`).toEqual([]);
  expect(defects.brokenImages, `${where}: broken images`).toEqual([]);
  expect(problems, `${where}: console errors or failed requests`).toEqual([]);
}

test.describe("mobile-first layout", () => {
  // Viewports are set explicitly, so this sweep runs once rather than per project.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Viewports are set explicitly in this spec.");
  });

  for (const viewport of REQUIRED_VIEWPORTS) {
    test(`${viewport.name} (${viewport.width}x${viewport.height}) renders every public page cleanly`, async ({ page }) => {
      const problems = watch(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const path of ["/", "/book", "/book/status", "/owner/login"]) {
        await page.goto(path, { waitUntil: "load" });
        // The booking route loads its catalogue and rules before the first step.
        if (path === "/book") await page.getByRole("heading", { name: /choose your services/i }).waitFor();
        await page.waitForTimeout(250);
        expectClean(await page.evaluate(COLLECT), `${path} at ${viewport.width}px`, problems);
      }
    });
  }

  for (const viewport of REQUIRED_VIEWPORTS) {
    test(`the booking flow is usable on a ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
      const problems = watch(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/book", { waitUntil: "load" });

      const wizard = page.getByRole("main");
      await expect(wizard.getByRole("heading", { name: /choose your services/i })).toBeVisible();

      // Step 1 — the service menu is a column of full-width cards on a phone.
      const card = serviceCards(wizard).first();      await expect(card).toBeVisible();
      const cardBox = await card.boundingBox();
      expect(cardBox!.height, "a service card is a large target").toBeGreaterThanOrEqual(44);
      expectClean(await page.evaluate(COLLECT), `booking step 1 at ${viewport.width}px`, problems);
      await card.click();

      // Step 2 — the calendar and its month controls.
      await wizard.getByRole("button", { name: /^continue$/i }).click();
      await expect(wizard.getByRole("heading", { name: /choose a date/i })).toBeVisible();
      const day = wizard.locator('[role="gridcell"] button:enabled').first();
      await expect(day).toBeVisible();
      const dayBox = await day.boundingBox();
      expect(dayBox!.height, "a calendar day is a 44px target").toBeGreaterThanOrEqual(44);
      const monthControl = wizard.getByRole("button", { name: /show the next month/i }).first();
      const monthBox = await monthControl.boundingBox();
      expect(monthBox!.width).toBeGreaterThanOrEqual(44);
      expectClean(await page.evaluate(COLLECT), `booking step 2 at ${viewport.width}px`, problems);
      await day.click();

      // Step 3 — the time grid, with the summary still on screen.
      await wizard.getByRole("button", { name: /^continue$/i }).click();
      await expect(wizard.getByRole("heading", { name: /pick a time/i })).toBeVisible();
      const slot = wizard.locator("ul button:enabled").filter({ hasText: /^\d{2}:\d{2}$/ }).first();
      await expect(slot).toBeVisible();
      const slotBox = await slot.boundingBox();
      expect(slotBox!.height, "a time slot is a 44px target").toBeGreaterThanOrEqual(44);
      // Choosing another day must stay reachable from the time step. The list
      // scrolls on the narrowest screens, so it is scrolled to before measuring.
      const changeDate = wizard.getByRole("button", { name: /change date/i });
      await changeDate.scrollIntoViewIfNeeded();
      await expect(changeDate).toBeInViewport();
      expectClean(await page.evaluate(COLLECT), `booking step 3 at ${viewport.width}px`, problems);
      await slot.scrollIntoViewIfNeeded();
      await slot.click();

      // Step 4 — the details form keeps the right mobile keyboard.
      await wizard.getByRole("button", { name: /^continue$/i }).click();
      await expect(wizard.getByRole("heading", { name: /your details/i })).toBeVisible();
      await expect(wizard.getByLabel(/mobile number/i)).toHaveAttribute("inputmode", "numeric");
      await expect(wizard.getByLabel(/mobile number/i)).toHaveAttribute("type", "tel");
      await expect(wizard.getByLabel(/full name/i)).toHaveAttribute("autocomplete", "name");
      expectClean(await page.evaluate(COLLECT), `booking step 4 at ${viewport.width}px`, problems);

      await wizard.getByLabel(/full name/i).fill("Responsive Booking");
      await wizard.getByLabel(/mobile number/i).fill("6280866359");
      await wizard.getByRole("button", { name: /review request/i }).click();

      // Step 5 — the review, with the submit button reachable without hunting.
      await expect(wizard.getByRole("heading", { name: /check and confirm/i })).toBeVisible();
      await expect(wizard.getByRole("button", { name: /confirm request/i })).toBeInViewport();
      expectClean(await page.evaluate(COLLECT), `booking review at ${viewport.width}px`, problems);

      expect(problems).toEqual([]);
    });
  }

  test("a service card books in place on a phone without leaving the menu", async ({ page }) => {
    const problems = watch(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#services", { waitUntil: "load" });

    const card = page.locator('#services li:has(button:has-text("Book this service"))').first();
    await card.scrollIntoViewIfNeeded();
    await card.getByRole("button", { name: /book this service/i }).click();

    const dialog = page.getByRole("dialog", { name: /book an appointment/i });
    await expect(dialog).toBeVisible();
    // The overlay must fit the screen rather than spilling off it.
    const box = await dialog.boundingBox();
    const size = page.viewportSize()!;
    expect(box!.width).toBeLessThanOrEqual(size.width + 1);
    expect(box!.height).toBeLessThanOrEqual(size.height + 1);
    expectClean(await page.evaluate(COLLECT), "booking dialog at 390px", problems);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(problems).toEqual([]);
  });
});

test.describe("mobile navigation", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "Viewports are set explicitly in this spec.");
  });

  for (const width of [320, 390, 768]) {
    test(`the menu fills the screen and closes after navigating at ${width}px`, async ({ page }) => {
      const problems = watch(page);
      await page.setViewportSize({ width, height: 740 });
      await page.goto("/", { waitUntil: "load" });

      const toggle = page.getByRole("button", { name: /open navigation menu/i });
      await expect(toggle).toBeVisible();
      await toggle.click();

      const menu = page.locator("#mobile-navigation");
      await expect(menu).toBeVisible();

      // The overlay must cover the viewport, not collapse into the header. A
      // backdrop-filter on an ancestor would make the fixed overlay resolve
      // against the header instead of the screen.
      const box = await menu.boundingBox();
      const size = page.viewportSize()!;
      expect(box!.x).toBeLessThanOrEqual(1);
      expect(box!.y).toBeLessThanOrEqual(1);
      expect(box!.width).toBeGreaterThanOrEqual(size.width - 1);
      expect(box!.height).toBeGreaterThanOrEqual(size.height - 1);

      // Every menu destination must be reachable, not just present.
      for (const label of ["Home", "Services", "Our Work", "About", "Contact"]) {
        await expect(page.getByRole("dialog").getByRole("link", { name: new RegExp(`^${label}$`, "i") })).toBeInViewport();
      }

      await page.getByRole("dialog").getByRole("link", { name: /^services$/i }).click();
      await expect(menu).toBeHidden();
      await expect(page).toHaveURL(/#services$/);
      expect(problems).toEqual([]);
    });
  }

  test("the booking action is reachable without opening the menu", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/", { waitUntil: "load" });

    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: /^book$/i })).toBeInViewport();
  });

  test("the brand stays readable on a narrow phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/", { waitUntil: "load" });

    const brand = page.getByRole("banner").getByRole("link").first();
    const box = await brand.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    // The name must not be cut off with an ellipsis.
    const brandText = await brand.evaluate((el) => {
      const span = el.querySelector("span")!;
      return { scroll: span.scrollWidth, client: span.clientWidth };
    });
    expect(brandText.scroll).toBeLessThanOrEqual(brandText.client + 2);
  });
});

test.describe("mobile booking journey", () => {
  test("a customer can complete the whole request on a 390px phone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "This journey runs once, on the mobile project.");

    const problems = watch(page);
    await page.setViewportSize({ width: 390, height: 844 });

    // Publish a service if the suite has not already, so this spec is
    // independent of file execution order.
    const published = await ensurePublishedService(page);
    expect(published, "a published service is required for this journey").not.toBeNull();
    await page.context().clearCookies();

    await page.goto("/book", { waitUntil: "load" });
    const wizard = page.getByRole("main");

    // Step 1 — pick the first offered service.
    const anyService = serviceCards(wizard).first();
    await expect(anyService).toBeVisible();
    await anyService.click();
    await expect(anyService).toHaveAttribute("aria-pressed", "true");
    expectClean(await page.evaluate(COLLECT), "booking step 1", problems);
    await wizard.getByRole("button", { name: /^continue$/i }).click();

    // Step 2 — choose a date the salon actually offers.
    await expect(wizard.getByRole("heading", { name: /choose a date/i })).toBeVisible();
    const day = wizard.locator('[role="gridcell"] button:enabled').first();
    await expect(day).toBeVisible();
    await day.click();
    await wizard.getByRole("button", { name: /^continue$/i }).click();

    // Step 3 — choose an available time.
    await expect(wizard.getByRole("heading", { name: /pick a time/i })).toBeVisible();
    const slot = wizard.locator("ul button:enabled").filter({ hasText: /^\d{2}:\d{2}$/ }).first();
    await expect(slot).toBeVisible();
    expectClean(await page.evaluate(COLLECT), "booking step 2", problems);
    await slot.click();
    await wizard.getByRole("button", { name: /^continue$/i }).click();

    // Step 4 — validation is inline and next to the field.
    await expect(wizard.getByRole("heading", { name: /your details/i })).toBeVisible();
    await wizard.getByRole("button", { name: /review request/i }).click();
    await expect(wizard.getByText(/enter your name so the salon knows/i)).toBeVisible();
    await expect(wizard.getByLabel(/full name/i)).toBeFocused();
    await expect(wizard.getByLabel(/full name/i)).toHaveAttribute("aria-invalid", "true");

    // Correct input types keep the right mobile keyboard on screen.
    await expect(wizard.getByLabel(/mobile number/i)).toHaveAttribute("inputmode", "numeric");
    await expect(wizard.getByLabel(/mobile number/i)).toHaveAttribute("type", "tel");
    await expect(wizard.getByLabel(/full name/i)).toHaveAttribute("autocomplete", "name");

    // A bad number is reported next to the field, not in a distant banner.
    await wizard.getByLabel(/full name/i).fill("Mobile Journey Test");
    await wizard.getByLabel(/mobile number/i).fill("12345");
    await wizard.getByRole("button", { name: /review request/i }).click();
    await expect(wizard.getByText(/10-digit indian mobile number/i)).toBeVisible();

    expectClean(await page.evaluate(COLLECT), "booking step 3", problems);

    // Recovering from the error keeps what was already typed.
    await expect(wizard.getByLabel(/full name/i)).toHaveValue("Mobile Journey Test");
    await wizard.getByLabel(/mobile number/i).fill("6280866359");
    await wizard.getByRole("button", { name: /review request/i }).click();

    // Step 5 — review, then submit.
    await expect(wizard.getByRole("heading", { name: /check and confirm/i })).toBeVisible();
    await wizard.getByRole("button", { name: /confirm request/i }).click();

    await expect(wizard.getByRole("heading", { name: /pending approval/i })).toBeVisible();
    await expect(wizard.getByTestId("booking-reference")).toHaveText(/^BK-[A-Z2-9]{8}$/);
    expectClean(await page.evaluate(COLLECT), "booking confirmation", problems);
  });

  test("the owner can manage an appointment from a phone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-chromium", "This journey runs once, on the mobile project.");

    const problems = watch(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsOwner(page);

    // A phone-sized dashboard must expose the same controls without overflow.
    await page.getByRole("navigation").getByRole("button", { name: /^appointments$/i }).click();
    await page.waitForTimeout(500);
    expectClean(await page.evaluate(COLLECT), "owner appointments on mobile", problems);

    const actions = page.getByRole("button", { name: /^(approve|reject|cancel request|cancel|mark complete)$/i });
    const count = await actions.count();
    if (count > 0) {
      const first = actions.first();
      await expect(first).toBeInViewport();
      const box = await first.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
      // Consequential actions must be separated, not stacked edge to edge.
      if (count > 1) {
        const second = await actions.nth(1).boundingBox();
        const gap = Math.abs(second!.x - box!.x) >= box!.width + 4 || second!.y >= box!.y + box!.height;
        expect(gap, "consequential actions must not touch").toBe(true);
      }
    }

    for (const tab of ["Services", "Opening hours", "Blocked times", "Notifications", "Settings"]) {
      await page.getByRole("navigation").getByRole("button", { name: new RegExp(`^${tab}$`, "i") }).click();
      await page.waitForTimeout(400);
      expectClean(await page.evaluate(COLLECT), `owner ${tab} on mobile`, problems);
    }

    expect(problems).toEqual([]);
  });
});
