"use client";

import type { SlotAvailability } from "@/lib/types";
import { formatClockTime } from "@/lib/money";

interface SlotPickerProps {
  date: string;
  slots: SlotAvailability[];
  selectedTime: string;
  onSelect: (time: string) => void;
  loading: boolean;
  error: string | null;
  salonOpen: boolean;
  closedReason: string | null;
  onRetry: () => void;
  onChangeDate: () => void;
  /** Salon-local dates before and after the chosen one, for quick switching. */
  alternativeDates: string[];
  onSelectDate: (date: string) => void;
  minSelectableDate: string;
  maxSelectableDate: string;
  isDaySelectable: (date: string) => boolean;
}

/**
 * Step three: pick a time.
 *
 * Available and unavailable slots look and behave differently, and an
 * unavailable slot carries the salon's own reason as its accessible name rather
 * than pretending to be tappable. When nothing is left the customer is offered
 * the next few open days instead of a dead end.
 */
export default function SlotPicker({
  date,
  slots,
  selectedTime,
  onSelect,
  loading,
  error,
  salonOpen,
  closedReason,
  onRetry,
  onChangeDate,
  alternativeDates,
  onSelectDate,
  minSelectableDate,
  maxSelectableDate,
  isDaySelectable,
}: SlotPickerProps) {
  const availableCount = slots.filter((slot) => slot.available).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xl sm:text-2xl">Pick a time</h3>
        <button
          type="button"
          onClick={onChangeDate}
          className="inline-flex min-h-11 items-center text-xs font-medium text-champagne underline-offset-4 hover:underline"
        >
          Change date
        </button>
      </div>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
        {alternativeDates.map((option) => {
          const isSelected = option === date;
          const selectable = option >= minSelectableDate && option <= maxSelectableDate && isDaySelectable(option);
          const dayNumber = Number(option.slice(8, 10));
          const monthLabel = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short" }).format(
            new Date(`${option}T12:00:00+05:30`)
          );
          const weekdayLabel = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" }).format(
            new Date(`${option}T12:00:00+05:30`)
          );
          return (
            <button
              key={option}
              type="button"
              onClick={() => onSelectDate(option)}
              disabled={!selectable}
              aria-current={isSelected ? "date" : undefined}
              aria-label={new Intl.DateTimeFormat("en-IN", {
                timeZone: "Asia/Kolkata",
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(new Date(`${option}T12:00:00+05:30`))}
              className={`flex min-h-16 w-16 shrink-0 flex-col items-center justify-center border px-2 transition-colors ${
                isSelected
                  ? "border-champagne bg-champagne text-charcoal"
                  : selectable
                  ? "border-border bg-elevated text-foreground hover:border-champagne"
                  : "cursor-not-allowed border-transparent bg-neutral-100 text-neutral-400/70"
              }`}
            >
              <span className="text-[0.6rem] uppercase tracking-[0.1em]">{weekdayLabel}</span>
              <span className="text-base font-medium tabular-nums">{dayNumber}</span>
              <span className="text-[0.6rem]">{monthLabel}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-10" role="status">
          <span aria-hidden="true" className="h-6 w-6 animate-spin rounded-full border-2 border-champagne border-t-transparent" />
          <span className="text-xs text-neutral-500">Checking the salon’s availability…</span>
        </div>
      ) : error ? (
        <div role="alert" className="surface-panel p-5 text-center">
          <p className="text-sm text-neutral-600">{error}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" onClick={onRetry} className="btn-secondary text-xs">Try again</button>
            <button type="button" onClick={onChangeDate} className="btn-secondary text-xs">Choose another date</button>
          </div>
        </div>
      ) : !salonOpen ? (
        <div className="surface-panel p-6 text-center">
          <h4 className="text-lg text-foreground">The salon is not taking requests for this day</h4>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-neutral-500">
            {closedReason || "The salon is closed or unavailable on this date."}
          </p>
          <button type="button" onClick={onChangeDate} className="btn-primary mt-5 text-xs">Choose another date</button>
        </div>
      ) : availableCount === 0 ? (
        <div className="surface-panel p-6 text-center">
          <h4 className="text-lg text-foreground">No times left on this day</h4>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-neutral-500">
            Every remaining slot is too short for the services you chose, or has already been taken. Another day will
            usually have room.
          </p>
          <button type="button" onClick={onChangeDate} className="btn-primary mt-5 text-xs">Choose another date</button>
        </div>
      ) : (
        <div>
          <p className="text-xs text-neutral-500">
            {availableCount} {availableCount === 1 ? "time" : "times"} available. Times are shown in the salon’s local
            time (IST) and include the full length of your appointment.
          </p>
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {slots.map((slot) => {
              const isSelected = selectedTime === slot.time;
              return (
                <li key={slot.time}>
                  <button
                    type="button"
                    disabled={!slot.available}
                    onClick={() => onSelect(slot.time)}
                    aria-pressed={slot.available ? isSelected : undefined}
                    aria-label={
                      slot.available
                        ? formatClockTime(slot.time)
                        : `${formatClockTime(slot.time)} — unavailable: ${slot.reason ?? "not available"}`
                    }
                    title={slot.available ? undefined : slot.reason ?? undefined}
                    className={`flex min-h-12 w-full items-center justify-center border text-sm tabular-nums transition-colors ${
                      !slot.available
                        ? "cursor-not-allowed border-transparent bg-neutral-100 text-neutral-400/70 line-through"
                        : isSelected
                        ? "border-champagne bg-champagne font-semibold text-charcoal"
                        : "border-border bg-elevated text-foreground hover:border-champagne"
                    }`}
                  >
                    {slot.time}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[0.68rem] leading-5 text-neutral-500">
            Crossed-out times are already reserved or fall inside the salon’s break. The salon re-checks your slot when
            it receives your request.
          </p>
        </div>
      )}
    </div>
  );
}
