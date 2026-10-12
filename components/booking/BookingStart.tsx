"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import BookingWizard from "@/components/booking/BookingWizard";

/**
 * Reads the deep link a service card uses (`/book?service=<id>`, or several ids
 * separated by commas) and hands it to the wizard, which honours an id only when
 * the salon actually offers that service.
 *
 * Reading the parameters is separated from the page shell so the route itself
 * stays server-rendered.
 */
export default function BookingStart() {
  const searchParams = useSearchParams();
  const preselectedServiceIds = useMemo(() => {
    const raw = searchParams.getAll("service").join(",");
    return Array.from(
      new Set(
        raw
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0 && value.length <= 64)
      )
    );
  }, [searchParams]);

  return <BookingWizard preselectedServiceIds={preselectedServiceIds} />;
}
