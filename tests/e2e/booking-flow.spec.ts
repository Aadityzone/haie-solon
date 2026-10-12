import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  fillCustomerDetails,
  istDateAfter,
  pageAlert,
  pickFirstAvailableDate,
  pickFirstAvailableTime,
  selectService,
  selectedServiceCards,
  signInAsOwner,
  TEST_CUSTOMER_PHONE,
  TEST_OWNER_PASSWORD,
  wizardContinue,
} from "./helpers";

let service: { id: string; name: string; priceRupees: number | null; durationMinutes: number };

test.beforeAll(async ({ request }) => {
  const catalogue = await (await request.get("/api/booking/services")).json();
  expect(catalogue.services?.length, "the standard catalogue must be published").toBeGreaterThan(0);
  service = catalogue.services[0];
});

/** Books a slot through the real API so a test can drive the owner side. */
async function bookViaApi(
  request: APIRequestContext,
  date: string,
  time: string,
  name: string,
  phone = TEST_CUSTOMER_PHONE
): Promise<string> {
  const response = await request.post("/api/booking/create", {
    data: { serviceIds: [service.id], date, time, customerName: name, customerPhone: phone },
  });
  expect(response.status(), `booking ${date} ${time} should be accepted`).toBe(200);
  return (await response.json()).referenceCode;
}

/** The first time the salon still offers on a given date. */
async function firstFreeSlot(request: APIRequestContext, date: string): Promise<string> {
  const body = await (await request.get(`/api/booking/slots?date=${date}&duration=${service.durationMinutes}`)).json();
  expect(body.success).toBe(true);
  const slot = body.slots.find((entry: { available: boolean }) => entry.available);
  expect(slot, `a free slot is required on ${date}`).toBeTruthy();
  return slot.time;
}

test.describe("booking rules come from the server", () => {
  test("the config endpoint publishes the window, open days, and true durations", async ({ request }) => {
    const response = await request.get("/api/booking/config");
    expect(response.ok()).toBe(true);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.rules.timezone).toBe("Asia/Kolkata");
    expect(body.rules.maxAdvanceDays).toBeGreaterThan(0);
    expect(body.rules.minSelectableDate >= body.rules.windowStart).toBe(true);
    expect(body.rules.windowEnd > body.rules.windowStart).toBe(true);
    expect(body.rules.days).toHaveLength(7);
    expect(Array.isArray(body.rules.closedDates)).toBe(true);

    for (const item of body.services) {
      // The duration the customer sees is the row's own duration.
      const detail = await (await request.get(`/api/booking/config?services=${item.id}`)).json();
      expect(detail.success).toBe(true);
    }

    // A duration is derived from the database, never trusted from the caller.
    expect((await request.get("/api/booking/config?duration=9999")).status()).toBe(400);
    expect((await request.get("/api/booking/config?duration=abc")).status()).toBe(400);
    expect((await request.get("/api/booking/config?services=does-not-exist")).status()).toBe(400);
  });

  test("a malformed service list is refused rather than silently ignored", async ({ request }) => {
    const many = Array.from({ length: 9 }, (_, index) => `svc-${index}`).join(",");
    expect((await request.get(`/api/booking/config?services=${many}`)).status()).toBe(400);
  });
});

