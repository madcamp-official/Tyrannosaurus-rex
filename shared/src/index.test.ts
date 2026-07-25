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

  it("keeps the core bone roster in sync with the bone count constant", () => {
    expect(BONE_IDS).toHaveLength(CORE_BONE_COUNT);
    expect(new Set(BONE_IDS).size).toBe(BONE_IDS.length);
  });
});
