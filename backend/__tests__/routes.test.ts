import request from 'supertest';
import { createApp } from '../src/app';
import { clearCache } from '../src/services/cache';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: async () => body } as Response);
}

const app = createApp();

beforeEach(() => {
  clearCache();
  global.fetch = jest.fn() as unknown as typeof fetch;
});

describe('GET /health', () => {
  it('reports ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /ingredients/barcode/:code', () => {
  it('returns the product on a successful lookup', async () => {
    (global.fetch as jest.Mock).mockReturnValue(
      jsonResponse({ status: 1, product: { code: 'abc1', product_name: 'Test Snack' } }),
    );
    const res = await request(app).get('/ingredients/barcode/abc1');
    expect(res.status).toBe(200);
    expect(res.body.product.product_name).toBe('Test Snack');
  });

  it('returns 404 when Open Food Facts has no match', async () => {
    (global.fetch as jest.Mock).mockReturnValue(jsonResponse({ status: 0 }));
    const res = await request(app).get('/ingredients/barcode/missing1');
    expect(res.status).toBe(404);
  });

  it('returns 502 with a friendly message when the upstream API is unreachable', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    const res = await request(app).get('/ingredients/barcode/unreachable1');
    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/try again/i);
  }, 10000);
});

describe('GET /ingredients/search', () => {
  it('requires a query parameter', async () => {
    const res = await request(app).get('/ingredients/search');
    expect(res.status).toBe(400);
  });

  it('returns products for a valid query', async () => {
    (global.fetch as jest.Mock).mockReturnValue(jsonResponse({ products: [{ code: '1' }] }));
    const res = await request(app).get('/ingredients/search').query({ q: 'granola' });
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
  });
});

describe('GET /alternatives', () => {
  it('requires both category and country', async () => {
    const res = await request(app).get('/alternatives').query({ category: 'en:snacks' });
    expect(res.status).toBe(400);
  });

  it('returns products for valid category/country', async () => {
    (global.fetch as jest.Mock).mockReturnValue(jsonResponse({ products: [{ code: '2' }] }));
    const res = await request(app)
      .get('/alternatives')
      .query({ category: 'en:snacks', country: 'en:united-states' });
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(1);
  });
});

describe('POST /logs', () => {
  it('rejects an invalid level', async () => {
    const res = await request(app).post('/logs').send({ level: 'debug', message: 'hi' });
    expect(res.status).toBe(400);
  });

  it('accepts a well-formed log event', async () => {
    const res = await request(app).post('/logs').send({ level: 'error', message: 'OCR failed', context: { engine: 'ml_kit' } });
    expect(res.status).toBe(202);
  });
});

describe('rate limiting', () => {
  it('eventually returns 429 after repeated requests from the same client', async () => {
    (global.fetch as jest.Mock).mockReturnValue(jsonResponse({ products: [] }));
    let sawRateLimit = false;
    for (let i = 0; i < 40; i += 1) {
      const res = await request(app).get('/ingredients/search').query({ q: `item-${i}` });
      if (res.status === 429) {
        sawRateLimit = true;
        break;
      }
    }
    expect(sawRateLimit).toBe(true);
  }, 20000);
});
