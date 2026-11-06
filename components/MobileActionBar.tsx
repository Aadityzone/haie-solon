"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { salonConfig } from "@/config/salon";

/**
 * Thumb-reach action bar for phones.
 *
 * A salon site is used standing up, one-handed, often while walking in. The two
 * conversions that matter — calling and messaging — sat in a `#contact` section
 * several screens down, and the only always-visible action was "Book" in the
 * header, which is the hardest place on a phone to reach. This pins the three
 * real actions to the bottom edge, inside the thumb arc.
 *
 * Scope is deliberate:
 *
 * - Hidden from `lg` up, where a mouse and a visible nav bar make it redundant.
 * - Absent on `/owner*`, which is an operator tool with its own chrome.
 * - Absent on `/book*`: the booking wizard already pins its own action bar to
 *   the bottom, and two stacked bars would eat a fifth of the viewport.
 *
 * It renders an in-flow spacer alongside the fixed bar so the footer's last
 * line is never trapped underneath it.
 */
export default function MobileActionBar() {
  const pathname = usePathname();

  if (pathname.startsWith("/owner") || pathname.startsWith("/book")) return null;

  return (
    <>
      {/* Reserves the bar's height so page content can still be scrolled clear. */}
      <div aria-hidden="true" className="h-[calc(3.5rem+env(safe-area-inset-bottom))] lg:hidden" />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md lg:hidden">
        <nav aria-label="Quick contact" className="safe-x m-0 grid grid-cols-[1fr_1fr_1.3fr] pb-[env(safe-area-inset-bottom)]">
          <a
            href={`tel:${salonConfig.contact.phone}`}
            className="flex min-h-14 flex-col items-center justify-center gap-1 border-r border-border/70 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:text-champagne focus-visible:outline-offset-[-2px]"
          >
            <svg aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372a1.125 1.125 0 0 0-.852-1.091l-4.423-1.106a1.125 1.125 0 0 0-1.173.417l-.97 1.293a1.125 1.125 0 0 1-1.21.38 12.035 12.035 0 0 1-7.143-7.143 1.125 1.125 0 0 1 .38-1.21l1.293-.97a1.125 1.125 0 0 0 .417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
            </svg>
            Call
          </a>

          <a
            href={salonConfig.contact.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-14 flex-col items-center justify-center gap-1 border-r border-border/70 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:text-champagne focus-visible:outline-offset-[-2px]"
          >
            <svg aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
            </svg>
            WhatsApp
          </a>

          <Link
            href="/book"
            className="flex min-h-14 flex-col items-center justify-center gap-1 bg-champagne text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-charcoal transition-colors hover:bg-champagne-light focus-visible:outline-offset-[-3px]"
          >
            <svg aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            Book
          </Link>
        </nav>
      </div>
    </>
  );
}
