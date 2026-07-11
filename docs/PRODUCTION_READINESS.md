# Production-Readiness Checklist

## Error handling

| Scenario | Handled | Where |
|---|---|---|
| Camera permission denied/no device | ✅ | `ScanScreen` — inline prompt/message, no crash |
| OCR engine failure or low-confidence result | ✅ | `ocrService.recognizeText` — auto-falls back to the second engine, then surfaces a friendly `OcrFailureError` |
| Open Food Facts timeout / 5xx | ✅ | `ingredientApi.ts` (client) and `offClient.ts` (backend) — retry with backoff, then degrade to curated fallback rather than failing the scan |
| Backend unreachable | ✅ | Mobile client documented to fall back to calling Open Food Facts directly; logging becomes a no-op instead of blocking the UI (`logger.ts`) |
| Ingredient missing from every source | ✅ | Labeled `unknown`/"not yet in our database" — never defaulted to a risk tier |
| Location permission denied / unsupported region | ✅ | `AlternativesScreen` — explicit messaging, rest of app stays usable |
| Save beyond the 5-product cap | ✅ | `SavedProductLimitError` surfaced as an actionable alert |
| Self-imposed rate limit exceeded | ✅ | `429` from `rateLimiter.ts` with a "please wait" message |
| Malformed `/logs` payload | ✅ | `400` from `logsRouter`, validated level enum + required message string |

## Logging & monitoring

- Backend: structured JSON via `pino`, stdout — pipe to any log aggregator (Datadog, CloudWatch, etc.) without code changes.
- Client: OCR/API/storage failures are caught and sent to `POST /logs` best-effort (never blocks the UI on failure); also mirrored to the console in dev builds.
- Gap: no crash-reporting SDK (Sentry/Bugsnag) wired in yet — recommended before public launch so unhandled exceptions in production are visible; not required for internal MVP testing.

## Testing strategy

**What's covered by automated tests in this repo (all passing in this environment):**
- `mobile/__tests__/ingredientAnalysis.test.ts` — ingredient parsing (nested parens, normalization), match resolution order (API > curated > unmatched), overall risk aggregation, child-flag counting. Run: `cd mobile && npm test`.
- `mobile/__tests__/ingredientApi.test.ts` — Open Food Facts client: success, not-found, 4xx (no retry), 5xx (retry-then-succeed), network failure (retry-then-throw `IngredientApiError`).
- `backend/__tests__/routes.test.ts` — every route's happy path, validation errors, upstream-failure mapping to `502`, and the self-imposed rate limiter tripping to `429`. Run: `cd backend && npm test`. Uses `supertest` against the real Express app with `fetch` mocked — no network calls.

**What is *not* covered here, and needs a real device/simulator:**
- Camera capture and native OCR (ML Kit) behavior — this environment has no iOS/Android simulator or physical device attached.
- React Navigation screen transitions and React Native component rendering (would need `jest-expo` + `@testing-library/react-native` plus native module mocks — not set up here since the priority was proving the analysis/API logic is correct first).
- End-to-end scan → result → alternatives → save → compare flow on-device.

**Recommended before shipping:**
1. `npx expo run:ios` / `run:android` on a real device; manually run the checklist below.
2. Add `@testing-library/react-native` + `jest-expo` for screen-level tests once the UI stabilizes.
3. Add a basic Detox or Maestro E2E flow for the scan → results → alternatives path.

## Manual QA checklist (run on-device before each release)

- [ ] Camera permission prompt appears and works on first launch
- [ ] Scan a real product label in good lighting → correct-looking ingredient list extracted
- [ ] Scan a blurry/curved label → app falls back gracefully, doesn't hang
- [ ] Airplane mode: scan still produces a result via curated fallback, alternatives screen explains it needs a connection/location
- [ ] Save 5 products, confirm the 6th is blocked with a clear message
- [ ] Compare 2–3 saved products side-by-side
- [ ] Launch disclaimer appears once, results-screen disclaimer is always visible
- [ ] Deny location permission → alternatives screen explains rather than crashing

## Documentation

- Product scope & positioning: `docs/PRODUCT_SCOPE.md`
- Architecture & data flow (with error paths): `docs/ARCHITECTURE.md`
- Ingredient database strategy: `docs/INGREDIENT_DATABASE.md`
- Roadmap (MVP vs. Phase 2+): `docs/ROADMAP.md`
- Mobile app setup: `mobile/README.md`
- Backend setup: `backend/README.md`
