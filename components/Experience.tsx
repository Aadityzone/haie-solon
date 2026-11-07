import Link from "next/link";

const steps = [
  {
    number: "01",
    title: "Choose Your Services",
    copy: "Browse the service menu — haircuts, colour, beard grooming, treatments, and more. Select what you need and the system calculates the total time.",
  },
  {
    number: "02",
    title: "Pick a Date & Time",
    copy: "Choose a preferred date and an available time slot. The salon's real availability is checked in real time — no double bookings.",
  },
  {
    number: "03",
    title: "Await Confirmation",
    copy: "Your slot is held while the salon reviews your request. You receive a reference code to track the status. Submission is not a confirmed booking.",
  },
];

export default function Experience() {
  return (
    <section className="section-padding border-y border-border bg-surface" aria-labelledby="experience-title">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="eyebrow">How It Works</p>
            <h2 id="experience-title" className="mt-4 max-w-md text-4xl leading-tight sm:text-5xl">
              Booking made simple.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-neutral-500">
              Request an appointment in three steps, track it with your reference code, and visit the salon once confirmed.
            </p>
            <Link href="/book" className="btn-primary mt-7">
              Book an Appointment <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <ol className="divide-y divide-border border-y border-border">
            {steps.map((step) => (
              <li key={step.number} className="grid gap-3 py-5 sm:grid-cols-[3.5rem_1fr] sm:gap-5 sm:py-6">
                <span className="font-mono text-xs text-champagne">{step.number}</span>
                <div>
                  <h3 className="text-xl">{step.title}</h3>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">{step.copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
