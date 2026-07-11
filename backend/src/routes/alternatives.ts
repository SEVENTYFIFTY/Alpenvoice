import { Router } from 'express';
import { OpenFoodFactsError, searchProductsByCategoryAndRegion } from '../services/offClient';
import { logger } from '../logger';

export const alternativesRouter = Router();

alternativesRouter.get('/', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : '';
  const country = typeof req.query.country === 'string' ? req.query.country : '';
  if (!category || !country) {
    res.status(400).json({
      error: 'invalid_request',
      message: 'Query parameters "category" and "country" are both required.',
    });
    return;
  }
  try {
    const products = await searchProductsByCategoryAndRegion(category, country);
    res.json({ products });
  } catch (err) {
    logger.error({ err }, 'Alternatives lookup failed');
    const status = err instanceof OpenFoodFactsError ? 502 : 500;
    res.status(status).json({
      error: 'upstream_unavailable',
      message: 'Could not load alternatives right now. Please try again shortly.',
    });
  }
});
