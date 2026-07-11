# Feature Roadmap

## MVP (this build) — scanning, analysis, results, alternatives

- [x] Real-time camera capture with visual frame guide (`ScanScreen`)
- [x] On-device OCR (ML Kit primary, Tesseract.js fallback) with automatic engine fallback on low confidence/failure
- [x] Ingredient parsing that handles nested parenthetical sub-ingredients
- [x] Ingredient matching: API-derived (Open Food Facts additive tags) → curated fallback → honestly-labeled "not yet in our database"
- [x] Safe/Caution/Avoid results with per-ingredient source + child-specific flags
- [x] Persistent (non-dismiss-once) non-medical disclaimer on launch and results
- [x] Region-filtered alternative suggestions with "why this alternative" reasons, no live-inventory claims
- [x] Save up to 5 products locally (no accounts) and compare them side-by-side
- [x] Error handling: OCR failure, API timeout/5xx, missing ingredient, permission denials, rate limiting
- [x] Backend proxy: caching, retry/backoff, self-imposed rate limit, best-effort client logging

## Phase 2 — accounts & coverage

- [ ] Optional user accounts (Firebase Auth or Supabase Auth); sync the existing local storage schema to the cloud rather than redesigning it
- [ ] Barcode scan as a faster alternate input path alongside label-text OCR
- [ ] Expand the curated dataset using the `/logs`-reported "ingredient not found" gaps
- [ ] Multi-frame capture / image preprocessing to improve OCR accuracy on curved or glossy labels
- [ ] USDA FoodData Central integration as a secondary source for US nutrient detail

**Explicitly out of scope, not just deferred:** health-condition profiles or any personalization keyed to a named medical condition (e.g. "flag ingredients unsafe for my child's eczema"). This stays out indefinitely — it's the line between a consumer-education tool and a regulated medical device, not a Phase 3 nice-to-have.

## Phase 3 — real store integration

- [ ] Contracted retailer/store APIs for live availability and pricing where available
- [ ] "Preferred store" becomes an actual inventory filter instead of a user-set label
- [ ] Price-range display alongside alternatives

## Phase 4 — scale

- [ ] Additional markets/languages (both OCR language packs and the curated dataset's regional relevance)
- [ ] Ingredient-source transparency dashboard (which % of a given scan came from API vs. curated vs. unmatched)
- [ ] Formal per-market regulatory re-review (FTC/FDA in the US, Regulation (EC) 1924/2006 + MDR boundary in the EU) before expanding claims or markets
- [ ] Advisory board (nutrition/toxicology) for ongoing curated-dataset review
