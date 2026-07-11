import { LRUCache } from 'lru-cache';

/**
 * Single process-local cache for Open Food Facts responses. Sized and
 * TTL'd conservatively for MVP; if the backend ever runs as more than
 * one instance, this needs to move to Redis (see docs/PRODUCT_SCOPE.md §2).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new LRUCache<string, any>({
  max: 2000,
  ttl: 1000 * 60 * 30, // 30 minutes — product/ingredient data doesn't change fast enough to need fresher reads.
});

export async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit !== undefined) return hit as T;
  const value = await compute();
  cache.set(key, value);
  return value;
}

export function clearCache(): void {
  cache.clear();
}
