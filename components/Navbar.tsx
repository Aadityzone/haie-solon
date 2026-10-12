"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { navItems, salonConfig } from "@/config/salon";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => mobileMenuRef.current?.querySelector<HTMLElement>("a[href]")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key === "Tab" && mobileMenuRef.current) {
        const items = Array.from(mobileMenuRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prior;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  const close = () => setIsOpen(false);
  const sectionHref = (href: string) => `/${href}`;

  return (
    // The header itself must not carry `backdrop-filter`: a filtered ancestor
    // becomes the containing block for `position: fixed` descendants, which
    // collapsed the full-screen mobile menu into the height of the bar. The blur
    // lives on the inner bar so the menu stays a sibling of it, not a child.
    <header className="fixed inset-x-0 top-0 z-50">
      <div className={`safe-x border-b backdrop-blur-md transition-colors duration-300 ${scrolled ? "border-border bg-background/95" : "border-border/60 bg-background/80"}`}>
        <nav aria-label="Main navigation" className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-5 py-3 sm:px-8 lg:px-12">
          <Link href="/#home" onClick={close} className="relative z-[60] flex min-h-11 min-w-0 flex-col justify-center leading-none focus-visible:outline-offset-8">
            <span className="line-clamp-2 font-[family-name:var(--font-serif)] text-base font-medium leading-tight tracking-tight text-foreground sm:text-xl">{salonConfig.name}</span>
            <span className="mt-1 hidden text-[0.58rem] font-medium uppercase tracking-[0.2em] text-champagne sm:block">{salonConfig.tagline}</span>
          </Link>

          <ul className="hidden items-center gap-7 lg:flex">
            {navItems.map(item => <li key={item.href}><a href={sectionHref(item.href)} className="text-sm text-neutral-500 transition-colors hover:text-foreground focus-visible:rounded-sm">{item.label}</a></li>)}
          </ul>

          <div className="flex shrink-0 items-center gap-2">
            {/* The primary action stays reachable on a phone without opening the menu. */}
            <Link href="/book" onClick={close} className="btn-header">
              <span className="lg:hidden">Book</span>
              <span className="hidden lg:inline">Book an appointment</span>
              <span aria-hidden="true" className="hidden sm:inline">↗</span>
            </Link>

            <button
              ref={toggleRef}
              type="button"
              aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
              aria-expanded={isOpen}
              aria-controls="mobile-navigation"
              onClick={() => setIsOpen(value => !value)}
              className="relative z-[60] flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-[5px] border border-border text-foreground lg:hidden"
            >
              <motion.span animate={isOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }} className="h-px w-5 bg-current" />
              <motion.span animate={isOpen ? { opacity: 0 } : { opacity: 1 }} className="h-px w-5 bg-current" />
              <motion.span animate={isOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }} className="h-px w-5 bg-current" />
            </button>
          </div>
        </nav>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={mobileMenuRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="safe-area-menu fixed inset-0 z-50 flex flex-col items-center justify-center gap-1 overflow-y-auto bg-background px-6 py-24 lg:hidden"
          >
            <nav aria-label="Mobile navigation" className="flex w-full max-w-sm flex-col items-center gap-1">
              {navItems.map((item, index) => (
                <motion.a
                  key={item.href}
                  href={sectionHref(item.href)}
                  onClick={close}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.035 }}
                  className="flex min-h-12 w-full items-center justify-center font-[family-name:var(--font-serif)] text-3xl text-foreground hover:text-champagne focus-visible:outline-offset-4"
                >
                  {item.label}
                </motion.a>
              ))}
              <Link href="/book" onClick={close} className="btn-primary mt-6 w-full">
                Book an appointment <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/book/status" onClick={close} className="btn-secondary mt-2 w-full text-xs">
                Check an existing request
              </Link>            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
