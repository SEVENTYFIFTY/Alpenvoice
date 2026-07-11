# Ingredient Label Scanner — Product & Technical Scope

Working name used throughout this doc: **Sprout**. A family-focused mobile app that scans product ingredient labels and explains, in plain language, what's inside — positioned explicitly as a consumer-education tool, never a medical device.

## 1. Positioning & guardrails (read this first)

Everything below is designed around one constraint: **Sprout informs, it does not diagnose.**

- No claims of preventing, treating, or diagnosing any condition (this is what separates a "wellness/education" app from a regulated medical device under FDA/EU MDR rules).
- No personalization based on a named health condition ("safe for my child's eczema"). Personalization is limited to non-medical preferences the user sets themselves (e.g., "flag artificial dyes," "flag added sugar") — never diagnosis-driven filtering.
- Every result screen carries a persistent, non-dismissible-on-first-view disclaimer: *"Sprout provides general consumer information, not medical advice. Talk to a pediatrician or healthcare provider about specific health conditions or allergies."*
- All ingredient risk data is sourced from named sources — Open Food Facts, USDA FoodData Central, or the app's own curated fallback list — with the source visibly labeled per ingredient — trust comes from transparency, not authority claims.
- Legal review checkpoint before public launch in each target market (US: FTC health-claim rules + FDA device classification boundary; EU: Regulation (EC) 1924/2006 on nutrition/health claims + MDR device boundary).

## 2. Tech stack (MVP)

| Layer | Choice | Why |
|---|---|---|
| Mobile | **React Native (Expo bare/dev-client workflow)**, TypeScript | One codebase for iOS + Android. Camera OCR native modules mean this runs as an Expo **dev client / EAS build**, not Expo Go. |
| On-device OCR | **react-native-vision-camera** + **ML Kit Text Recognition** (`@react-native-ml-kit/text-recognition`), wrapped behind one `ocrService` interface | Free, offline, fast (<1s), no image or text leaves the device for the common case. |
| OCR fallback | **Tesseract.js** (pure JS/WASM) behind the same `ocrService` interface | No native build required, so it also runs in Expo Go / web preview during development, and acts as a degrade path if the ML Kit native module isn't available on a given build. Slower and less accurate on curved/glossy labels — not the primary path for production. |
| Ingredient data | **Open Food Facts** public API (primary) — free, no key required, global, ingredient + additive data included per product; **USDA FoodData Central** as a secondary source for US packaged-food nutrient detail; **Nutritionix** considered but requires paid API key beyond free tier, so deferred past MVP. See §4. | Avoids building a proprietary database before the product is validated; documented fallback covers gaps. |
| Backend | **Node.js + Express**, TypeScript | Thin proxy: caches Open Food Facts responses, applies backoff/retry, and collects error/analytics logs. Not a system of record — the client can also call Open Food Facts directly if the backend is unavailable (documented fallback in §4). |
| Cache | In-memory LRU (`lru-cache`) in the backend process for MVP; revisit Redis only once traffic justifies a shared cache across multiple backend instances. | Keeps MVP infra to a single deployable service. |
| Data storage (client) | **AsyncStorage** on-device — saved scans and comparison set (3–5 products), no user accounts for MVP. | Matches the "no auth for MVP" requirement; documented upgrade path to cloud sync in §6. |
| Location/store data | Device geolocation (`expo-location`, opt-in) + Open Food Facts' region/country tagging on products, used to filter the alternatives list to the user's market. No live retailer inventory in MVP — see §5 for the honesty constraint this implies. | Avoids promising real-time in-stock data the free API can't back up. |
| Logging/monitoring | Backend logs structured JSON (pino) to stdout, shippable to any log aggregator later; client OCR/API failures are caught and sent to the backend's `/logs` endpoint (best-effort, never blocking the UI). | Lean but real error visibility from day one. |

### Cloud-sync upgrade path (post-MVP)
Local-only storage means saved scans don't survive a reinstall or move between devices. Phase 2 adds optional accounts (Firebase Auth or Supabase Auth) and syncs the same AsyncStorage records to a per-user table — the local storage schema is designed now so that step is a sync layer, not a rewrite (see `mobile/src/services/storage.ts`).

## 3. Architecture

Full data-flow diagram with error paths lives in `docs/ARCHITECTURE.md`. Summary:

```
┌────────────────────────────┐
│      Mobile App (RN)        │
│  Camera → OCR (on-device)   │
│  → Analysis → Results       │
│  → Alternatives → Compare   │
└──────────────┬───────────────┘
               │ HTTPS
               │ (raw ingredient TEXT only — never the photo)
┌──────────────▼───────────────┐
│   Backend (Node/Express)      │
│  - GET /ingredients/:query    │──► Open Food Facts API (cached, LRU)
│  - GET /alternatives          │──► Open Food Facts (region-filtered)
│  - POST /logs                 │      (fallback: USDA FoodData Central)
└───────────────────────────────┘

Client falls back to calling Open Food Facts directly if the
backend is unreachable; analysis engine falls back to the bundled
curated dataset if Open Food Facts has no match for a given
ingredient (see docs/INGREDIENT_DATABASE.md).

On-device only, no network round trip:
  - OCR (ML Kit primary, Tesseract.js fallback)
  - Ingredient parsing + scoring (pure functions, unit tested)
  - Saved/compared products (AsyncStorage)
```

