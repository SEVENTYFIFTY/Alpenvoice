# Ingredient Database Strategy

## Why API-first, not a proprietary database

Standing up and maintaining a proprietary ingredient-safety database is a multi-month, ongoing-review effort (see the earlier hybrid proposal in git history for that version of the plan). For an MVP, the confirmed direction is to lean on an existing free/open API and cover the gaps with a small, honestly-labeled curated fallback — see `docs/PRODUCT_SCOPE.md` §4 for the summary and the reasoning.

## Primary source: Open Food Facts

- **Base URL**: `https://world.openfoodfacts.org`
- **Auth**: none required. Requests must send a descriptive `User-Agent` per Open Food Facts' usage guidelines (`Sprout-IngredientScanner/<version> (contact: <email>)`).
- **Endpoints used**:
  - `GET /api/v2/product/{barcode}.json` — barcode lookup. Returns `status: 1` + `product` on a match, `status: 0` otherwise.
  - `GET /cgi/search.pl?search_terms=&search_simple=1&action=process&json=1&page_size=` — free-text product search, used to cross-reference a scanned label by product name.
  - `GET /cgi/search.pl?tagtype_0=categories&tag_0=&tagtype_1=countries&tag_1=&json=1` — category + country-tag filtered search, backing the alternatives feature.
- **Fields consumed**: `ingredients_text`, `additives_tags` (E-number tags, e.g. `en:e129`), `ingredients_analysis_tags` (e.g. `en:palm-oil-free`), `categories_tags`, `countries_tags`, `product_name`, `image_url`.
- **What it does *not* give us**: a health-risk score. Open Food Facts is a composition/labeling database. The E-number → common-name → risk-tier mapping (`mobile/src/services/additiveTags.ts`) and the curated fallback dataset are what actually carry the Safe/Caution/Avoid judgment.
- **Rate limits**: Open Food Facts does not publish a hard numeric limit for the read API, but asks integrators to cache and avoid excessive polling. Both the mobile client and backend apply exponential-backoff retries (2 retries, 500ms/1000ms) on 5xx responses, and the backend self-imposes a 30 requests/minute/IP cap (`backend/src/rateLimiter.ts`) so a client bug can't hammer the upstream API.

## Secondary source: USDA FoodData Central

Called out in the confirmed direction as a secondary source for US packaged-food nutrient detail. Not wired into MVP code yet — the client/backend architecture (`ingredientApi.ts` / `offClient.ts`) is structured so adding a second source is a new module with the same `fetchWithRetry` pattern, not a rewrite. Requires a free API key (`api.nal.usda.gov`), unlike Open Food Facts.

## Considered and deferred: Nutritionix

Nutritionix has a strong natural-language ingredient parser but requires a paid API key beyond a very limited free tier. Deferred past MVP; revisit if OCR-to-ingredient parsing accuracy against Open Food Facts' raw text proves insufficient.

## Curated fallback dataset

`mobile/src/data/curatedIngredients.ts` ships ~50 of the most common food ingredients relevant to a family/child health lens (artificial dyes, common preservatives, added sugar, common allergens, and some clearly beneficial ingredients like fiber/vitamins, for balance — the app should show what's good, not only what's concerning). Every entry:

- Has a plain-language `summary` and, where relevant, a `childConcern` note.
- Is tagged `source: 'curated_fallback'` — the UI always shows this label distinctly from `open_food_facts`, so a fallback match is never presented as if it were a live, authoritative API result.

## Resolution order (implemented in `ingredientAnalysis.ts`)

1. **API-derived match** — if the scanned product was identified against Open Food Facts and its `additives_tags` map to a known E-number in `additiveTags.ts`, that wins.
2. **Curated fallback** — if no API match, look up the normalized ingredient name in `curatedIngredients.ts`.
3. **Unmatched** — if neither has it, the ingredient is shown as `unknown` risk tier with "Not yet in our database" — never guessed at, never defaulted to a risk level. A "report this ingredient" action logs the gap via `/logs` for the next curated-list update.

## Handling a missing/unreachable API

If Open Food Facts times out or 5xxs after retries, `ingredientAnalysis.analyzeIngredientText` still runs — it just has no `apiMatches` map to consult, so every ingredient falls through to curated-fallback-or-unmatched. The scan still produces a usable result; it just leans more heavily on the bundled dataset, and the source labels reflect that honestly.
