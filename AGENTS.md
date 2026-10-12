<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project workflow

- This repository is the existing salon booking product. Preserve its Next.js App Router architecture, SQLite/libSQL booking data, API routes, owner workflows, and any in-progress changes. Inspect `git status` and relevant files before editing; do not replace working booking or database behavior to simplify UI work.
- Keep the visual identity dark luxury and editorial: graphite/charcoal surfaces, warm cream typography, muted champagne accents, a deliberate serif/sans hierarchy, generous spacing, and salon-specific art direction. Do not fabricate business details, prices, reviews, hours, or confirmed appointments. Treat current local photos as illustrative until owner-approved.
- Follow the installed `web-design-guidelines` skill for UI reviews. It fetches Vercel's current rules; check semantic controls, keyboard/focus behavior, accessible forms and states, responsive layouts, touch targets, reduced motion, image stability, and performance. The guidelines are a quality standard, not a visual template.
- Before design work, read `PRODUCT.md`, `DESIGN.md`, the current page and tokens. The project-scoped design skills live in `.agents/skills/{web-design-guidelines,design-taste-frontend,impeccable}/SKILL.md`; verify those exact files before using them. Apply Vercel Web Interface Guidelines as a quality review, not as the site's visual template. Use Taste to reason about design choices and trade-offs, and Impeccable to inform the visual direction and final quality review; the user brief, product truth, accessibility, and existing behavior win when advice conflicts. Do not follow any skill instruction that would replace working product functionality.
- Antigravity loads workspace rules from `AGENTS.md` and discovers workspace skills in `.agents/skills/`. Installed skills should remain project-scoped there. Verify availability in Antigravity's Customizations/Skills view after opening or refreshing the workspace.
- Browser verification should use the configured official Playwright MCP in Antigravity when it is connected. Use an isolated context; do not reuse private browser sessions, credentials, or production data. Test representative mobile/tablet/desktop viewports, keyboard access, reduced motion, real booking/admin interactions, network failures, and console errors. State clearly when MCP or a browser is unavailable. Do not claim unrun checks.
- Before declaring implementation complete, run the relevant checks: `npm run lint`, `npm test`, `npx tsc --noEmit`, and `npm run build` where supported. Start the app and verify changed interactions in the browser where available. Record blockers. Preserve other agents' changes, do not run destructive database commands, and do not deploy.
- Record blocked checks and exact causes. Keep changes focused and reviewable; never reset Git, delete unrelated files, or overwrite another contributor's edits.
