/** Plan.md §14.3. 소켓별 최근 requestId acknowledgement 캐시. 재실행 없이 동일 응답을 반환한다. */

import { REQUEST_ID_CACHE_MAX_ENTRIES, REQUEST_ID_CACHE_TTL_MS, type Ack } from "@trex/shared";

type CacheEntry = { ack: Ack<unknown>; cachedAt: number };

export class IdempotencyCache {
  private readonly bySocket = new Map<string, Map<string, CacheEntry>>();

  get<T>(socketId: string, requestId: string): Ack<T> | undefined {
    const entries = this.bySocket.get(socketId);
    const entry = entries?.get(requestId);
    if (!entry) return undefined;
    if (Date.now() - entry.cachedAt > REQUEST_ID_CACHE_TTL_MS) {
      entries?.delete(requestId);
      return undefined;
    }
    return entry.ack as Ack<T>;
  }

  set(socketId: string, requestId: string, ack: Ack<unknown>): void {
    let entries = this.bySocket.get(socketId);
    if (!entries) {
      entries = new Map();
      this.bySocket.set(socketId, entries);
    }
    entries.set(requestId, { ack, cachedAt: Date.now() });
    while (entries.size > REQUEST_ID_CACHE_MAX_ENTRIES) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  }

  dropSocket(socketId: string): void {
    this.bySocket.delete(socketId);
  }
}
