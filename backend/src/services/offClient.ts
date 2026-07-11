import { cached } from './cache';
import { logger } from '../logger';

const BASE_URL = process.env.OFF_BASE_URL ?? 'https://world.openfoodfacts.org';
const USER_AGENT = process.env.OFF_USER_AGENT ?? 'Sprout-IngredientScanner-Backend/0.1 (contact: support@example.com)';
const TIMEOUT_MS = 6000;
const MAX_RETRIES = 2;

export class OpenFoodFactsError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'OpenFoodFactsError';
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface OffProductResponse {
  status: number;
  product?: unknown;
}

interface OffSearchResponse {
  products?: unknown[];
}

async function fetchWithRetry(url: string, attempt = 0): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok && response.status >= 500 && attempt < MAX_RETRIES) {
      await sleep(2 ** attempt * 500);
      return fetchWithRetry(url, attempt + 1);
    }
    return response;
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await sleep(2 ** attempt * 500);
      return fetchWithRetry(url, attempt + 1);
    }
    logger.error({ err, url }, 'Open Food Facts request failed after retries');
    throw new OpenFoodFactsError('Open Food Facts request failed after retries', err);
  } finally {
    clearTimeout(timer);
  }
}

export async function getProductByBarcode(barcode: string): Promise<unknown | null> {
  return cached(`barcode:${barcode}`, async () => {
    const url = `${BASE_URL}/api/v2/product/${encodeURIComponent(barcode)}.json`;
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw new OpenFoodFactsError(`Open Food Facts returned ${response.status} for barcode lookup`);
    }
    const body = (await response.json()) as OffProductResponse;
    if (body.status !== 1 || !body.product) return null;
    return body.product;
  });
}

export async function searchProductsByName(query: string, pageSize = 10): Promise<unknown[]> {
  return cached(`search:${query}:${pageSize}`, async () => {
    const params = new URLSearchParams({
      search_terms: query,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: String(pageSize),
    });
    const url = `${BASE_URL}/cgi/search.pl?${params.toString()}`;
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw new OpenFoodFactsError(`Open Food Facts returned ${response.status} for product search`);
    }
    const body = (await response.json()) as OffSearchResponse;
    return body.products ?? [];
  });
}

export async function searchProductsByCategoryAndRegion(
  categoryTag: string,
  countryTag: string,
  pageSize = 20,
): Promise<unknown[]> {
  return cached(`category:${categoryTag}:${countryTag}:${pageSize}`, async () => {
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
    const url = `${BASE_URL}/cgi/search.pl?${params.toString()}`;
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw new OpenFoodFactsError(`Open Food Facts returned ${response.status} for category/region search`);
    }
    const body = (await response.json()) as OffSearchResponse;
    return body.products ?? [];
  });
}
