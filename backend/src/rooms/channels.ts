/** Plan.md §16.1. Socket.IO 내부 room 이름 규칙 (클라이언트 API에는 노출하지 않는다). */

export function roomChannel(roomCode: string): string {
  return `room:${roomCode}`;
}
export function hostChannel(roomCode: string): string {
  return `host:${roomCode}`;
}
export function teamChannel(roomCode: string, teamId: string): string {
  return `team:${roomCode}:${teamId}`;
}
