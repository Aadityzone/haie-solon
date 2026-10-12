"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import BookingWizard from "@/components/booking/BookingWizard";

interface BookingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedServiceIds?: string[];
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * The booking wizard as a focused overlay, so a service card can start a real
 * booking without navigating away from the menu.
 *
 * It wraps the same `BookingWizard` the `/book` page renders — one flow, one set
 * of server calls, one place where booking rules live. The shell owns the modal
 * concerns: body scroll lock, initial focus, Escape to close, and a focus trap
 * that keeps Tab inside the dialog.
 */
export default function BookingDialog({ isOpen, onClose, preselectedServiceIds = [] }: BookingDialogProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      surfaceRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !surfaceRef.current) return;
      const items = Array.from(surfaceRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
            className="fixed inset-0 bg-charcoal/85 backdrop-blur-sm"
          />

          <motion.div
            ref={surfaceRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-dialog-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden border border-border bg-background shadow-2xl sm:max-h-[90vh] sm:rounded-sm"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-elevated px-4 py-3.5 sm:px-6">
              <div className="min-w-0">
                <span className="eyebrow">Online reservation</span>
                <h2 id="booking-dialog-title" className="mt-1 truncate text-lg sm:text-xl">
                  Book an appointment
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close the booking form"
                className="flex h-11 w-11 shrink-0 items-center justify-center border border-border text-neutral-500 transition-colors hover:border-champagne hover:text-foreground"
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-4 sm:px-6">
              <BookingWizard variant="dialog" preselectedServiceIds={preselectedServiceIds} onExit={onClose} />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
