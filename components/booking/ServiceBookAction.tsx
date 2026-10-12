"use client";

import { useState } from "react";
import Link from "next/link";
import BookingDialog from "@/components/booking/BookingDialog";

const actionClass =
  "inline-flex min-h-11 items-center text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-champagne transition-colors hover:text-champagne-light focus-visible:outline-offset-4";

interface ServiceBookActionProps {
  serviceId: string;
  serviceName: string;
  /**
   * `dialog` starts the request on the page the customer is already reading.
   * `link` opens the full booking page. Both run the same wizard.
   */
  mode?: "dialog" | "link";
}

/**
 * The "book this service" control on a menu card.
 *
 * Both modes lead to the same booking wizard and the same server validation.
 * The dialog keeps the customer in the menu; the plain link is a real
 * destination, so keyboard, assistive-technology, and no-JavaScript visitors are
 * never locked out of booking.
 */
export default function ServiceBookAction({ serviceId, serviceName, mode = "dialog" }: ServiceBookActionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const href = `/book?service=${encodeURIComponent(serviceId)}`;
  const label = mode === "dialog" ? `${serviceName} — open the booking page` : `Book ${serviceName}`;

  return (
    <span className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
      {mode === "dialog" && (
        <button type="button" onClick={() => setIsOpen(true)} className={actionClass}>
          Book this service
          <span className="sr-only">{serviceName}</span>
          <span aria-hidden="true">↗</span>
        </button>
      )}

      <Link href={href} className={actionClass} aria-label={label}>
        {mode === "dialog" ? "Open booking page" : "Book this service"}
        <span aria-hidden="true" className="sr-only">{serviceName}</span>
        <span className="ml-1" aria-hidden="true">↗</span>
      </Link>

      {mode === "dialog" && isOpen && (
        <BookingDialog isOpen={isOpen} onClose={() => setIsOpen(false)} preselectedServiceIds={[serviceId]} />
      )}
    </span>
  );
}