Most of the pipeline runs on-device: OCR runs locally, and only the extracted **text** (not the photo) is ever sent to the backend/API — minimizes what leaves the device and keeps the common path fast.

## 4. Ingredient database approach: API-first with a curated fallback

Per the confirmed direction, MVP does **not** stand up a proprietary ingredient database. Full API documentation (endpoints, fields used, rate limits) is in `docs/INGREDIENT_DATABASE.md`; summary:

1. **Open Food Facts is the primary source** — free, no API key, global coverage, returns `ingredients_text`, `additives_tags`, `ingredients_analysis_tags` (e.g., palm-oil-free, vegan) per product. Used both to cross-check OCR'd ingredient lists and to look up individual ingredients/additives.
2. **USDA FoodData Central is a secondary source** for US packaged foods where Open Food Facts lacks nutrient detail — used to enrich, not replace, the Open Food Facts result.
3. **Curated fallback dataset ships inside the app** (`mobile/src/data/curatedIngredients.ts`) — roughly 60 of the most common ingredients of concern (artificial dyes, high-fructose corn syrup, certain preservatives, common allergens) with a plain-language summary, risk tier, and a child-specific flag. This is what the analysis engine falls back to when: (a) Open Food Facts has no match for a parsed ingredient name, or (b) the API is unreachable/times out. The UI always labels which source produced a given ingredient's info, so a curated-fallback result never gets silently presented as if it were an authoritative API match.
4. **Unknown ingredient handling**: if neither source matches, the ingredient is shown as "Not yet in our database" (neutral, not defaulted to Caution/Avoid) with a "report this ingredient" action — never guessed at.
5. **Feedback loop**: user-flagged corrections are logged via the backend `/logs` endpoint for later review; this is the seed of the Phase 2 curated-core expansion.

## 5. Location/store-aware alternatives

- MVP: user opts into device location (`expo-location`); alternatives are Open Food Facts products in the same category tag, filtered to the user's `countries_tags`/region, ranked by fewer flagged ingredients than the scanned product. **No live retailer inventory or pricing** — the free data source can't back that up, so the UI says "commonly available in your region," never "in stock at [store]," to avoid a false-availability claim.
- Optional "preferred store" is a user-set label attached to saved products for their own reference in MVP, not a live inventory filter — wiring an actual store/retailer API is called out explicitly as Phase 3 in the roadmap once one is contracted.
- Every alternative shows *why* it's suggested (e.g., "no artificial dyes, 2 fewer flagged ingredients") rather than an unexplained "healthier" label.

## 6. Roadmap

Full checklist-style breakdown in `docs/ROADMAP.md`. Summary:

**MVP (this build)**
Real-time camera scan → on-device OCR → Open Food Facts lookup with curated-fallback → Safe/Caution/Avoid results with child-specific flags → region-filtered alternatives (no live inventory) → save/compare up to 5 products locally, no accounts → disclaimers on launch and results → error handling for OCR failure, API timeout, and missing-ingredient cases.

**Phase 2 — Accounts & coverage**
Optional user accounts (Firebase/Supabase Auth) with cloud sync of the same local storage schema; barcode scan as a faster alternate input path; expanded curated dataset informed by user feedback/corrections; multi-frame capture to improve OCR accuracy on curved/glossy labels.

**Explicitly out of scope, not just deferred:** health-condition profiles or any personalization keyed to a named medical condition — stays out indefinitely per the non-medical-device positioning.

**Phase 3 — Real store integration**
Contracted retailer/store APIs for live availability and pricing where available; "preferred store" becomes a real inventory filter instead of a label.

**Phase 4 — Scale**
Additional markets/languages, ingredient-source transparency dashboard, formal per-market regulatory re-review, advisory board for ongoing content review.

## 7. UX principles

- **Speed**: on-device OCR + cached ingredient lookups keep the scan-to-result path under ~2s for common products.
- **Clarity**: three-tier traffic-light system (green/amber/red) paired with icon + text label, never color alone (accessibility, colorblind users) — concerning ingredients surface first, not buried in a full list.
- **Trust**: every ingredient tappable to its source and last-reviewed date; disclaimer persistent, not a one-time modal.
- **Child focus**: a distinct "for children" flag layer, separate from the general risk tier, since something can be broadly fine but worth a second look for a toddler.
- **Responsible framing**: results screen and onboarding both state plainly that the app is informational and that a healthcare provider is the right resource for anything condition-specific.

See the accompanying wireframe artifact for the camera → loading → results → alternatives → comparison screen flow, and `docs/PRODUCTION_READINESS.md` for the error-handling, logging, and testing checklist.
