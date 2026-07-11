# Architecture & Data Flow

## End-to-end flow

```
 ┌─────────────┐
 │   Camera     │  react-native-vision-camera preview + shutter
 └──────┬───────┘
        │ photo (local file, never uploaded)
 ┌──────▼───────┐
 │  OCR Service  │  ML Kit (primary) → Tesseract.js (fallback engine)
 └──────┬───────┘
        │ raw ingredient TEXT (photo discarded after this step)
 ┌──────▼──────────────┐
 │ Ingredient Analysis   │  parse → normalize → match against:
 │ (on-device, pure fn)  │    1) API-derived matches (additive tags)
 └──────┬───────────────┘    2) curated fallback dataset
        │                    3) unmatched ("not yet in our database")
 ┌──────▼───────┐
 │   Results     │  Safe / Caution / Avoid + child flags + disclaimer
 └──────┬───────┘
        │ user taps "See healthier alternatives"
 ┌──────▼───────────────┐
 │ Alternatives Service   │  location (opt-in) → category guess →
 │                        │  Open Food Facts category+region search →
 │                        │  re-run analysis on each candidate → rank
 └──────┬────────────────┘
        │ user taps "Save"
 ┌──────▼───────┐
 │ Local Storage │  AsyncStorage, up to 5 saved products, no account
 └──────┬───────┘
        │
 ┌──────▼───────┐
 │  Comparison   │  side-by-side view of saved products
 └───────────────┘
```

## Network calls and what leaves the device

| Step | Leaves the device? | Data sent |
|---|---|---|
| Camera capture → OCR | No | Photo stays local; both ML Kit and Tesseract.js run on-device. |
| Ingredient matching | Only for the API-derived layer | The *product name or barcode* (not the photo) is sent to the backend (or directly to Open Food Facts) to fetch structured additive/category tags. |
| Alternatives | Yes | Category tag + coarse region (country-level, from `expo-location` reverse geocode) — no precise coordinates are sent onward. |
| Save/compare | No | AsyncStorage is local to the device. |
| Error/analytics logs | Yes, best-effort | Log level, message, and non-identifying context (e.g. `{ engine: 'ml_kit' }`) posted to `/logs`. |

## Error paths

| Failure | Where it's caught | User-facing behavior |
|---|---|---|
| Camera permission denied | `ScanScreen` | Inline "Allow camera access" prompt; app usable once granted. |
| No camera device found | `ScanScreen` | Inline message; no crash. |
| OCR: ML Kit throws or returns low-confidence/empty text | `ocrService.recognizeText` | Automatically retries with Tesseract.js before surfacing an error. |
| OCR: both engines fail | `ocrService.recognizeText` → `ScanScreen` | `OcrFailureError` surfaced as an inline banner with retake guidance ("hold steadier," "move closer," "improve lighting"). |
| Open Food Facts unreachable/5xx | `ingredientApi.ts` (client) / `offClient.ts` (backend) | Up to 2 retries with exponential backoff, then the analysis engine silently falls back to the curated dataset — the scan still produces a result, just sourced differently (labeled in the UI). |
| Backend itself unreachable | Mobile client | Falls back to calling Open Food Facts directly (see `docs/PRODUCT_SCOPE.md` §2); logging becomes a no-op rather than blocking the UI. |
| Ingredient not in any source | `ingredientAnalysis.ts` | Labeled "Not yet in our database" (`unknown` tier) — never defaulted to Caution/Avoid, since that would be a guess dressed up as a finding. |
| Location permission denied | `AlternativesScreen` | Explains alternatives need location, no crash, rest of the app still usable. |
| Region not in the supported country map | `AlternativesScreen` | Explicit "we don't yet cover your region" message rather than silently returning irrelevant products. |
| Save beyond the 5-product limit | `storage.ts` → `ResultsScreen` | `SavedProductLimitError` surfaced as an alert asking the user to remove one first. |
| Rate limit exceeded (self-imposed, backend) | `rateLimiter.ts` | `429` with a "please wait a moment" message — protects the shared Open Food Facts quota from a client bug/loop. |

## Why this shape

The pipeline is designed so that the **common path never depends on the network**: OCR and ingredient matching against the curated dataset both work with the phone in airplane mode. The backend and Open Food Facts add breadth (API-sourced additive data, regional alternatives) but their absence degrades the experience rather than breaking it.
