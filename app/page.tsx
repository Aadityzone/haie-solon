import Navbar from "@/components/Navbar";
import AnimatedMarqueeHero from "@/components/ui/hero-3";
import Services from "@/components/Services";
import Gallery from "@/components/Gallery";
import About from "@/components/About";
import Experience from "@/components/Experience";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

/**
 * The homepage renders the owner-configured service catalogue.
 *
 * It is rendered per request rather than prerendered. Turso/libSQL credentials
 * may exist only in the runtime environment, not at build time, so a prerendered
 * build can bake "the menu could not be loaded" into the static HTML and keep
 * serving it long after the database is reachable. Rendering on request also
 * means an owner's edit is visible immediately, with no cache window to wait out.
 */
export const dynamic = "force-dynamic";

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
