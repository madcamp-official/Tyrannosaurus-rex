/** Plan.md §5.1 퍼즐 화면. 실루엣 위 조각 배치를 보여주는 2D 안전 화면 (Godot 없이도 동작). */

import { PUZZLE_PIECE_COUNT, PUZZLE_TARGET_TRANSFORMS, type PublicPlayer, type TeamState } from "@trex/shared";

export function PuzzleTeamPanel({ team, players }: { team: TeamState; players: PublicPlayer[] }): JSX.Element {
  return (
    <div className="puzzle-view">
      <p className="puzzle-view__count">
        {team.puzzle.fixedCount} / {PUZZLE_PIECE_COUNT} 조각 고정
      </p>
      <div className="puzzle-view__canvas">
        {Object.keys(PUZZLE_TARGET_TRANSFORMS).map((boneId) => {
          const target = PUZZLE_TARGET_TRANSFORMS[boneId as keyof typeof PUZZLE_TARGET_TRANSFORMS];
          return (
            <div
              key={`target-${boneId}`}
              className="puzzle-view__target"
              style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }}
              title={boneId}
            />
          );
        })}
        {team.puzzle.pieces
          .filter((piece) => piece.discovered)
          .map((piece) => {
            const owner = piece.claimedBy ? players.find((p) => p.id === piece.claimedBy) : null;
            const status = piece.fixed ? "fixed" : piece.claimedBy ? "claimed" : piece.lockedUntil && piece.lockedUntil > Date.now() ? "locked" : "free";
            return (
              <div
                key={piece.boneId}
                className={`puzzle-view__piece puzzle-view__piece--${status}`}
                style={{
                  left: `${piece.transform.x * 100}%`,
                  top: `${piece.transform.y * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${piece.transform.rotationDeg}deg)`,
                  borderColor: owner?.color,
                }}
              >
                {piece.boneId}
              </div>
            );
          })}
      </div>
    </div>
  );
}
