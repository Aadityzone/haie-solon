import { salonConfig, navItems } from "@/config/salon";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-charcoal text-neutral-400">
      {/* Main footer */}
      <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 lg:px-12">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex flex-col leading-none">
              <span className="font-[family-name:var(--font-serif)] text-2xl font-semibold text-ivory">
                {salonConfig.name}
              </span>
              <span className="mt-1 text-[0.6rem] font-medium tracking-[0.25em] uppercase text-champagne">
                {salonConfig.tagline}
              </span>
            </div>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-neutral-500">
              {salonConfig.description}
            </p>
            <a href="/book" className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-champagne transition-colors hover:text-champagne-light focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-champagne">
              Request an appointment <span aria-hidden="true">↗</span>
            </a>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-ivory">
              Quick Links
            </h4>
            <nav className="mt-3 flex flex-col gap-1" aria-label="Footer navigation">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={`/${item.href}`}
                  className="flex min-h-11 items-center text-sm text-neutral-500 transition-colors duration-200 hover:text-champagne"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          {/* Contact info */}
          <div>
            <h4 className="text-xs font-semibold tracking-[0.15em] uppercase text-ivory">
              Contact
            </h4>
            <div className="mt-3 space-y-1">
              <a
                href={`tel:${salonConfig.contact.phone}`}
                className="flex min-h-11 items-center gap-2 text-sm text-neutral-500 transition-colors duration-200 hover:text-champagne"
              >
                <svg
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                  />
                </svg>
                {salonConfig.contact.phoneDisplay}
              </a>

              <a
                href={salonConfig.contact.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-2 text-sm text-neutral-500 transition-colors duration-200 hover:text-champagne"
              >
                <svg
                  className="h-4 w-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp
              </a>

              <div className="flex items-start gap-2 text-sm text-neutral-500">
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                  />
                </svg>
                Location details to be confirmed
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-neutral-800">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-neutral-600 md:flex-row md:px-8 lg:px-12">
          <p>
            © {currentYear} {salonConfig.name}. All rights reserved.
          </p>
          <p>Business details awaiting owner confirmation</p>
        </div>
      </div>
    </footer>
  );
}
