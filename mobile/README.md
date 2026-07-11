# Sprout — mobile app (MVP)

React Native + Expo app that scans ingredient labels, analyzes them for family/child-relevant risk, and suggests healthier regional alternatives. See `../docs/PRODUCT_SCOPE.md` for the full product scope.

## Why this isn't Expo Go

`react-native-vision-camera` and `@react-native-ml-kit/text-recognition` are native modules, so this project runs as an **Expo dev client / EAS build**, not plain Expo Go.

```bash
npm install
npx expo prebuild
npx expo run:ios      # or: npx expo run:android
```

During development without a native build (e.g. quick UI iteration), the OCR service falls back to `tesseract.js`, which does run in Expo Go — pass `{ preferredEngine: 'tesseract_js' }` to `recognizeText` if you want to force that path.

## Environment

Set `EXPO_PUBLIC_API_BASE_URL` to point at the backend (see `../backend/README.md`) for caching and error logging. The app works without it — it falls back to calling Open Food Facts directly and simply skips remote logging.

## Testing

Only the framework-agnostic logic layer is covered by automated tests in this environment (no device/simulator available here to exercise the camera, OCR, or navigation):

```bash
npm test
```

Covers: ingredient parsing/scoring (`src/services/ingredientAnalysis.ts`) and the Open Food Facts client's success/error/timeout paths (`src/services/ingredientApi.ts`). Screens, camera capture, and native OCR integration need to be exercised on a real device/simulator — see `../docs/PRODUCTION_READINESS.md` for the manual QA checklist.

## Project layout

```
src/
  types/            shared TypeScript types
  data/              curatedIngredients.ts — bundled fallback dataset
  services/          ocrService, ingredientApi, ingredientAnalysis,
                      additiveTags, alternativesService, storage, logger
  navigation/        React Navigation stack + route param types
  screens/           Scan, Results, Alternatives, Comparison
  components/        RiskBadge, Disclaimer
```
