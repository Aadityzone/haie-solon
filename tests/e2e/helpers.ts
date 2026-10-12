import { expect, type Page } from "@playwright/test";

/**
 * Throwaway credential for the Playwright-managed test server only. It is not a
 * production secret and must never be reused as one.
 */
export const TEST_OWNER_PASSWORD = "playwright-e2e-owner-password";

/** Current date in the salon's timezone, offset by whole days. */
export function istDateAfter(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const value = new Date(`${today}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function signInAsOwner(page: Page): Promise<void> {
  await page.goto("/owner/login");
  await page.getByLabel(/master password/i).fill(TEST_OWNER_PASSWORD);
  await page.getByRole("button", { name: /access dashboard|initialize & sign in/i }).click();
  await expect(page.getByRole("heading", { name: /owner dashboard/i })).toBeVisible();
}

export async function openOwnerTab(page: Page, tab: string): Promise<void> {
  await page.getByRole("navigation").getByRole("button", { name: new RegExp(`^${tab}$`, "i") }).click();
}

/**
 * Next.js injects its own `role="alert"` route announcer, which makes a bare
 * `getByRole("alert")` ambiguous. Real page alerts always render inside the
 * main landmark.
 */
export function pageAlert(page: Page) {
  return page.locator('#main-content [role="alert"]');
}

/**
 * Guarantees at least one bookable service exists, so a spec never depends on
 * which file happened to run first. Returns the published service, if any.
 */
export async function ensurePublishedService(page: Page): Promise<{ id: string; name: string } | null> {
  const already = await (await page.request.get("/api/booking/services")).json();
  if (already.services?.length) return already.services[0];

  await signInAsOwner(page);
  const all = await (await page.request.get("/api/owner/services")).json();
  const candidate = all.services?.[0];
  if (!candidate) return null;

  await page.request.put("/api/owner/services", {
    data: { id: candidate.id, name: candidate.name, description: candidate.description, priceRupees: 300, durationMinutes: 30, isActive: true, imageUrl: null },
  });

  const after = await (await page.request.get("/api/booking/services")).json();
  return after.services?.[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Booking wizard helpers                                                     */
/* -------------------------------------------------------------------------- */

/** The mobile number every simulated customer books with. */
export const TEST_CUSTOMER_PHONE = "6280866359";

export type BookingScope = Page | ReturnType<Page["getByRole"]>;

/** The step heading each step of the wizard renders. */
export const STEP_HEADING = {
  services: /choose your services/i,
  date: /choose a date/i,
  time: /pick a time/i,
  details: /your details/i,
  review: /check and confirm/i,
} as const;

/** Advances the wizard with the sticky action bar's primary button. */
export async function wizardContinue(scope: BookingScope, label?: RegExp): Promise<void> {
  const button = scope.getByRole("button", { name: /^(continue|review request|confirm request)$/i });
  await expect(button).toBeVisible();
  if (label) await expect(button).toHaveText(label);
  await button.click();
}

/** The service cards of the picker, which expose their state with `aria-pressed`. */
export function serviceCards(scope: BookingScope) {
  return scope.locator('[data-testid="service-card"]');
}

/** The service cards the customer has currently selected. */
export function selectedServiceCards(scope: BookingScope) {
  return scope.locator('[data-testid="service-card"][aria-pressed="true"]');
}

/**
 * Chooses a service card by name and asserts the card reports itself selected —
 * the same signal a sighted user gets from the champagne state.
 */
export async function selectService(scope: BookingScope, name: RegExp | string): Promise<void> {
  const card = scope.getByRole("button", { name }).first();
  await card.click();
  await expect(card).toHaveAttribute("aria-pressed", "true");
}

/**
 * Picks the first date the calendar offers as selectable. Unavailable days are
 * genuinely `disabled` buttons, so `:enabled` is exactly the set a customer can
 * tap. Returns the accessible label the picker gave that day.
 */
export async function pickFirstAvailableDate(scope: BookingScope): Promise<string> {
  const day = scope.locator('[role="gridcell"] button:enabled').first();
  await expect(day).toBeVisible();
  const label = (await day.getAttribute("aria-label")) || "";
  await day.click();
  return label.split(" — ")[0];
}

/** Picks the first bookable time and returns it as `HH:MM`. */
export async function pickFirstAvailableTime(scope: BookingScope): Promise<string> {
  const slot = scope.locator("ul button:enabled").filter({ hasText: /^\d{2}:\d{2}$/ }).first();
  await expect(slot).toBeVisible();
  const time = (await slot.innerText()).trim();
  await slot.click();
  return time;
}

/** Fills the customer details step. */
export async function fillCustomerDetails(
  scope: BookingScope,
  name: string,
  phone: string = TEST_CUSTOMER_PHONE,
  notes?: string
): Promise<void> {
  await scope.getByLabel(/full name/i).fill(name);
  await scope.getByLabel(/mobile number/i).fill(phone);
  if (notes) await scope.getByLabel(/anything the salon should know/i).fill(notes);
}
