const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

export function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}

export function cacheSet(key, data, ttlMs = TTL_MS) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheClearByPrefix(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function cacheKey(userId, query, ...params) {
  return `bsync:${userId}:${query}:${params.join(":")}`;
}
