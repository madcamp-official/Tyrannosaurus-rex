/** 배틀 화면 HUD 데이터 인터페이스. 배틀 화면 구현 프롬프트 §7. */

export type TeamId = "A" | "B";

export interface BattlePlayer {
  id: string;
  name: string;
  shots: number;
  hits: number;
  energy: number;
  /** 조준점 원 색상 — 같은 팀이어도 사람마다 다르게 표시한다(PublicPlayer.color). */
  color: string;
}

export interface BattleTeam {
  name: string;
  players: BattlePlayer[];
  energy: number;
  totalHits: number;
  coreHits: number;
  /** 부활 에너지를 먼저 채운 팀이 WIN. */
  result: "WIN" | "LOSE" | "DRAW" | null;
}

export interface BattleTrex {
  /** 0..1, 무대 내 좌우 위치 */
  x: number;
  /** 0..1, 무대 내 상하 위치 */
  y: number;
  facing: 1 | -1;
  /** 0..1, 0..1 — 무대 내 코어(약점) 정규화 좌표 */
  corePos: [number, number];
}

export interface BattleState {
  remainingSec: number;
  coreName: string;
  stage: number;
  teamA: BattleTeam;
  teamB: BattleTeam;
  trex: BattleTrex;
  siteName: string;
  energyTarget: number;
}

/** 발사 순간 발생하는 시각 효과(레이저/머즐플래시/임팩트) 전용 이벤트. Battle 상태 자체에는 포함하지 않는다. */
export interface BattleShotEvent {
  id: string;
  team: TeamId;
  playerId: string;
  hit: boolean;
  core: boolean;
  /** 0..1, 0..1 — 무대 내 명중 좌표 */
  point: [number, number];
  ts: number;
}

export function emptyTeam(): BattleTeam {
  return { name: "", players: [], energy: 0, totalHits: 0, coreHits: 0, result: null };
}

export function hitRate(team: BattleTeam): number {
  const shots = team.players.reduce((sum, p) => sum + p.shots, 0);
  if (shots === 0) return 0;
  return Math.round((team.totalHits / shots) * 100);
}
