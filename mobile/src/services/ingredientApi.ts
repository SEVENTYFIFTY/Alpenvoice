import type { OpenFoodFactsProduct } from '../types';
import { IngredientApiError } from '../types';

/**
 * Open Food Facts is a composition/labeling database (ingredients text,
 * additive tags, allergen tags, NOVA processing group) — it does not
 * itself provide a health-risk score per ingredient. The analysis engine
 * (ingredientAnalysis.ts) combines these structured tags with the app's
 * curated fallback dataset to produce the Safe/Caution/Avoid judgment.
 * See docs/INGREDIENT_DATABASE.md for the full endpoint reference.
 */

const DEFAULT_BASE_URL = 'https://world.openfoodfacts.org';
const DEFAULT_USER_AGENT = 'Sprout-IngredientScanner/0.1 (contact: support@example.com)';
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RETRIES = 2;

export interface IngredientApiConfig {
  baseUrl?: string;
  userAgent?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function resolveConfig(config: IngredientApiConfig = {}) {
  return {
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
    userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fetchImpl: config.fetchImpl ?? fetch,
  };
}

async function fetchWithRetry(
  url: string,
  config: Required<IngredientApiConfig>,
  attempt = 0,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await config.fetchImpl(url, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok && response.status >= 500 && attempt < MAX_RETRIES) {
      await sleep(2 ** attempt * 500);
      return fetchWithRetry(url, config, attempt + 1);
    }
    return response;
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await sleep(2 ** attempt * 500);
      return fetchWithRetry(url, config, attempt + 1);
    }
    throw new IngredientApiError('Open Food Facts request failed after retries', err);
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GET /api/v2/product/{barcode}.json — used when the user scans a barcode instead of (or in addition to) the label text. */
export async function fetchProductByBarcode(
  barcode: string,
  config?: IngredientApiConfig,
): Promise<OpenFoodFactsProduct | null> {
  const resolved = resolveConfig(config);
  const url = `${resolved.baseUrl}/api/v2/product/${encodeURIComponent(barcode)}.json`;
  const response = await fetchWithRetry(url, resolved);
  if (!response.ok) {
    throw new IngredientApiError(`Open Food Facts returned ${response.status} for barcode lookup`);
  }
  const body = await response.json();
  if (body.status !== 1 || !body.product) return null;
  return body.product as OpenFoodFactsProduct;
}

/** GET /cgi/search.pl — free-text product search, used to cross-reference a scanned label by product name. */
export async function searchProductsByName(
  query: string,
  config?: IngredientApiConfig,
  pageSize = 10,
): Promise<OpenFoodFactsProduct[]> {
  const resolved = resolveConfig(config);
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(pageSize),
  });
  const url = `${resolved.baseUrl}/cgi/search.pl?${params.toString()}`;
  const response = await fetchWithRetry(url, resolved);
  if (!response.ok) {
    throw new IngredientApiError(`Open Food Facts returned ${response.status} for product search`);
  }
  const body = await response.json();
  return (body.products ?? []) as OpenFoodFactsProduct[];
}

/**
 * GET /cgi/search.pl filtered by category + country tag — backs the
 * "alternatives in your region" feature. No live inventory/pricing;
 * this only reflects what's catalogued in Open Food Facts for that
 * market, which is why the UI must say "commonly available" rather
 * than "in stock."
 */
export async function searchProductsByCategoryAndRegion(
  categoryTag: string,
  countryTag: string,
  config?: IngredientApiConfig,
  pageSize = 20,
): Promise<OpenFoodFactsProduct[]> {
  const resolved = resolveConfig(config);
  const params = new URLSearchParams({
    tagtype_0: 'categories',
    tag_contains_0: 'contains',
    tag_0: categoryTag,
    tagtype_1: 'countries',
    tag_contains_1: 'contains',
    tag_1: countryTag,
    json: '1',
    page_size: String(pageSize),
  });
  const url = `${resolved.baseUrl}/cgi/search.pl?${params.toString()}`;
  const response = await fetchWithRetry(url, resolved);
  if (!response.ok) {
    throw new IngredientApiError(`Open Food Facts returned ${response.status} for category/region search`);
  }
  const body = await response.json();
  return (body.products ?? []) as OpenFoodFactsProduct[];
}
