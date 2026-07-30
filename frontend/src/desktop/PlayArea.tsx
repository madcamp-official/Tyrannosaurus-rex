/** Plan.md §5.1, §10.3 "Godot이 지연되더라도 서버·React 흐름을 완주 가능하게" — 2D 안전 화면 겸 기본 HUD.
 * 좌우 풀블리드 분할로 각 팀의 3D 무대(Godot, 배경) 위에 단계별 오버레이를 얹는다. */

import {
  BONE_IDS,
  CHARGING_PRACTICE_DURATION_MS,
  DINO_RUN_DURATION_MS,
  PHASE_START_GRACE_MS,
  teamPlayerScore,
  type PlayerId,
  type PublicPlayer,
  type RoomState,
  type TeamId,
  type TeamPhase,
  type TeamState,
} from "@trex/shared";
import { useEffect, useState } from "react";
import { serverNow } from "../socket";
import { ExcavationTeamPanel } from "./ExcavationView";
import { DinoRunOverlay, DinoRunTeamPanel } from "./DinoRunView";
import { ChargingSharedArena, ChargingTeamStats, type CrosshairDisplay, type TrexDisplay } from "./ChargingView";
import { BattleScreen } from "../battle/BattleScreen";
import { battleStateFromRoom } from "../battle/fromRoomState";
import type { BattleShotEvent } from "../battle/battleTypes";
import { useCountdownSound } from "../audio/useCountdownSound";

const TEAM_IDS: readonly TeamId[] = ["A", "B"];

export type ChargingEphemeral = {
  trexByTeam: Partial<Record<TeamId, TrexDisplay>>;
  crosshairsByPlayer: Record<PlayerId, CrosshairDisplay & { teamId: TeamId }>;
  hitFlashByTeam: Partial<Record<TeamId, "HIT" | "MISS">>;
  /** energy:coreChanged가 실어 보내는 다음 코어 교체 시각(ms epoch). 배틀 화면의 코어 카운트다운에 쓴다. */
  coreChangesAtByTeam: Partial<Record<TeamId, number>>;
  /** 배틀 화면의 발사 임팩트 연출용, TTL로 스스로 사라지는 최근 발사 이벤트 목록. */
  battleShotEvents: BattleShotEvent[];
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

function ShakeIcon(): JSX.Element {
  return (
    <svg className="play-area__shake-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6.5v-2a1.5 1.5 0 0 1 3 0v2-1a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v5.2c0 4.2-2.7 7.3-6.8 7.3H10c-2.2 0-3.7-1-5.2-2.7L3 14.2a1.6 1.6 0 0 1 2.3-2.1L7 13.5v-7a1.5 1.5 0 0 1 3 0" />
      <path d="M3.5 5.5 2 4m18.5 1.5L22 4M4 9H2m20 0h-2" />
    </svg>
  );
}

function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSec / 60).toString().padStart(2, "0");
  const seconds = (totalSec % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function PhaseTimer({ roomState }: { roomState: RoomState }): JSX.Element | null {
  // 폰과 데스크탑의 시스템 시계가 서로 어긋나 있으면 같은 phaseStartedAt을 기준으로 해도
  // 표시되는 시간이 달라진다 — raw Date.now() 대신 서버 기준으로 보정된 serverNow()를 쓴다.
  const [nowMs, setNowMs] = useState(() => serverNow());
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(serverNow()), 200);
    return () => window.clearInterval(interval);
  }, []);

  const activeTeams = TEAM_IDS.map((teamId) => roomState.teams[teamId]).filter((team) => team.phase !== "REVIVED");
  if (activeTeams.length === 0) return null;
  const primary = activeTeams[0]!;
  const countdownEndsAt = Math.max(...activeTeams.map((team) => team.phaseStartedAt + PHASE_START_GRACE_MS));
  if (nowMs < countdownEndsAt) return null;
  const isExcavation = primary.phase === "EXCAVATION";
  const fallbackDuration = primary.phase === "ASSEMBLY" ? DINO_RUN_DURATION_MS : CHARGING_PRACTICE_DURATION_MS;
  const clockMs = isExcavation
    ? Math.max(0, nowMs - primary.phaseStartedAt - PHASE_START_GRACE_MS)
    : Math.min(
        ...activeTeams.map((team) =>
          team.phaseEndsAt !== null
            ? team.phaseEndsAt - Math.max(nowMs, team.phaseStartedAt + PHASE_START_GRACE_MS)
            : team.phaseStartedAt + PHASE_START_GRACE_MS + fallbackDuration - Math.max(nowMs, team.phaseStartedAt + PHASE_START_GRACE_MS),
        ),
      );

  return (
    <div className="phase-timer">
      <span>{isExcavation ? "진행 시간" : "남은 시간"}</span>
      <strong>{formatClock(clockMs)}</strong>
    </div>
  );
}

