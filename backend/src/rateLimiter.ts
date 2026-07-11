import type { NextFunction, Request, Response } from 'express';

/**
 * Open Food Facts doesn't publish a hard rate limit for the read API,
 * but asks integrators to cache aggressively and avoid hammering it.
 * This is a self-imposed per-IP limit so Sprout stays a good API
 * citizen even if a client bug causes a request loop.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;

const requestLog = new Map<string, number[]>();

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({
      error: 'rate_limited',
      message: 'Too many requests. Please wait a moment and try again.',
    });
    return;
  }

  timestamps.push(now);
  requestLog.set(ip, timestamps);
  next();
}
