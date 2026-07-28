import { describe, expect, it } from "vitest";
import { roomCodeSchema, roomJoinRequestSchema } from "./events.js";
import { BONE_IDS, boneCountForTeam, boneWaveSizes } from "./index.js";

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

  it("has enough named bones to cover the largest possible team bone count", () => {
    // boneCountForTeam은 아무리 인원이 많아도 BONE_IDS.length를 넘지 않아야
    // makeBoneOrder가 매번 채울 수 있다.
    expect(BONE_IDS.length).toBeGreaterThanOrEqual(boneCountForTeam(100));
    expect(new Set(BONE_IDS).size).toBe(BONE_IDS.length);
  });

  it("scales the target bone count with team size, capped at BONE_IDS.length", () => {
    expect(boneCountForTeam(1)).toBe(4);
    expect(boneCountForTeam(2)).toBe(8);
    expect(boneCountForTeam(3)).toBe(12);
    expect(boneCountForTeam(4)).toBe(BONE_IDS.length);
    expect(boneCountForTeam(10)).toBe(BONE_IDS.length);
  });

  it("splits BONE_IDS.length bones across waves as evenly as possible, always summing to the full set", () => {
    expect(boneWaveSizes(4)).toEqual([3, 3, 3, 4]);
    expect(boneWaveSizes(1)).toEqual([13]);
    expect(boneWaveSizes(13)).toEqual(Array(13).fill(1));
    for (const waveCount of [1, 2, 3, 4, 5, 8, 13, 20]) {
      const sizes = boneWaveSizes(waveCount);
      expect(sizes.reduce((sum, n) => sum + n, 0)).toBe(BONE_IDS.length);
    }
  });
});
