import Navbar from "@/components/Navbar";
import AnimatedMarqueeHero from "@/components/ui/hero-3";
import Services from "@/components/Services";
import Gallery from "@/components/Gallery";
import About from "@/components/About";
import Experience from "@/components/Experience";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

/**
 * The homepage renders the owner-configured service catalogue. Revalidate keeps
 * the page statically served while picking up owner edits to the menu.
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
        <Contact />
      </main>
      <Footer />
    </>
  );
}
