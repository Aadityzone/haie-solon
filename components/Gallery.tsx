"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import { galleryImages } from "@/config/salon";

gsap.registerPlugin(ScrollTrigger);

export default function Gallery() {
  const sectionRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        headerRef.current,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: {
            trigger: headerRef.current,
            start: "top 85%",
            once: true,
          },
        }
      );

      const items = gridRef.current?.children;
      if (items) {
        gsap.fromTo(
          items,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.7,
            stagger: 0.1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: gridRef.current,
              start: "top 80%",
              once: true,
            },
          }
        );
      }
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (lightboxIndex !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [lightboxIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowRight")
        setLightboxIndex((prev) =>
          prev !== null ? (prev + 1) % galleryImages.length : null
        );
      if (e.key === "ArrowLeft")
        setLightboxIndex((prev) =>
          prev !== null
            ? (prev - 1 + galleryImages.length) % galleryImages.length
            : null
        );
    },
    [lightboxIndex]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <section
      ref={sectionRef}
      id="gallery"
      className="section-padding bg-charcoal"
    >
      <div className="mx-auto max-w-7xl px-5 md:px-8 lg:px-12">
        {/* Section header */}
        <div ref={headerRef} className="mb-16 text-center">
          <span className="text-xs font-medium tracking-[0.2em] uppercase text-champagne">
            Studio inspiration
          </span>
          <h2 className="mt-4 font-[family-name:var(--font-serif)] text-3xl font-semibold tracking-tight text-ivory sm:text-4xl md:text-5xl">
            Hair, space & details
          </h2>
          <div className="mx-auto mt-4 h-[1.5px] w-12 bg-champagne" />
          <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-neutral-400">
            Salon-themed photographs for visual direction. Replace with the studio’s own approved portfolio before launch.
          </p>
        </div>
        <p className="mt-7 text-center text-[0.62rem] uppercase tracking-[0.14em] text-neutral-500">
          All imagery is illustrative and is not presented as client work from this salon.
        </p>

        {/* Gallery grid */}
        <div
          ref={gridRef}
          className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
        >
          {galleryImages.map((image, index) => (
            <button
              key={image.id}
              onClick={() => setLightboxIndex(index)}
              className="group relative aspect-[4/5] cursor-pointer overflow-hidden bg-charcoal-light transition-transform duration-500 hover:scale-[1.02] sm:aspect-[3/4] lg:aspect-square text-left"
              aria-label={`View: ${image.alt}`}
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-charcoal/60 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              <div className="absolute bottom-0 left-0 right-0 translate-y-4 p-5 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                <p className="text-sm font-medium text-ivory">{image.alt}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal/95 backdrop-blur-sm"
            onClick={() => setLightboxIndex(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Gallery image viewer"
          >
            {/* Close button */}
            <button
              onClick={() => setLightboxIndex(null)}
              className="absolute top-4 z-10 flex h-11 w-11 items-center justify-center text-ivory/70 transition-colors hover:text-ivory right-[max(0.5rem,env(safe-area-inset-right))]"
              aria-label="Close lightbox"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Previous */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(
                  (lightboxIndex - 1 + galleryImages.length) %
                    galleryImages.length
                );
              }}
              className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center text-ivory/70 transition-colors hover:text-ivory sm:left-4"
              aria-label="Previous image"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>

            {/* Image */}
            <motion.div
              key={lightboxIndex}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="relative mx-12 h-[70vh] w-full max-w-4xl sm:mx-16 sm:h-[75vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={galleryImages[lightboxIndex].src}
                alt={galleryImages[lightboxIndex].alt}
                fill
                sizes="90vw"
                className="object-contain"
                priority
              />
              <p className="absolute -bottom-8 left-0 right-0 text-center text-sm text-neutral-400">
                {galleryImages[lightboxIndex].alt}
              </p>
            </motion.div>

            {/* Next */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(
                  (lightboxIndex + 1) % galleryImages.length
                );
              }}
              className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center text-ivory/70 transition-colors hover:text-ivory sm:right-4"
              aria-label="Next image"
              style={{ top: "50%" }}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
