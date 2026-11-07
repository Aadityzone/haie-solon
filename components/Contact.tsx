import Link from "next/link";
import { salonConfig } from "@/config/salon";

export default function Contact() {
  return (
    <section id="location" className="section-padding bg-background scroll-mt-20">
      {/* Anchor for backward compatibility with #contact links */}
      <span id="contact" className="sr-only scroll-mt-24" aria-hidden="true" />

      <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
        {/* Header */}
        <div className="mb-12 text-center">
          <p className="eyebrow text-champagne-dark">Find Our Salon</p>
          <h2 className="mt-4 font-[family-name:var(--font-serif)] text-4xl leading-tight tracking-tight text-foreground sm:text-5xl">
            Visit Us in Patiala
          </h2>
          <div className="mx-auto mt-4 h-px w-14 bg-champagne" />
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-neutral-400">
            Conveniently located near Punjabi University. Walk in during salon hours or request your appointment online.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          {/* Map embed */}
          <div className="flex flex-col">
            <div
              className="relative overflow-hidden border border-border bg-elevated shadow-xl"
              style={{ aspectRatio: "16/10" }}
            >
              <iframe
                title="Salman Unisex Hair Saloon & Academy on Google Maps"
                src="https://maps.google.com/maps?q=30.3558333,76.4561667&z=17&output=embed"
                width="100%"
                height="100%"
                style={{ border: 0, position: "absolute", inset: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <a
                href={salonConfig.location.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary justify-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A2 2 0 012.5 15.485V4.764a2 2 0 011.053-1.764l5.447-2.724a2 2 0 011.895 0l5.21 2.605a2 2 0 001.79 0l5.052-2.526A2 2 0 0121.5 2.118v10.721a2 2 0 01-1.053 1.764l-5.447 2.724a2 2 0 01-1.895 0l-5.21-2.605a2 2 0 00-1.79 0L2.5 17.236" />
                </svg>
                Get Directions <span aria-hidden="true">↗</span>
              </a>

              <a
                href={salonConfig.location.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary justify-center gap-2 text-xs"
              >
                Open in Google Maps <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>

          {/* Contact & Location details */}
          <div className="flex flex-col gap-6">
            {/* Address */}
            <div className="border-l-2 border-champagne pl-5">
              <h3 className="eyebrow text-neutral-400 mb-1.5">Salon Address</h3>
              <p className="text-base text-foreground font-medium leading-relaxed">
                {salonConfig.location.fullAddress}
              </p>
              <p className="mt-1 text-xs text-neutral-400">
                Opposite Bawa PG · Near Punjabi University
              </p>
            </div>

            {/* Contact Actions Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Call Now */}
              <div className="border-l-2 border-champagne pl-5">
                <h3 className="eyebrow text-neutral-400 mb-1.5">Call Us</h3>
                <a
                  href={`tel:${salonConfig.contact.phone}`}
                  className="inline-flex items-center gap-2 text-lg font-[family-name:var(--font-serif)] text-foreground underline decoration-champagne/60 underline-offset-4 hover:decoration-champagne transition-colors"
                >
                  <svg className="h-4 w-4 text-champagne" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  {salonConfig.contact.phoneDisplay}
                </a>
                <p className="mt-1 text-xs text-neutral-500">Tap to call directly</p>
              </div>

              {/* WhatsApp */}
              <div className="border-l-2 border-champagne pl-5">
                <h3 className="eyebrow text-neutral-400 mb-1.5">WhatsApp</h3>
                <a
                  href={salonConfig.contact.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-foreground hover:text-champagne transition-colors"
                >
                  <svg className="h-4 w-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Chat on WhatsApp
                </a>
                <p className="mt-1 text-xs text-neutral-500">Quick enquiries &amp; timing</p>
              </div>
            </div>

            {/* Email & Instagram */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="border-l-2 border-champagne pl-5">
                <h3 className="eyebrow text-neutral-400 mb-1.5">Email</h3>
                <a
                  href={`mailto:${salonConfig.contact.email}`}
                  className="text-sm text-foreground underline decoration-champagne/60 underline-offset-4 hover:decoration-champagne transition-colors break-all"
                >
                  {salonConfig.contact.email}
                </a>
              </div>

              <div className="border-l-2 border-champagne pl-5">
                <h3 className="eyebrow text-neutral-400 mb-1.5">Instagram</h3>
                <a
                  href={salonConfig.social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-foreground hover:text-champagne transition-colors"
                >
                  {salonConfig.social.instagramHandle}
                </a>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <a
                href={`tel:${salonConfig.contact.phone}`}
                className="btn-primary justify-center gap-2 sm:flex-1"
              >
                Call Now (+91 99179 53267)
              </a>
              <Link href="/book" className="btn-secondary justify-center gap-2 sm:flex-1 text-xs">
                Book an Appointment <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
