import { describe, expect, it } from "vitest";
import type { PublicPlayer } from "@trex/shared";
import { computeMvpRanking } from "../src/game/mvp.js";

function makePlayer(overrides: Partial<PublicPlayer> & { id: string; nickname: string; teamId: "A" | "B" }): PublicPlayer {
  return {
    color: "#000000",
    connected: true,
    ready: true,
    aimMode: "TOUCHPAD",
    motionPermission: "GRANTED",
    orientationPermission: "GRANTED",
    stats: { excavationInputs: 0, dinoCleared: 0, shots: 0, hits: 0, coreHits: 0, energyContributed: 0 },
    ...overrides,
  };
}

describe("computeMvpRanking", () => {
  it("ranks players by weighted contribution across all three games, highest first", () => {
    const players: PublicPlayer[] = [
      makePlayer({ id: "p1", nickname: "발굴왕", teamId: "A", stats: { excavationInputs: 100, dinoCleared: 0, shots: 0, hits: 0, coreHits: 0, energyContributed: 0 } }),
      makePlayer({ id: "p2", nickname: "명사수", teamId: "B", stats: { excavationInputs: 0, dinoCleared: 0, shots: 20, hits: 15, coreHits: 10, energyContributed: 0 } }),
      makePlayer({ id: "p3", nickname: "무기여자", teamId: "A", stats: { excavationInputs: 0, dinoCleared: 0, shots: 0, hits: 0, coreHits: 0, energyContributed: 0 } }),
    ];

    const ranking = computeMvpRanking(players);

    // p1: 100*1=100, p2: 15*2+10*3=60, p3: 0
    expect(ranking).toHaveLength(3);
    expect(ranking.map((entry) => entry.playerId)).toEqual(["p1", "p2", "p3"]);
    expect(ranking.map((entry) => entry.score)).toEqual([100, 60, 0]);
  });

  it("caps the ranking at the top 3 even with more players", () => {
    const players: PublicPlayer[] = Array.from({ length: 5 }, (_, i) =>
      makePlayer({
        id: `p${i}`,
        nickname: `p${i}`,
        teamId: i % 2 === 0 ? "A" : "B",
        stats: { excavationInputs: i * 10, dinoCleared: 0, shots: 0, hits: 0, coreHits: 0, energyContributed: 0 },
      }),
    );

    const ranking = computeMvpRanking(players);
    expect(ranking).toHaveLength(3);
    expect(ranking[0]?.playerId).toBe("p4");
    expect(ranking[1]?.playerId).toBe("p3");
    expect(ranking[2]?.playerId).toBe("p2");
  });

  it("returns zero-score entries for players with no contribution instead of throwing", () => {
    const players: PublicPlayer[] = [makePlayer({ id: "p1", nickname: "구경꾼", teamId: "A" })];
    const ranking = computeMvpRanking(players);
    expect(ranking).toEqual([{ playerId: "p1", nickname: "구경꾼", teamId: "A", score: 0 }]);
  });
});
