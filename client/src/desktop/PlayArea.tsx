/** Plan.md §5.1, §10.3 "Godot이 지연되더라도 서버·React 흐름을 완주 가능하게" — 2D 안전 화면 겸 기본 HUD. */

import type { RoomState, TeamId, TeamState } from "@trex/shared";
import { ExcavationTeamPanel } from "./ExcavationView";
import { PuzzleTeamPanel } from "./PuzzleView";

const TEAM_IDS: readonly TeamId[] = ["A", "B"];

function TeamPhaseContent({ team, roomState }: { team: TeamState; roomState: RoomState }): JSX.Element {
  const players = roomState.players.filter((p) => p.teamId === team.id);

  switch (team.phase) {
    case "EXCAVATION":
      return <ExcavationTeamPanel team={team} players={players} />;
    case "ASSEMBLY":
      return <PuzzleTeamPanel team={team} players={players} />;
    case "CHARGING":
      return <p className="phase-placeholder">⚡ 부활 에너지 충전 중… (다음 단계)</p>;
    case "PURIFICATION":
      return <p className="phase-placeholder">🧪 정화 시도 중… (다음 단계)</p>;
    case "REVIVED":
      return <p className="phase-placeholder">🦖 부활 완료! 결과를 기다리는 중…</p>;
    default:
      return <p className="phase-placeholder">대기 중…</p>;
  }
}

export function PlayArea({ roomState }: { roomState: RoomState }): JSX.Element {
  return (
    <section className="play-area">
      {TEAM_IDS.map((teamId) => {
        const team = roomState.teams[teamId];
        return (
          <div key={teamId} className={`play-area__team play-area__team--${teamId}`}>
            <h2>{teamId}팀</h2>
            <TeamPhaseContent team={team} roomState={roomState} />
          </div>
        );
      })}
    </section>
  );
}
