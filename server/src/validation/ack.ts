/** Plan.md §14.3. 성공/실패 acknowledgement 생성 헬퍼. */

import type { Ack, ApiError, ErrorCode, RequestId } from "@trex/shared";

export function ackOk<T>(requestId: RequestId, data: T): Ack<T> {
  return { ok: true, requestId, serverTime: Date.now(), data };
}

/**
 * 실패 acknowledgement는 T에 의존하지 않으므로 제네릭 없이 ok:false 모양만 반환한다.
 * 이 모양은 어떤 Ack<T>의 ok:false 멤버와도 구조적으로 일치해 그대로 대입할 수 있다.
 */
export function ackErr(
  requestId: RequestId,
  code: ErrorCode,
  message: string,
  retryable: boolean,
  details?: Record<string, unknown>,
): Extract<Ack<never>, { ok: false }> {
  const error: ApiError = { code, message, retryable, details };
  return { ok: false, requestId, serverTime: Date.now(), error };
}
