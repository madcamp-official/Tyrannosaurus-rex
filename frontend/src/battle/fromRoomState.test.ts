import { describe, expect, it } from "vitest";
import type { PublicPlayer, RoomState, TeamState } from "@trex/shared";
import type { ChargingEphemeral } from "../desktop/PlayArea";
import { battleStateFromRoom } from "./fromRoomState";

function makePlayer(overrides: Partial<PublicPlayer> & { id: string; nickname: string; teamId: "A" | "B" }): PublicPlayer {
  return {
    color: "#000000",
    connected: true,
    ready: true,
    aimMode: "TOUCHPAD",
    motionPermission: "GRANTED",
    orientationPermission: "GRANTED",
    stats: { excavationInputs: 0, dinoCleared: 0, shots: 10, hits: 5, coreHits: 2, energyContributed: 30 },
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
    charging: { energy: 40, stability: 100, activeCore: "HEART", coreChangesAt: 0, form: "NONE" },
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
    players: [],
    teams: { A: makeTeam({ id: "A" }), B: makeTeam({ id: "B" }) },
    winner: { teamId: null, reason: null },
    ...overrides,
  };
}

function makeEphemeral(overrides: Partial<ChargingEphemeral> = {}): ChargingEphemeral {
  return {
    trexByTeam: {},
    crosshairsByPlayer: {},
    hitFlashByTeam: {},
    coreChangesAtByTeam: {},
    battleShotEvents: [],
    ...overrides,
  };
}

describe("battleStateFromRoom", () => {
  it("returns null when no team is charging", () => {
    const roomState = makeRoomState({ teams: { A: makeTeam({ id: "A", phase: "EXCAVATION" }), B: makeTeam({ id: "B", phase: "EXCAVATION" }) } });
    expect(battleStateFromRoom(roomState, makeEphemeral(), [])).toBeNull();
  });

  it("returns null until the first trex:transform tick has arrived for the charging team", () => {
    const roomState = makeRoomState();
    expect(battleStateFromRoom(roomState, makeEphemeral(), ["A"])).toBeNull();
  });

  it("converts server data into BattleState — core label, facing sign, and team aggregates", () => {
    const player1 = makePlayer({ id: "p1", nickname: "화염랩터", teamId: "A" });
    const player2 = makePlayer({ id: "p2", nickname: "프로스트핀", teamId: "B" });
    const roomState = makeRoomState({ players: [player1, player2] });
    const ephemeral = makeEphemeral({
      trexByTeam: {
        A: { position: { x: 0.4, y: 0.5 }, facing: "LEFT", activeCore: "SKULL", corePosition: { x: 0.42, y: 0.46 } },
      },
    });

    const battle = battleStateFromRoom(roomState, ephemeral, ["A"]);

    expect(battle).not.toBeNull();
    expect(battle!.coreName).toBe("두개골");
    expect(battle!.trex).toEqual({ x: 0.4, y: 0.5, facing: -1, corePos: [0.42, 0.46] });
    expect(battle!.teamA.players).toEqual([{ id: "p1", name: "화염랩터", shots: 10, hits: 5, energy: 30 }]);
    expect(battle!.teamA.totalHits).toBe(5);
    expect(battle!.teamA.coreHits).toBe(2);
    expect(battle!.teamB.players[0]!.name).toBe("프로스트핀");
    expect(battle!.siteName).toBe("테스트 발굴지");
  });

  it("maps RIGHT facing to 1", () => {
    const roomState = makeRoomState();
    const ephemeral = makeEphemeral({
      trexByTeam: { A: { position: { x: 0.6, y: 0.5 }, facing: "RIGHT", activeCore: "HEART", corePosition: { x: 0.6, y: 0.5 } } },
    });
    const battle = battleStateFromRoom(roomState, ephemeral, ["A"]);
    expect(battle!.trex.facing).toBe(1);
  });
});
