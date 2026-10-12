"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Appointment, BookingRules, ServiceItem, SlotAvailability } from "@/lib/types";
import { formatClockTime, formatDuration, formatRupees, formatSalonDate, formatSalonInstant, formatTotal } from "@/lib/money";
import { addDays } from "@/lib/salon-dates";
import ServicePicker from "./ServicePicker";
import DatePicker from "./DatePicker";
import SlotPicker from "./SlotPicker";

export type BookingStep = "services" | "date" | "time" | "details" | "review" | "done";

const STEP_ORDER: BookingStep[] = ["services", "date", "time", "details", "review"];
const STEP_LABELS: Record<Exclude<BookingStep, "done">, string> = {
  services: "Services",
  date: "Date",
  time: "Time",
  details: "Details",
  review: "Review",
};

interface BookingWizardProps {
  /** Deep link support: a service chosen on the menu before booking opened. */
  preselectedServiceIds?: string[];
  /**
   * `page` renders inside the booking route's own layout. `dialog` keeps the
   * same steps inside a modal shell that the caller pins to the viewport.
   */
  variant?: "page" | "dialog";
  onExit?: () => void;
}

type FieldErrors = { customerName?: string; customerPhone?: string };

const PHONE_ERROR = "Enter a 10-digit Indian mobile number, for example 62808 66359.";

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+/, "");
}

/** Indian mobile numbers are 10 digits beginning 6-9 after any +91 prefix. */
function normalizePhoneInput(value: string): string {
  let digits = digitsOnly(value);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  return digits.slice(0, 10);
}

function isValidPhone(digits: string): boolean {
  return /^[6-9]\d{9}$/.test(digits);
}

