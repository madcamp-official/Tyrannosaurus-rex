import { describe, expect, it } from "vitest";
import type { PublicPlayer, RoomState, TeamState } from "@trex/shared";
import { applyShotResolved } from "./roomStateReducer";

function makePlayer(overrides: Partial<PublicPlayer> & { id: string; teamId: "A" | "B" }): PublicPlayer {
  return {
    nickname: "테스터",
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

function makeTeam(overrides: Partial<TeamState> & { id: "A" | "B" }): TeamState {
  return {
    phase: "CHARGING",
    phaseStartedAt: 0,
    phaseEndsAt: 90_000,
    playerIds: [],
    excavation: { points: 0, nextBoneAt: 60, discoveredBoneIds: [], fossils: 0, result: null },
    dinoRun: {
      skyObjects: [],
      livesByPlayer: {},
      scoreByPlayer: {},
      resolvedObjectIdsByPlayer: {},
      deadPlayerIds: [],
      performance: null,
      grade: null,
      result: null,
    },
    charging: { energy: 0, stability: 100, activeCore: "HEART", coreChangesAt: 0, form: "NONE", result: null },
    scores: { excavation: null, dinoRun: null, charging: null },
    ...overrides,
  };
}

function makeRoomState(overrides: Partial<RoomState> = {}): RoomState {
  return {
    schemaVersion: 1,
    revision: 1,
    roomCode: "1234",
    roomName: "테스트 발굴지",
    maxPlayersPerTeam: 5,
    teamNames: { A: "T라노 팀", B: "F라노 팀" },
    roomPhase: "PLAYING",
    createdAt: 0,
    roundStartedAt: 0,
    roundEndsAt: 300_000,
    hostConnected: true,
    players: [makePlayer({ id: "p1", teamId: "A" })],
    teams: { A: makeTeam({ id: "A" }), B: makeTeam({ id: "B" }) },
    winner: { teamId: null, reason: null },
    ...overrides,
  };
}

describe("applyShotResolved", () => {
  it("accumulates the shooting player's shots/hits/coreHits/energyContributed, not just team energy", () => {
    const state = makeRoomState();

    const afterMiss = applyShotResolved(state, {
      teamId: "A",
      playerId: "p1",
      energyAfter: 0,
      stabilityAfter: 100,
      hit: false,
      hitZone: null,
      energyDelta: 0,
    });
    expect(afterMiss.players[0]!.stats).toMatchObject({ shots: 1, hits: 0, coreHits: 0, energyContributed: 0 });

    const afterCoreHit = applyShotResolved(afterMiss, {
      teamId: "A",
      playerId: "p1",
      energyAfter: 7,
      stabilityAfter: 100,
      hit: true,
      hitZone: "HEART",
      energyDelta: 7,
    });
    expect(afterCoreHit.players[0]!.stats).toMatchObject({ shots: 2, hits: 1, coreHits: 1, energyContributed: 7 });
    expect(afterCoreHit.teams.A.charging.energy).toBe(7);

    const afterBodyHit = applyShotResolved(afterCoreHit, {
      teamId: "A",
      playerId: "p1",
      energyAfter: 11,
      stabilityAfter: 100,
      hit: true,
      hitZone: "BONE",
      energyDelta: 4,
    });
    expect(afterBodyHit.players[0]!.stats).toMatchObject({ shots: 3, hits: 2, coreHits: 1, energyContributed: 11 });
  });
});
