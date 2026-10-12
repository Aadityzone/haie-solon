import Image from "next/image";
import { salonConfig } from "@/config/salon";

export default function About() {
  return (
    <section id="about" className="section-padding bg-surface">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-12">
        <div className="relative mx-auto w-full max-w-lg">
          <div className="relative aspect-[4/5] overflow-hidden bg-elevated">
            <Image
              src="/images/about.jpg"
              alt="Illustrative image of a calm, contemporary salon interior"
              fill
              sizes="(max-width: 1024px) 90vw, 42vw"
              className="object-cover"
              loading="lazy"
            />
          </div>
          <div className="absolute -bottom-3 -right-3 -z-0 h-full w-full border border-champagne/50" aria-hidden="true" />
          <p className="relative mt-4 text-right text-[0.62rem] uppercase tracking-[0.13em] text-neutral-500">Illustrative photography · not a verified salon image</p>
        </div>

        <div className="relative z-10 lg:pl-4">
          <p className="eyebrow text-champagne-dark">A little about the studio</p>
          <h2 className="mt-5 max-w-xl font-[family-name:var(--font-serif)] text-4xl leading-[1.08] tracking-tight text-foreground sm:text-5xl">
            Your style, with room to be <span className="italic text-champagne-dark">you.</span>
          </h2>
          <div className="my-6 h-px w-14 bg-champagne" />
          <div className="max-w-xl space-y-4 text-base leading-7 text-neutral-600">
            <p>A good appointment begins with listening. The right shape, finish, or care routine should feel personal to the person wearing it.</p>
            <p>The studio is being shaped as a welcoming place to pause, talk through what you have in mind, and find an approach that suits you. Service details and the salon story will be added once confirmed by the owner.</p>
            <p>No two appointments need to look alike. A thoughtful consultation helps make the experience feel considered from the first conversation to the final detail.</p>
          </div>
          <p className="mt-7 text-sm text-neutral-500">Salon location: {salonConfig.location.city}, {salonConfig.location.state} · please confirm before publishing.</p>
        </div>
      </div>
    </section>
  );
}
