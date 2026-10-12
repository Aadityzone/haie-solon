import { test, expect } from "@playwright/test";
import {
  fillCustomerDetails,
  istDateAfter,
  pickFirstAvailableDate,
  pickFirstAvailableTime,
  selectedServiceCards,
  signInAsOwner,
  TEST_CUSTOMER_PHONE,
  wizardContinue,
} from "./helpers";

/** The salon's own `en-IN` formatting of a salon-local date, for assertions. */
function salonDateText(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+05:30`));
}

/**
 * The full customer and owner journey against a real database:
 * publish a service, deep-link into the booking page, pick a date and a time,
 * submit the request, track it with the reference plus the booking mobile
 * number, have the owner approve it, and confirm the slot can no longer be
 * double-booked.
 */
test.describe("appointment journey", () => {
  test("a request is published, tracked, approved, and cannot be double-booked", async ({ page, request }, testInfo) => {
    // Both browser projects share one database, so the full journey — which
    // reserves real intervals — runs once. The mobile project covers the flow's
    // layout and touch behaviour in responsive.spec.ts instead.
    test.skip(testInfo.project.name.startsWith("mobile"), "one database, one full journey");

    const appointmentDate = istDateAfter(1);

    // --- 1. The owner publishes one service at a known price ---------------
    await signInAsOwner(page);
    await page.getByRole("navigation").getByRole("button", { name: /^services$/i }).click();

    const serviceCard = page.locator('article:has(input[id^="service-name-"])').first();
    await expect(serviceCard).toBeVisible();

    const serviceName = (await serviceCard.locator('input[id^="service-name-"]').inputValue()).trim();
    expect(serviceName.length).toBeGreaterThan(0);

    await serviceCard.locator('input[type="number"]').nth(0).fill("500");
    await serviceCard.locator('input[type="number"]').nth(1).fill("30");
    await serviceCard.locator('input[type="checkbox"]').check();
    await serviceCard.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByRole("status")).toContainText(/saved/i);

    const catalogue = await (await request.get("/api/booking/services")).json();
    const published = catalogue.services.find((service: { name: string }) => service.name === serviceName);
    expect(published, `${serviceName} should be published`).toBeTruthy();
    expect(published.priceRupees).toBe(500);
    expect(published.durationMinutes).toBe(30);

    // The owner's edit is visible on the very next visit, not after a wait.
    const overview = await (await page.request.get("/api/owner/overview")).json();
    expect(overview.success).toBe(true);
    expect(overview.overview.statusBreakdown).toHaveLength(5);
    expect(overview.overview.week).toHaveLength(7);

    // --- 2. The menu deep-links into booking with it preselected -----------
    // Drop the owner session: everything from here is the customer's view.
    await page.context().clearCookies();
    await page.goto("/#services");

    const menuLink = page.locator(`#services a[href="/book?service=${published.id}"]`);
    await expect(menuLink).toHaveCount(1);
    await menuLink.scrollIntoViewIfNeeded();
    await menuLink.click();
    await expect(page).toHaveURL(new RegExp(`/book\\?service=${published.id}$`));

    const wizard = page.getByRole("main");
    await expect(wizard.getByRole("heading", { name: /choose your services/i })).toBeVisible();

    // The deep-linked service arrives already selected.
    const preselected = wizard.getByRole("button", { name: new RegExp(serviceName, "i") }).first();
    await expect(preselected).toHaveAttribute("aria-pressed", "true");
    await expect(selectedServiceCards(wizard)).toHaveCount(1);
    await expect(wizard.getByText(/1 service/i).first()).toBeVisible();
    await expect(wizard.getByText("₹500").first()).toBeVisible();

    // --- 3. The customer picks a date, a time, and submits ------------------
    await wizardContinue(wizard);
    await expect(wizard.getByRole("heading", { name: /choose a date/i })).toBeVisible();
    const pickedDateLabel = await pickFirstAvailableDate(wizard);
    await wizardContinue(wizard);

    await expect(wizard.getByRole("heading", { name: /pick a time/i })).toBeVisible();
    const chosenTime = await pickFirstAvailableTime(wizard);
    await wizardContinue(wizard);

    await fillCustomerDetails(wizard, "Playwright Booking Test");
    await wizardContinue(wizard);

    await expect(wizard.getByRole("heading", { name: /check and confirm/i })).toBeVisible();
    const [pickedDay] = pickedDateLabel.split(",");
    await expect(wizard.getByText(new RegExp(pickedDay, "i")).first()).toBeVisible();
    expect(chosenTime).toMatch(/^\d{2}:\d{2}$/);
    await wizardContinue(wizard, /confirm request/i);

    await expect(wizard.getByRole("heading", { name: /pending approval/i })).toBeVisible();
    await expect(wizard.getByText(salonDateText(appointmentDate))).toBeVisible();
    const reference = (await wizard.getByTestId("booking-reference").innerText()).trim();
    expect(reference).toMatch(/^BK-[A-Z2-9]{8}$/);
    // The confirmation names the services, the length, the price, and the status.
    await expect(wizard.getByText(serviceName, { exact: true }).first()).toBeVisible();
    await expect(wizard.getByText("₹500", { exact: true })).toBeVisible();
    await expect(wizard.getByText(/30 min/).first()).toBeVisible();
    await expect(wizard.getByText(/pending approval/i).first()).toBeVisible();

    // --- 4. The request is pending and the reference alone is not enough ----
    const withoutPhone = await request.get(`/api/booking/status?ref=${reference}`);
    expect(withoutPhone.status(), "a reference alone must not resolve").toBe(400);

    const wrongPhone = await request.get(`/api/booking/status?ref=${reference}&phone=9876543210`);
    expect(wrongPhone.status(), "the wrong number must not resolve").toBe(404);

    const pending = await (await request.get(`/api/booking/status?ref=${reference}&phone=${TEST_CUSTOMER_PHONE}`)).json();
    expect(pending.appointment.status).toBe("PENDING");
    expect(pending.appointment.totalPriceRupees).toBe(500);
    // Even a successful lookup never returns the customer's phone number.
    expect(JSON.stringify(pending)).not.toContain(TEST_CUSTOMER_PHONE);

    // --- 5. The same slot cannot be booked twice ---------------------------
    const conflict = await request.post("/api/booking/create", {
      data: {
        serviceIds: [published.id],
        date: appointmentDate,
        time: chosenTime,
        customerName: "Overlap Attempt",
        customerPhone: TEST_CUSTOMER_PHONE,
      },
    });
    expect(conflict.status()).toBe(409);
    expect((await conflict.json()).code).toBe("SLOT_CONFLICT");

    // --- 6. The owner approves it ------------------------------------------
    await signInAsOwner(page);
    await page.getByRole("navigation").getByRole("button", { name: /^appointments$/i }).click();
    await page.locator('input[type="date"]').fill(appointmentDate);

    const appointment = page.locator("article").filter({ hasText: reference });
    await expect(appointment).toBeVisible();
    await appointment.getByRole("button", { name: /^approve$/i }).click();
    await expect(page.getByRole("status")).toContainText(/approved/i);

    const approved = await (await request.get(`/api/booking/status?ref=${reference}&phone=${TEST_CUSTOMER_PHONE}`)).json();
    expect(approved.appointment.status).toBe("CONFIRMED");

    // --- 7. Notification state is recorded, never fabricated ---------------
    await expect
      .poll(async () => {
        const body = await (await page.request.get("/api/owner/notifications")).json();
        return body.notifications.filter((item: { referenceCode: string }) => item.referenceCode === reference).length;
      })
      .toBeGreaterThan(0);

    const log = await (await page.request.get("/api/owner/notifications")).json();
    expect(log.configuration.ready).toBe(false);

    const forReference = log.notifications.filter((item: { referenceCode: string }) => item.referenceCode === reference);
    // With no WhatsApp credentials configured, every attempt is recorded as
    // skipped with a reason. Nothing may be reported as delivered.
    expect(forReference.some((item: { status: string }) => item.status === "SKIPPED")).toBe(true);
    for (const item of forReference) {
      expect(["SKIPPED", "FAILED", "DUPLICATE"]).toContain(item.status);
      expect(item.errorMessage, "a skipped attempt must explain itself").toBeTruthy();
    }
  });

  test("a service card starts the request in place, with that service selected", async ({ page }) => {
    await page.goto("/#services");

    const card = page.locator('#services li:has(button:has-text("Book this service"))').first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /book this service/i }).click();

    const dialog = page.getByRole("dialog", { name: /book an appointment/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /choose your services/i })).toBeVisible();
    // Exactly one card inside the dialog is preselected by the service card.
    await expect(selectedServiceCards(dialog)).toHaveCount(1);

    // Escape closes it, restoring the menu underneath.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("a service chosen before booking opens is preselected on the page", async ({ page, request }) => {
    const catalogue = await (await request.get("/api/booking/services")).json();
    const service = catalogue.services[0];
    expect(service).toBeTruthy();

    await page.goto(`/book?service=${service.id}`);
    const wizard = page.getByRole("main");
    const card = wizard.getByRole("button", { name: new RegExp(service.name, "i") }).first();
    await expect(card).toHaveAttribute("aria-pressed", "true");

    // Removing it leaves the flow correctly blocked again.
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "false");
    await expect(wizard.getByRole("button", { name: /^continue$/i })).toBeDisabled();
  });

  test("an unknown deep link does not preselect anything", async ({ page, request }) => {
    const catalogue = await (await request.get("/api/booking/services")).json();
    void catalogue;

    await page.goto("/book?service=not-a-real-service-id");
    const wizard = page.getByRole("main");
    await expect(selectedServiceCards(wizard)).toHaveCount(0);
    await expect(wizard.getByRole("button", { name: /^continue$/i })).toBeDisabled();
  });
});