const PHASE_GUIDE: Record<TeamPhase, string> = {
  ASSEMBLY: "운석을 피하고\n과일과 하트를 획득하세요!",
  EXCAVATION: "휴대폰을 흔들거나 버튼을 눌러\n티라노의 뼈를 발굴하세요!",
  CHARGING_PRACTICE: "조준점을 중앙에 맞춰\n레이저 영점을 조정하세요!",
  CHARGING: "휴대폰으로 조준하고 발사해 뼈라노에게 부활 에너지를 채우세요!",
  REVIVED: "부활 결과를 확인하세요!",
};

function GameIntroOverlay({ roomState }: { roomState: RoomState }): JSX.Element | null {
  // 폰과 데스크탑의 시스템 시계가 서로 어긋나 있으면 같은 phaseStartedAt을 기준으로 해도
  // 카운트다운이 서로 다르게 보인다 — raw Date.now() 대신 서버 기준으로 보정된 serverNow()를 쓴다.
  const [nowMs, setNowMs] = useState(() => serverNow());
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(serverNow()), 100);
    return () => window.clearInterval(interval);
  }, []);

  const teams = TEAM_IDS.map((teamId) => roomState.teams[teamId]).filter((team) => team.phase !== "REVIVED");
  const primary = teams[0];
  const remainingSec = primary
    ? Math.max(0, Math.ceil((primary.phaseStartedAt + PHASE_START_GRACE_MS - nowMs) / 1000))
    : null;
  useCountdownSound(remainingSec);
  if (!primary || remainingSec === null || remainingSec <= 0) return null;
  const elapsedMs = Math.max(0, nowMs - primary.phaseStartedAt);

  const eraText =
    primary.phase === "ASSEMBLY"
      ? "약 6,600만 년 전, 백악기 말…"
      : primary.phase === "EXCAVATION"
        ? "2026년의 대한민국…"
        : null;
  const showEra = eraText !== null && elapsedMs < 2_000;
  const showGuide = !showEra && elapsedMs >= PHASE_START_GRACE_MS - 3_000;

  return (
    <div className="game-intro-overlay">
      {showEra ? (
        <p key={`era-${primary.phase}`} className="game-intro-overlay__era">{eraText}</p>
      ) : showGuide ? (
        <div key={`guide-${primary.phase}`} className="game-intro-overlay__guide">
          <span>게임 방법</span>
          <strong>{PHASE_GUIDE[primary.phase]}</strong>
          <small>{remainingSec}초 후 시작</small>
        </div>
      ) : (
        <span className="game-intro-overlay__eyebrow">다음 게임 준비</span>
      )}
    </div>
  );
}

