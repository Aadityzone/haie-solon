"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { salonConfig } from "@/config/salon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface AppointmentDetails {
  referenceCode: string;
  customerName: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED" | "COMPLETED";
  date: string;
  time: string;
  durationMinutes: number;
  totalPriceRupees: number | null;
  services: { name: string; priceRupees: number | null; durationMinutes: number }[];
  rejectionReason?: string;
  holdExpiresAt?: string;
}

function StatusContent() {
  const searchParams = useSearchParams();
  const queryRef = searchParams.get("ref") || "";

  const [inputRef, setInputRef] = useState(queryRef);
  const [inputPhone, setInputPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<AppointmentDetails | null>(null);

  const fetchStatus = (code: string, phone: string) => {
    if (!code.trim() || !phone.trim()) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ ref: code.trim().toUpperCase(), phone: phone.trim() });
    fetch(`/api/booking/status?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.appointment) {
          setAppointment(data.appointment);
        } else {
          setError(data.error || "No appointment matches that reference and mobile number.");
          setAppointment(null);
        }
      })
      .catch((err) => {
        console.error(err);
        setError("Network error. Please try again.");
      })
      .finally(() => setLoading(false));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStatus(inputRef, inputPhone);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "CONFIRMED":
        return <span className="rounded-full bg-emerald-950/50 px-3 py-1 text-xs font-semibold text-emerald-200">Confirmed</span>;
      case "PENDING":
        return <span className="border border-champagne/60 bg-champagne-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-champagne">Pending approval</span>;
      case "REJECTED":
        return <span className="rounded-full bg-rose-950/50 px-3 py-1 text-xs font-semibold text-rose-200">Declined</span>;
      case "CANCELLED":
        return <span className="rounded-full bg-neutral-800 px-3 py-1 text-xs font-semibold text-neutral-700">Cancelled</span>;
      case "COMPLETED":
        return <span className="rounded-full bg-blue-950/50 px-3 py-1 text-xs font-semibold text-blue-200">Completed</span>;
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-5 py-24 md:py-32">
      <div className="text-center">
        <span className="text-xs font-medium tracking-[0.2em] uppercase text-champagne">
          Reservation Tracker
        </span>
        <h1 className="mt-2 font-[family-name:var(--font-serif)] text-3xl font-semibold text-foreground sm:text-4xl">
          Check Appointment Status
        </h1>
        <p className="mt-3 text-sm text-neutral-500">
          Enter your booking reference code and the mobile number you booked with. Both are required, so only you can see your appointment.
        </p>

        {/* Search form */}
        <form onSubmit={handleSearch} className="mx-auto mt-6 grid max-w-md gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <div className="text-left">
            <label htmlFor="booking-reference" className="sr-only">Booking reference code</label>
            <input
              id="booking-reference"
              name="referenceCode"
              type="text"
              required
              autoComplete="off"
              spellCheck={false}
              value={inputRef}
              onChange={(e) => setInputRef(e.target.value.toUpperCase())}
              placeholder="Reference, e.g. BK-XXXX…"
              className="w-full rounded-sm border border-neutral-300 bg-elevated px-4 py-2.5 font-mono text-sm uppercase tracking-wider text-foreground outline-none focus:border-champagne focus:ring-1 focus:ring-champagne"
            />
          </div>
          <div className="text-left">
            <label htmlFor="booking-phone" className="sr-only">Mobile number used for the booking</label>
            <input
              id="booking-phone"
              name="phone"
              type="tel"
              required
              autoComplete="tel-national"
              inputMode="tel"
              value={inputPhone}
              onChange={(e) => setInputPhone(e.target.value)}
              placeholder="Mobile, e.g. 62808 66359"
              className="w-full rounded-sm border border-neutral-300 bg-elevated px-4 py-2.5 text-sm text-foreground outline-none focus:border-champagne focus:ring-1 focus:ring-champagne"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary shrink-0 text-xs disabled:opacity-50"
          >
            {loading ? "Searching…" : "Track"}
          </button>
        </form>
      </div>

      {/* Results View */}
      {error && (
        <div role="alert" className="mt-8 rounded-sm border border-red-900 bg-red-950/40 p-4 text-center text-sm text-red-200">
          {error}
        </div>
      )}

      {appointment && (
        <div className="mt-10 rounded-sm border border-neutral-200 bg-elevated p-6 md:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-neutral-100 pb-5 gap-3">
            <div>
              <span className="text-[0.65rem] uppercase tracking-wider text-neutral-400">Reference Code</span>
              <div className="font-mono text-xl font-bold text-foreground">{appointment.referenceCode}</div>
            </div>
            <div>{getStatusBadge(appointment.status)}</div>
          </div>

          {/* Status Context Banner */}
          <div className="mt-5 rounded-sm p-4 text-xs leading-relaxed border bg-neutral-50 border-neutral-200/80">
            {appointment.status === "PENDING" && (
              <p className="text-amber-200">
                <strong>Pending confirmation:</strong> Your request is being reviewed by the salon. The appointment is not confirmed yet. Please contact the salon if you need an update.
              </p>
            )}
            {appointment.status === "CONFIRMED" && (
              <p className="text-emerald-200">
                ✨ <strong>Confirmed:</strong> Your appointment has been approved! We look forward to seeing you at {salonConfig.name}. Please arrive 5 minutes early.
              </p>
            )}
            {appointment.status === "REJECTED" && (
              <p className="text-rose-200">
                ❌ <strong>Request Declined:</strong> Unfortunately, the salon could not accommodate this appointment
                {appointment.rejectionReason ? ` (${appointment.rejectionReason})` : ""}. Please select another time or contact us.
              </p>
            )}
            {appointment.status === "CANCELLED" && (
              <p className="text-neutral-700">
                This appointment has been cancelled.
              </p>
            )}
          </div>

          {/* Details Table */}
          <div className="mt-6 space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-neutral-100">
              <span className="text-neutral-500">Customer</span>
              <span className="font-medium text-foreground">{appointment.customerName}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-neutral-100">
              <span className="text-neutral-500">Date & Time</span>
              <span className="font-medium text-foreground">{appointment.date} at {appointment.time}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-neutral-100">
              <span className="text-neutral-500">Appointment length</span>
              <span className="font-medium text-foreground">{appointment.durationMinutes > 0 ? `${appointment.durationMinutes} minutes` : "To be confirmed"}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-neutral-100">
              <span className="text-neutral-500">Price</span>
              <span className="font-semibold text-foreground">{appointment.totalPriceRupees === null ? "To be confirmed" : `₹${appointment.totalPriceRupees.toLocaleString("en-IN")}`}</span>
            </div>
          </div>

          {/* Services list */}
          <div className="mt-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
              Reserved Services
            </h4>
            <div className="space-y-2">
              {appointment.services?.map((svc, i) => (
                <div key={i} className="flex items-center justify-between rounded bg-neutral-50 px-3.5 py-2 text-xs">
                  <span className="font-medium text-neutral-800">{svc.name}</span>
                  <span className="text-neutral-500">{svc.durationMinutes} min · {svc.priceRupees === null ? "Price to be confirmed" : `₹${svc.priceRupees.toLocaleString("en-IN")}`}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end border-t border-neutral-100 pt-5">
            <a
              href={salonConfig.contact.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs"
            >
              Contact Salon on WhatsApp
            </a>
            <Link href="/" className="btn-primary text-xs">
              Return Home
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BookingStatusPage() {
  return (
    <>
      <Navbar />
      <main id="main-content" className="min-h-screen bg-background">
        <Suspense fallback={<div className="py-32 text-center text-sm text-neutral-500">Loading tracker...</div>}>
          <StatusContent />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
