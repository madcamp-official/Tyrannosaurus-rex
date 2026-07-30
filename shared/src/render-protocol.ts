/** Plan.md §11.3. React ↔ Godot iframe postMessage 브리지 계약. */

import type {
  BoneId,
  Facing,
  NormalizedPoint,
  PlayerId,
  PoseId,
  RevivalForm,
  TeamId,
  TeamPhase,
  Transform2D,
} from "./domain.js";
import { BRIDGE_PROTOCOL_VERSION } from "./constants.js";

export type BridgeSource = "trex-react" | "trex-godot";

export type BridgeEnvelope<TType extends string, TPayload> = {
  source: BridgeSource;
  version: typeof BRIDGE_PROTOCOL_VERSION;
  type: TType;
  roomCode?: string;
  sequence: number;
  payload: TPayload;
};

// ---------------------------------------------------------------------------
// React → Godot
// ---------------------------------------------------------------------------

export type InitPayload = {
  teamColors: Record<TeamId, string>;
  assetVersion: string;
  screen: { width: number; height: number };
};

export type PhaseChangedPayload = {
  teams: Record<TeamId, { phase: TeamPhase; startedAt: number; endsAt: number | null }>;
};

export type FullSnapshotPayload = {
  revision: number;
  teams: Record<
    TeamId,
    {
      phase: TeamPhase;
      excavationPoints: number;
      /** 전체 발굴 목표 대비 누적 진행도(0~100). 재연결/HMR 뒤 파인 지형 복구에 사용한다. */
      excavationProgress: number;
      discoveredBoneIds: BoneId[];
      puzzlePieces: Array<{ boneId: BoneId; transform: Transform2D; fixed: boolean }>;
      trex: { position: NormalizedPoint; rotationDeg: number; facing: Facing; poseId: PoseId };
      energy: number;
      stability: number;
      form: RevivalForm;
    }
  >;
};

export type BoneDiscoveredPayload = { teamId: TeamId; boneId: BoneId; position: NormalizedPoint };
/** 현재 뼈 구간 진행도(0~100). Godot의 GroundDig.dig_random_scoop(progress)에 그대로 넘긴다. */
export type ExcavationProgressPayload = { teamId: TeamId; progress: number };
export type PuzzleStatePayload = {
  teamId: TeamId;
  pieces: Array<{ boneId: BoneId; transform: Transform2D; fixed: boolean }>;
};
export type CrosshairsPayload = {
  teamId: TeamId;
  crosshairs: Array<{ playerId: PlayerId; color: string; point: NormalizedPoint; active: boolean }>;
};
export type TrexTransformPayload = {
  teamId: TeamId;
  position: NormalizedPoint;
  rotationDeg: number;
  facing: Facing;
  poseId: PoseId;
};
export type EnergyHitPayload = {
  teamId: TeamId;
  hitZone: "HEART" | "SKULL" | "SPINE" | "BONE" | null;
  hitPoint: NormalizedPoint | null;
  energy: number;
  stability: number;
};
export type RevivalResultPayload = { teamId: TeamId; form: RevivalForm; purified: boolean };

export type ReactToGodotMessage =
  | BridgeEnvelope<"INIT", InitPayload>
  | BridgeEnvelope<"PHASE_CHANGED", PhaseChangedPayload>
  | BridgeEnvelope<"FULL_SNAPSHOT", FullSnapshotPayload>
  | BridgeEnvelope<"BONE_DISCOVERED", BoneDiscoveredPayload>
  | BridgeEnvelope<"EXCAVATION_PROGRESS", ExcavationProgressPayload>
  | BridgeEnvelope<"PUZZLE_STATE", PuzzleStatePayload>
  | BridgeEnvelope<"CROSSHAIRS", CrosshairsPayload>
  | BridgeEnvelope<"TREX_TRANSFORM", TrexTransformPayload>
  | BridgeEnvelope<"ENERGY_HIT", EnergyHitPayload>
  | BridgeEnvelope<"REVIVAL_RESULT", RevivalResultPayload>;

// ---------------------------------------------------------------------------
// Godot → React
// ---------------------------------------------------------------------------

export type GodotLoadingPayload = { loadedBytes: number; totalBytes: number };
export type GodotErrorPayload = { code: string; message: string };
export type PerformanceSamplePayload = { fps: number; drawCalls: number };
export type SceneReadyPayload = { scene: string };
export type AnimationFinishedPayload = { teamId: TeamId; animation: string };

export type GodotToReactMessage =
  | BridgeEnvelope<"GODOT_LOADING", GodotLoadingPayload>
  | BridgeEnvelope<"GODOT_READY", Record<string, never>>
  | BridgeEnvelope<"SCENE_READY", SceneReadyPayload>
  | BridgeEnvelope<"ANIMATION_FINISHED", AnimationFinishedPayload>
  | BridgeEnvelope<"GODOT_ERROR", GodotErrorPayload>
  | BridgeEnvelope<"PERFORMANCE_SAMPLE", PerformanceSamplePayload>;

export function isBridgeEnvelope(value: unknown): value is BridgeEnvelope<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.source === "trex-react" || v.source === "trex-godot") &&
    v.version === BRIDGE_PROTOCOL_VERSION &&
    typeof v.type === "string" &&
    typeof v.sequence === "number"
  );
}