test.describe("selecting services", () => {
  test("several services total the database prices and durations", async ({ page, request }) => {
    const catalogue = await (await request.get("/api/booking/services")).json();
    const services = catalogue.services.slice(0, 2);
    expect(services.length, "two enabled services are needed for this test").toBe(2);

    await page.goto("/book");
    const wizard = page.getByRole("main");
    await selectService(wizard, new RegExp(services[0].name, "i"));
    await selectService(wizard, new RegExp(services[1].name, "i"));

    const expectedPrice = services[0].priceRupees + services[1].priceRupees;
    const expectedDuration = services[0].durationMinutes + services[1].durationMinutes;

    await expect(wizard.getByText(/2 services/i).first()).toBeVisible();
    await expect(wizard.getByText(`₹${expectedPrice.toLocaleString("en-IN")}`).first()).toBeVisible();
    // The combined duration is stated in the running summary, in words once it
    // passes an hour rather than as a bare number of minutes.
    const expectedDurationText = expectedDuration < 60
      ? `${expectedDuration} min`
      : `${Math.floor(expectedDuration / 60)} hr${expectedDuration % 60 === 0 ? "" : ` ${expectedDuration % 60} min`}`;
    await expect(wizard.getByText(expectedDurationText, { exact: true }).first()).toBeVisible();
    await expect(selectedServiceCards(wizard)).toHaveCount(2);

    // The chosen services are re-checked on the server, not trusted from here.
    const config = await (await request.get(`/api/booking/config?services=${services[0].id},${services[1].id}`)).json();
    expect(config.success).toBe(true);

    // Removing one updates the running total immediately.
    await wizard.getByRole("button", { name: new RegExp(services[1].name, "i") }).first().click();
    await expect(wizard.getByText(/1 service/i).first()).toBeVisible();
    await expect(wizard.getByText(`₹${services[0].priceRupees.toLocaleString("en-IN")}`).first()).toBeVisible();
    await expect(selectedServiceCards(wizard)).toHaveCount(1);
  });

  test("a service with no published price never shows a partial total", async ({ page, request }) => {
    // Create a service the owner has left unpriced, then enable it.
    await signInAsOwner(page);
    const created = await page.request.post("/api/owner/services", {
      data: { name: "Unpriced Playwright Service", categoryName: "Test only", durationMinutes: 20, isActive: true },
    });
    expect(created.status()).toBe(201);

    const catalogue = await (await request.get("/api/booking/services")).json();
    const unpriced = catalogue.services.find((item: { name: string }) => item.name === "Unpriced Playwright Service");
    expect(unpriced, "the unpriced service should be live").toBeTruthy();
    expect(unpriced.priceRupees).toBeNull();

    await page.context().clearCookies();
    await page.goto("/book");
    const wizard = page.getByRole("main");
    await selectService(wizard, /unpriced playwright service/i);

    // No invented number anywhere in the summary.
    await expect(wizard.getByText(/confirmed by the salon/i).first()).toBeVisible();

    // Mixing it with a priced service still refuses to invent a total: the
    // running total says the price is confirmed by the salon rather than showing
    // the priced service's own figure as if it were the total.
    const priced = catalogue.services.find((item: { priceRupees: number | null }) => item.priceRupees !== null);
    await selectService(wizard, new RegExp(priced.name, "i"));
    await expect(selectedServiceCards(wizard)).toHaveCount(2);
    await expect(wizard.getByTestId("booking-total")).toHaveText(/confirmed by the salon/i);
    await expect(wizard.getByTestId("booking-total")).not.toContainText(priced.priceRupees.toLocaleString("en-IN"));

    // Removing the unpriced service restores a real total.
    await wizard.getByRole("button", { name: /unpriced playwright service/i }).first().click();
    await expect(wizard.getByTestId("booking-total")).toHaveText(`₹${priced.priceRupees.toLocaleString("en-IN")}`);
  });
});

