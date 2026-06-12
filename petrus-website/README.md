# Petrus AI — Website

Immersive 3D single-page website for **Petrus AI by Seventy Fifty** — AI-powered support for children's mental health, built for **www.petrus-labs.com**.

> "There is always a window."

## What's inside

- **Full-page 3D scene** (Three.js): the camera travels through a particle field as you scroll, passing glowing wireframe *windows* — a visual echo of the brand tagline. Mouse parallax, alpine snow drift, and a wireframe icosahedron behind the hero.
- **Scroll-driven animations** (GSAP ScrollTrigger with an IntersectionObserver fallback): section reveals, animated stat counters with Swiss number formatting, progress bars that fill on view.
- **Interactive data visualizations** (Chart.js, lazy-rendered): condition-distribution doughnut, feature-importance radar (Schools vs. Psychiatry), reported-challenges bars, 3-year revenue projection, and the 2028→2031+ revenue trajectory.
- **3D tilt cards** with cursor spotlight, country comparison tabs (CH/DE/AT), four-level alert architecture, full feature-comparison matrix, team, roadmap timeline, investor section (tranches, exit scenarios, use of funds), vision board, and FAQ accordions.
- Fully responsive, `prefers-reduced-motion` respected, no build step required.

## Structure

```
petrus-website/
├── index.html        # All content & sections
├── css/style.css     # Dark glassmorphism design system
└── js/
    ├── three-scene.js  # Scroll-reactive 3D background (Three.js, ES module)
    ├── charts.js       # Chart.js visualizations
    └── main.js         # Nav, reveals, counters, tabs, tilt
```

Libraries are loaded from CDN (Three.js 0.160, GSAP 3.12, Chart.js 4.4) — no npm install needed.

## Run locally

Any static server works:

```bash
cd petrus-website
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy

The site is a plain static bundle — drop it onto any host (GitHub Pages, Netlify, Vercel, Cloudflare Pages, or the petrus-labs.com hosting) as-is.
