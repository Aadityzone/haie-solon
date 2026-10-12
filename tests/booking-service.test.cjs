const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const project = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "salon-booking-test-"));
process.env.SALON_DB_PATH = path.join(temp, "test.db");
delete process.env.DATABASE_URL;
process.env.NODE_ENV = "test";

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  const mapped = request.startsWith("@/") ? path.join(project, request.slice(2)) : request;
  return originalResolve.call(this, mapped, parent, isMain, options);
};
require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  module._compile(output, filename);
};

const service = require("../lib/booking-service.ts");
const time = require("../lib/time-utils.ts");
const { getDb } = require("../lib/db.ts");
let ids;
function dateAfter(days) {
  const today = time.utcIsoToIstParts(new Date().toISOString()).date;
  const value = new Date(`${today}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function input(date, at, suffix = "") {
  return { serviceIds: [ids.short], date, time: at, customerName: `Test Customer ${suffix}`, customerPhone: "6280866359", customerNotes: "", whatsappOptIn: false };
}

test("booking validation, trusted service data, holds, and state transitions", async (t) => {
  await service.getActiveServices();
  await getDb().execute("UPDATE services SET is_active = 1");
  const available = await service.getActiveServices();
  ids = { short: available.find(x => x.durationMinutes <= 30)?.id, long: available.find(x => x.durationMinutes >= 45)?.id };
  assert.ok(ids.short && ids.long);
  const date = dateAfter(1);

  await t.test("rejects malformed calendar dates, phone, and duplicate services", async () => {
    await assert.rejects(service.createBookingRequest(input("2026-02-30", "10:00")), /Invalid.*date/);
    await assert.rejects(service.createBookingRequest({ ...input(date, "10:00"), customerPhone: "123" }), /valid 10-digit/);
    await assert.rejects(service.createBookingRequest(input(dateAfter(-1), "10:00")), /past/);
    await assert.rejects(service.createBookingRequest({ ...input(date, "10:00"), serviceIds: [ids.short, ids.short] }), /select at least one service/);
    await assert.rejects(service.createBookingRequest(input(date, "09:45")), /within salon hours/);
  });

  await t.test("creates pending requests from database duration and price snapshots", async () => {
    await getDb().execute({ sql: "UPDATE services SET price_rupees = 777 WHERE id = ?", args: [ids.short] });
    const booking = await service.createBookingRequest(input(date, "10:00", "success"));
    assert.equal(booking.totalPriceRupees, 777);
    await getDb().execute({ sql: "UPDATE services SET price_rupees = 999 WHERE id = ?", args: [ids.short] });
    assert.equal((await service.getAppointmentByReference(booking.referenceCode)).services[0].priceRupees, 777);
    assert.equal(booking.status, "PENDING");
    assert.equal(booking.durationMinutes, available.find(x => x.id === ids.short).durationMinutes);
    assert.match(booking.referenceCode, /^BK-[A-Z2-9]{8}$/);
    assert.ok(Date.parse(booking.holdExpiresAt) > Date.now());
    await assert.rejects(service.createBookingRequest(input(date, "10:15", "overlap")), /SLOT_UNAVAILABLE/);
    await service.rejectAppointment(booking.id, "Test rejection");
    const rejected = await service.getAppointmentByReference(booking.referenceCode);
    assert.equal(rejected.status, "REJECTED");
    await assert.rejects(service.approveAppointment(booking.id), /Cannot approve/);

    await getDb().execute({ sql: "UPDATE owner_settings SET value = '10' WHERE key = 'salon_buffer_minutes'" });
    const combined = await service.createBookingRequest({ ...input(date, "14:00", "combined"), serviceIds: [ids.short, ids.long] });
    assert.equal(combined.durationMinutes, available.find(x => x.id === ids.short).durationMinutes + available.find(x => x.id === ids.long).durationMinutes);
    assert.equal(Date.parse(combined.endTime) - Date.parse(combined.startTime), (combined.durationMinutes + 10) * 60_000);
    await service.rejectAppointment(combined.id);
    await getDb().execute({ sql: "UPDATE owner_settings SET value = '0' WHERE key = 'salon_buffer_minutes'" });

    await getDb().execute({ sql: "UPDATE services SET price_rupees = 0 WHERE id = ?", args: [ids.short] });
    const consultation = await service.createBookingRequest(input(date, "16:00", "zero-price"));
    assert.equal(consultation.totalPriceRupees, 0);
    assert.equal((await service.getAppointmentByReference(consultation.referenceCode)).services[0].priceRupees, 0);
    await service.rejectAppointment(consultation.id);
  });

  await t.test("only one simultaneous overlapping request reserves the interval", async () => {
    const results = await Promise.allSettled([
      service.createBookingRequest(input(date, "11:00", "parallel-a")),
      service.createBookingRequest(input(date, "11:00", "parallel-b")),
    ]);
    assert.equal(results.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(results.filter(x => x.status === "rejected").length, 1);
  });

  await t.test("approval, confirmed cancellation, and pending expiration release intervals", async () => {
    const confirmed = await service.createBookingRequest(input(date, "12:00", "confirm"));
    await service.approveAppointment(confirmed.id);
    await assert.rejects(service.approveAppointment(confirmed.id), /already confirmed/);
    await service.cancelAppointment(confirmed.id, "Owner cancellation");
    assert.equal((await service.getAppointmentByReference(confirmed.referenceCode)).status, "CANCELLED");
    const released = await service.createBookingRequest(input(date, "12:00", "released"));
    await service.rejectAppointment(released.id);

    const expired = await service.createBookingRequest(input(date, "13:00", "expired"));
    await getDb().execute({ sql: "UPDATE appointments SET hold_expires_at = ? WHERE id = ?", args: [new Date(Date.now() - 1000).toISOString(), expired.id] });
    await assert.rejects(service.approveAppointment(expired.id), /expired/);
    assert.equal(await service.cleanupExpiredHolds(), 1);
  });

  await t.test("time conversion respects the salon's UTC offset boundary", () => {
    assert.equal(time.istToUtcIso("2026-01-02", "00:00"), "2026-01-01T18:30:00.000Z");
    assert.equal(time.utcIsoToIstParts("2026-01-01T18:30:00.000Z").date, "2026-01-02");
  });
});

test("WhatsApp failures retry transiently and duplicate events do not send twice", async () => {
  const { sendAppointmentNotification } = require("../lib/notifications/whatsapp.ts");
  process.env.WHATSAPP_API_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456";
  process.env.WHATSAPP_API_VERSION = "v21.0";
  process.env.WHATSAPP_DEV_RECIPIENT = "919999999999";
  process.env.WHATSAPP_TEMPLATE_NEW_REQUEST = "salon_new_request";
  let attempts = 0;
  global.fetch = async () => {
    attempts++;
    return attempts === 1 ? new Response("", { status: 429, headers: { "retry-after": "0" } }) : Response.json({ messages: [{ id: "provider-id" }] });
  };
  const payload = { appointmentId: "notification-test", recipientPhone: "919999999999", recipientRole: "OWNER", eventType: "NEW_REQUEST", details: { referenceCode: "BK-ABCDEFGH", customerName: "Test", customerPhone: "919999999999", servicesText: "Cut", dateTimeText: "Tomorrow", totalPriceText: "To confirm", durationText: "30 min" } };
  const result = await sendAppointmentNotification(payload);
  assert.equal(result.status, "ACCEPTED");
  assert.equal(attempts, 2);
  process.env.WHATSAPP_APP_SECRET = "test-webhook-secret";
  const { POST: webhookPost } = require("../app/api/webhooks/whatsapp/route.ts");
  const { NextRequest } = require("next/server");
  const webhookBody = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "provider-id", status: "delivered" }] } }] }] });
  const signature = `sha256=${require("node:crypto").createHmac("sha256", process.env.WHATSAPP_APP_SECRET).update(webhookBody).digest("hex")}`;
  const webhookResponse = await webhookPost(new NextRequest("http://localhost/api/webhooks/whatsapp", { method: "POST", headers: { "x-hub-signature-256": signature }, body: webhookBody }));
  assert.equal(webhookResponse.status, 200);
  const deliveredLog = await getDb().execute({ sql: "SELECT status FROM notification_logs WHERE provider_message_id = ?", args: ["provider-id"] });
  assert.equal(deliveredLog.rows[0].status, "DELIVERED");
  const badSignatureResponse = await webhookPost(new NextRequest("http://localhost/api/webhooks/whatsapp", { method: "POST", headers: { "x-hub-signature-256": "sha256=invalid" }, body: webhookBody }));
  assert.equal(badSignatureResponse.status, 401);
  const duplicate = await sendAppointmentNotification(payload);
  assert.equal(duplicate.status, "DUPLICATE");
  assert.equal(attempts, 2);
  let failures = 0;
  global.fetch = async () => { failures++; return new Response("", { status: 503 }); };
  const failedPayload = { ...payload, appointmentId: "notification-failure-test" };
  const failed = await sendAppointmentNotification(failedPayload);
  assert.equal(failed.status, "FAILED");
  assert.equal(failures, 3);
  const failedDuplicate = await sendAppointmentNotification(failedPayload);
  assert.equal(failedDuplicate.status, "DUPLICATE");
  assert.equal(failures, 3);
});

test("owner session signatures reject tampering", () => {
  const { createSessionToken, verifySessionToken } = require("../lib/auth.ts");
  const token = createSessionToken("owner");
  assert.equal(verifySessionToken(token).valid, true);
  assert.equal(verifySessionToken(`${token}x`).valid, false);
});

test("the public catalogue is controlled by the owner's availability flag alone", async () => {
  // Notifications are fired without being awaited. With no credentials the
  // integration records a single SKIPPED attempt instead of retrying a live
  // request, which keeps this suite fast and keeps late writes out of teardown.
  delete process.env.WHATSAPP_API_TOKEN;

  await getDb().execute("UPDATE services SET is_active = 1, price_rupees = 400");
  const active = await service.getActiveServices();
  assert.ok(active.length > 0, "the seeded catalogue must be present");

  // Regression guard: the salon is unisex. A beard service must appear whenever
  // the owner enables it, and must never be hidden by a hardcoded name filter.
  const beard = active.find((s) => /beard/i.test(s.name));
  assert.ok(beard, "an enabled beard service must be listed");

  await getDb().execute({ sql: "UPDATE services SET is_active = 0 WHERE id = ?", args: [beard.id] });
  const hidden = await service.getActiveServices();
  assert.ok(!hidden.some((s) => s.id === beard.id), "a disabled service must not be listed");
  assert.equal(active.length - 1, hidden.length, "exactly the disabled service disappears");
  await getDb().execute({ sql: "UPDATE services SET is_active = 1 WHERE id = ?", args: [beard.id] });

  // Seeded services carry no image unless the owner sets one.
  assert.ok(active.every((s) => s.imageUrl === null || typeof s.imageUrl === "string"));
  await getDb().execute({ sql: "UPDATE services SET image_url = ? WHERE id = ?", args: ["/images/gallery/gallery-2.jpg", beard.id] });
  const withImage = await service.getActiveServices();
  assert.equal(withImage.find((s) => s.id === beard.id).imageUrl, "/images/gallery/gallery-2.jpg");
  await getDb().execute({ sql: "UPDATE services SET image_url = NULL WHERE id = ?", args: [beard.id] });
});

test("a booking reference alone does not reveal an appointment", async () => {
  const target = dateAfter(2);
  const catalogue = await service.getActiveServices();
  const thirtyMinute = catalogue.find((s) => s.durationMinutes === 30);
  const booking = await service.createBookingRequest({
    serviceIds: [thirtyMinute.id], date: target, time: "15:00",
    customerName: "Privacy Check", customerPhone: "6280866359", customerNotes: "", whatsappOptIn: false,
  });
  const other = await service.createBookingRequest({
    serviceIds: [thirtyMinute.id], date: target, time: "16:00",
    customerName: "Someone Else", customerPhone: "9876543210", customerNotes: "", whatsappOptIn: false,
  });

  // The reference plus the matching number resolves.
  const matched = await service.getAppointmentByReference(booking.referenceCode, "+916280866359");
  assert.equal(matched.status, "PENDING");

  // Accepted input shapes are normalised, so a customer can type it naturally.
  assert.ok(await service.getAppointmentByReference(booking.referenceCode, "6280866359"));
  assert.ok(await service.getAppointmentByReference(booking.referenceCode, "+91 62808 66359"));

  // A wrong number, another customer's number, or a malformed number resolves to
  // nothing at all — the caller cannot tell the reference exists.
  assert.equal(await service.getAppointmentByReference(booking.referenceCode, "9876543210"), null);
  assert.equal(await service.getAppointmentByReference(other.referenceCode, "6280866359"), null);
  assert.equal(await service.getAppointmentByReference(booking.referenceCode, "123"), null);
  assert.equal(await service.getAppointmentByReference("BK-ZZZZZZZZ", "6280866359"), null);

  await service.rejectAppointment(booking.id);
  await service.rejectAppointment(other.id);
});

test("slot availability honours opening hours, breaks, blocks, and live holds", async () => {
  const target = dateAfter(3);
  const dow = new Date(`${target}T12:00:00+05:30`).getDay();

  await getDb().execute("UPDATE services SET is_active = 1, price_rupees = 400");
  const catalogue = await service.getActiveServices();
  const thirtyMinute = catalogue.find((s) => s.durationMinutes === 30);
  assert.ok(thirtyMinute, "a 30 minute service is required for this test");

  await getDb().execute({
    sql: "UPDATE salon_hours SET is_open = 1, open_time = '10:00', close_time = '18:00', break_start = '13:00', break_end = '14:00' WHERE day_of_week = ?",
    args: [dow],
  });

  const open = await service.getAvailableSlots(target, 30);
  assert.equal(open.salonOpen, true);
  assert.ok(open.slots.length > 0, "a normal day must offer slots");
  assert.equal(open.slots[0].time, "10:00", "slots start at opening time");

  const lastStart = open.slots[open.slots.length - 1].time.split(":").map(Number);
  assert.ok(lastStart[0] * 60 + lastStart[1] + 30 <= 18 * 60, "the last slot must finish by closing time");

  const minutes = (value) => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
  const breakSlots = open.slots.filter((s) => minutes(s.time) < 14 * 60 && minutes(s.time) + 30 > 13 * 60);
  assert.ok(breakSlots.length > 0, "the break must cover at least one slot");
  assert.ok(breakSlots.every((s) => s.available === false && /break/i.test(s.reason || "")), "break slots are unavailable and explained");

  // A closed day yields no slots.
  await getDb().execute({ sql: "UPDATE salon_hours SET is_open = 0 WHERE day_of_week = ?", args: [dow] });
  const closed = await service.getAvailableSlots(target, 30);
  assert.equal(closed.salonOpen, false);
  assert.match(closed.reason, /closed/i);
  await getDb().execute({ sql: "UPDATE salon_hours SET is_open = 1 WHERE day_of_week = ?", args: [dow] });

  // A blocked period removes only the slots it overlaps.
  await getDb().execute({
    sql: "INSERT INTO blocked_periods (id, start_time, end_time, reason, created_at) VALUES ('test-block', ?, ?, 'Test block', ?)",
    args: [time.istToUtcIso(target, "16:00"), time.istToUtcIso(target, "17:00"), new Date().toISOString()],
  });
  const blocked = await service.getAvailableSlots(target, 30);
  const duringBlock = blocked.slots.find((s) => s.time === "16:30");
  assert.ok(duringBlock && duringBlock.available === false && /blocked/i.test(duringBlock.reason || ""));
  assert.equal(blocked.slots.find((s) => s.time === "10:00").available, true, "slots outside the block stay bookable");

  // A live pending hold reserves its interval.
  const hold = await service.createBookingRequest({
    serviceIds: [thirtyMinute.id], date: target, time: "10:00",
    customerName: "Slot Hold Test", customerPhone: "6280866359", customerNotes: "", whatsappOptIn: false,
  });
  const withHold = await service.getAvailableSlots(target, 30);
  assert.equal(withHold.slots.find((s) => s.time === "10:00").available, false, "a held interval is not offered");

  // Cancelling releases it again.
  await service.cancelAppointment(hold.id, "Slot test cleanup");
  const released = await service.getAvailableSlots(target, 30);
  assert.equal(released.slots.find((s) => s.time === "10:00").available, true, "cancelling releases the interval");

  // Dates outside the booking window are refused rather than offered.
  const past = await service.getAvailableSlots(dateAfter(-1), 30);
  assert.equal(past.salonOpen, false);
  assert.match(past.reason, /within the next/i);

  await getDb().execute("DELETE FROM blocked_periods WHERE id = 'test-block'");
  await getDb().execute({
    sql: "UPDATE salon_hours SET break_start = NULL, break_end = NULL, open_time = '10:00', close_time = '20:00' WHERE day_of_week = ?",
    args: [dow],
  });
});

test("approval is refused when the interval becomes blocked after the request", async () => {
  const target = dateAfter(4);
  const dow = new Date(`${target}T12:00:00+05:30`).getDay();
  await getDb().execute({
    sql: "UPDATE salon_hours SET is_open = 1, open_time = '10:00', close_time = '20:00', break_start = NULL, break_end = NULL WHERE day_of_week = ?",
    args: [dow],
  });

  const catalogue = await service.getActiveServices();
  const thirtyMinute = catalogue.find((s) => s.durationMinutes === 30);
  const booking = await service.createBookingRequest({
    serviceIds: [thirtyMinute.id], date: target, time: "11:00",
    customerName: "Blocked Approval Test", customerPhone: "6280866359", customerNotes: "", whatsappOptIn: false,
  });

  await getDb().execute({
    sql: "INSERT INTO blocked_periods (id, start_time, end_time, reason, created_at) VALUES ('approval-block', ?, ?, 'Staff training', ?)",
    args: [time.istToUtcIso(target, "10:30"), time.istToUtcIso(target, "12:00"), new Date().toISOString()],
  });

  await assert.rejects(service.approveAppointment(booking.id), /blocked/i);
  assert.equal((await service.getAppointmentByReference(booking.referenceCode)).status, "PENDING", "a refused approval leaves the request pending");

  await getDb().execute("DELETE FROM blocked_periods WHERE id = 'approval-block'");
  await service.approveAppointment(booking.id);
  assert.equal((await service.getAppointmentByReference(booking.referenceCode)).status, "CONFIRMED");
  await service.cancelAppointment(booking.id, "Test cleanup");
});

test.after(async () => {
  // Booking creation deliberately does not await notifications. Let the last
  // recorded attempt land before the client is closed.
  await new Promise((resolve) => setTimeout(resolve, 250));
  try { await getDb().close(); } catch {}
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch { /* libSQL may retain the temp directory until process exit on Windows. */ }
});