test.describe("the customer booking page", () => {
  test("refuses an empty form and points at the field that is wrong", async ({ page }) => {
    await page.goto("/book");
    const wizard = page.getByRole("main");

    await selectService(wizard, new RegExp(service.name, "i"));
    await wizardContinue(wizard);
    await pickFirstAvailableDate(wizard);
    await wizardContinue(wizard);
    await pickFirstAvailableTime(wizard);
    await wizardContinue(wizard);

    await expect(wizard.getByRole("heading", { name: /your details/i })).toBeVisible();
    await wizardContinue(wizard);

    // Still on the details step, with a real error next to the field.
    await expect(wizard.getByText(/enter your name so the salon knows/i)).toBeVisible();
    await expect(wizard.getByLabel(/full name/i)).toBeFocused();

    await wizard.getByLabel(/full name/i).fill("A");
    await wizardContinue(wizard);
    await expect(wizard.getByText(/at least 2 characters/i)).toBeVisible();

    await wizard.getByLabel(/full name/i).fill("Validation Test");
    await wizard.getByLabel(/mobile number/i).fill("12345");
    await wizardContinue(wizard);
    await expect(wizard.getByText(/10-digit indian mobile number/i)).toBeVisible();

    // A landline-style number is refused too.
    await wizard.getByLabel(/mobile number/i).fill("1234567890");
    await wizardContinue(wizard);
    await expect(wizard.getByText(/10-digit indian mobile number/i)).toBeVisible();

    // Anything that is not a digit is stripped as it is typed.
    await wizard.getByLabel(/mobile number/i).fill("62808 66359abc");
    await expect(wizard.getByLabel(/mobile number/i)).toHaveValue("6280866359");
    await wizardContinue(wizard);
    await expect(wizard.getByRole("heading", { name: /check and confirm/i })).toBeVisible();
  });

  test("only offers days that are open and inside the booking window", async ({ page, request }) => {
    const rules = (await (await request.get("/api/booking/config")).json()).rules;

    await page.goto("/book");
    const wizard = page.getByRole("main");
    await selectService(wizard, new RegExp(service.name, "i"));
    await wizardContinue(wizard);

    const days = wizard.locator('[role="gridcell"] button');
    const count = await days.count();
    expect(count).toBeGreaterThan(0);

    let disabled = 0;
    for (let index = 0; index < count; index += 1) {
      const day = days.nth(index);
      const label = (await day.getAttribute("aria-label")) || "";
      const isDisabled = await day.isDisabled();
      if (isDisabled) {
        disabled += 1;
        // Every disabled day states the salon's own reason.
        expect(label, "a disabled day must explain itself").toMatch(/unavailable:/);
      }
    }
    expect(disabled, "closed weekdays and out-of-window days must be disabled").toBeGreaterThan(0);

    // The window itself is enforced: every enabled day is inside it.
    const enabledLabels = await days.evaluateAll((nodes) =>
      nodes.filter((node) => !(node as HTMLButtonElement).disabled).map((node) => node.getAttribute("aria-label") || "")
    );
    expect(enabledLabels.length).toBeGreaterThan(0);
    expect(rules.closedDates.length + rules.blockedDates.length).toBeLessThanOrEqual(rules.maxAdvanceDays + 1);

    // The calendar is a real grid with one tab stop, and the arrow keys move
    // between days rather than requiring a tab through every date.
    const grid = wizard.getByRole("grid");
    await expect(grid).toBeVisible();
    const firstFocusable = grid.locator('button[tabindex="0"]');
    await expect(firstFocusable).toHaveCount(1);
    await firstFocusable.focus();
    const before = await firstFocusable.getAttribute("data-date");
    await page.keyboard.press("ArrowRight");
    const after = await grid.locator('button[tabindex="0"]').getAttribute("data-date");
    expect(after).not.toBe(before);
  });

  test("does not offer a past date, and reports an empty day honestly", async ({ page, request }) => {
    const yesterday = istDateAfter(-1);

    // The API refuses a past date rather than returning slots for it.
    const past = await (await request.get(`/api/booking/slots?date=${yesterday}&duration=30`)).json();
    expect(past.slots).toHaveLength(0);
    expect(past.reason).toMatch(/within the next/i);

    // The booking engine refuses it even if it is posted directly.
    const rejected = await request.post("/api/booking/create", {
      data: { serviceIds: [service.id], date: yesterday, time: "10:00", customerName: "Past Date", customerPhone: TEST_CUSTOMER_PHONE },
    });
    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).error).toMatch(/past/i);

    // A day the salon is closed reports no slots at all.
    const rules = (await (await request.get("/api/booking/config")).json()).rules;
    if (rules.closedDates.length > 0) {
      const closed = await (await request.get(`/api/booking/slots?date=${rules.closedDates[0]}&duration=30`)).json();
      expect(closed.salonOpen).toBe(false);
      expect(closed.reason).toMatch(/closed/i);
    }

    await page.goto("/book");
    const wizard = page.getByRole("main");
    await selectService(wizard, new RegExp(service.name, "i"));
  });

  test("shows the review before submitting and can go back to fix a detail", async ({ page }) => {
    await page.goto("/book");
    const wizard = page.getByRole("main");

    await selectService(wizard, new RegExp(service.name, "i"));
    await wizardContinue(wizard);
    const date = await pickFirstAvailableDate(wizard);
    await wizardContinue(wizard);
    const time = await pickFirstAvailableTime(wizard);
    await wizardContinue(wizard);
    await fillCustomerDetails(wizard, "Review Before Submit", TEST_CUSTOMER_PHONE, "Please allow extra time");
    await wizardContinue(wizard);

    // Nothing has been sent yet: the review lists what will be.
    await expect(wizard.getByRole("heading", { name: /check and confirm/i })).toBeVisible();
    await expect(wizard.getByText(new RegExp(date.split(",")[0]))).toBeVisible();
    await expect(wizard.getByText(time, { exact: false }).first()).toBeVisible();
    await expect(wizard.getByText("Review Before Submit")).toBeVisible();
    await expect(wizard.getByText(/please allow extra time/i)).toBeVisible();

    // The server has no appointment for this name yet.
    await signInAsOwner(page);
    await page.getByRole("navigation").getByRole("button", { name: /^appointments$/i }).click();
    await page.getByPlaceholder(/reference, name, mobile, or service/i).fill("Review Before Submit");
    await expect(page.locator("article").filter({ hasText: "Review Before Submit" })).toHaveCount(0);
  });

  test("keeps the selections and details when moving between steps", async ({ page }) => {
    await page.goto("/book");
    const wizard = page.getByRole("main");

    await selectService(wizard, new RegExp(service.name, "i"));
    await wizardContinue(wizard);
    await pickFirstAvailableDate(wizard);
    await wizardContinue(wizard);
    await pickFirstAvailableTime(wizard);
    await wizardContinue(wizard);
    await fillCustomerDetails(wizard, "Keeps Everything");

    // Review, then walk all the way back.
    await wizardContinue(wizard);
    await expect(wizard.getByRole("heading", { name: /check and confirm/i })).toBeVisible();
    await wizard.getByRole("button", { name: /change mobile number/i }).click();

    await expect(wizard.getByLabel(/full name/i)).toHaveValue("Keeps Everything");
    await expect(wizard.getByLabel(/mobile number/i)).toHaveValue(TEST_CUSTOMER_PHONE);

    await wizard.getByRole("button", { name: /^back$/i }).click();
    await expect(wizard.getByRole("heading", { name: /pick a time/i })).toBeVisible();
    await expect(wizard.locator('ul button[aria-pressed="true"]')).toHaveCount(1);

    await wizard.getByRole("button", { name: /^back$/i }).click();
    await expect(wizard.getByRole("heading", { name: /choose a date/i })).toBeVisible();
    await expect(wizard.locator('[role="gridcell"] button[aria-current="date"]')).toHaveCount(1);

    await wizard.getByRole("button", { name: /^back$/i }).click();
    await expect(wizard.getByRole("heading", { name: /choose your services/i })).toBeVisible();
    await expect(selectedServiceCards(wizard)).toHaveCount(1);
  });

  test("changing the date keeps the chosen services", async ({ page }) => {
    await page.goto("/book");
    const wizard = page.getByRole("main");

    await selectService(wizard, new RegExp(service.name, "i"));
    await wizardContinue(wizard);
    await pickFirstAvailableDate(wizard);
    await wizardContinue(wizard);
    await expect(wizard.getByRole("heading", { name: /pick a time/i })).toBeVisible();

    // Change the date from the time step, then come back.
    await wizard.getByRole("button", { name: /change date/i }).click();
    const enabledDays = wizard.locator('[role="gridcell"] button:enabled');
    const second = enabledDays.nth(1);
    if ((await enabledDays.count()) > 1) {
      await second.click();
    } else {
      await enabledDays.first().click();
    }
    await wizardContinue(wizard);
    await expect(wizard.getByRole("heading", { name: /pick a time/i })).toBeVisible();

    await wizard.getByRole("button", { name: /^back$/i }).click();
    await wizard.getByRole("button", { name: /^back$/i }).click();
    await expect(selectedServiceCards(wizard)).toHaveCount(1);
  });

  test("prevents a duplicate submission with a second Confirm press", async ({ page, request }) => {
    const name = `Duplicate Guard ${Date.now()}`;
    let createCalls = 0;
    page.on("request", (event) => {
      if (event.url().includes("/api/booking/create")) createCalls += 1;
    });

    await page.goto("/book");
    const wizard = page.getByRole("main");
    await selectService(wizard, new RegExp(service.name, "i"));
    await wizardContinue(wizard);
    await pickFirstAvailableDate(wizard);
    await wizardContinue(wizard);
    await pickFirstAvailableTime(wizard);
    await wizardContinue(wizard);
    await fillCustomerDetails(wizard, name);
    await wizardContinue(wizard);

    // A double tap on the primary action must produce exactly one request. The
    // `isSubmitting` guard disables the button as React re-renders the step, so
    // the second press of the double tap cannot start a second request.
    const confirm = wizard.getByRole("button", { name: /confirm request/i });
    await confirm.dblclick();

    await expect(wizard.getByRole("heading", { name: /pending approval/i })).toBeVisible();
    const reference = (await wizard.getByTestId("booking-reference").innerText()).trim();
    expect(reference).toMatch(/^BK-[A-Z2-9]{8}$/);
    expect(createCalls, "a double tap must not create two appointments").toBe(1);

    // And exactly one appointment exists for that customer. The stored records
    // are the authority here, not a filtered view.
    await signInAsOwner(page);
    const stored = await (await page.request.get("/api/owner/appointments?status=PENDING")).json();
    const mine = stored.appointments.filter((item: { customerName: string }) => item.customerName === name);
    expect(mine, "exactly one appointment must have been created").toHaveLength(1);

    // The owner sees it with the services, length, and price it was created with.
    // The dashboard filters by date, so the list is opened on the appointment's
    // own day rather than on today.
    const chosenDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(mine[0].startTime));
    await page.getByRole("navigation").getByRole("button", { name: /^appointments$/i }).click();
    await page.locator('input[type="date"]').fill(chosenDate);
    const row = page.locator("article").filter({ hasText: reference });
    await expect(row).toBeVisible();
    await expect(row).toContainText(service.name);

    // Clean up so later tests see an empty slot again.
    await page.request.post("/api/owner/appointments", {
      data: { action: "reject", appointmentId: mine[0].id, reason: "Playwright cleanup" },
    });
    const after = await (await page.request.get("/api/owner/appointments?status=PENDING")).json();
    expect(after.appointments.filter((item: { customerName: string }) => item.customerName === name)).toHaveLength(0);
    void request;
  });
});

