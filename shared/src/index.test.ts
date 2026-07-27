import { describe, expect, it } from "vitest";
import { roomCodeSchema, roomJoinRequestSchema } from "./events.js";
import { BONE_IDS, CORE_BONE_COUNT } from "./index.js";

describe("shared contracts", () => {
  it("accepts a valid 4-digit room code", () => {
    expect(roomCodeSchema.safeParse("1234").success).toBe(true);
  });

  it("rejects a non 4-digit room code", () => {
    expect(roomCodeSchema.safeParse("12a4").success).toBe(false);
    expect(roomCodeSchema.safeParse("123").success).toBe(false);
  });

  it("rejects an oversized nickname", () => {
    const result = roomJoinRequestSchema.safeParse({
      requestId: "550e8400-e29b-41d4-a716-446655440000",
      roomCode: "1234",
      nickname: "너무길게쓴닉네임입니다",
    });
    expect(result.success).toBe(false);
  });

  it("has enough named bones to cover the core bone count", () => {
    // CORE_BONE_COUNT는 테스트 중 조정될 수 있는 밸런스 값이라, 정확히 같을 필요는 없고
    // BONE_IDS가 그 개수만큼은 항상 있어야 한다(모자라면 makeBoneOrder가 못 채운다).
    expect(BONE_IDS.length).toBeGreaterThanOrEqual(CORE_BONE_COUNT);
    expect(new Set(BONE_IDS).size).toBe(BONE_IDS.length);
  });
});
