/** Plan.md §14.2. 클라이언트가 발급하는 요청 ID는 UUID v4다. */
export function newRequestId(): string {
  return crypto.randomUUID();
}
