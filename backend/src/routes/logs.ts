import { Router } from 'express';
import { logger } from '../logger';

export const logsRouter = Router();

const VALID_LEVELS = new Set(['info', 'warn', 'error']);

logsRouter.post('/', (req, res) => {
  const { level, message, context, timestamp } = req.body ?? {};

  if (typeof message !== 'string' || !VALID_LEVELS.has(level)) {
    res.status(400).json({
      error: 'invalid_request',
      message: 'Body must include a valid "level" (info|warn|error) and a string "message".',
    });
    return;
  }

  logger[level as 'info' | 'warn' | 'error']({ context, clientTimestamp: timestamp, source: 'mobile-client' }, message);
  res.status(202).json({ received: true });
});
