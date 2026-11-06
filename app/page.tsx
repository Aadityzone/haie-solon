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
 * It is prerendered and revalidated rather than rendered per request. Rendering
 * per request meant one full server render and several database reads per visit
 * for a menu that changes when the owner clicks Save, and it also made the page
 * impossible for any CDN to hold — so at a hundred thousand visits the origin
 * did a hundred thousand of them.
 *
 * Freshness is preserved two ways. The catalogue read is cached and tagged, and
 * the owner's service routes call `revalidatePath("/")` and drop that tag, so an
 * edit is visible on the next visit rather than after the window below. The
 * window is the backstop for a change that arrives without going through those
 * routes — a database restored from backup, or another instance serving its own
 * cached copy.
 *
 * `force-dynamic` previously guarded one real case: a build machine with no
 * database, where a prerendered page could bake in "the menu could not be
 * loaded". That is now bounded rather than removed. `loadCatalogue` still
 * catches the failure and renders the honest unavailable state, and that state
 * is replaced within the revalidate window once the database is reachable.
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
