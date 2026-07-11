import { fetchProductByBarcode, searchProductsByName } from '../src/services/ingredientApi';
import { IngredientApiError } from '../src/types';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('fetchProductByBarcode', () => {
  it('returns the product when Open Food Facts finds a match', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      jsonResponse({ status: 1, product: { code: '123', product_name: 'Test Snack' } }),
    );
    const product = await fetchProductByBarcode('123', { fetchImpl });
    expect(product?.product_name).toBe('Test Snack');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('/api/v2/product/123.json');
  });

  it('returns null when Open Food Facts has no match for the barcode', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ status: 0 }));
    const product = await fetchProductByBarcode('000', { fetchImpl });
    expect(product).toBeNull();
  });

  it('throws IngredientApiError on a non-OK response after retries are exhausted', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, false, 404));
    await expect(fetchProductByBarcode('bad', { fetchImpl, timeoutMs: 1000 })).rejects.toThrow(IngredientApiError);
  });

  it('retries on server error then succeeds', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, false, 500))
      .mockResolvedValueOnce(jsonResponse({ status: 1, product: { code: '1', product_name: 'Recovered' } }));
    const product = await fetchProductByBarcode('1', { fetchImpl, timeoutMs: 1000 });
    expect(product?.product_name).toBe('Recovered');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('wraps network failures (e.g. timeout/abort) in IngredientApiError after retries', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('network down'));
    await expect(fetchProductByBarcode('1', { fetchImpl, timeoutMs: 500 })).rejects.toThrow(IngredientApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});

describe('searchProductsByName', () => {
  it('returns an empty array when Open Food Facts returns no products field', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}));
    const results = await searchProductsByName('granola bar', { fetchImpl });
    expect(results).toEqual([]);
  });

  it('passes the query through to the search endpoint', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ products: [] }));
    await searchProductsByName('fruit snacks', { fetchImpl });
    const calledUrl = fetchImpl.mock.calls[0][0] as string;
    expect(calledUrl).toContain('search_terms=fruit');
    expect(calledUrl).toContain('/cgi/search.pl');
  });
});
