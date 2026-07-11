# Sprout — Ingredient Label Scanner

A family-focused mobile app that scans product ingredient labels via camera OCR, analyzes ingredients for health impact, and suggests healthier regional alternatives — positioned explicitly as a consumer-education tool, not a medical device.

- **Product scope & positioning:** [`docs/PRODUCT_SCOPE.md`](docs/PRODUCT_SCOPE.md)
- **Architecture & data flow:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Ingredient database strategy:** [`docs/INGREDIENT_DATABASE.md`](docs/INGREDIENT_DATABASE.md)
- **Roadmap (MVP vs. Phase 2+):** [`docs/ROADMAP.md`](docs/ROADMAP.md)
- **Production-readiness checklist:** [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md)

## Project layout

```
mobile/    React Native (Expo) app — scanning, analysis, results, alternatives, comparison
backend/   Lightweight Node/Express proxy — caching, retries, rate limiting, client logging
docs/      Product scope, architecture, ingredient DB strategy, roadmap, production readiness
```

See `mobile/README.md` and `backend/README.md` for setup and test instructions for each.
