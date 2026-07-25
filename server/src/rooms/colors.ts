/** 플레이어별 크로스헤어/컬렉션 구분용 색상 팔레트. 팀 배정과는 별개다. */
export const PLAYER_COLOR_PALETTE: readonly string[] = [
  "#F94144",
  "#F3722C",
  "#F9C74F",
  "#90BE6D",
  "#43AA8B",
  "#577590",
  "#277DA1",
  "#9D4EDD",
  "#F72585",
  "#4D908E",
];

export function colorForJoinIndex(index: number): string {
  return PLAYER_COLOR_PALETTE[index % PLAYER_COLOR_PALETTE.length]!;
}
