"use client";

import { useMemo, useRef, useState } from "react";
import type { BookingRules } from "@/lib/types";
import { formatSalonDate } from "@/lib/money";
import { addDays, daysBetween, firstOfMonth, salonDayOfWeek, shiftMonth } from "@/lib/salon-dates";

interface DatePickerProps {
  rules: BookingRules;
  selectedDate: string;
  onSelect: (date: string) => void;
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

interface DayState {
  selectable: boolean;
  /** Why the day cannot be chosen, phrased for a customer. */
  reason: string | null;
}

/**
 * Month-grid date picker for the salon's own bookable window.
 *
 * The picker never decides on its own that a day is bookable: it renders the
 * window, closed weekdays, and blocked periods the server returned, and states
 * the reason for every day it disables. A tap target is a full 44px, and the
 * chosen day carries both a visual state and `aria-current`.
 */
export default function DatePicker({ rules, selectedDate, onSelect }: DatePickerProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const closedDates = useMemo(() => new Set(rules.closedDates), [rules.closedDates]);
  const blockedDates = useMemo(() => new Set(rules.blockedDates), [rules.blockedDates]);

  const resolve = useMemo(() => {
    return (date: string): DayState => {
      if (date < rules.windowStart) return { selectable: false, reason: "This date has passed." };
      if (date < rules.minSelectableDate) {
        return {
          selectable: false,
          reason:
            rules.minSelectableDate === addDays(rules.windowStart, 1)
              ? "Today has no time left for these services. Please choose tomorrow or later."
              : "This date is too soon to book online.",
        };
      }
      if (date > rules.windowEnd) {
        return { selectable: false, reason: `Appointments can be requested up to ${rules.maxAdvanceDays} days ahead.` };
      }
      if (closedDates.has(date)) {
        return { selectable: false, reason: "The salon is closed on this weekday." };
      }
      if (blockedDates.has(date)) {
        return { selectable: false, reason: "The salon is unavailable on this date." };
      }
      return { selectable: true, reason: null };
    };
  }, [rules.windowStart, rules.minSelectableDate, rules.windowEnd, rules.maxAdvanceDays, closedDates, blockedDates]);

  // Open on the month holding the earliest selectable day, or the chosen day.
  const [visibleMonth, setVisibleMonth] = useState(() => firstOfMonth(selectedDate || rules.minSelectableDate));
  // The roving tab stop: where the grid's single Tab entry point currently is.
  const [focusDate, setFocusDate] = useState(() => selectedDate || rules.minSelectableDate);

  const earliestMonth = firstOfMonth(rules.windowStart < rules.minSelectableDate ? rules.minSelectableDate : rules.windowStart);
  const latestMonth = firstOfMonth(rules.windowEnd);
  const canGoBack = visibleMonth > earliestMonth;
  const canGoForward = visibleMonth < latestMonth;

  const grid = useMemo(() => {
    const monthStart = visibleMonth;
    const [year, month] = monthStart.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    // The grid is Monday-first, which is how an Indian salon week reads.
    const leadingBlank = (salonDayOfWeek(monthStart) + 6) % 7;
    const cells: (string | null)[] = Array.from({ length: leadingBlank }, () => null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(`${monthStart.slice(0, 7)}-${String(day).padStart(2, "0")}`);
    }
    return cells;
  }, [visibleMonth]);

  const openDayCount = useMemo(() => {
    let count = 0;
    const span = daysBetween(rules.windowStart, rules.windowEnd);
    for (let offset = 0; offset <= span; offset++) {
      const date = addDays(rules.windowStart, offset);
      if (resolve(date).selectable) count++;
    }
    return count;
  }, [rules.windowStart, rules.windowEnd, resolve]);

  const shiftVisibleMonth = (delta: number) => {
    setVisibleMonth(`${shiftMonth(visibleMonth.slice(0, 7), delta)}-01`);
  };

  /**
   * Moves the roving focus by whole days or weeks, following the month if the
   * target falls outside the one on screen. Focus lands on the day button so the
   * next Tab press continues from where the customer is.
   */
  const moveFocus = (fromDate: string, deltaDays: number) => {
    const target = addDays(fromDate, deltaDays);
    if (target < rules.windowStart || target > rules.windowEnd) return;
    setFocusDate(target);
    if (firstOfMonth(target) !== visibleMonth) setVisibleMonth(firstOfMonth(target));
    window.requestAnimationFrame(() => {
      const button = gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${target}"]`);
      button?.focus();
    });
  };

  const onDayKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, date: string) => {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        return moveFocus(date, -1);
      case "ArrowRight":
        event.preventDefault();
        return moveFocus(date, 1);
      case "ArrowUp":
        event.preventDefault();
        return moveFocus(date, -7);
      case "ArrowDown":
        event.preventDefault();
        return moveFocus(date, 7);
      case "Home": {
        event.preventDefault();
        const weekday = (salonDayOfWeek(date) + 6) % 7;
        return moveFocus(date, -weekday);
      }
      case "End": {
        event.preventDefault();
        const weekday = (salonDayOfWeek(date) + 6) % 7;
        return moveFocus(date, 6 - weekday);
      }
      case "PageUp":
        event.preventDefault();
        shiftVisibleMonth(-1);
        return;
      case "PageDown":
        event.preventDefault();
        shiftVisibleMonth(1);
        return;
      default:
        return;
    }
  };

  const monthName = MONTH_LABELS[Number(visibleMonth.slice(5, 7)) - 1];
  const monthYear = visibleMonth.slice(0, 4);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shiftVisibleMonth(-1)}
          disabled={!canGoBack}
          aria-label="Show the previous month"
          className="flex h-11 w-11 items-center justify-center border border-border text-foreground transition-colors hover:border-champagne disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border"
        >
          <span aria-hidden="true">←</span>
        </button>
        <p aria-live="polite" className="min-w-0 text-center text-sm font-medium text-foreground">
          {monthName} {monthYear}
        </p>
        <button
          type="button"
          onClick={() => shiftVisibleMonth(1)}
          disabled={!canGoForward}
          aria-label="Show the next month"
          className="flex h-11 w-11 items-center justify-center border border-border text-foreground transition-colors hover:border-champagne disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border"
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>

      {/*
        A real ARIA grid: one tab stop for the whole calendar, with arrow keys
        moving between days, so a keyboard or screen-reader customer reaches any
        date without tabbing through thirty buttons.
      */}
      <div
        ref={gridRef}
        role="grid"
        aria-label={`Choose an appointment date. ${openDayCount} of the next ${rules.maxAdvanceDays + 1} days are available to request.`}
        className="mt-3 w-full"
      >
        <div role="row" className="grid grid-cols-7">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              role="columnheader"
              aria-label={label}
              className="pb-2 text-center text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-neutral-500"
            >
              <span aria-hidden="true">{label.slice(0, 1)}</span>
            </div>
          ))}
        </div>
        {Array.from({ length: Math.ceil(grid.length / 7) }, (_, week) => (
          <div role="row" key={week} className="grid grid-cols-7">
            {grid.slice(week * 7, week * 7 + 7).map((date, index) => {
              if (!date) return <div role="gridcell" key={`blank-${week}-${index}`} className="p-0.5" />;
              const state = resolve(date);
              const isSelected = selectedDate === date;
              const isToday = date === rules.windowStart;
              const dayNumber = Number(date.slice(8, 10));
              return (
                <div role="gridcell" key={date} className="p-0.5">
                  <button
                    type="button"
                    data-date={date}
                    tabIndex={date === (selectedDate || focusDate) ? 0 : -1}
                    onClick={() => onSelect(date)}
                    onKeyDown={(event) => onDayKeyDown(event, date)}
                    disabled={!state.selectable}
                    aria-current={isSelected ? "date" : undefined}
                    aria-label={`${formatSalonDate(date)}${state.selectable ? "" : ` — unavailable: ${state.reason}`}`}
                    title={state.reason ?? undefined}
                    className={`flex h-11 w-full flex-col items-center justify-center border text-sm tabular-nums transition-colors ${
                      isSelected
                        ? "border-champagne bg-champagne font-semibold text-charcoal"
                        : state.selectable
                        ? `border-border bg-elevated text-foreground hover:border-champagne ${isToday ? "ring-1 ring-inset ring-champagne/50" : ""}`
                        : "cursor-not-allowed border-transparent bg-neutral-100 text-neutral-400/70"
                    }`}
                  >
                    {dayNumber}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] text-neutral-500">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-3 border border-champagne bg-champagne" /> Selected
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-3 border border-border bg-elevated" /> Available
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-3 bg-neutral-100" /> Closed or unavailable
        </li>
      </ul>
    </div>
  );
}