function PracticeAimOverlay({
  roomState,
  crosshairs,
}: {
  roomState: RoomState;
  crosshairs: Array<CrosshairDisplay & { teamId: TeamId }>;
}): JSX.Element {
  const playersById = new Map(roomState.players.map((player) => [player.id, player]));
  return (
    <div className="practice-aim">
      <div className="practice-aim__target">
        <span className="practice-aim__ring practice-aim__ring--outer" />
        <span className="practice-aim__ring practice-aim__ring--middle" />
        <span className="practice-aim__ring practice-aim__ring--inner" />
        <span className="practice-aim__bullseye" />
        {crosshairs.map((crosshair) => {
          const player = playersById.get(crosshair.playerId);
          return (
            <span
              key={crosshair.playerId}
              className="practice-aim__crosshair"
              style={{ left: `${crosshair.point.x * 100}%`, top: `${crosshair.point.y * 100}%`, color: crosshair.color }}
            >
              <span />
              <small>{player?.nickname ?? crosshair.playerId}</small>
            </span>
          );
        })}
      </div>
      <p className="practice-aim__guide">휴대폰을 움직여 과녁판 중앙을 맞추어, 영점을 조정하세요!</p>
      <div className="practice-aim__legend">
        {TEAM_IDS.map((teamId) => (
          <span key={teamId} className={`practice-aim__team practice-aim__team--${teamId.toLowerCase()}`}>
            {roomState.teamNames[teamId]}
          </span>
        ))}
      </div>
    </div>
  );
}

function TeamHeader({
  teamId,
  teamName,
  players,
  team,
}: {
  teamId: TeamId;
  teamName: string;
  players: PublicPlayer[];
  team: TeamState;
}): JSX.Element {
  const connected = players.filter((p) => p.connected).length;
  const totalExcavationInputs = players.reduce((sum, player) => sum + player.stats.excavationInputs, 0);
  const score =
    team.phase === "EXCAVATION"
      ? Math.round(team.excavation.points)
      : team.phase === "ASSEMBLY"
        ? Object.values(team.dinoRun.scoreByPlayer).reduce((sum, value) => sum + value, 0)
        : Math.round(teamPlayerScore(players, team.id));
  const teamIdentity = (
    <div className="play-area__team-name">
      <span className="play-area__team-icon">
        <span className="play-area__team-icon-dot" />
      </span>
      {teamName}
    </div>
  );
  const teamStats = (
    <div className="play-area__team-stats">
      <div className="play-area__team-stat">
        <GamepadIcon />
        <span className="play-area__team-count">
          {connected}
          <span>/{players.length}</span>
        </span>
      </div>
      {team.phase === "EXCAVATION" && (
        <>
          <div className="play-area__team-stat" title="팀 전체 휴대폰 흔들기 횟수">
            <ShakeIcon />
            {/* excavationInputs는 레이트리밋 초과분을 절반 효율로 인정해 소수로 누적될 수
                있다 — 화면엔 항상 정수(횟수)로 보이게 반올림한다. */}
            <span className="play-area__team-count">{Math.round(totalExcavationInputs)}회</span>
          </div>
          <div className="play-area__team-stat" title="발견한 뼈">
            <RingsIcon />
            <span className="play-area__team-count">
              {team.excavation.discoveredBoneIds.length}
              <span>/{BONE_IDS.length}</span>
            </span>
          </div>
        </>
      )}
      {team.phase !== "CHARGING_PRACTICE" && (
        <div className="play-area__team-score">
          <span>점수</span>
          <strong>{score}</strong>
        </div>
      )}
    </div>
  );
  return (
    <div className={`play-area__team-header play-area__team-header--${teamId.toLowerCase()}`}>
      {teamId === "A" ? <>{teamIdentity}{teamStats}</> : <>{teamStats}{teamIdentity}</>}
    </div>
  );
}

function TeamPhaseContent({ team, roomState }: { team: TeamState; roomState: RoomState }): JSX.Element {
  const players = roomState.players.filter((p) => p.teamId === team.id);

  switch (team.phase) {
    case "EXCAVATION":
      return <ExcavationTeamPanel team={team} teamName={roomState.teamNames[team.id]} players={players} />;
    case "ASSEMBLY":
      return <DinoRunTeamPanel team={team} players={players} />;
    case "CHARGING_PRACTICE":
      return <p className="phase-placeholder">🎯 영점 조정 연습 중… 곧 사격이 시작됩니다.</p>;
    case "CHARGING":
      return <ChargingTeamStats team={team} players={players} />;
    case "REVIVED":
      // 부활 완료 여부·WIN/LOSE/DRAW는 다 같이 보는 공유 화면인 여기서만 보여준다(§모바일에는 안 띄움).
      return (
        <div className="phase-placeholder" style={{ flexDirection: "column", gap: "8px" }}>
          <p>{team.charging.form === "NORMAL" ? "🦖 정상 부활 완료!" : "🦖 와이라노가 되어버렸어요."}</p>
          {team.charging.result ? (
            <p>
              {team.charging.result === "WIN" ? "🏆 부활 성공! 먼저 채웠어요." : team.charging.result === "DRAW" ? "무승부예요." : "상대가 먼저 채웠어요."}
            </p>
          ) : (
            <p>결과를 기다리는 중…</p>
          )}
        </div>
      );
    default:
      return <p className="phase-placeholder">대기 중…</p>;
  }
}

