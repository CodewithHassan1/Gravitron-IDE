// src/services/quickInput/QuickInputCache.ts
import { QuickInputTelemetry } from './QuickInputTelemetry';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class QuickInputCacheImpl {
  private providerCache = new Map<string, CacheEntry<any>>();
  private searchCache = new Map<string, CacheEntry<any>>();
  private mruList = new Map<string, string[]>(); // providerId -> mru Item IDs
  private DEFAULT_TTL = 60000; // 1 minute

  get<T>(key: string, type: 'provider' | 'search', ttl: number = this.DEFAULT_TTL): T | null {
    const cacheMap = type === 'provider' ? this.providerCache : this.searchCache;
    const entry = cacheMap.get(key);

    if (entry) {
      if (performance.now() - entry.timestamp <= ttl) {
        QuickInputTelemetry.trackCacheHit(true);
        return entry.data as T;
      } else {
        cacheMap.delete(key); // TTL expired
      }
    }

    QuickInputTelemetry.trackCacheHit(false);
    return null;
  }

  set<T>(key: string, data: T, type: 'provider' | 'search') {
    const cacheMap = type === 'provider' ? this.providerCache : this.searchCache;
    cacheMap.set(key, { data, timestamp: performance.now() });
  }

  invalidate(key: string, type?: 'provider' | 'search') {
    if (!type || type === 'provider') this.providerCache.delete(key);
    if (!type || type === 'search') this.searchCache.delete(key);
  }

  clear() {
    this.providerCache.clear();
    this.searchCache.clear();
  }

  // MRU Logic
  addMru(providerId: string, itemId: string) {
    let mru = this.mruList.get(providerId) || [];
    mru = [itemId, ...mru.filter((id) => id !== itemId)].slice(0, 100);
    this.mruList.set(providerId, mru);
  }

  getMru(providerId: string): string[] {
    return this.mruList.get(providerId) || [];
  }
}

export const QuickInputCache = new QuickInputCacheImpl();