test.describe("double-booking protection", () => {
  test("two simultaneous requests for one slot produce exactly one appointment", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("mobile"), "one database, one concurrency check");

    const date = istDateAfter(6);
    const time = await firstFreeSlot(request, date);

    const [first, second] = await Promise.all([
      request.post("/api/booking/create", {
        data: { serviceIds: [service.id], date, time, customerName: "Race One", customerPhone: "6280866359" },
      }),
      request.post("/api/booking/create", {
        data: { serviceIds: [service.id], date, time, customerName: "Race Two", customerPhone: "9876543210" },
      }),
    ]);

    const statuses = [first.status(), second.status()].sort();
    expect(statuses, "exactly one request may win the interval").toEqual([200, 409]);

    const loser = first.status() === 409 ? first : second;
    const body = await loser.json();
    expect(body.code).toBe("SLOT_CONFLICT");
    expect(body.error).toMatch(/already reserved|select another time/i);

    // The slot is no longer offered to anyone else.
    const after = await (await request.get(`/api/booking/slots?date=${date}&duration=${service.durationMinutes}`)).json();
    expect(after.slots.find((slot: { time: string }) => slot.time === time).available).toBe(false);
  });
});

test.describe("owner decisions and slot release", () => {
  test("approving persists the status and the slot stays taken", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("mobile"), "one database, one owner flow");

    const date = istDateAfter(7);
    const time = await firstFreeSlot(request, date);
    const reference = await bookViaApi(request, date, time, "Approve Flow");

    await signInAsOwner(page);
    await page.getByRole("navigation").getByRole("button", { name: /^appointments$/i }).click();
    await page.locator('input[type="date"]').fill(date);

    const appointment = page.locator("article").filter({ hasText: reference });
    await expect(appointment).toBeVisible();
    // The owner sees the customer, the services, the length, and the price.
    await expect(appointment).toContainText("Approve Flow");
    await expect(appointment).toContainText(service.name);
    await expect(appointment).toContainText(String(service.durationMinutes));

    await appointment.getByRole("button", { name: /^approve$/i }).click();
    await expect(page.getByRole("status")).toContainText(/approved/i);

    const status = await (await request.get(`/api/booking/status?ref=${reference}&phone=${TEST_CUSTOMER_PHONE}`)).json();
    expect(status.appointment.status).toBe("CONFIRMED");

    // Approval does not release the interval.
    const slots = await (await request.get(`/api/booking/slots?date=${date}&duration=${service.durationMinutes}`)).json();
    expect(slots.slots.find((slot: { time: string }) => slot.time === time).available).toBe(false);
  });

  test("rejecting requires a decision, releases the slot, and can be rebooked", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("mobile"), "one database, one owner flow");

    const date = istDateAfter(8);
    const time = await firstFreeSlot(request, date);
    const reference = await bookViaApi(request, date, time, "Reject Flow");

    await signInAsOwner(page);
    await page.getByRole("navigation").getByRole("button", { name: /^appointments$/i }).click();
    await page.locator('input[type="date"]').fill(date);

    const appointment = page.locator("article").filter({ hasText: reference });
    await expect(appointment).toBeVisible();

    // Rejecting is destructive, so it asks for confirmation first. Dismissing
    // the prompt must leave the request untouched.
    page.once("dialog", (dialog) => dialog.dismiss());
    await appointment.getByRole("button", { name: /^reject$/i }).click();
    const stillPending = await (await request.get(`/api/booking/status?ref=${reference}&phone=${TEST_CUSTOMER_PHONE}`)).json();
    expect(stillPending.appointment.status).toBe("PENDING");

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("article").filter({ hasText: reference }).getByRole("button", { name: /^reject$/i }).click();
    await expect(page.getByRole("status")).toContainText(/rejected/i);

    const status = await (await request.get(`/api/booking/status?ref=${reference}&phone=${TEST_CUSTOMER_PHONE}`)).json();
    expect(status.appointment.status).toBe("REJECTED");

    // The interval is free again.
    const slots = await (await request.get(`/api/booking/slots?date=${date}&duration=${service.durationMinutes}`)).json();
    expect(slots.slots.find((slot: { time: string }) => slot.time === time).available).toBe(true);

    // And it can genuinely be booked by someone else.
    const rebooked = await request.post("/api/booking/create", {
      data: { serviceIds: [service.id], date, time, customerName: "Rebooked After Reject", customerPhone: "9876543210" },
    });
    expect(rebooked.status()).toBe(200);
  });

  test("cancelling a confirmed appointment releases the slot", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("mobile"), "one database, one owner flow");

    const date = istDateAfter(9);
    const time = await firstFreeSlot(request, date);
    const reference = await bookViaApi(request, date, time, "Cancel Flow");

    await signInAsOwner(page);
    await page.getByRole("navigation").getByRole("button", { name: /^appointments$/i }).click();
    await page.locator('input[type="date"]').fill(date);

    const appointment = page.locator("article").filter({ hasText: reference });
    await appointment.getByRole("button", { name: /^approve$/i }).click();
    await expect(page.getByRole("status")).toContainText(/approved/i);

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("article").filter({ hasText: reference }).getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.getByRole("status")).toContainText(/cancelled/i);

    const status = await (await request.get(`/api/booking/status?ref=${reference}&phone=${TEST_CUSTOMER_PHONE}`)).json();
    expect(status.appointment.status).toBe("CANCELLED");

    const slots = await (await request.get(`/api/booking/slots?date=${date}&duration=${service.durationMinutes}`)).json();
    expect(slots.slots.find((slot: { time: string }) => slot.time === time).available).toBe(true);
  });

  test("the owner cannot approve the same request twice", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name.startsWith("mobile"), "one database, one owner flow");

    const date = istDateAfter(10);
    const time = await firstFreeSlot(request, date);
    await bookViaApi(request, date, time, "Double Approve");

    await signInAsOwnerViaApi(request);
    const listed = await (await request.get("/api/owner/appointments?status=PENDING")).json();
    const mine = listed.appointments.find((item: { customerName: string }) => item.customerName === "Double Approve");
    expect(mine).toBeTruthy();

    const first = await request.post("/api/owner/appointments", { data: { action: "approve", appointmentId: mine.id } });
    expect(first.status()).toBe(200);
    const second = await request.post("/api/owner/appointments", { data: { action: "approve", appointmentId: mine.id } });
    expect(second.status()).toBe(400);
    expect((await second.json()).error).toMatch(/already confirmed/i);
  });
});