export function PlayArea({ roomState, ephemeral }: { roomState: RoomState; ephemeral: ChargingEphemeral }): JSX.Element {
  // Plan.md §2.3 "모니터엔 스켈레톤 티라노가 단 하나만 표시되며, 두 팀이 같은 개체를 동시에
  // 조준·사격한다" — 어느 한 팀이라도 CHARGING이면 배틀 화면(BattleScreen)이 전체 화면을 대신한다.
  const chargingTeamIds = TEAM_IDS.filter((teamId) => roomState.teams[teamId].phase === "CHARGING");
  const hasSharedArena = chargingTeamIds.length > 0;
  const battle = hasSharedArena ? battleStateFromRoom(roomState, ephemeral, chargingTeamIds) : null;
  if (battle) {
    // 실제 플레이어 조준 좌표(자이로/터치패드) 그대로 전달 — 아직 안 온 플레이어는 표시 안 함.
    const aimPoints = Object.fromEntries(
      Object.entries(ephemeral.crosshairsByPlayer)
        .filter(([, c]) => chargingTeamIds.includes(c.teamId))
        .map(([playerId, c]) => [playerId, [c.point.x, c.point.y] as [number, number]]),
    );
    return (
      <>
        <BattleScreen battle={battle} shotEvents={ephemeral.battleShotEvents} aimPoints={aimPoints} />
        <GameIntroOverlay roomState={roomState} />
      </>
    );
  }

  // 배틀 데이터가 아직 준비되지 않은 첫 100ms 안팎의 과도기(또는 CHARGING이 아닌 단계)에는
  // 예전 최소 레이아웃으로 대체해 화면이 비지 않게 한다.
  const sharedTrex = hasSharedArena ? ephemeral.trexByTeam[chargingTeamIds[0]!] : undefined;
  const sharedCrosshairs = Object.values(ephemeral.crosshairsByPlayer).filter((c) => chargingTeamIds.includes(c.teamId));
  const sharedHitFlash = chargingTeamIds.map((teamId) => ephemeral.hitFlashByTeam[teamId]).find((flash) => flash) ?? null;
  const isDinoRunActive = TEAM_IDS.some(
    (teamId) => roomState.teams[teamId].phase === "ASSEMBLY" && roomState.teams[teamId].dinoRun.result === null,
  );
  const isPracticeActive = TEAM_IDS.some((teamId) => roomState.teams[teamId].phase === "CHARGING_PRACTICE");
  const practiceCrosshairs = Object.values(ephemeral.crosshairsByPlayer).filter((crosshair) =>
    TEAM_IDS.some((teamId) => roomState.teams[teamId].phase === "CHARGING_PRACTICE" && crosshair.teamId === teamId),
  );

  const teamPanel = (teamId: TeamId): JSX.Element => {
    const team = roomState.teams[teamId];
    const players = roomState.players.filter((p) => p.teamId === teamId);
    return (
      <div
        key={teamId}
        className={`play-area__team play-area__team--${teamId}${hasSharedArena ? " play-area__team--sidebar" : ""}`}
      >
        {team.phase !== "EXCAVATION" && (
          <TeamHeader teamId={teamId} teamName={roomState.teamNames[teamId]} players={players} team={team} />
        )}
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
      <PhaseTimer roomState={roomState} />
      <GameIntroOverlay roomState={roomState} />
      {isDinoRunActive && <DinoRunOverlay roomState={roomState} />}
      {isPracticeActive && <PracticeAimOverlay roomState={roomState} crosshairs={practiceCrosshairs} />}
    </section>
  );
}
