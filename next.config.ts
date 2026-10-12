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
  },
};

export default nextConfig;
