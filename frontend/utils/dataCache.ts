import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'fitai_cache_';
const DEFAULT_CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours (for temporary data)
const PERMANENT_CACHE_EXPIRY_MS = Number.MAX_SAFE_INTEGER; // Permanent cache (never expires)

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiryMs: number;
}

export async function cacheUserData(
    userId: string,
    cacheKey: string,
    data: any,
    expiryMs: number = DEFAULT_CACHE_EXPIRY_MS
): Promise<void> {
    try {
        const key = `${CACHE_PREFIX}${userId}_${cacheKey}`;
        const entry: CacheEntry<any> = {
            data,
            timestamp: Date.now(),
            expiryMs,
        };
        await AsyncStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
        console.error('Error caching user data:', error);
    }
}

export async function getCachedUserData<T>(userId: string, cacheKey: string): Promise<T | null> {
    try {
        const key = `${CACHE_PREFIX}${userId}_${cacheKey}`;
        const cached = await AsyncStorage.getItem(key);
        if (!cached) return null;

        const entry: CacheEntry<T> = JSON.parse(cached);
        const now = Date.now();
        const expiryMs = entry.expiryMs || DEFAULT_CACHE_EXPIRY_MS;

        // Check if cache is permanent (never expires) or if it hasn't expired yet
        if (expiryMs === PERMANENT_CACHE_EXPIRY_MS || expiryMs === Number.MAX_SAFE_INTEGER) {
            // Permanent cache - never expires
            return entry.data;
        }

        if (now - entry.timestamp > expiryMs) {
            await AsyncStorage.removeItem(key);
            return null;
        }

        return entry.data;
    } catch (error) {
        console.error('Error getting cached user data:', error);
        return null;
    }
}

export async function invalidateCache(userId: string, cacheKey?: string): Promise<void> {
    try {
        if (cacheKey) {
            // Invalidate specific cache key
            const key = `${CACHE_PREFIX}${userId}_${cacheKey}`;
            await AsyncStorage.removeItem(key);
        } else {
            // Invalidate all caches for this user
            const keys = await AsyncStorage.getAllKeys();
            const userPrefix = `${CACHE_PREFIX}${userId}_`;
            for (const key of keys) {
                if (key.startsWith(userPrefix)) {
                    await AsyncStorage.removeItem(key);
                }
            }
        }
    } catch (error) {
        console.error('Error invalidating cache:', error);
    }
}

export async function clearUserData(userId: string): Promise<void> {
    try {
        const key = `${CACHE_PREFIX}${userId}`;
        await AsyncStorage.removeItem(key);
    } catch (error) {
        console.error('Error clearing user data:', error);
    }
}

export async function checkAndCleanupStorage(userId: string): Promise<void> {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const userCacheKey = `${CACHE_PREFIX}${userId}`;
        
        for (const key of keys) {
            if (key.startsWith(CACHE_PREFIX) && key !== userCacheKey) {
                const cached = await AsyncStorage.getItem(key);
                if (cached) {
                    const entry: CacheEntry<any> = JSON.parse(cached);
                    const now = Date.now();
                    const expiryMs = entry.expiryMs || DEFAULT_CACHE_EXPIRY_MS;
                    // Skip permanent cache entries
                    if (expiryMs !== PERMANENT_CACHE_EXPIRY_MS && expiryMs !== Number.MAX_SAFE_INTEGER) {
                        if (now - entry.timestamp > expiryMs) {
                            await AsyncStorage.removeItem(key);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error checking and cleaning up storage:', error);
    }
}

