import Image from "next/image";
import Link from "next/link";

export default function About() {
  return (
    <section id="about" className="section-padding bg-surface">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-12">
        <div className="relative mx-auto w-full max-w-lg">
          <div className="relative aspect-[4/5] overflow-hidden bg-elevated">
            <Image
              src="/images/about.jpg"
              alt="Illustrative image of a modern salon interior — not a verified photograph of Salman Salon"
              fill
              sizes="(max-width: 1024px) 90vw, 42vw"
              className="object-cover"
              loading="lazy"
            />
          </div>
          <div className="absolute -bottom-3 -right-3 -z-0 h-full w-full border border-champagne/50" aria-hidden="true" />
          <p className="relative mt-4 text-right text-[0.7rem] uppercase tracking-[0.13em] text-neutral-500">
            Illustrative photography · not a verified salon image
          </p>
        </div>

        <div className="relative z-10 lg:pl-4">
          <p className="eyebrow text-champagne-dark">About the Salon</p>
          <h2 className="mt-5 max-w-xl font-[family-name:var(--font-serif)] text-4xl leading-[1.08] tracking-tight text-foreground sm:text-5xl">
            Where style meets{" "}
            <span className="italic text-champagne-dark">expertise.</span>
          </h2>
          <div className="my-6 h-px w-14 bg-champagne" />
          <div className="max-w-xl space-y-4 text-base leading-7 text-neutral-500">
            <p>
              Salman Unisex Hair Saloon &amp; Academy is a professional grooming destination in Patiala — serving men, women, and all who want to look and feel their best.
            </p>
            <p>
              From modern haircuts and precision beard styling to hair colour, spa treatments, and bridal finishing — every service is delivered with care and attention to your personal style.
            </p>
            <p>
              Located near Punjabi University, the salon is also home to a hair academy — a space for learning, skill development, and professional training in the craft of modern hairdressing.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 border-t border-border pt-6 sm:grid-cols-3">
            {[
              { label: "Unisex Services", desc: "For men & women" },
              { label: "Hair Academy", desc: "Professional training" },
              { label: "Patiala", desc: "Near Punjabi University" },
            ].map((item) => (
              <div key={item.label} className="border-l border-champagne/40 pl-3">
                <p className="text-sm font-semibold text-foreground">{item.label}</p>
                <p className="mt-0.5 text-xs text-neutral-500">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/book" className="btn-primary">
              Book an Appointment <span aria-hidden="true">↗</span>
            </Link>
            <a href="#services" className="btn-secondary">
              Explore Services
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
