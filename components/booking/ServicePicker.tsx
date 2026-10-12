"use client";

import { useMemo, useState } from "react";
import type { ServiceItem } from "@/lib/types";
import { formatDuration, formatRupees } from "@/lib/money";

interface ServicePickerProps {
  services: ServiceItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  /** Label for the category filter that shows everything. */
  allLabel?: string;
}

/**
 * Step one: the bookable menu.
 *
 * Every card is a real toggle with its selected state exposed through
 * `aria-pressed`, so a screen reader and a keyboard user get the same
 * information the champagne border gives a sighted user. A service the salon
 * has not published a price for says so instead of showing a number nobody has
 * agreed to.
 */
export default function ServicePicker({
  services,
  selectedIds,
  onToggle,
  allLabel = "All services",
}: ServicePickerProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const service of services) map.set(service.categoryId, service.categoryName);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [services]);

  const visible = useMemo(
    () => (activeCategory === "all" ? services : services.filter((service) => service.categoryId === activeCategory)),
    [services, activeCategory]
  );

  const anyUnverified = services.some((service) => !service.priceVerified && service.priceRupees !== null);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xl sm:text-2xl">Choose your services</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          Pick one or more. The total price and the length of your appointment are added up for you.
        </p>
        {anyUnverified && (
          <p className="mt-3 border-l-2 border-champagne bg-champagne-muted px-3 py-2 text-xs leading-5 text-neutral-600">
            Prices marked <span className="text-champagne">proposed</span> are a starting guide the salon has not
            finalised yet. Your final price is confirmed by the salon before your appointment.
          </p>
        )}
      </div>

      {categories.length > 1 && (
        <div role="group" aria-label="Filter services by category" className="-mx-5 flex flex-wrap gap-2 px-5 sm:mx-0 sm:px-0">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            aria-pressed={activeCategory === "all"}
            className={`min-h-11 rounded-full px-4 text-xs font-medium transition-colors ${
              activeCategory === "all"
                ? "bg-champagne text-charcoal"
                : "border border-border bg-elevated text-neutral-600 hover:border-champagne hover:text-foreground"
            }`}
          >
            {allLabel}
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              aria-pressed={activeCategory === category.id}
              className={`min-h-11 rounded-full px-4 text-xs font-medium transition-colors ${
                activeCategory === category.id
                  ? "bg-champagne text-charcoal"
                  : "border border-border bg-elevated text-neutral-600 hover:border-champagne hover:text-foreground"
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {visible.map((service) => {
          const isSelected = selectedIds.includes(service.id);
          return (
            <li key={service.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onToggle(service.id)}
                aria-pressed={isSelected}
                data-testid="service-card"
                className={`flex h-full w-full flex-col justify-between gap-3 border p-4 text-left transition-colors duration-200 ${
                  isSelected
                    ? "border-champagne bg-champagne-muted"
                    : "border-border bg-elevated hover:border-champagne/60"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-champagne">
                      {service.categoryName}
                    </span>
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-[0.7rem] ${
                        isSelected ? "border-champagne bg-champagne text-charcoal" : "border-neutral-300"
                      }`}
                    >
                      {isSelected ? "✓" : ""}
                    </span>
                  </div>
                  <h4 className="mt-2 text-lg leading-snug text-foreground">{service.name}</h4>
                  {service.description && (
                    <p className="mt-1.5 text-sm leading-6 text-neutral-500">{service.description}</p>
                  )}
                </div>

                <div className="flex items-end justify-between gap-3 border-t border-border pt-3">
                  <span className="text-xs text-neutral-500 tabular-nums">{formatDuration(service.durationMinutes)}</span>
                  <span className="text-right">
                    <span className="block text-sm text-foreground tabular-nums">
                      {service.priceRupees === null ? "Price on request" : formatRupees(service.priceRupees)}
                    </span>
                    {service.priceRupees !== null && !service.priceVerified && (
                      <span className="mt-0.5 block text-[0.62rem] uppercase tracking-[0.1em] text-neutral-500">
                        Proposed
                      </span>
                    )}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
