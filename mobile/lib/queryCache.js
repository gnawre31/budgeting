import AsyncStorage from '@react-native-async-storage/async-storage';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function cacheGet(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { data, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function cacheSet(key, data, ttlMs = TTL_MS) {
  try {
    await AsyncStorage.setItem(
      key,
      JSON.stringify({ data, expiresAt: Date.now() + ttlMs })
    );
  } catch {
    // storage full or unavailable — non-fatal
  }
}

export async function cacheClearByPrefix(prefix) {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const matching = keys.filter((k) => k.startsWith(prefix));
    if (matching.length > 0) await AsyncStorage.multiRemove(matching);
  } catch {
    // non-fatal
  }
}

export function cacheKey(userId, query, ...params) {
  return `bsync:${userId}:${query}:${params.join(':')}`;
}