export default function BookingWizard({
  preselectedServiceIds = [],
  variant = "page",
  onExit,
}: BookingWizardProps) {
  const [step, setStep] = useState<BookingStep>("services");

  // Catalogue and booking rules both come from the server. Nothing about the
  // window, the slot length, or a price is decided here.
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [rules, setRules] = useState<BookingRules | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configAttempt, setConfigAttempt] = useState(0);

  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [slotsSalonOpen, setSlotsSalonOpen] = useState(true);
  const [slotsClosedReason, setSlotsClosedReason] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [slotAttempt, setSlotAttempt] = useState(0);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [slotConflict, setSlotConflict] = useState(false);
  const [created, setCreated] = useState<Appointment | null>(null);
  const [copied, setCopied] = useState(false);

  const stepPanelRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  // Remembers the exact payload already accepted by the server, so a stray
  // second tap or a repeated Enter press cannot create a second appointment.
  const submittedSignature = useRef<string | null>(null);

  const selectedServices = useMemo(
    () => services.filter((service) => selectedServiceIds.includes(service.id)),
    [services, selectedServiceIds]
  );
  const totalDuration = useMemo(
    () => selectedServices.reduce((sum, service) => sum + service.durationMinutes, 0),
    [selectedServices]
  );
  const price = useMemo(() => formatTotal(selectedServices), [selectedServices]);
  const multiServiceAllowed = rules?.allowMultiService !== false;

  const isDaySelectable = useCallback(
    (date: string) => {
      if (!rules) return false;
      if (date < rules.minSelectableDate || date > rules.windowEnd) return false;
      if (rules.closedDates.includes(date)) return false;
      if (rules.blockedDates.includes(date)) return false;
      return true;
    },
    [rules]
  );

  // --- Loading the menu and the bookable window ------------------------------
  // The key keeps the request stable: a caller may pass a fresh array on every
  // render, which must not re-trigger the load.
  const preselectionKey = useMemo(() => [...preselectedServiceIds].sort().join(","), [preselectedServiceIds]);
  const configKey = `${configAttempt}|${preselectionKey}`;
  const servedConfigKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      if (servedConfigKey.current !== configKey) {
        setLoadingConfig(true);
        setConfigError(null);
      }
      try {
        const response = await fetch("/api/booking/config");
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Could not load booking details.");
        if (cancelled) return;
        const loaded = data as { services: ServiceItem[]; rules: BookingRules };
        // Catalogue edits made while the page was open must not resurrect a
        // service the salon has since disabled.
        const liveIds = new Set(loaded.services.map((service) => service.id));
        const preselected = preselectionKey ? preselectionKey.split(",") : [];
        setServices(loaded.services);
        setRules(loaded.rules);
        setSelectedServiceIds((previous) => {
          const honoured = previous.filter((id) => liveIds.has(id));
          if (honoured.length > 0) return honoured;
          return preselected.filter((id) => liveIds.has(id));
        });
      } catch (error: unknown) {
        if (cancelled) return;
        setConfigError(
          error instanceof Error && error.message
            ? error.message
            : "We could not load the booking menu. Check your connection and try again."
        );
      } finally {
        if (!cancelled) {
          servedConfigKey.current = configKey;
          setLoadingConfig(false);
        }
      }
    };

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, [configKey, preselectionKey]);

  // Once services are chosen, the window can tighten (today may no longer fit),
  // so the rules are re-read with the combined duration the server derives from
  // the selected ids — the frontend never sends a duration of its own choosing.
  const selectionKey = [...selectedServiceIds].sort().join(",");
  useEffect(() => {
    if (loadingConfig || totalDuration === 0) return;
    let cancelled = false;
    const tightenWindow = async () => {
      try {
        const response = await fetch(`/api/booking/config?services=${encodeURIComponent(selectionKey)}`);
        const data = await response.json();
        if (cancelled || !data.success) return;
        const nextRules = data.rules as BookingRules;
        setRules(nextRules);
        // A date that no longer fits, or is now outside the window, is cleared
        // rather than submitted. The selections themselves are never dropped.
        setSelectedDate((current) => {
          if (!current) return current;
          const stillValid =
            current >= nextRules.minSelectableDate &&
            current <= nextRules.windowEnd &&
            !nextRules.closedDates.includes(current) &&
            !nextRules.blockedDates.includes(current);
          return stillValid ? current : "";
        });
      } catch {
        /* The original rules stay; the server still re-checks on submit. */
      }
    };
    void tightenWindow();
    return () => {
      cancelled = true;
    };
  }, [totalDuration, loadingConfig, selectionKey]);

  // --- Slots for the chosen date --------------------------------------------
  const slotRequestKey = `${slotAttempt}|${selectedDate}|${totalDuration}`;
  const servedSlotKey = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedDate || totalDuration <= 0) return;
    let cancelled = false;

    const loadSlots = async () => {
      if (servedSlotKey.current !== slotRequestKey) {
        setLoadingSlots(true);
        setSlotError(null);
      }
      try {
        const response = await fetch(`/api/booking/slots?date=${selectedDate}&duration=${totalDuration}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Could not check availability.");
        if (cancelled) return;
        const loaded = data as { slots: SlotAvailability[]; salonOpen: boolean; reason?: string };
        setSlotsSalonOpen(loaded.salonOpen);
        setSlotsClosedReason(loaded.reason ?? null);
        setSlots(loaded.slots ?? []);
        // A previously chosen time is dropped only if it is no longer offered.
        setSelectedTime((current) =>
          current && loaded.slots?.some((slot) => slot.time === current && slot.available) ? current : ""
        );
      } catch (error: unknown) {
        if (cancelled) return;
        setSlots([]);
        setSlotsSalonOpen(true);
        setSlotError(
          error instanceof Error && error.message
            ? error.message
            : "We could not check availability for that date. Please try again."
        );
      } finally {
        if (!cancelled) {
          servedSlotKey.current = slotRequestKey;
          setLoadingSlots(false);
        }
      }
    };

    void loadSlots();
    return () => {
      cancelled = true;
    };
  }, [slotRequestKey, selectedDate, totalDuration]);

  const alternativeDates = useMemo(() => {
    if (!rules) return [];
    const anchor = selectedDate || rules.minSelectableDate;
    const list: string[] = [];
    for (let offset = -1; list.length < 12 && offset < 45; offset++) {
      const candidate = addDays(anchor, offset);
      if (candidate < rules.windowStart || candidate > rules.windowEnd) continue;
      list.push(candidate);
    }
    return list;
  }, [rules, selectedDate]);

  const toggleService = (id: string) => {
    setSelectedServiceIds((previous) => {
      if (previous.includes(id)) return previous.filter((value) => value !== id);
      if (!multiServiceAllowed) return [id];
      return [...previous, id];
    });
    setSubmitError(null);
    setSlotConflict(false);
  };

  const goToStep = useCallback((next: BookingStep) => {
    setStep(next);
    window.requestAnimationFrame(() => {
      const panel = stepPanelRef.current;
      if (!panel) return;
      // Move focus to the new panel so a screen reader announces the step. The
      // scroll is handled explicitly below rather than by focus.
      panel.focus({ preventScroll: true });
      // A step is taller than a phone screen, so focusing it is not enough: the
      // browser leaves the page where it was and the customer arrives looking at
      // the middle of the form. Reset the panel's own scroll for the dialog
      // variant, and bring the step's top into view on the page variant, where
      // `scroll-mt-24` keeps it clear of the fixed header.
      panel.scrollTop = 0;
      if (variant !== "dialog") panel.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }, [variant]);

  const validateDetails = (): FieldErrors => {
    const errors: FieldErrors = {};
    const name = customerName.trim();
    if (!name) errors.customerName = "Enter your name so the salon knows who is coming.";
    else if (name.length < 2) errors.customerName = "Your name needs at least 2 characters.";
    if (!customerPhone.trim()) errors.customerPhone = PHONE_ERROR;
    else if (!isValidPhone(customerPhone)) errors.customerPhone = PHONE_ERROR;
    return errors;
  };

  const handleContinue = () => {
    if (step === "services") return goToStep("date");
    if (step === "date") return goToStep("time");
    if (step === "time") return goToStep("details");
    if (step === "details") {
      const errors = validateDetails();
      setFieldErrors(errors);
      if (errors.customerName) {
        nameInputRef.current?.focus();
        return;
      }
      if (errors.customerPhone) {
        phoneInputRef.current?.focus();
        return;
      }
      return goToStep("review");
    }
    if (step === "review") return void submitBooking();
  };

  const handleBack = () => {
    if (step === "date") return goToStep("services");
    if (step === "time") return goToStep("date");
    if (step === "details") return goToStep("time");
    if (step === "review") return goToStep("details");
  };

  const canContinue = (() => {
    if (loadingConfig) return false;
    if (step === "services") return selectedServiceIds.length > 0;
    if (step === "date") return Boolean(selectedDate);
    if (step === "time") return Boolean(selectedTime);
    if (step === "details") return true;
    if (step === "review") return !isSubmitting;
    return false;
  })();

  const submitBooking = async () => {
    if (isSubmitting || !selectedDate || !selectedTime) return;

    const signature = JSON.stringify({
      serviceIds: [...selectedServiceIds].sort(),
      date: selectedDate,
      time: selectedTime,
      customerName: customerName.trim(),
      customerPhone: customerPhone,
    });

    // The server is the authority on whether this slot can be taken. If it has
    // already accepted this exact request, re-sending it would create a second
    // appointment for the same customer, so the original confirmation stands.
    if (submittedSignature.current === signature && created) {
      setSubmitError("This request has already been received. Your reference is " + created.referenceCode + ".");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSlotConflict(false);

    try {
      const response = await fetch("/api/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceIds: selectedServiceIds,
          date: selectedDate,
          time: selectedTime,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerNotes: customerNotes.trim() || undefined,
          whatsappOptIn,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.code === "SLOT_CONFLICT") {
          setSlotConflict(true);
          setSubmitError(
            data.error ||
              "That time was just taken. Choose another time — everything you entered is kept."
          );
          return;
        }
        if (data.code === "VALIDATION_ERROR" && typeof data.error === "string" && /mobile|phone/i.test(data.error)) {
          setFieldErrors({ customerPhone: data.error });
        }
        setSubmitError(data.error || "We could not send your request. Check your details and try again.");
        return;
      }

      submittedSignature.current = signature;
      setCreated({
        id: "",
        referenceCode: data.referenceCode,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerNotes: customerNotes.trim() || null,
        startTime: data.appointment.startTime,
        endTime: data.appointment.endTime,
        durationMinutes: data.appointment.durationMinutes,
        totalPriceRupees: data.appointment.totalPriceRupees,
        status: data.appointment.status,
        holdExpiresAt: data.appointment.holdExpiresAt,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        services: selectedServices.map((service, index) => ({
          id: String(index),
          appointmentId: "",
          serviceId: service.id,
          serviceName: service.name,
          priceRupees: service.priceRupees,
          durationMinutes: service.durationMinutes,
        })),
      });
      goToStep("done");
    } catch {
      setSubmitError(
        "We could not reach the salon. Check your connection and try again — everything you entered is kept."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const restart = () => {
    setCreated(null);
    setSelectedServiceIds([]);
    setSelectedDate("");
    setSelectedTime("");
    setSlots([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerNotes("");
    setWhatsappOptIn(false);
    setFieldErrors({});
    setSubmitError(null);
    setSlotConflict(false);
    setCopied(false);
    submittedSignature.current = null;
    goToStep("services");
  };

  // --- Loading and failure states for the whole flow -------------------------
  if (loadingConfig) {
    return (
      <div className="flex flex-col items-center gap-4 py-20" role="status" aria-live="polite">
        <span aria-hidden="true" className="h-7 w-7 animate-spin rounded-full border-2 border-champagne border-t-transparent" />
        <p className="text-sm text-neutral-500">Loading the salon services and availability…</p>
      </div>
    );
  }

  if (configError || !rules) {
    return (
      <div role="alert" className="surface-panel mx-auto max-w-lg p-6 text-center">
        <h3 className="text-xl text-foreground">We could not open the booking form</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-500">{configError}</p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" className="btn-primary text-xs" onClick={() => setConfigAttempt((value) => value + 1)}>
            Try again
          </button>
          <Link href="/book/status" className="btn-secondary text-xs">Check an existing request</Link>
        </div>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="surface-panel mx-auto max-w-lg p-6 text-center">
        <h3 className="text-xl text-foreground">Online booking is not open yet</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          The salon has not published any services for online requests. Please contact the salon directly and they will
          help you book.
        </p>
        <Link href="/#contact" className="btn-secondary mt-5 text-xs">Contact the salon</Link>
      </div>
    );
  }

  // --- Confirmation ----------------------------------------------------------
  if (step === "done" && created) {
    const reference = created.referenceCode;
    return (
      <div ref={stepPanelRef} tabIndex={-1} className="mx-auto max-w-2xl scroll-mt-24 outline-none">
        <div className="surface-panel p-5 sm:p-7">
          <p className="eyebrow">Request received</p>
          <h3 className="mt-3 text-2xl sm:text-3xl">Your appointment is pending approval</h3>
          <p className="mt-3 text-sm leading-6 text-neutral-500">
            Nothing is confirmed yet. The salon reviews every request and will confirm or decline it. Your slot is held
            only until <strong className="text-foreground">{formatSalonInstant(created.holdExpiresAt)}</strong>.
          </p>

          <div className="mt-5 border border-champagne/50 bg-champagne-muted p-4">
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-champagne">Booking reference</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p data-testid="booking-reference" className="font-mono text-xl font-semibold tracking-wider text-foreground sm:text-2xl">
                {reference}
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(reference);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
                className="btn-secondary text-[0.68rem]"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-[0.7rem] leading-5 text-neutral-500">
              Keep this reference. You need it <em>and</em> the mobile number you booked with to check your status.
            </p>
          </div>

          <dl className="mt-5 divide-y divide-border border-y border-border text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <dt className="text-neutral-500">Status</dt>
              <dd>
                <span className="border border-champagne/60 bg-champagne-muted px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-champagne">
                  Pending approval
                </span>
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <dt className="text-neutral-500">Date</dt>
              <dd className="text-foreground">{formatSalonDate(selectedDate)}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <dt className="text-neutral-500">Time</dt>
              <dd className="text-foreground tabular-nums">
                {formatClockTime(selectedTime)} <span className="text-neutral-500">IST</span>
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <dt className="text-neutral-500">Estimated length</dt>
              <dd className="text-foreground tabular-nums">{formatDuration(created.durationMinutes)}</dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <dt className="text-neutral-500">Total</dt>
              <dd className="text-foreground tabular-nums">
                {created.totalPriceRupees === null ? "Confirmed by the salon" : formatRupees(created.totalPriceRupees)}
              </dd>
            </div>
          </dl>

          <div className="mt-5">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-champagne">Services requested</h4>
            <ul className="mt-2 divide-y divide-border border-y border-border">
              {(created.services ?? []).map((service) => (
                <li key={`${service.serviceId}-${service.id}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0 text-foreground">{service.serviceName}</span>
                  <span className="shrink-0 text-neutral-500 tabular-nums">
                    {formatDuration(service.durationMinutes)} · {service.priceRupees === null ? "on request" : formatRupees(service.priceRupees)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 border-t border-border pt-5">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-champagne">What happens next</h4>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-neutral-500">
              <li>1. The salon reviews your request and confirms or declines it.</li>
              <li>2. Check the status any time with your reference and mobile number.</li>
              <li>3. If it is confirmed, arrive a few minutes early. If it is declined, the salon will suggest another time.</li>
            </ol>
            {whatsappOptIn && (
              <p className="mt-3 text-[0.7rem] leading-5 text-neutral-500">
                You asked for WhatsApp updates. Messages are only sent when the salon has its WhatsApp service
                configured and its templates approved, so treat this page as your source of truth.
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link href={`/book/status?ref=${encodeURIComponent(reference)}`} className="btn-primary text-xs">
              Check this request
            </Link>
            <button type="button" onClick={restart} className="btn-secondary text-xs">Book another appointment</button>
            {onExit && (
              <button type="button" onClick={onExit} className="btn-secondary text-xs sm:ml-auto">Close</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const isDialog = variant === "dialog";
  const stepLabel = (value: (typeof STEP_ORDER)[number]) => STEP_LABELS[value as Exclude<BookingStep, "done">];

  // --- Steps -----------------------------------------------------------------
  return (
    <div className={isDialog ? "flex min-h-0 flex-1 flex-col" : "pb-2"}>
      <ol
        aria-label="Booking progress"
        className={`z-20 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-background/95 px-1 py-2.5 backdrop-blur-sm sm:px-0 ${
          isDialog ? "shrink-0" : "sticky top-0"
        }`}
      >
        {STEP_ORDER.map((value, index) => {
          const isCurrent = step === value;
          const isDone = index < stepIndex;
          return (
            <li key={value} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true" className="text-neutral-300">/</span>}
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={`text-[0.68rem] font-medium sm:text-xs ${
                  isCurrent ? "text-champagne" : isDone ? "text-neutral-600" : "text-neutral-400"
                }`}
              >
                <span aria-hidden="true">{index + 1}. </span>
                {stepLabel(value)}
                {isDone && <span aria-hidden="true" className="ml-1 text-champagne">✓</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div
        ref={stepPanelRef}
        tabIndex={-1}
        className={`scroll-mt-24 outline-none ${isDialog ? "flex-1 overflow-y-auto px-1 py-5 sm:px-0" : "pt-6"}`}
      >
        {step === "services" && (
          <ServicePicker services={services} selectedIds={selectedServiceIds} onToggle={toggleService} />
        )}

        {step === "date" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl sm:text-2xl">Choose a date</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                You can request any open day within the next {rules.maxAdvanceDays} days. Days the salon is closed or
                already booked out are shown greyed out with the reason.
              </p>
            </div>
            <DatePicker rules={rules} selectedDate={selectedDate} onSelect={setSelectedDate} />
            {selectedDate && (
              <p className="text-sm text-foreground">
                Selected: <strong>{formatSalonDate(selectedDate)}</strong>
              </p>
            )}
          </div>
        )}

        {step === "time" && (
          <SlotPicker
            date={selectedDate}
            slots={slots}
            selectedTime={selectedTime}
            onSelect={setSelectedTime}
            loading={loadingSlots}
            error={slotError}
            salonOpen={slotsSalonOpen}
            closedReason={slotsClosedReason}
            onRetry={() => setSlotAttempt((value) => value + 1)}
            onChangeDate={() => goToStep("date")}
            alternativeDates={alternativeDates}
            onSelectDate={(date) => setSelectedDate(date)}
            minSelectableDate={rules.minSelectableDate}
            maxSelectableDate={rules.windowEnd}
            isDaySelectable={isDaySelectable}
          />
        )}

        {step === "details" && (
          <form
            className="space-y-5"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              handleContinue();
            }}
          >
            <div>
              <h3 className="text-xl sm:text-2xl">Your details</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                The salon uses these only to confirm and coordinate this appointment.
              </p>
            </div>

            <div>
              <label htmlFor="booking-name" className="block text-xs font-medium text-neutral-700">
                Full name <span aria-hidden="true" className="text-champagne">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="booking-name"
                name="name"
                type="text"
                autoComplete="name"
                autoCapitalize="words"
                enterKeyHint="next"
                required
                value={customerName}
                aria-invalid={fieldErrors.customerName ? true : undefined}
                aria-describedby={fieldErrors.customerName ? "booking-name-error" : undefined}
                onChange={(event) => {
                  setCustomerName(event.target.value);
                  if (fieldErrors.customerName) setFieldErrors((old) => ({ ...old, customerName: undefined }));
                }}
                placeholder="For example, Gurpreet Singh"
                className={`form-control mt-1.5 ${fieldErrors.customerName ? "border-red-700" : ""}`}
              />
              {fieldErrors.customerName && (
                <p id="booking-name-error" role="alert" className="mt-1.5 text-xs text-red-300">
                  {fieldErrors.customerName}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="booking-phone" className="block text-xs font-medium text-neutral-700">
                Mobile number <span aria-hidden="true" className="text-champagne">*</span>
              </label>
              <div className="mt-1.5 flex">
                <span
                  aria-hidden="true"
                  className={`inline-flex items-center border border-r-0 bg-neutral-100 px-3 text-sm text-neutral-600 ${
                    fieldErrors.customerPhone ? "border-red-700" : "border-neutral-300"
                  }`}
                >
                  +91
                </span>
                <input
                  ref={phoneInputRef}
                  id="booking-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel-national"
                  inputMode="numeric"
                  enterKeyHint="done"
                  required
                  value={customerPhone}
                  aria-invalid={fieldErrors.customerPhone ? true : undefined}
                  aria-describedby={fieldErrors.customerPhone ? "booking-phone-error" : "booking-phone-hint"}
                  onChange={(event) => {
                    setCustomerPhone(normalizePhoneInput(event.target.value));
                    if (fieldErrors.customerPhone) setFieldErrors((old) => ({ ...old, customerPhone: undefined }));
                  }}
                  placeholder="62808 66359"
                  className={`form-control mt-0 ${fieldErrors.customerPhone ? "border-red-700" : ""}`}
                />
              </div>
              {fieldErrors.customerPhone ? (
                <p id="booking-phone-error" role="alert" className="mt-1.5 text-xs text-red-300">
                  {fieldErrors.customerPhone}
                </p>
              ) : (
                <p id="booking-phone-hint" className="mt-1.5 text-[0.7rem] text-neutral-500">
                  10 digits. The salon calls or messages this number to confirm.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="booking-notes" className="block text-xs font-medium text-neutral-700">
                Anything the salon should know? <span className="text-neutral-500">(optional)</span>
              </label>
              <textarea
                id="booking-notes"
                name="notes"
                rows={3}
                maxLength={1000}
                value={customerNotes}
                onChange={(event) => setCustomerNotes(event.target.value)}
                placeholder="For example, first time colouring, or please allow a little extra time."
                className="form-control mt-1.5"
              />
              <p className="mt-1.5 text-[0.7rem] text-neutral-500">
                Do not include medical or payment details. {1000 - customerNotes.length} characters left.
              </p>
            </div>

            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-xs leading-relaxed text-neutral-600">
              <input
                type="checkbox"
                checked={whatsappOptIn}
                onChange={(event) => setWhatsappOptIn(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0"
              />
              <span>I agree to receive WhatsApp messages about this request and its status.</span>
            </label>
          </form>
        )}

        {step === "review" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl sm:text-2xl">Check and confirm</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-500">
                The salon re-checks this slot when your request arrives. If it has just been taken you will be asked to
                pick another time.
              </p>
            </div>

            {submitError && (
              <div role="alert" className="border border-red-900 bg-red-950/40 p-3 text-xs text-red-200">
                {submitError}
                {slotConflict && (
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitError(null);
                      setSelectedTime("");
                      goToStep("time");
                    }}
                    className="mt-2 block font-semibold underline underline-offset-4"
                  >
                    Choose another time
                  </button>
                )}
              </div>
            )}

            <dl className="divide-y divide-border border-y border-border text-sm">
              <ReviewRow label="Services" onEdit={() => goToStep("services")} editLabel="Change services">
                <ul className="space-y-1">
                  {selectedServices.map((service) => (
                    <li key={service.id} className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="min-w-0">{service.name}</span>
                      <span className="shrink-0 text-neutral-500 tabular-nums">
                        {formatDuration(service.durationMinutes)} ·{" "}
                        {service.priceRupees === null ? "on request" : formatRupees(service.priceRupees)}
                      </span>
                    </li>
                  ))}
                </ul>
              </ReviewRow>
              <ReviewRow label="Date" onEdit={() => goToStep("date")} editLabel="Change date">
                {formatSalonDate(selectedDate)}
              </ReviewRow>
              <ReviewRow label="Time" onEdit={() => goToStep("time")} editLabel="Change time">
                {formatClockTime(selectedTime)} <span className="text-neutral-500">IST</span>
              </ReviewRow>
              <ReviewRow label="Length" onEdit={() => goToStep("services")} editLabel="Change services">
                {formatDuration(totalDuration)}
              </ReviewRow>
              <ReviewRow label="Name" onEdit={() => goToStep("details")} editLabel="Change name">
                {customerName.trim()}
              </ReviewRow>
              <ReviewRow label="Mobile" onEdit={() => goToStep("details")} editLabel="Change mobile number">
                +91 {customerPhone}
              </ReviewRow>
              {customerNotes.trim() && (
                <ReviewRow label="Notes" onEdit={() => goToStep("details")} editLabel="Change notes">
                  {customerNotes.trim()}
                </ReviewRow>
              )}
              <div className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                <dt className="font-medium text-foreground">Total</dt>
                <dd className="text-lg text-foreground tabular-nums">{price.text}</dd>
              </div>
            </dl>

            {price.total === null && (
              <p className="text-[0.7rem] leading-5 text-neutral-500">
                One or more selected services has no published price, so no total is shown. The salon confirms the
                price before your appointment.
              </p>
            )}

            <p className="border-l-2 border-champagne bg-champagne-muted px-3 py-2 text-xs leading-5 text-neutral-600">
              Submitting places a short hold on this slot while the salon reviews it. Your request stays{" "}
              <strong className="text-foreground">pending approval</strong> until the salon confirms it.
            </p>
          </div>
        )}
      </div>

      {/* Action bar: the running total and the next action stay reachable without
          scrolling back up on a narrow screen. Inside the modal the shell is the
          scroll container, so the bar simply pins to its bottom. */}
      <div
        className={`z-20 border-t border-border bg-background/95 backdrop-blur-sm ${
          isDialog
            ? "shrink-0 px-1 pb-1 pt-3 sm:px-0"
            : "sticky bottom-0 mt-6 pb-3 pt-3"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-neutral-500">
          <span className="min-w-0">
            {selectedServiceIds.length === 0 ? (
              "Select at least one service"
            ) : (
              <>
                <span className="text-foreground">{selectedServiceIds.length}</span>{" "}
                {selectedServiceIds.length === 1 ? "service" : "services"} ·{" "}
                <span className="text-foreground tabular-nums">{formatDuration(totalDuration)}</span>
              </>
            )}
          </span>
          <span data-testid="booking-total" className="shrink-0 text-sm text-foreground tabular-nums">{price.text}</span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          {step !== "services" ? (
            <button type="button" onClick={handleBack} className="btn-secondary text-xs">
              Back
            </button>
          ) : (
            onExit && (
              <button type="button" onClick={onExit} className="btn-secondary text-xs">
                Close
              </button>
            )
          )}

          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinue}
            aria-busy={isSubmitting || undefined}
            className="btn-primary ml-auto text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            {step === "review"
              ? isSubmitting
                ? "Sending your request…"
                : "Confirm request"
              : step === "details"
              ? "Review request"
              : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A labelled row of the final review, each with a way back to fix it. */
function ReviewRow({
  label,
  children,
  onEdit,
  editLabel,
}: {
  label: string;
  children: React.ReactNode;
  onEdit: () => void;
  editLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-start justify-end gap-x-3 gap-y-1 text-right text-foreground">
        <div className="min-w-0">{children}</div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 shrink-0 items-center text-[0.68rem] font-medium uppercase tracking-[0.1em] text-champagne underline-offset-4 hover:underline"
        >
          {editLabel}
        </button>
      </dd>
    </div>
  );
}
