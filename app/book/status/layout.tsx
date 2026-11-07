import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check Appointment Status",
  description:
    "Check the confirmation status of your salon booking request with Salman Unisex Hair Saloon & Academy in Patiala.",
  alternates: {
    canonical: "/book/status",
  },
  openGraph: {
    title: "Check Appointment Status | Salman Unisex Hair Saloon & Academy",
    description:
      "Look up your appointment request using your booking reference and phone number.",
    url: "/book/status",
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function BookStatusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

