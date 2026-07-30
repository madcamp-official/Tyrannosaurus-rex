/** ErrorCode(shared 계약)를 사용자에게 보여줄 한국어 문구로 옮긴다. */

import type { ErrorCode } from "@trex/shared";

const MESSAGES: Record<ErrorCode, string> = {
  FINAL_STAGE_STUNNED: "피격 복구 중에는 발사할 수 없습니다.",
  INVALID_PAYLOAD: "요청 형식이 올바르지 않아요. 새로고침 후 다시 시도해주세요.",
  CLIENT_VERSION_UNSUPPORTED: "앱 버전이 서버와 맞지 않아요. 새로고침 후 다시 시도해주세요.",
  ROOM_NOT_FOUND: "방을 찾을 수 없어요. 코드를 다시 확인해주세요.",
  ROOM_FULL: "방 인원이 가득 찼어요.",
  ROOM_ALREADY_STARTED: "이미 게임이 시작된 방이에요.",
  NICKNAME_INVALID: "닉네임은 1~8자, 특수문자(<, >)와 제어문자를 뺀 형태로 입력해주세요.",
  NICKNAME_TAKEN: "이미 이 방에서 쓰이고 있는 닉네임이에요.",
  HOST_ONLY: "호스트만 할 수 있는 동작이에요.",
  PLAYER_NOT_JOINED: "방에 먼저 입장해주세요.",
  WRONG_ROOM_PHASE: "지금 단계에서는 할 수 없는 동작이에요.",
  WRONG_TEAM_PHASE: "지금 진행 중인 경기가 아니에요.",
  TEAM_ELIMINATED: "이미 탈락한 상태예요.",
  RATE_LIMITED: "너무 빠르게 요청했어요. 잠시 후 다시 시도해주세요.",
  DUPLICATE_REQUEST: "이미 처리된 요청이에요.",
  BONE_NOT_AVAILABLE: "지금은 발굴할 수 있는 뼈가 없어요.",
  SHOT_COOLDOWN: "발사 쿨다운 중이에요. 잠시 후 다시 시도해주세요.",
  SERVER_ERROR: "서버에서 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
};

export function describeAckError(code: ErrorCode): string {
  return MESSAGES[code] ?? "알 수 없는 오류가 발생했어요. 잠시 후 다시 시도해주세요.";
}
