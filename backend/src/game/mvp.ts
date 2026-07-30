/** Plan.md §2.3, §5.1. 개인 MVP 1~3위: 발굴 기여·다이노런 클리어·사격 명중을 가중 합산한다. */

import {
  MVP_TOP_COUNT,
  type MvpEntry,
  type PublicPlayer,
  individualGameScore,
} from "@trex/shared";

export function computeMvpRanking(players: PublicPlayer[]): MvpEntry[] {
  const ranked: MvpEntry[] = players.map((player) => ({
    playerId: player.id,
    nickname: player.nickname,
    teamId: player.teamId,
    score: individualGameScore(player),
  }));
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, MVP_TOP_COUNT);
}
