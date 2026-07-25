/** Plan.md §7. 티꾸/이름 투표 공통 집계 로직. */

export type VoteTally = Record<string, number>;

export function castVote(votes: Map<string, string>, voterId: string, itemId: string, allowedIds: readonly string[]): boolean {
  if (!allowedIds.includes(itemId)) return false;
  votes.set(voterId, itemId);
  return true;
}

export function tallyVotes(votes: Map<string, string>): VoteTally {
  const counts: VoteTally = {};
  for (const itemId of votes.values()) counts[itemId] = (counts[itemId] ?? 0) + 1;
  return counts;
}

/**
 * 최다 득표 아이템을 고른다. 동률이면 무작위로 하나를 고른다 (§7 "과반이 없으면 서버가
 * 후보 중 무작위 선택"). 투표가 하나도 없으면 전체 후보 중 무작위로 고른다.
 */
export function pickWinner(counts: VoteTally, allowedIds: readonly string[], randomIndex: number): string | null {
  if (allowedIds.length === 0) return null;
  const entries = Object.entries(counts);
  if (entries.length === 0) return allowedIds[randomIndex % allowedIds.length]!;
  const max = Math.max(...entries.map(([, c]) => c));
  const leaders = entries.filter(([, c]) => c === max).map(([id]) => id);
  return leaders[randomIndex % leaders.length]!;
}
