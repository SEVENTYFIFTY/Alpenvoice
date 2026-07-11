import type { OcrResult } from '../types';
import { OcrFailureError } from '../types';
import { logger } from './logger';

/**
 * Single interface over two OCR engines:
 *  - ML Kit (react-native-vision-camera + @react-native-ml-kit/text-recognition):
 *    on-device, fast, requires a dev-client/EAS build (not Expo Go).
 *  - Tesseract.js: pure JS/WASM fallback that also runs in Expo Go/web,
 *    used when the ML Kit native module isn't available in the current
 *    build, or as a manual retry path if ML Kit returns low confidence.
 * Screens should only ever call `recognizeText`, never the engines directly,
 * so swapping/upgrading an engine never touches screen code.
 */

const LOW_CONFIDENCE_THRESHOLD = 0.4;

async function recognizeWithMlKit(photoUri: string): Promise<OcrResult> {
  // Deferred require: keeps this module importable (and unit-testable)
  // on a JS-only build where the native ML Kit module isn't linked.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const TextRecognition = require('@react-native-ml-kit/text-recognition').default;
  const result = await TextRecognition.recognize(photoUri);
  const text: string = result?.text ?? '';
  // ML Kit doesn't return a single scalar confidence; approximate one
  // from block-level confidences when present, otherwise assume high
  // confidence for non-empty results.
  const blocks = result?.blocks ?? [];
  const confidences = blocks
    .map((b: { confidence?: number }) => b.confidence)
    .filter((c: number | undefined): c is number => typeof c === 'number');
  const confidence = confidences.length
    ? confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length
    : text.trim().length > 0
      ? 0.75
      : 0;
  return { text, engine: 'ml_kit', confidence };
}

async function recognizeWithTesseract(photoUri: string): Promise<OcrResult> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Tesseract = require('tesseract.js');
  const { data } = await Tesseract.recognize(photoUri, 'eng');
  return { text: data?.text ?? '', engine: 'tesseract_js', confidence: (data?.confidence ?? 0) / 100 };
}

export interface RecognizeOptions {
  /** Force a specific engine; otherwise ML Kit is tried first with a Tesseract.js retry on failure/low confidence. */
  preferredEngine?: 'ml_kit' | 'tesseract_js';
}

export async function recognizeText(photoUri: string, options: RecognizeOptions = {}): Promise<OcrResult> {
  const tryEngines = options.preferredEngine === 'tesseract_js'
    ? [recognizeWithTesseract, recognizeWithMlKit]
    : [recognizeWithMlKit, recognizeWithTesseract];

  let lastError: unknown;
  for (const engine of tryEngines) {
    try {
      const result = await engine(photoUri);
      if (result.text.trim().length === 0) {
        logger.warn('OCR engine returned empty text, trying next engine', { engine: result.engine });
        continue;
      }
      if (result.confidence < LOW_CONFIDENCE_THRESHOLD) {
        logger.warn('OCR result below confidence threshold, trying next engine', {
          engine: result.engine,
          confidence: result.confidence,
        });
        continue;
      }
      return result;
    } catch (err) {
      lastError = err;
      logger.warn('OCR engine threw, trying next engine', { error: String(err) });
    }
  }

  throw new OcrFailureError(
    'Could not read the ingredient list. Try holding the camera steadier, moving closer, or improving lighting.',
    lastError,
  );
}
