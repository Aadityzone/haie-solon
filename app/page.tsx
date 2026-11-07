import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import AnimatedMarqueeHero from "@/components/ui/hero-3";
import Services from "@/components/Services";
import Gallery from "@/components/Gallery";
import About from "@/components/About";
import Experience from "@/components/Experience";
import Instagram from "@/components/Instagram";
import GoogleReviews from "@/components/GoogleReviews";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Salman Unisex Hair Saloon & Academy | Unisex Salon in Patiala",
  description:
    "Looking for a unisex salon near Punjabi University, Patiala? Visit Salman Unisex Hair Saloon & Academy for haircuts, beard grooming, hairstyling and professional hair care.",
  alternates: {
    canonical: "/",
  },
};

/**
 * The homepage renders the owner-configured service catalogue.
 *
 * It is prerendered and revalidated rather than rendered per request.
 */
export const revalidate = 60;

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main-content">
        <AnimatedMarqueeHero />
        <Services />
        <About />
        <Experience />
        <Gallery />
        <Instagram />
        <GoogleReviews />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
