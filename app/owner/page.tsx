"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Appointment, SalonDayHours, ServiceItem, BlockedPeriod } from "@/lib/types";
import { proposedCatalogue } from "@/config/service-catalogue";

type Tab = "overview" | "appointments" | "services" | "hours" | "blocked" | "notifications" | "settings";

type BookingSettings = {
  pendingHoldMinutes: number;
  maxAdvanceBookingDays: number;
  slotIntervalMinutes: number;
  bufferMinutes: number;
};

type Overview = {
  today: string;
  todayCount: number;
  pendingCount: number;
  upcomingConfirmedCount: number;
  completedRevenueRupees: number;
  statusBreakdown: { status: string; count: number }[];
  week: { date: string; label: string; total: number; pending: number }[];
};

type NotificationRecord = {
  id: string;
  referenceCode: string | null;
  recipient: string;
  recipientRole: string;
  eventType: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
};

type WhatsAppConfiguration = {
  environment: string;
  recipientKey: string;
  ready: boolean;
  checks: { key: string; label: string; present: boolean }[];
};

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  appointments: "Appointments",
  services: "Services",
  hours: "Opening hours",
  blocked: "Blocked times",
  notifications: "Notifications",
  settings: "Settings",
};

const rupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

function todayIst(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}

function shiftDate(dateStr: string, days: number): string {
  const value = new Date(`${dateStr}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export default function OwnerDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [hours, setHours] = useState<SalonDayHours[]>([]);
  const [blocks, setBlocks] = useState<BlockedPeriod[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<BookingSettings>({ pendingHoldMinutes: 30, maxAdvanceBookingDays: 30, slotIntervalMinutes: 15, bufferMinutes: 0 });
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [whatsapp, setWhatsapp] = useState<WhatsAppConfiguration | null>(null);
  const [date, setDate] = useState(todayIst);
  const [weekView, setWeekView] = useState(false);
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const call = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    const data = await response.json();
    if (response.status === 401) {
      router.replace("/owner/login");
      throw new Error("Please sign in again.");
    }
    if (!response.ok || !data.success) throw new Error(data.error || "Request failed.");
    return data;
  }, [router]);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const filters = new URLSearchParams({ status });
      if (weekView) {
        filters.set("from", date);
        filters.set("to", shiftDate(date, 6));
      } else {
        filters.set("date", date);
      }
      const results = await Promise.all([
        call(`/api/owner/appointments?${filters.toString()}`),
        call("/api/owner/services"),
        call("/api/owner/hours"),
        call("/api/owner/blocked-periods"),
        call("/api/owner/settings"),
        call("/api/owner/notifications"),
        call("/api/owner/overview"),
      ]);
      setAppointments(results[0].appointments);
      setServices(results[1].services);
      setHours(results[2].hours);
      setBlocks(results[3].blockedPeriods);
      setSettings(results[4].settings);
      setNotifications(results[5].notifications);
      setWhatsapp(results[5].configuration);
      setOverview(results[6].overview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load dashboard.");
    } finally {
      setBusy(false);
    }
  }, [call, date, status, weekView]);

  // Loading is an external request; defer state updates until after the effect phase.
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleAppointments = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return appointments;
    return appointments.filter((appointment) =>
      appointment.referenceCode.toLowerCase().includes(term) ||
      appointment.customerName.toLowerCase().includes(term) ||
      appointment.customerPhone.toLowerCase().includes(term) ||
      (appointment.services ?? []).some((service) => service.serviceName.toLowerCase().includes(term)),
    );
  }, [appointments, search]);

  const confirmDestructive: Record<string, string> = {
    reject: "Reject this request? The customer will see the request as declined and the slot is released.",
    cancel: "Cancel this appointment? The slot is released and cannot be restored.",
  };

  const act = async (appointmentId: string, action: string) => {
    const prompt = confirmDestructive[action];
    if (prompt && !window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await call("/api/owner/appointments", { method: "POST", body: JSON.stringify({ appointmentId, action }) });
      const past: Record<string, string> = { approve: "approved", reject: "rejected", cancel: "cancelled", complete: "completed" };
      setNotice(`Appointment ${past[action]}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update appointment.");
    } finally {
      setBusy(false);
    }
  };

  const saveService = async (service: ServiceItem) => {
    setError("");
    try {
      await call("/api/owner/services", { method: "PUT", body: JSON.stringify(service) });
      setNotice(`${service.name} saved.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save service.");
    }
  };

  const patchService = (id: string, patch: Partial<ServiceItem>) =>
    setServices((old) => old.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const createService = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    try {
      await call("/api/owner/services", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          categoryName: data.get("categoryName"),
          durationMinutes: Number(data.get("durationMinutes")),
          priceRupees: data.get("priceRupees") === "" ? null : Number(data.get("priceRupees")),
        }),
      });
      form.reset();
      setNotice("Service added as inactive. Review it, then switch Available on.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add service.");
    }
  };

  const addProposedService = async (id: string) => {
    const service = proposedCatalogue.find((item) => item.id === id);
    if (!service) return;
    setError("");
    try {
      await call("/api/owner/services", {
        method: "POST",
        body: JSON.stringify({
          name: service.name,
          description: service.description,
          categoryName: service.categoryName,
          durationMinutes: service.durationMinutes,
          priceRupees: service.proposedPriceRupees,
          isActive: false,
        }),
      });
      setNotice(`${service.name} added as an inactive proposal. Confirm its details before enabling it.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add proposed service.");
    }
  };

  const saveHours = async (day: SalonDayHours) => {
    setError("");
    const breakStart = day.breakStart || null;
    const breakEnd = day.breakEnd || null;
    if (day.openTime >= day.closeTime) {
      setError(`${day.dayName}: opening time must be earlier than closing time.`);
      return;
    }
    if ((breakStart === null) !== (breakEnd === null)) {
      setError(`${day.dayName}: set both break start and break end, or clear both.`);
      return;
    }
    if (breakStart && breakEnd && (breakStart >= breakEnd || breakStart < day.openTime || breakEnd > day.closeTime)) {
      setError(`${day.dayName}: the break must start before it ends and sit inside ${day.openTime}–${day.closeTime}.`);
      return;
    }
    try {
      await call("/api/owner/hours", { method: "PUT", body: JSON.stringify({ ...day, breakStart, breakEnd }) });
      setNotice(`${day.dayName} hours saved.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save hours.");
    }
  };

  const saveSettings = async () => {
    setError("");
    try {
      await call("/api/owner/settings", { method: "PUT", body: JSON.stringify(settings) });
      setNotice("Booking rules saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save booking rules.");
    }
  };

  const addBlock = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const toIso = (key: string) => `${String(data.get(key))}:00+05:30`;
    setError("");
    try {
      await call("/api/owner/blocked-periods", {
        method: "POST",
        body: JSON.stringify({ startTime: toIso("start"), endTime: toIso("end"), reason: data.get("reason") }),
      });
      setNotice("Unavailable time added.");
      form.reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not block that time.");
    }
  };

  const removeBlock = async (id: string) => {
    if (!window.confirm("Remove this blocked period? The time becomes bookable again.")) return;
    setError("");
    try {
      await call(`/api/owner/blocked-periods?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setNotice("Blocked period removed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the blocked period.");
    }
  };

  const logout = async () => {
    await fetch("/api/owner/logout", { method: "POST" });
    router.replace("/owner/login");
  };

  return (
    <main id="main-content" className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="eyebrow">Salon management</p>
            <h1 className="mt-2 font-[family-name:var(--font-serif)] text-3xl sm:text-4xl">Owner dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" disabled={busy} onClick={() => void load()} className="btn-secondary text-xs">
              {busy ? "Refreshing…" : "Refresh"}
            </button>
            <button type="button" onClick={() => void logout()} className="btn-secondary text-xs">Sign out</button>
          </div>
        </header>

        <nav aria-label="Dashboard sections" className="flex flex-wrap gap-2 py-5">
          {(Object.keys(TAB_LABELS) as Tab[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              aria-current={tab === item ? "page" : undefined}
              className={`min-h-11 rounded-sm px-4 text-xs uppercase tracking-wider transition-colors ${tab === item ? "bg-champagne text-charcoal" : "border border-neutral-300 text-neutral-600 hover:border-champagne hover:text-foreground"}`}
            >
              {TAB_LABELS[item]}
            </button>
          ))}
        </nav>

        {error && <p role="alert" className="mb-4 border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
        {notice && <p role="status" aria-live="polite" className="mb-4 border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</p>}

        {tab === "overview" && (
          <section aria-label="Overview">
            {!overview && busy && <p className="py-8 text-sm text-neutral-500">Loading…</p>}
            {overview && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: "Appointments today", value: String(overview.todayCount), hint: "Pending, confirmed, and completed" },
                    { label: "Awaiting approval", value: String(overview.pendingCount), hint: "Holding a slot until the hold expires" },
                    { label: "Upcoming confirmed", value: String(overview.upcomingConfirmedCount), hint: "From now onwards" },
                    { label: "Completed value", value: rupees.format(overview.completedRevenueRupees), hint: "Recorded price of completed appointments" },
                  ].map((card) => (
                    <article key={card.label} className="border border-border bg-surface p-5">
                      <p className="text-[0.62rem] uppercase tracking-[0.14em] text-neutral-500">{card.label}</p>
                      <p className="mt-3 font-[family-name:var(--font-serif)] text-3xl tabular-nums text-foreground">{card.value}</p>
                      <p className="mt-2 text-xs leading-5 text-neutral-500">{card.hint}</p>
                    </article>
                  ))}
                </div>

                <div className="mt-8 grid gap-6 lg:grid-cols-2">
                  <div>
                    <h2 className="font-[family-name:var(--font-serif)] text-xl">Next seven days</h2>
                    <ul className="mt-3 divide-y divide-border border-y border-border">
                      {overview.week.map((day) => (
                        <li key={day.date} className="flex items-center justify-between gap-4 py-3 text-sm">
                          <span className="text-neutral-600">{day.label}</span>
                          <span className="flex items-center gap-4 tabular-nums">
                            {day.pending > 0 && <span className="text-xs text-amber-300">{day.pending} pending</span>}
                            <span className="text-foreground">{day.total}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h2 className="font-[family-name:var(--font-serif)] text-xl">All requests by status</h2>
                    <ul className="mt-3 divide-y divide-border border-y border-border">
                      {overview.statusBreakdown.map((entry) => (
                        <li key={entry.status} className="flex items-center justify-between gap-4 py-3 text-sm">
                          <span className="uppercase tracking-[0.1em] text-neutral-500">{entry.status}</span>
                          <span className="tabular-nums text-foreground">{entry.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <p className="mt-6 text-xs leading-5 text-neutral-500">
                  Every figure is counted from stored appointments for {overview.today} in Asia/Kolkata. Expired pending holds are released before counting, so nothing here includes a request that has already lapsed.
                </p>
              </>
            )}
          </section>
        )}

        {tab === "appointments" && (
          <section aria-label="Appointments">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <label className="text-xs text-neutral-500">
                {weekView ? "Week starting" : "Date"}
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="form-control mt-1 block w-auto" />
              </label>
              <label className="text-xs text-neutral-500">
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-control mt-1 block w-auto">
                  {["ALL", "PENDING", "CONFIRMED", "REJECTED", "CANCELLED", "COMPLETED"].map((value) => <option key={value}>{value}</option>)}
                </select>
              </label>
              <label className="min-w-56 flex-1 text-xs text-neutral-500">
                Search
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Reference, name, mobile, or service…"
                  className="form-control mt-1 block w-full"
                />
              </label>
              <button type="button" onClick={() => setWeekView((value) => !value)} className="btn-secondary text-xs">
                {weekView ? "Daily view" : "Weekly view"}
              </button>
            </div>

            {busy && <p className="py-6 text-sm text-neutral-500">Loading…</p>}
            {!busy && visibleAppointments.length === 0 && (
              <p className="border border-border bg-surface p-8 text-center text-sm text-neutral-500">
                {appointments.length === 0 ? "No appointments for this selection." : "No appointments match that search."}
              </p>
            )}

            <div className="grid gap-3">
              {visibleAppointments.map((appointment) => (
                <article key={appointment.id} className="border border-border bg-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-neutral-500">{appointment.referenceCode} · {appointment.status}</p>
                      <h2 className="mt-1 text-lg font-[family-name:var(--font-serif)]">{appointment.customerName}</h2>
                      <a className="text-sm text-champagne underline underline-offset-4" href={`tel:${appointment.customerPhone}`}>{appointment.customerPhone}</a>
                    </div>
                    <time className="shrink-0 text-sm text-neutral-600 tabular-nums" dateTime={appointment.startTime}>{dateTime.format(new Date(appointment.startTime))}</time>
                  </div>

                  <p className="mt-3 text-sm text-neutral-600">
                    {(appointment.services ?? []).map((service) => `${service.serviceName} (${service.durationMinutes} min${service.priceRupees == null ? "" : `, ${rupees.format(service.priceRupees)}`})`).join(" · ")}
                    {" · "}{appointment.durationMinutes} min · {appointment.totalPriceRupees == null ? "Price to confirm" : rupees.format(appointment.totalPriceRupees)}
                  </p>
                  {appointment.customerNotes && <p className="mt-2 text-sm text-neutral-500">Note: {appointment.customerNotes}</p>}
                  {appointment.rejectionReason && <p className="mt-2 text-sm text-neutral-500">Reason: {appointment.rejectionReason}</p>}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {appointment.status === "PENDING" && (
                      <>
                        <button type="button" disabled={busy} onClick={() => void act(appointment.id, "approve")} className="btn-primary text-xs">Approve</button>
                        <button type="button" disabled={busy} onClick={() => void act(appointment.id, "reject")} className="btn-secondary text-xs">Reject</button>
                        <button type="button" disabled={busy} onClick={() => void act(appointment.id, "cancel")} className="btn-secondary text-xs">Cancel request</button>
                      </>
                    )}
                    {appointment.status === "CONFIRMED" && (
                      <>
                        <button type="button" disabled={busy} onClick={() => void act(appointment.id, "cancel")} className="btn-secondary text-xs">Cancel</button>
                        <button type="button" disabled={busy} onClick={() => void act(appointment.id, "complete")} className="btn-secondary text-xs">Mark complete</button>
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === "services" && (
          <section aria-label="Services">
            <div className="mb-5 border border-amber-900 bg-amber-950/40 p-4 text-sm leading-6 text-amber-200">
              <strong>Proposed starter catalogue.</strong> These names, prices, and durations come from the project brief and have not been confirmed by the salon. Adding a proposal stores it as inactive; review the details and switch Available on only after you have confirmed them.
            </div>

            <section aria-labelledby="proposed-catalogue-title" className="mb-6">
              <h2 id="proposed-catalogue-title" className="font-[family-name:var(--font-serif)] text-2xl">Suggested starting points</h2>
              <p className="mt-2 text-xs leading-5 text-neutral-500">
                Proposed wording and prices for the services above to be confirmed. Adding one stores it inactive, so nothing is published until you review it and switch Available on.
              </p>
              {/* Collapsed by default: ten rows of reference material push the real
                  work far down the page on a phone. */}
              <button
                type="button"
                aria-expanded={showSuggestions}
                aria-controls="suggested-catalogue-list"
                onClick={() => setShowSuggestions((value) => !value)}
                className="btn-secondary mt-3 text-xs"
              >
                {showSuggestions ? "Hide suggestions" : `Show ${proposedCatalogue.length} suggestions`}
              </button>
              {showSuggestions && (
                <ul id="suggested-catalogue-list" className="mt-3 grid gap-2 sm:grid-cols-2">
                  {proposedCatalogue.map((service) => {
                    const exists = services.some((item) => item.name.trim().toLowerCase() === service.name.toLowerCase());
                    return (
                      <li key={service.id} className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{service.name}</p>
                          <p className="mt-1 text-xs text-neutral-500">
                            Proposed · {service.durationMinutes} min · {rupees.format(service.proposedPriceRupees)}
                          </p>
                        </div>
                        <button type="button" disabled={exists || busy} onClick={() => void addProposedService(service.id)} className="btn-secondary min-h-11 px-3 text-xs">
                          {exists ? "Already listed" : "Add inactive"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <form onSubmit={createService} className="mb-4 grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-xs text-neutral-500">Service name<input required name="name" minLength={2} maxLength={100} className="form-control mt-1 w-full" /></label>
              <label className="text-xs text-neutral-500">Category<input name="categoryName" maxLength={80} className="form-control mt-1 w-full" /></label>
              <label className="text-xs text-neutral-500">Price ₹<input name="priceRupees" type="number" min="0" className="form-control mt-1 w-full" /></label>
              <label className="text-xs text-neutral-500">Minutes<input required name="durationMinutes" type="number" min="5" max="480" defaultValue="30" className="form-control mt-1 w-full" /></label>
              <button className="btn-primary self-end text-xs">Add inactive service</button>
            </form>

            <section aria-label="Configured services" className="grid gap-3">
              {services.length === 0 && <p className="border border-border bg-surface p-8 text-center text-sm text-neutral-500">No services yet. Add one above, or start from a suggestion.</p>}
              {services.map((service) => (
                <article key={service.id} className="grid grid-cols-2 gap-3 border border-border bg-surface p-4 lg:grid-cols-6">
                  <div className="col-span-2 lg:col-span-6">
                    <p className="text-xs uppercase tracking-[0.1em] text-neutral-500">{service.categoryName}</p>
                    <label className="sr-only" htmlFor={`service-name-${service.id}`}>Service name</label>
                    <input
                      id={`service-name-${service.id}`}
                      value={service.name}
                      maxLength={100}
                      onChange={(event) => patchService(service.id, { name: event.target.value })}
                      className="form-control mt-1 w-full font-medium"
                    />
                    <label className="sr-only" htmlFor={`service-description-${service.id}`}>Service description</label>
                    <textarea
                      id={`service-description-${service.id}`}
                      value={service.description ?? ""}
                      maxLength={500}
                      rows={2}
                      onChange={(event) => patchService(service.id, { description: event.target.value })}
                      className="form-control mt-2 w-full text-xs"
                      placeholder="What the customer should expect…"
                    />
                  </div>

                  <label className="col-span-2 text-xs text-neutral-500 lg:col-span-2">
                    Image path
                    <input
                      value={service.imageUrl ?? ""}
                      maxLength={300}
                      onChange={(event) => patchService(service.id, { imageUrl: event.target.value || null })}
                      className="form-control mt-1 w-full text-xs"
                      placeholder="/images/gallery/gallery-2.jpg"
                    />
                  </label>
                  <label className="text-xs text-neutral-500">
                    Price ₹
                    <input
                      type="number"
                      min="0"
                      value={service.priceRupees ?? ""}
                      placeholder="Set price"
                      onChange={(event) => patchService(service.id, { priceRupees: event.target.value === "" ? null : Number(event.target.value) })}
                      className="form-control mt-1 w-full"
                    />
                  </label>
                  <label className="text-xs text-neutral-500">
                    Minutes
                    <input
                      type="number"
                      min="5"
                      max="480"
                      value={service.durationMinutes}
                      onChange={(event) => patchService(service.id, { durationMinutes: Number(event.target.value) })}
                      className="form-control mt-1 w-full"
                    />
                  </label>
                  <label className="flex min-h-11 items-center gap-2 self-end text-xs text-neutral-500">
                    <input type="checkbox" checked={service.isActive} onChange={(event) => patchService(service.id, { isActive: event.target.checked })} />
                    Available
                  </label>
                  <button type="button" onClick={() => void saveService(service)} className="btn-primary self-end text-xs">Save</button>
                </article>
              ))}
            </section>
          </section>
        )}

        {tab === "hours" && (
          <section aria-label="Opening hours" className="grid gap-3">
            <p className="max-w-3xl border border-border bg-surface p-4 text-xs leading-5 text-neutral-500">
              Opening hours and any daily break are used for online availability and are re-checked when you approve a request. A break must sit inside the opening hours; leave both break fields empty for a day without a break. Untick a day to stop accepting requests on it.
            </p>
            {hours.map((day) => {
              const update = (patch: Partial<SalonDayHours>) => setHours((old) => old.map((item) => (item.dayOfWeek === day.dayOfWeek ? { ...item, ...patch } : item)));
              return (
                <article key={day.dayOfWeek} className="grid items-end gap-3 border border-border bg-surface p-4 sm:grid-cols-3 lg:grid-cols-7">
                  <h3 className="text-sm font-semibold">{day.dayName}</h3>
                  <label className="text-xs text-neutral-500">Opens<input type="time" value={day.openTime} onChange={(e) => update({ openTime: e.target.value })} className="form-control mt-1 w-full" /></label>
                  <label className="text-xs text-neutral-500">Closes<input type="time" value={day.closeTime} onChange={(e) => update({ closeTime: e.target.value })} className="form-control mt-1 w-full" /></label>
                  <label className="text-xs text-neutral-500">Break starts<input type="time" value={day.breakStart ?? ""} onChange={(e) => update({ breakStart: e.target.value || null })} className="form-control mt-1 w-full" /></label>
                  <label className="text-xs text-neutral-500">Break ends<input type="time" value={day.breakEnd ?? ""} onChange={(e) => update({ breakEnd: e.target.value || null })} className="form-control mt-1 w-full" /></label>
                  <label className="flex min-h-11 items-center gap-2 text-xs text-neutral-500">
                    <input type="checkbox" checked={day.isOpen} onChange={(e) => update({ isOpen: e.target.checked })} />
                    Accepting requests
                  </label>
                  <button type="button" disabled={busy} onClick={() => void saveHours(day)} className="btn-primary text-xs">Save {day.dayName}</button>
                </article>
              );
            })}
          </section>
        )}

        {tab === "blocked" && (
          <section aria-label="Blocked times">
            <form onSubmit={addBlock} className="mb-5 grid gap-3 border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs text-neutral-500">Start<input required name="start" type="datetime-local" className="form-control mt-1 w-full" /></label>
              <label className="text-xs text-neutral-500">End<input required name="end" type="datetime-local" className="form-control mt-1 w-full" /></label>
              <label className="text-xs text-neutral-500">Reason<input required name="reason" maxLength={120} className="form-control mt-1 w-full" placeholder="Staff training, holiday…" /></label>
              <button className="btn-primary self-end text-xs">Block that time</button>
            </form>
            <p className="mb-4 text-xs leading-5 text-neutral-500">
              Blocked times are treated as Asia/Kolkata time and are refused if they overlap an existing confirmed or held request. Use them for holidays, training, or personal time.
            </p>
            <div className="grid gap-2">
              {blocks.length === 0 && <p className="border border-border bg-surface p-8 text-center text-sm text-neutral-500">Nothing blocked. Availability follows your opening hours and breaks.</p>}
              {blocks.map((block) => (
                <div key={block.id} className="flex flex-wrap items-center justify-between gap-3 border border-border bg-surface p-4 text-sm">
                  <span className="text-neutral-600">
                    <time dateTime={block.startTime}>{dateTime.format(new Date(block.startTime))}</time> – <time dateTime={block.endTime}>{dateTime.format(new Date(block.endTime))}</time> · {block.reason}
                  </span>
                  <button type="button" onClick={() => void removeBlock(block.id)} className="min-h-11 text-xs text-champagne underline underline-offset-4">Remove</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "notifications" && (
          <section aria-label="WhatsApp notifications">
            <div className={`mb-5 border p-4 text-sm leading-6 ${whatsapp?.ready ? "border-emerald-900 bg-emerald-950/40 text-emerald-200" : "border-amber-900 bg-amber-950/40 text-amber-200"}`}>
              <p className="font-semibold">{whatsapp?.ready ? "WhatsApp notifications are configured." : "WhatsApp notifications are not being sent."}</p>
              <p className="mt-1">
                {whatsapp?.ready
                  ? `Sending in the ${whatsapp.environment} environment. An accepted message is not proof of delivery; delivery appears only after the signed status webhook reports it.`
                  : "No message is sent until every item below is configured. Attempts are still recorded, with the reason they were skipped, so you can see exactly what is missing."}
              </p>
            </div>

            {whatsapp && (
              <div className="mb-6 grid gap-2 sm:grid-cols-2">
                {whatsapp.checks.map((check) => (
                  <div key={check.key} className="flex items-center justify-between gap-3 border border-border bg-surface p-3 text-xs">
                    <span className="text-neutral-500">{check.label}</span>
                    <span className={`shrink-0 font-semibold ${check.present ? "text-emerald-300" : "text-amber-300"}`}>{check.present ? "Configured" : "Missing"}</span>
                  </div>
                ))}
              </div>
            )}

            <h2 className="font-[family-name:var(--font-serif)] text-xl">Recorded attempts</h2>
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              Every attempt is listed with the state the provider actually reported. Nothing is marked delivered unless the status webhook said so.
            </p>

            {busy && <p className="py-6 text-sm text-neutral-500">Loading…</p>}
            {!busy && notifications.length === 0 && <p className="mt-3 border border-border bg-surface p-8 text-center text-sm text-neutral-500">No notification attempts have been recorded yet.</p>}
            {!busy && notifications.length > 0 && (
              <div className="mt-3 grid gap-2">
                {notifications.map((item) => (
                  <article key={item.id} className="flex flex-wrap items-start justify-between gap-3 border border-border bg-surface p-4 text-sm">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-neutral-500">{item.referenceCode ?? "Unlinked appointment"} · {item.eventType} · to {item.recipientRole.toLowerCase()}</p>
                      <p className="mt-1 break-words text-neutral-500">{item.errorMessage ?? `Template message for the ${item.recipientRole.toLowerCase()} notification.`}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-xs font-semibold ${item.status === "FAILED" ? "text-rose-300" : item.status === "SKIPPED" || item.status === "DUPLICATE" ? "text-amber-300" : item.status === "DELIVERED" || item.status === "READ" ? "text-emerald-300" : "text-champagne"}`}>
                        {item.status}
                      </p>
                      <time className="mt-1 block text-xs text-neutral-500 tabular-nums" dateTime={item.createdAt}>{dateTime.format(new Date(item.createdAt))}</time>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "settings" && (
          <section aria-label="Booking rules" className="max-w-2xl border border-border bg-surface p-5">
            <h2 className="font-[family-name:var(--font-serif)] text-xl">Booking rules</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-neutral-500">
                Pending reservation hold (minutes)
                <input type="number" min="5" max="1440" value={settings.pendingHoldMinutes} onChange={(e) => setSettings({ ...settings, pendingHoldMinutes: Number(e.target.value) })} className="form-control mt-1 w-full" />
              </label>
              <label className="text-sm text-neutral-500">
                Book ahead (days)
                <input type="number" min="1" max="365" value={settings.maxAdvanceBookingDays} onChange={(e) => setSettings({ ...settings, maxAdvanceBookingDays: Number(e.target.value) })} className="form-control mt-1 w-full" />
              </label>
              <label className="text-sm text-neutral-500">
                Slot interval
                <select value={settings.slotIntervalMinutes} onChange={(e) => setSettings({ ...settings, slotIntervalMinutes: Number(e.target.value) })} className="form-control mt-1 w-full">
                  {[5, 10, 15, 20, 30, 60].map((value) => <option key={value} value={value}>{value} minutes</option>)}
                </select>
              </label>
              <label className="text-sm text-neutral-500">
                Buffer between appointments (minutes)
                <input type="number" min="0" max="120" value={settings.bufferMinutes} onChange={(e) => setSettings({ ...settings, bufferMinutes: Number(e.target.value) })} className="form-control mt-1 w-full" />
              </label>
            </div>
            <button type="button" onClick={() => void saveSettings()} className="btn-primary mt-5 text-xs">Save booking rules</button>
            <p className="mt-3 text-xs leading-5 text-neutral-500">
              A pending request holds its slot only until the hold expires. The buffer is added after every appointment so back-to-back bookings are not accepted. The salon time zone is Asia/Kolkata.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