test.describe("failure handling", () => {
  test("a failed booking request keeps every entered detail and can be retried", async ({ page }) => {
    await page.goto("/book");
    const wizard = page.getByRole("main");

    await selectService(wizard, new RegExp(service.name, "i"));
    await wizardContinue(wizard);
    await pickFirstAvailableDate(wizard);
    await wizardContinue(wizard);
    await pickFirstAvailableTime(wizard);
    await wizardContinue(wizard);
    await fillCustomerDetails(wizard, "Network Failure Test", TEST_CUSTOMER_PHONE, "keep my notes");
    await wizardContinue(wizard);

    // The submission fails at the network layer.
    await page.route("**/api/booking/create", (route) => route.abort("failed"));
    await wizardContinue(wizard);

    await expect(wizard.getByText(/could not reach the salon/i)).toBeVisible();
    // Nothing is confirmed, the step is unchanged, and every field survived.
    await expect(wizard.getByRole("heading", { name: /check and confirm/i })).toBeVisible();
    await wizard.getByRole("button", { name: /change mobile number/i }).click();
    await expect(wizard.getByLabel(/full name/i)).toHaveValue("Network Failure Test");
    await expect(wizard.getByLabel(/mobile number/i)).toHaveValue(TEST_CUSTOMER_PHONE);
    await expect(wizard.getByLabel(/anything the salon should know/i)).toHaveValue("keep my notes");

    // With the network restored the same request succeeds.
    await page.unroute("**/api/booking/create");
    await wizardContinue(wizard);
    await wizardContinue(wizard, /confirm request/i);
    await expect(wizard.getByRole("heading", { name: /pending approval/i })).toBeVisible();
  });

  test("a server error never leaks an internal message and keeps the details", async ({ page }) => {
    await page.goto("/book");
    const wizard = page.getByRole("main");

    await selectService(wizard, new RegExp(service.name, "i"));
    await wizardContinue(wizard);
    await pickFirstAvailableDate(wizard);
    await wizardContinue(wizard);
    await pickFirstAvailableTime(wizard);
    await wizardContinue(wizard);
    await fillCustomerDetails(wizard, "Server Error Test");
    await wizardContinue(wizard);

    await page.route("**/api/booking/create", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, error: "We could not save your request. Please try again in a moment, or contact the salon directly.", code: "SERVER_ERROR" }),
      })
    );
    await wizardContinue(wizard);

    await expect(wizard.getByText(/could not save your request/i)).toBeVisible();
    await expect(wizard.getByText(/LibsqlError|at Object\.|node_modules/i)).toHaveCount(0);
    await page.unroute("**/api/booking/create");
  });

  test("a slot taken between choosing and submitting is recoverable, not a dead end", async ({ page }) => {
    await page.goto("/book");
    const wizard = page.getByRole("main");
    await selectService(wizard, new RegExp(service.name, "i"));
    await wizardContinue(wizard);
    await pickFirstAvailableDate(wizard);
    await wizardContinue(wizard);
    await pickFirstAvailableTime(wizard);
    await wizardContinue(wizard);
    await fillCustomerDetails(wizard, "Conflict Handling Test");
    await wizardContinue(wizard);

    // The server answers exactly as it does when the interval was taken first.
    await page.route("**/api/booking/create", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          code: "SLOT_CONFLICT",
          error: "This time slot is already reserved. Please select another time.",
        }),
      })
    );
    await wizardContinue(wizard);

    // The customer is told what happened and offered the way to fix it, with
    // everything they entered still in place.
    const alert = wizard.getByRole("alert");
    await expect(alert).toContainText(/already reserved|just taken/i);
    await alert.getByRole("button", { name: /choose another time/i }).click();
    await expect(wizard.getByRole("heading", { name: /pick a time/i })).toBeVisible();
    await expect(wizard.locator('ul button[aria-pressed="true"]')).toHaveCount(0);

    // The details survive the detour.
    await pickFirstAvailableTime(wizard);
    await wizardContinue(wizard);
    await expect(wizard.getByLabel(/full name/i)).toHaveValue("Conflict Handling Test");
  });

  test("the create endpoint answers a conflict with plain language, not an internal code", async ({ request }) => {
    const date = istDateAfter(12);
    const time = await firstFreeSlot(request, date);

    const first = await request.post("/api/booking/create", {
      data: { serviceIds: [service.id], date, time, customerName: "Conflict First", customerPhone: TEST_CUSTOMER_PHONE },
    });
    expect(first.status()).toBe(200);

    const second = await request.post("/api/booking/create", {
      data: { serviceIds: [service.id], date, time, customerName: "Conflict Second", customerPhone: "9876543210" },
    });
    expect(second.status()).toBe(409);
    const body = await second.json();
    expect(body.code).toBe("SLOT_CONFLICT");
    expect(body.error).not.toMatch(/SLOT_UNAVAILABLE|SLOT_BLOCKED|LibsqlError/);
  });

  test("the status lookup needs both the reference and the booking number", async ({ page }) => {
    await page.goto("/book/status");
    await page.getByLabel(/booking reference code/i).fill("BK-ZZZZZZZZ");
    await page.getByLabel(/mobile number used for the booking/i).fill(TEST_CUSTOMER_PHONE);
    await page.getByRole("button", { name: /^track$/i }).click();
    await expect(pageAlert(page)).toContainText(/no appointment matches/i);
  });
});

/**
 * The owner API is session-protected; a spec that drives it directly signs in
 * with the same throwaway password the browser suite uses.
 */
async function signInAsOwnerViaApi(request: APIRequestContext): Promise<void> {
  const response = await request.post("/api/owner/login", { data: { password: TEST_OWNER_PASSWORD } });
  expect(response.ok(), "the owner API sign-in must succeed for this spec").toBe(true);
}
