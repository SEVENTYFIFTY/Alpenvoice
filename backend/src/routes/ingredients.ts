import { Router } from 'express';
import { getProductByBarcode, OpenFoodFactsError, searchProductsByName } from '../services/offClient';
import { logger } from '../logger';

export const ingredientsRouter = Router();

ingredientsRouter.get('/barcode/:code', async (req, res) => {
  try {
    const product = await getProductByBarcode(req.params.code);
    if (!product) {
      res.status(404).json({ error: 'not_found', message: 'No product found for this barcode.' });
      return;
    }
    res.json({ product });
  } catch (err) {
    logger.error({ err }, 'Barcode lookup failed');
    const status = err instanceof OpenFoodFactsError ? 502 : 500;
    res.status(status).json({
      error: 'upstream_unavailable',
      message: 'Could not reach the ingredient database right now. Please try again shortly.',
    });
  }
});

ingredientsRouter.get('/search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query) {
    res.status(400).json({ error: 'invalid_request', message: 'Query parameter "q" is required.' });
    return;
  }
  try {
    const products = await searchProductsByName(query);
    res.json({ products });
  } catch (err) {
    logger.error({ err }, 'Product search failed');
    const status = err instanceof OpenFoodFactsError ? 502 : 500;
    res.status(status).json({
      error: 'upstream_unavailable',
      message: 'Could not reach the ingredient database right now. Please try again shortly.',
    });
  }
});
