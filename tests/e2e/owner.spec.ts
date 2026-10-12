import { test, expect } from "@playwright/test";
import { pageAlert, signInAsOwner } from "./helpers";

const OWNER_APIS = [
  "/api/owner/appointments",
  "/api/owner/services",
  "/api/owner/hours",
  "/api/owner/blocked-periods",
  "/api/owner/settings",
  "/api/owner/notifications",
  "/api/owner/overview",
];

test.describe("owner access control", () => {
  test("redirects an anonymous visitor from the dashboard to sign-in", async ({ page }) => {
    await page.goto("/owner");
    await expect(page).toHaveURL(/\/owner\/login/);
  });

  test("rejects every owner API without a session", async ({ request }) => {
    for (const url of OWNER_APIS) {
      const response = await request.get(url);
      expect(response.status(), `${url} must require a session`).toBe(401);
    }
  });

  test("rejects a wrong owner password", async ({ page }) => {
    await page.goto("/owner/login");
    await page.getByLabel(/master password/i).fill("definitely-not-the-owner-password");
    await page.getByRole("button", { name: /access dashboard|initialize & sign in/i }).click();

    await expect(pageAlert(page)).toContainText(/invalid password/i);
    await expect(page).toHaveURL(/\/owner\/login/);
  });

  test("signs the owner in and opens every dashboard tab", async ({ page }) => {
    await signInAsOwner(page);

    for (const tab of ["Appointments", "Services", "Opening hours", "Blocked times", "Notifications", "Settings"]) {
      await page.getByRole("navigation").getByRole("button", { name: new RegExp(`^${tab}$`, "i") }).click();
      await expect(
        page.getByRole("navigation").getByRole("button", { name: new RegExp(`^${tab}$`, "i") }),
      ).toHaveAttribute("aria-current", "page");
    }
  });

  test("signs the owner out", async ({ page }) => {
    await signInAsOwner(page);
    await page.getByRole("button", { name: /sign out/i }).click();

    await expect(page).toHaveURL(/\/owner\/login/);
    expect((await page.request.get("/api/owner/appointments")).status()).toBe(401);
  });

  test("lets the owner configure a daily break and rejects an invalid one", async ({ page }) => {
    await signInAsOwner(page);
    await page.getByRole("navigation").getByRole("button", { name: /^opening hours$/i }).click();

    const monday = page.locator("article").filter({ hasText: "Monday" }).first();
    const [opens, closes, breakStarts, breakEnds] = [
      monday.locator('input[type="time"]').nth(0),
      monday.locator('input[type="time"]').nth(1),
      monday.locator('input[type="time"]').nth(2),
      monday.locator('input[type="time"]').nth(3),
    ];

    // A break outside the opening hours must be refused before it is saved.
    await opens.fill("10:00");
    await closes.fill("20:00");
    await breakStarts.fill("21:00");
    await breakEnds.fill("22:00");
    await monday.getByRole("button", { name: /save monday/i }).click();
    await expect(pageAlert(page)).toContainText(/break must start before it ends and sit inside/i);

    // A valid break is stored and stays visible after reload.
    await breakStarts.fill("14:00");
    await breakEnds.fill("15:00");
    await monday.getByRole("button", { name: /save monday/i }).click();
    await expect(page.getByRole("status")).toContainText(/monday hours saved/i);

    await expect(page.locator("article").filter({ hasText: "Monday" }).first().locator('input[type="time"]').nth(2)).toHaveValue("14:00");
    await expect(page.locator("article").filter({ hasText: "Monday" }).first().locator('input[type="time"]').nth(3)).toHaveValue("15:00");

    // Restore a break-free day so later tests are unaffected.
    await page.locator("article").filter({ hasText: "Monday" }).first().locator('input[type="time"]').nth(2).fill("");
    await page.locator("article").filter({ hasText: "Monday" }).first().locator('input[type="time"]').nth(3).fill("");
    await page.locator("article").filter({ hasText: "Monday" }).first().getByRole("button", { name: /save monday/i }).click();
    await expect(page.getByRole("status")).toContainText(/monday hours saved/i);
  });

  test("refuses a break on only one side of the day", async ({ page }) => {
    await signInAsOwner(page);
    await page.getByRole("navigation").getByRole("button", { name: /^opening hours$/i }).click();

    const sunday = page.locator("article").filter({ hasText: "Sunday" }).first();
    await sunday.locator('input[type="time"]').nth(2).fill("13:00");
    await sunday.getByRole("button", { name: /save sunday/i }).click();

    await expect(pageAlert(page)).toContainText(/set both break start and break end/i);

    await sunday.locator('input[type="time"]').nth(2).fill("");
  });

  test("shows an overview built only from real stored appointments", async ({ page }) => {
    await signInAsOwner(page);

    // Overview is the landing tab.
    await expect(page.getByRole("navigation").getByRole("button", { name: /^overview$/i })).toHaveAttribute("aria-current", "page");

    const cards = ["Appointments today", "Awaiting approval", "Upcoming confirmed", "Completed value"];
    for (const label of cards) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }

    // The seven-day strip and the status breakdown are rendered from the API.
    await expect(page.getByRole("heading", { name: /next seven days/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /all requests by status/i })).toBeVisible();

    const body = await (await page.request.get("/api/owner/overview")).json();
    expect(body.success).toBe(true);
    expect(body.overview.week).toHaveLength(7);
    expect(body.overview.week[0].label).toBe("Today");
    expect(body.overview.statusBreakdown.map((entry: { status: string }) => entry.status)).toEqual([
      "PENDING", "CONFIRMED", "REJECTED", "CANCELLED", "COMPLETED",
    ]);
    // Counts are real numbers, never placeholders.
    for (const entry of body.overview.statusBreakdown) {
      expect(Number.isInteger(entry.count)).toBe(true);
      expect(entry.count).toBeGreaterThanOrEqual(0);
    }
  });

  test("refuses a service image that is not served from this site", async ({ page }) => {
    await signInAsOwner(page);

    // Create a dedicated inactive service so this test never mutates the menu
    // that other specs rely on.
    const created = await page.request.post("/api/owner/services", {
      data: { name: "Playwright Image Service", categoryName: "Test only", durationMinutes: 30, priceRupees: 300 },
    });
    expect(created.status()).toBe(201);
    const serviceId: string = (await created.json()).id;

    const update = (imageUrl: unknown) =>
      page.request.put("/api/owner/services", {
        data: { id: serviceId, name: "Playwright Image Service", priceRupees: 300, durationMinutes: 30, isActive: false, imageUrl },
      });

    for (const bad of ["https://example.com/photo.jpg", "//cdn.example.com/x.jpg", "javascript:alert(1)", "/images/a b.jpg"]) {
      const response = await update(bad);
      expect(response.status(), `${String(bad)} must be refused`).toBe(400);
      expect((await response.json()).success).toBe(false);
    }

    // A site-relative path is accepted and persisted.
    expect((await update("/images/gallery/gallery-2.jpg")).status()).toBe(200);
    const listed = await (await page.request.get("/api/owner/services")).json();
    expect(listed.services.find((service: { id: string }) => service.id === serviceId).imageUrl).toBe("/images/gallery/gallery-2.jpg");

    // And it can be cleared again.
    expect((await update(null)).status()).toBe(200);
  });

  test("reports the WhatsApp integration honestly when unconfigured", async ({ page }) => {
    await signInAsOwner(page);
    await page.getByRole("navigation").getByRole("button", { name: /^notifications$/i }).click();

    // This test server has no WhatsApp credentials, so the dashboard must say
    // so and must never imply that a message was delivered.
    await expect(page.getByText(/whatsapp notifications are not being sent/i)).toBeVisible();
    await expect(page.getByText(/no message is sent until every item below is configured/i)).toBeVisible();
    await expect(page.getByText("Missing").first()).toBeVisible();
  });
});
