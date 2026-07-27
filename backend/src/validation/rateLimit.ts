/** Plan.md §20. 소켓·이벤트별 token bucket 속도 제한. */

type Bucket = { tokens: number; lastRefillMs: number };

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {}

  /** 토큰이 있으면 소비하고 true를 반환한다. 없으면 false. */
  tryConsume(key: string, now: number = Date.now()): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefillMs: now };
      this.buckets.set(key, bucket);
    }
    const elapsedSec = Math.max(0, now - bucket.lastRefillMs) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSecond);
    bucket.lastRefillMs = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  dropKey(key: string): void {
    this.buckets.delete(key);
  }
}
