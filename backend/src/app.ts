import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ingredientsRouter } from './routes/ingredients';
import { alternativesRouter } from './routes/alternatives';
import { logsRouter } from './routes/logs';
import { rateLimit } from './rateLimiter';
import { logger } from './logger';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/ingredients', rateLimit, ingredientsRouter);
  app.use('/alternatives', rateLimit, alternativesRouter);
  app.use('/logs', logsRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'not_found', message: 'No such route.' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
  });

  return app;
}
