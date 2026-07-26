/** Plan.md §5.1, §10.3 "Godot이 지연되더라도 서버·React 흐름을 완주 가능하게" — 2D 안전 화면 겸 기본 HUD. */

import type { PlayerId, RoomState, TeamId, TeamState } from "@trex/shared";
import { ExcavationTeamPanel } from "./ExcavationView";
import { DinoRunTeamPanel } from "./DinoRunView";
import { ChargingTeamPanel, type CrosshairDisplay, type TrexDisplay } from "./ChargingView";

const TEAM_IDS: readonly TeamId[] = ["A", "B"];

export type ChargingEphemeral = {
  trexByTeam: Partial<Record<TeamId, TrexDisplay>>;
  crosshairsByPlayer: Record<PlayerId, CrosshairDisplay & { teamId: TeamId }>;
  hitFlashByTeam: Partial<Record<TeamId, "HIT" | "MISS">>;
};

function TeamPhaseContent({
  team,
  roomState,
  ephemeral,
}: {
  team: TeamState;
  roomState: RoomState;
  ephemeral: ChargingEphemeral;
}): JSX.Element {
  const players = roomState.players.filter((p) => p.teamId === team.id);

  switch (team.phase) {
    case "EXCAVATION":
      return <ExcavationTeamPanel team={team} players={players} />;
    case "ASSEMBLY":
      return <DinoRunTeamPanel team={team} players={players} />;
    case "CHARGING": {
      const crosshairs = Object.values(ephemeral.crosshairsByPlayer).filter((c) => c.teamId === team.id);
      return (
        <ChargingTeamPanel
          team={team}
          players={players}
          trex={ephemeral.trexByTeam[team.id]}
          crosshairs={crosshairs}
          hitFlash={ephemeral.hitFlashByTeam[team.id] ?? null}
        />
      );
    }
    case "REVIVED":
      return (
        <p className="phase-placeholder">{team.charging.form === "NORMAL" ? "🦖 정상 부활 완료!" : "🦖 와이라노가 되어버렸어요."} 결과를 기다리는 중…</p>
      );
    default:
      return <p className="phase-placeholder">대기 중…</p>;
  }
}

export function PlayArea({ roomState, ephemeral }: { roomState: RoomState; ephemeral: ChargingEphemeral }): JSX.Element {
  return (
    <section className="play-area">
      {TEAM_IDS.map((teamId) => {
        const team = roomState.teams[teamId];
        return (
          <div key={teamId} className={`play-area__team play-area__team--${teamId}`}>
            <h2>{teamId}팀</h2>
            <TeamPhaseContent team={team} roomState={roomState} ephemeral={ephemeral} />
          </div>
        );
      })}
    </section>
  );
}
