import Link from "next/link";
import { salonConfig } from "@/config/salon";

export default function Contact() {
  return (
    <section id="contact" className="section-padding bg-background">
      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        <div className="grid gap-12 border-y border-charcoal/15 py-10 lg:grid-cols-[1fr_0.8fr] lg:items-end lg:gap-20 lg:py-14">
          <div>
            <p className="eyebrow text-champagne-dark">Start a conversation</p>
            <h2 className="mt-4 max-w-2xl font-[family-name:var(--font-serif)] text-4xl leading-tight tracking-tight text-foreground sm:text-5xl">
              A fresh point of view is only a conversation away.
            </h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-neutral-600">
              Send an appointment request online, or contact the studio directly. The salon will review your preferred time before confirming.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/book" className="btn-primary justify-center">Request an appointment <span aria-hidden="true">↗</span></Link>
              <a href={salonConfig.contact.whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary justify-center">Message on WhatsApp</a>
            </div>
          </div>

          <div className="grid gap-7 border-l border-champagne/60 pl-6 sm:grid-cols-2 lg:block lg:space-y-7">
            <div>
              <h3 className="eyebrow text-neutral-500">Call the studio</h3>
              <a className="mt-1 inline-flex min-h-11 items-center text-lg text-foreground underline decoration-champagne/60 underline-offset-4 hover:decoration-champagne focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-champagne" href={`tel:${salonConfig.contact.phone}`}>
                {salonConfig.contact.phoneDisplay}
              </a>
            </div>
            {salonConfig.hours.confirmed && (
              <div>
                <h3 className="eyebrow text-neutral-500">Opening hours</h3>
                <div className="mt-2 space-y-1 text-sm text-foreground">
                  {salonConfig.hours.schedule.map((hours) => <p key={hours.days}>{hours.days}: {hours.time}</p>)}
                </div>
              </div>
            )}
            <p className="max-w-xs text-xs leading-5 text-neutral-500">
              Address, directions, and opening hours will be added after the owner confirms the details.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
