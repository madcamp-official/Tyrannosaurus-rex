/** Plan.md §5.1, §10.3 "Godot이 지연되더라도 서버·React 흐름을 완주 가능하게" — 2D 안전 화면 겸 기본 HUD.
 * 좌우 풀블리드 분할로 각 팀의 3D 무대(Godot, 배경) 위에 단계별 오버레이를 얹는다. */

import { CORE_BONE_COUNT, TEAM_DISPLAY_NAMES, type PlayerId, type PublicPlayer, type RoomState, type TeamId, type TeamState } from "@trex/shared";
import { ExcavationTeamPanel } from "./ExcavationView";
import { DinoRunTeamPanel } from "./DinoRunView";
import { ChargingSharedArena, ChargingTeamStats, type CrosshairDisplay, type TrexDisplay } from "./ChargingView";

const TEAM_IDS: readonly TeamId[] = ["A", "B"];

export type ChargingEphemeral = {
  trexByTeam: Partial<Record<TeamId, TrexDisplay>>;
  crosshairsByPlayer: Record<PlayerId, CrosshairDisplay & { teamId: TeamId }>;
  hitFlashByTeam: Partial<Record<TeamId, "HIT" | "MISS">>;
};

function GamepadIcon(): JSX.Element {
  return (
    <svg width="26" height="14" viewBox="0 0 32 16">
      <circle cx="5" cy="5" r="4" fill="none" stroke="#e9dfc9" strokeWidth="1.6" />
      <circle cx="5" cy="11" r="4" fill="none" stroke="#e9dfc9" strokeWidth="1.6" />
      <circle cx="27" cy="5" r="4" fill="none" stroke="#e9dfc9" strokeWidth="1.6" />
      <circle cx="27" cy="11" r="4" fill="none" stroke="#e9dfc9" strokeWidth="1.6" />
      <rect x="7" y="6.5" width="18" height="3" rx="1.5" fill="none" stroke="#e9dfc9" strokeWidth="1.6" />
    </svg>
  );
}

function RingsIcon(): JSX.Element {
  return (
    <span style={{ position: "relative", width: 18, height: 18, display: "inline-block" }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.6px solid #cbb98f" }} />
      <span style={{ position: "absolute", inset: 4, borderRadius: "50%", border: "1.4px solid #cbb98f", opacity: 0.7 }} />
      <span style={{ position: "absolute", inset: 8, borderRadius: "50%", background: "#cbb98f", opacity: 0.6 }} />
    </span>
  );
}

function TeamHeader({ teamId, players, team }: { teamId: TeamId; players: PublicPlayer[]; team: TeamState }): JSX.Element {
  const connected = players.filter((p) => p.connected).length;
  return (
    <div className={`play-area__team-header play-area__team-header--${teamId.toLowerCase()}`}>
      <div className="play-area__team-name">
        <span className="play-area__team-icon">
          <span className="play-area__team-icon-dot" />
        </span>
        {TEAM_DISPLAY_NAMES[teamId]}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <GamepadIcon />
          <span className="play-area__team-count">
            {connected}
            <span>/{players.length}</span>
          </span>
        </div>
        {team.phase === "EXCAVATION" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }} title="발견한 뼈">
            <RingsIcon />
            <span className="play-area__team-count">
              {team.excavation.discoveredBoneIds.length}
              <span>/{CORE_BONE_COUNT}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const hasSharedArena = chargingTeamIds.length > 0;
  const sharedTrex = hasSharedArena ? ephemeral.trexByTeam[chargingTeamIds[0]!] : undefined;
  const sharedCrosshairs = Object.values(ephemeral.crosshairsByPlayer).filter((c) => chargingTeamIds.includes(c.teamId));
  const sharedHitFlash = chargingTeamIds.map((teamId) => ephemeral.hitFlashByTeam[teamId]).find((flash) => flash) ?? null;

  const teamPanel = (teamId: TeamId): JSX.Element => {
    const team = roomState.teams[teamId];
    const players = roomState.players.filter((p) => p.teamId === teamId);
    return (
      <div
        key={teamId}
        className={`play-area__team play-area__team--${teamId}${hasSharedArena ? " play-area__team--sidebar" : ""}`}
      >
        <TeamHeader teamId={teamId} players={players} team={team} />
        <div className="play-area__team-body">
          <TeamPhaseContent team={team} roomState={roomState} />
        </div>
      </div>
    );
  };

  return (
    <section className="play-area">
      {teamPanel("A")}
      {hasSharedArena && (
        <div className="play-area__shared-arena">
          <ChargingSharedArena trex={sharedTrex} crosshairs={sharedCrosshairs} hitFlash={sharedHitFlash} />
        </div>
      )}
      {teamPanel("B")}
    </section>
  );
}
