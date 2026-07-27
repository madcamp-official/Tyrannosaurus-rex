/** Plan.md §14.2. 클라이언트가 발급하는 요청 ID는 UUID v4다. */

/**
 * crypto.randomUUID()는 보안 컨텍스트(HTTPS 또는 localhost)에서만 존재한다.
 * 데스크탑/폰이 LAN IP로 평문 HTTP 접속하는 이 프로젝트 환경에서는 없으므로
 * crypto.getRandomValues(보안 컨텍스트 여부와 무관하게 항상 존재)로 직접 구성한다.
 */
function fallbackUUID(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newRequestId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : fallbackUUID();
}
