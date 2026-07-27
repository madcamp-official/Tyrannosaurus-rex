/** Plan.md §5.1, §10.3 "Godot이 지연되더라도 서버·React 흐름을 완주 가능하게" — 2D 안전 화면 겸 기본 HUD. */

import { TEAM_DISPLAY_NAMES, type PlayerId, type RoomState, type TeamId, type TeamState } from "@trex/shared";
import { ExcavationTeamPanel } from "./ExcavationView";
import { DinoRunTeamPanel } from "./DinoRunView";
import { ChargingSharedArena, ChargingTeamStats, type CrosshairDisplay, type TrexDisplay } from "./ChargingView";

const TEAM_IDS: readonly TeamId[] = ["A", "B"];

export type ChargingEphemeral = {
  trexByTeam: Partial<Record<TeamId, TrexDisplay>>;
  crosshairsByPlayer: Record<PlayerId, CrosshairDisplay & { teamId: TeamId }>;
  hitFlashByTeam: Partial<Record<TeamId, "HIT" | "MISS">>;
};

function TeamPhaseContent({ team, roomState }: { team: TeamState; roomState: RoomState }): JSX.Element {
  const players = roomState.players.filter((p) => p.teamId === team.id);

  switch (team.phase) {
    case "EXCAVATION":
      return <ExcavationTeamPanel team={team} players={players} />;
    case "ASSEMBLY":
      return <DinoRunTeamPanel team={team} players={players} />;
    case "CHARGING":
      return <ChargingTeamStats team={team} players={players} />;
    case "REVIVED":
      return (
        <p className="phase-placeholder">{team.charging.form === "NORMAL" ? "🦖 정상 부활 완료!" : "🦖 와이라노가 되어버렸어요."} 결과를 기다리는 중…</p>
      );
    default:
      return <p className="phase-placeholder">대기 중…</p>;
  }
}

export function PlayArea({ roomState, ephemeral }: { roomState: RoomState; ephemeral: ChargingEphemeral }): JSX.Element {
  // Plan.md §2.3 "모니터엔 스켈레톤 티라노가 단 하나만 표시되며, 두 팀이 같은 개체를 동시에
  // 조준·사격한다" — 어느 한 팀이라도 CHARGING이면 공유 아레나를 화면 중앙에 한 번만 그린다.
  const chargingTeamIds = TEAM_IDS.filter((teamId) => roomState.teams[teamId].phase === "CHARGING");
  const sharedTrex = chargingTeamIds.length > 0 ? ephemeral.trexByTeam[chargingTeamIds[0]!] : undefined;
  const sharedCrosshairs = Object.values(ephemeral.crosshairsByPlayer).filter((c) => chargingTeamIds.includes(c.teamId));
  const sharedHitFlash = chargingTeamIds.map((teamId) => ephemeral.hitFlashByTeam[teamId]).find((flash) => flash) ?? null;

  const teamPanel = (teamId: TeamId): JSX.Element => (
    <div key={teamId} className={`play-area__team play-area__team--${teamId}`}>
      <h2>{TEAM_DISPLAY_NAMES[teamId]}</h2>
      <TeamPhaseContent team={roomState.teams[teamId]} roomState={roomState} />
    </div>
  );

  return (
    <section className="play-area">
      {teamPanel("A")}
      {chargingTeamIds.length > 0 && (
        <div className="play-area__shared-arena">
          <ChargingSharedArena trex={sharedTrex} crosshairs={sharedCrosshairs} hitFlash={sharedHitFlash} />
        </div>
      )}
      {teamPanel("B")}
    </section>
  );
}
