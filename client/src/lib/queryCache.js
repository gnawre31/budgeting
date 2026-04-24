const TTL_MS = 5 * 60 * 1000; // 5 minutes

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

export function cacheSet(key, data, ttlMs = TTL_MS) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, expiresAt: Date.now() + ttlMs }));
  } catch { /* storage full */ }
}

export function cacheClearByPrefix(prefix) {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(prefix))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* unavailable */ }
}

export function cacheKey(userId, query, ...params) {
  return `bsync:${userId}:${query}:${params.join(':')}`;
}

