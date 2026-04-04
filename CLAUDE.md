# The Wobbly Table Theorem

Interactive 3D visualization (Three.js) demonstrating that a square four-legged table on a continuous surface can always be stabilized by rotation. Standalone HTML page styled to match the blog.

## Project structure

- `index.html` — the entire article and visualization (HTML, CSS, inline JS)
- `vitra_eames_plastic_chair.glb` — 3D model used in the scene
- `blog.toml` — config for the `blog` dev server
- `test_browser.mjs` — Puppeteer browser smoke test
- `test_legs.mjs`, `test_placement.mjs`, `test_tripod.mjs`, `test_animate_e2e.mjs`, `test_animation.mjs` — additional Puppeteer tests
- `inspect_eames.mjs` — utility for inspecting the GLB model
- `README.md` — project overview

## Dev server

```bash
blog dev
```

Config lives in `blog.toml` (`build=false`, serves `.` on port 8768). The `blog` CLI proxies `/blog/` requests to the blog repo so that `/blog/css/blog.css` resolves locally.

## CSS

Base styles load from `/blog/css/blog.css` (root-relative). On GitHub Pages this resolves because the blog lives on the same domain (`timvieira.github.io`). Locally, the `blog dev` proxy handles it. Article-specific styles are inline in `index.html`.

## Deployment

GitHub Pages serves the repo root at `https://timvieira.github.io/table-theorem/`. No build step. The user handles deployment—don't run deploy commands or push to production.

## Testing

Run tests against the dev server:

```bash
blog dev &
node test_browser.mjs http://localhost:8768/index.html
```

Tests require Puppeteer installed at `/tmp/node_modules/puppeteer`.

## Style conventions

- **Font**: EB Garamond, matching the blog (timvieira.github.io/blog)
- **Writing**: understated tone, no dorky capitalization, no cliche quotes
- **Em-dashes**: tight, no spaces—like this
- **Spelling**: American English (optimize, color, stabilize)
- **3D models**: prefer real GLB models over procedural geometry for recognizable objects
- **Math**: MathJax 3 with `typeset: false` + `ready` callback + `defer`. Use `\color[HTML]{hex}` not `\color{#hex}`.
- **The user values**: smoke-tested code and understated writing. Don't present work as done without verifying it works.
