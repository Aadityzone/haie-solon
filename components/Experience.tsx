import Link from "next/link";

const steps = [
  { number: "01", title: "Choose your services", copy: "Explore the current online menu. The salon’s confirmed services and prices are managed separately from this provisional presentation." },
  { number: "02", title: "Request a time", copy: "Select a date and an available start time for the combined duration of your chosen services." },
  { number: "03", title: "Track the response", copy: "Keep your booking reference close. Your request stays pending until the salon reviews and approves it." },
];

export default function Experience() {
  return (
    <section className="section-padding border-y border-border bg-surface" aria-labelledby="experience-title">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="eyebrow">A clear way to begin</p>
            <h2 id="experience-title" className="mt-4 max-w-md text-4xl leading-tight sm:text-5xl">A little clarity before your visit.</h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-neutral-500">Send a request in a few steps, see what happens next, and check its status with your reference. A request is not confirmed until the salon approves it.</p>
            <Link href="/book" className="btn-primary mt-7">Start an appointment request <span aria-hidden="true">↗</span></Link>
          </div>
          <ol className="divide-y divide-border border-y border-border">
            {steps.map(step => <li key={step.number} className="grid gap-3 py-5 sm:grid-cols-[3.5rem_1fr] sm:gap-5 sm:py-6">
              <span className="font-mono text-xs text-champagne">{step.number}</span>
              <div>
                <h3 className="text-xl">{step.title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">{step.copy}</p>
              </div>
            </li>)}
          </ol>
        </div>
      </div>
    </section>
  );
}
