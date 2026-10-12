import Image from "next/image";
import Link from "next/link";
import { getActiveServices, getBookingRules } from "@/lib/booking-service";
import { databaseErrorContext } from "@/lib/db";
import { logError } from "@/lib/logger";
import type { ServiceItem } from "@/lib/types";
import { salonConfig } from "@/config/salon";
import { formatDuration, formatRupees } from "@/lib/money";
import ServiceBookAction from "@/components/booking/ServiceBookAction";

type CatalogueState =
  | { kind: "ready"; services: ServiceItem[]; pricesVerified: boolean }
  | { kind: "empty" }
  | { kind: "unavailable" };

/**
 * Reads the owner-configured service catalogue.
 *
 * The menu is entirely owner-driven: a service appears here only when the owner
 * has marked it available in the dashboard. A price is shown only when the
 * service has one, and it is described as proposed until the owner has saved
 * that row themselves.
 *
 * A failure is logged with the database context rather than as a bare object, so
 * "the menu could not be loaded" in a browser always has a matching, specific
 * line in the server log.
 */
async function loadCatalogue(): Promise<CatalogueState> {
  try {
    const [services, rules] = await Promise.all([getActiveServices(), getBookingRules()]);
    return services.length > 0
      ? { kind: "ready", services, pricesVerified: rules.cataloguePricesVerified }
      : { kind: "empty" };
  } catch (error) {
    logError("home.service-menu", error, databaseErrorContext(error));
    return { kind: "unavailable" };
  }
}

function groupByCategory(services: ServiceItem[]) {
  const groups: { id: string; name: string; services: ServiceItem[] }[] = [];
  for (const service of services) {
    const existing = groups.find((group) => group.id === service.categoryId);
    if (existing) existing.services.push(service);
    else groups.push({ id: service.categoryId, name: service.categoryName, services: [service] });
  }
  return groups;
}

export default async function ServiceMenu() {
  const state = await loadCatalogue();

  if (state.kind !== "ready") {
    return (
      <div className="border-t border-border pt-8">
        <h3 className="text-2xl sm:text-3xl">The service menu is not published yet</h3>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">
          {state.kind === "empty"
            ? "The salon has not enabled any services for online requests. Please contact the studio directly and the confirmed menu will be published here."
            : "The service menu could not be loaded right now. Please try again shortly or contact the studio directly."}
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <a
            href={salonConfig.contact.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary justify-center"
          >
            Ask the salon about services
          </a>
          <a href={`tel:${salonConfig.contact.phone}`} className="btn-secondary justify-center">
            Call {salonConfig.contact.phoneDisplay}
          </a>
        </div>
      </div>
    );
  }

  const groups = groupByCategory(state.services);
  const pricedCount = state.services.filter((service) => service.priceRupees !== null).length;

  return (
    <div className="border-t border-border pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <p className="eyebrow">Available to request</p>
          <h3 className="mt-3 text-2xl sm:text-3xl">The current menu</h3>
        </div>
        <p className="max-w-md text-xs leading-5 text-neutral-500">
          {pricedCount === 0
            ? "Prices for these services are confirmed by the salon at the time of booking."
            : state.pricesVerified
            ? "Prices shown are set by the salon. Anything without a price is confirmed at the time of booking."
            : "Prices shown are proposed as a guide and are not confirmed by the salon yet — anything without a price is confirmed at the time of booking."}
        </p>
      </div>

      <div className="mt-8 grid gap-x-14 gap-y-10 lg:grid-cols-2">
        {groups.map((group) => (
          <section key={group.id} aria-labelledby={`menu-${group.id}`}>
            <h4
              id={`menu-${group.id}`}
              className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-champagne"
            >
              {group.name}
            </h4>
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {group.services.map((service) => (
                <li key={service.id} className="flex min-w-0 items-start gap-4 py-4">
                  {service.imageUrl && (
                    <div className="relative hidden h-16 w-16 shrink-0 overflow-hidden bg-elevated sm:block">
                      {/* Decorative: the service name beside it carries the meaning. */}
                      <Image src={service.imageUrl} alt="" fill sizes="64px" className="object-cover" loading="lazy" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-5">
                      <div className="min-w-0">
                        <p className="text-base text-foreground">{service.name}</p>
                        {service.description && (
                          <p className="mt-1 text-sm leading-6 text-neutral-500">{service.description}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm text-foreground tabular-nums">
                          {service.priceRupees === null ? "On request" : formatRupees(service.priceRupees)}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500 tabular-nums">
                          {formatDuration(service.durationMinutes)}
                        </p>
                      </div>
                    </div>
                    <ServiceBookAction serviceId={service.id} serviceName={service.name} mode="dialog" />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-xs leading-5 text-neutral-500">
          Choosing a service starts a request, not a confirmed booking. The salon reviews your preferred time and
          confirms it before your appointment is held.
        </p>
        <Link href="/book" className="btn-primary shrink-0">
          Request an appointment <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </div>
  );
}
