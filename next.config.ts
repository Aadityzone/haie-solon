import type { NextConfig } from "next";

/**
 * The build output directory.
 *
 * Turbopack materialises dependency junctions under `<distDir>/node_modules` and
 * removes them when the build finishes. On a OneDrive-synced checkout that
 * unlink can fail with `EPERM`, which breaks `next build` for reasons that have
 * nothing to do with this app. Setting `NEXT_DIST_DIR` points the build at a
 * directory outside the synced tree. It defaults to `.next`, so a normal
 * build and `next start` are unaffected.
 */
const distDir = process.env.NEXT_DIST_DIR || ".next";

const nextConfig: NextConfig = {
  distDir,
  turbopack: {
    root: process.cwd(),
  },
  images: {
    formats: ["image/avif", "image/webp"],
    /**
     * Every derivative is re-decoded from a ~800 KB source JPEG and re-encoded
     * when its cache entry expires, and the default is four hours. The sources
     * are deployment artefacts that change only on a redeploy, so a week is a
     * safe trade for markedly less encoder work.
     *
     * It is deliberately not indefinite: the placeholder photography is meant to
     * be replaced by the salon's own images at the same paths, and a longer
     * window would keep serving a derivative of the old file afterwards.
     */
    minimumCacheTTL: 604800,
    /**
     * Trimmed to the widths this layout can actually request. The container is
     * capped at 1440px, so the largest real request is the hero at 56vw with a
     * 2x display — which lands on 1920. The default ladder's 2048 and 3840
     * entries could never be chosen, but every one of them was still generated,
     * per image, per format, on each revalidation.
     */
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
  },
};

export default nextConfig;
