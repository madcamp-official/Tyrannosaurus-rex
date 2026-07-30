/** Plan.md §5.1, §17.1, §17.4. 데스크탑 로비: 방 생성, QR, 팀 배정, 게임 시작. */

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import QRCode from "qrcode";
import {
  BONE_IDS,
  boneCountForTeam,
  DEFAULT_MAX_PLAYERS_PER_TEAM,
  EXCAVATION_POINTS_PER_BONE,
  MAX_PLAYERS_PER_TEAM_CAP,
  PUZZLE_TARGET_TRANSFORMS,
  ROOM_NAME_MAX_LENGTH,
  TEAM_DISPLAY_NAMES,
  TEAM_NAME_MAX_LENGTH,
  type Ack,
  type GameResultEvent,
  type GameStartResponse,
  type PlayerId,
  type RoomCreateResponse,
  type RoomState,
  type TeamId,
} from "@trex/shared";
import { connectSocket, type AppSocket } from "../socket";
import { GodotStage, useGodotBridge } from "../godot/GodotStage";
import { DebugPanel } from "../DebugPanel";
import { newRequestId } from "../util/requestId";
import { describeAckError } from "../util/errorMessages";
import { PlayArea, type ChargingEphemeral } from "./PlayArea";
import { ResultView } from "./ResultView";
import { EndingSequence } from "./EndingSequence";
import {
  applyBoneFound,
  applyCoreChanged,
  applyExcavationEvent,
  applyExcavationTeamFinished,
  applyExcavationProgress,
  applyGameResult,
  applyDinoBonus,
  applyDinoFinished,
  applyDinoHit,
  applyDinoTeamResult,
  applyDinoStarted,
  applyPlayerDied,
  applyRevivalFormChanged,
  applyShotResolved,
  applyTeamPhaseChanged,
} from "../roomStateReducer";

const CROSSHAIR_STALE_MS = 700;
const LOBBY_BGM_VOLUME = 0.26;
const LOBBY_BGM_FADE_MS = 900;
const EXCAVATION_BGM_VOLUME = 0.45;
const EXCAVATION_BGM_FADE_MS = 900;
const DINO_RUN_BGM_VOLUME = 0.3;
const DINO_RUN_BGM_FADE_MS = 900;
const CHARGING_BGM_VOLUME = 0.3;
const CHARGING_BGM_FADE_MS = 900;
const RESULT_BGM_VOLUME = 0.28;
const RESULT_BGM_FADE_MS = 900;

/** 로비 BGM·운석 피하기 BGM이 공유하는 페이드아웃(볼륨 서서히 0으로 → 일시정지 → 볼륨 복원). */
function fadeOutAndPause(audio: HTMLAudioElement, fadeRef: { current: number | null }, fadeMs: number, restoreVolume: number): void {
  if (audio.paused) return;
  const startVolume = audio.volume;
  const startedAt = performance.now();
  fadeRef.current = window.setInterval(() => {
    const ratio = Math.min(1, (performance.now() - startedAt) / fadeMs);
    audio.volume = startVolume * (1 - ratio);
    if (ratio >= 1) {
      if (fadeRef.current !== null) window.clearInterval(fadeRef.current);
      fadeRef.current = null;
      audio.pause();
      audio.currentTime = 0;
      audio.volume = restoreVolume;
    }
  }, 50);
}

/** 로비 BGM처럼 특수한 초기 자동재생 잠금 해제가 필요 없는 단순한 "이 단계 동안만 켜짐" BGM 훅. */
function usePhaseBgm(src: string, volume: number, fadeMs: number, active: boolean, muted: boolean): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<number | null>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = volume;
    audioRef.current = audio;
    return () => {
      if (fadeRef.current !== null) window.clearInterval(fadeRef.current);
      audio.pause();
      audioRef.current = null;
    };
    // 마운트 시 한 번만 오디오 엘리먼트를 만든다 — volume 초기값은 아래 effect가 매번 다시 맞춘다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (fadeRef.current !== null) {
      window.clearInterval(fadeRef.current);
      fadeRef.current = null;
    }
    audio.muted = muted;
    if (active) {
      audio.volume = volume;
      if (!muted) void audio.play().catch(() => undefined);
      return;
    }
    fadeOutAndPause(audio, fadeRef, fadeMs, volume);
  }, [active, muted, volume, fadeMs]);
}

function ReadyCheckIcon(): JSX.Element {
  return (
    <svg className="lobby-team-card__ready-check" viewBox="0 0 24 24" role="img" aria-label="준비 완료">
      <circle cx="12" cy="12" r="10" />
      <path d="m7.2 12.1 3.1 3.1 6.7-7" />
    </svg>
  );
}

export function DesktopLobby(): JSX.Element {
  const socketRef = useRef<AppSocket | null>(null);
  const lobbyBgmRef = useRef<HTMLAudioElement | null>(null);
  const lobbyBgmFadeRef = useRef<number | null>(null);
  // 방을 만든 뒤 room:create 응답으로 받은 토큰 — 소켓이 잠깐 끊겼다 돌아오면(와이파이 순단,
  // 노트북 절전 등) 이 값으로 같은 방을 다시 붙잡는다(§room:hostReconnect).
  const hostSessionRef = useRef<{ roomCode: string; hostReconnectToken: string } | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [hostReconnectStatus, setHostReconnectStatus] = useState<"idle" | "reconnecting" | "failed">("idle");
  const [homeStarted, setHomeStarted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [bgmMuted, setBgmMuted] = useState(false);
  const [ephemeral, setEphemeral] = useState<ChargingEphemeral>({
    trexByTeam: {},
    crosshairsByPlayer: {},
    hitFlashByTeam: {},
    coreChangesAtByTeam: {},
    battleShotEvents: [],
    dustAttackByTeam: {},
  });
  const roomStateRef = useRef(roomState);
  roomStateRef.current = roomState;
  const ephemeralRef = useRef(ephemeral);
  ephemeralRef.current = ephemeral;
  const pendingCrosshairsRef = useRef<ChargingEphemeral["crosshairsByPlayer"]>({});
  const crosshairFlushTimerRef = useRef<number | null>(null);
  const [gameResult, setGameResult] = useState<GameResultEvent | null>(null);
  // 결과 화면 배경음악은 (있다면) 부활 엔딩 연출이 끝나고 실제 결과 화면이 보일 때부터
  // 재생한다 — 엔딩 연출 동안은 승리 팡파레(EndingSequence)만 들려야 하므로.
  const [resultBodyVisible, setResultBodyVisible] = useState(false);
  useEffect(() => {
    setResultBodyVisible(false);
  }, [gameResult?.finishedAt]);
  const { bridge } = useGodotBridge();
  const isChargingBattle =
    roomState?.roomPhase === "PLAYING" &&
    (roomState.teams.A.phase === "CHARGING" || roomState.teams.B.phase === "CHARGING");
  const isDinoRunActive =
    roomState?.roomPhase === "PLAYING" &&
    (roomState.teams.A.phase === "ASSEMBLY" || roomState.teams.B.phase === "ASSEMBLY");
  const isExcavationActive =
    roomState?.roomPhase === "PLAYING" &&
    (roomState.teams.A.phase === "EXCAVATION" || roomState.teams.B.phase === "EXCAVATION");
  const shouldRenderGodotStage =
    (!roomState || roomState.roomPhase === "LOBBY" || roomState.roomPhase === "PLAYING") &&
    !isChargingBattle;
  const isResultBodyActive = roomState?.roomPhase === "RESULT" && resultBodyVisible;
  usePhaseBgm("/audio/dino-run-bgm.mp3", DINO_RUN_BGM_VOLUME, DINO_RUN_BGM_FADE_MS, isDinoRunActive, bgmMuted);
  usePhaseBgm("/audio/excavation-bgm.mp3", EXCAVATION_BGM_VOLUME, EXCAVATION_BGM_FADE_MS, isExcavationActive, bgmMuted);
  usePhaseBgm("/audio/charging-bgm.mp3", CHARGING_BGM_VOLUME, CHARGING_BGM_FADE_MS, isChargingBattle, bgmMuted);
  usePhaseBgm("/audio/result-bgm.mp3", RESULT_BGM_VOLUME, RESULT_BGM_FADE_MS, isResultBodyActive, bgmMuted);

  useEffect(() => {
    const audio = new Audio("/audio/lobby-bgm.mp3");
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = LOBBY_BGM_VOLUME;
    lobbyBgmRef.current = audio;
    const retryAutoplay = () => {
      if (!bgmMuted && (!roomState || roomState.roomPhase === "LOBBY")) {
        void audio.play().catch(() => undefined);
      }
    };
    void audio.play().catch(() => undefined);
    window.addEventListener("pointerdown", retryAutoplay, { once: true });
    window.addEventListener("keydown", retryAutoplay, { once: true });

    return () => {
      if (lobbyBgmFadeRef.current !== null) window.clearInterval(lobbyBgmFadeRef.current);
      window.removeEventListener("pointerdown", retryAutoplay);
      window.removeEventListener("keydown", retryAutoplay);
      audio.pause();
      lobbyBgmRef.current = null;
    };
    // 최초 마운트 시 자동재생을 한 번 시도하고, 최신 상태 반영은 아래 effect가 담당한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const audio = lobbyBgmRef.current;
    if (!audio) return;
    if (lobbyBgmFadeRef.current !== null) {
      window.clearInterval(lobbyBgmFadeRef.current);
      lobbyBgmFadeRef.current = null;
    }

    const lobbyActive = !roomState || roomState.roomPhase === "LOBBY";
    audio.muted = bgmMuted;
    if (lobbyActive) {
      audio.volume = LOBBY_BGM_VOLUME;
      if (!bgmMuted) void audio.play().catch(() => undefined);
      return;
    }

    fadeOutAndPause(audio, lobbyBgmFadeRef, LOBBY_BGM_FADE_MS, LOBBY_BGM_VOLUME);
  }, [bgmMuted, roomState?.roomPhase]);

  useEffect(() => {
    const socket = connectSocket("HOST");
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // hostSessionRef가 있으면 이번 connect는 방을 만든 뒤 일어난 재연결이다 — Socket.IO가
      // 새 소켓으로 다시 붙어도 서버 쪽 socket.data(roomCode 등)는 이어지지 않으므로, 토큰으로
      // 같은 방을 다시 붙잡아야 한다.
      const session = hostSessionRef.current;
      if (!session) return;
      setHostReconnectStatus("reconnecting");
      socket.emit(
        "room:hostReconnect",
        { requestId: newRequestId(), roomCode: session.roomCode, hostReconnectToken: session.hostReconnectToken },
        (ack: Ack<{ state: RoomState }>) => {
          if (!ack.ok) {
            hostSessionRef.current = null;
            setHostReconnectStatus("failed");
            return;
          }
          setRoomState(ack.data.state);
          setHostReconnectStatus("idle");
        },
      );
    });
    socket.on("disconnect", () => {
      setConnected(false);
      if (hostSessionRef.current) setHostReconnectStatus("reconnecting");
    });

    socket.on("room:state", (evt) => {
      setRoomState(evt.data);
      if (evt.data.roomPhase === "LOBBY") setGameResult(null);
    });
    socket.on("excavation:progress", (evt) => {
      setRoomState((prev) => (prev ? applyExcavationProgress(prev, evt.data) : prev));
      // 뼈 구간(0~100%)이 아니라 팀의 발굴 전체 목표치 대비 누적 진행도를 넘긴다 — 웨이브
      // 수(=뼈 구간 개수)가 인원수에 비례해 줄어들다 보니(§boneCountForTeam), 구간 단위로
      // 넘기면 인원이 적을수록 땅 파는 연출이 총 몇 번 안 일어나 같은 발굴지가 유독 조금만
      // 파인 것처럼 보였다. 팀 전체 목표치 기준으로 바꾸면 인원수와 무관하게 땅이 고르게 파인다.
      const playerCount = roomStateRef.current?.teams[evt.data.teamId]?.playerIds.length ?? 1;
      const totalPointsNeeded = boneCountForTeam(playerCount) * EXCAVATION_POINTS_PER_BONE;
      const progress = Math.min(100, Math.max(0, (evt.data.points / totalPointsNeeded) * 100));
      bridge.send("EXCAVATION_PROGRESS", { teamId: evt.data.teamId, progress });
    });
    socket.on("excavation:boneFound", (evt) => {
      setRoomState((prev) => (prev ? applyBoneFound(prev, evt.data) : prev));
      bridge.send("BONE_DISCOVERED", { teamId: evt.data.teamId, boneId: evt.data.boneId, position: { x: 0.5, y: 0.5 } });
    });
    socket.on("excavation:eventTriggered", (evt) => setRoomState((prev) => (prev ? applyExcavationEvent(prev, evt.data) : prev)));
    socket.on("excavation:teamFinished", (evt) => setRoomState((prev) => (prev ? applyExcavationTeamFinished(prev, evt.data) : prev)));
    socket.on("excavation:dustAttacked", (evt) => {
      const targetTeamId = evt.data.targetTeamId;
      setEphemeral((prev) => ({
        ...prev,
        dustAttackByTeam: {
          ...prev.dustAttackByTeam,
          [targetTeamId]: {
            attackerNickname: evt.data.attackerNickname,
            disruptedUntil: evt.data.disruptedUntil,
          },
        },
      }));
      window.setTimeout(() => {
        setEphemeral((prev) => {
          const current = prev.dustAttackByTeam[targetTeamId];
          if (!current || current.disruptedUntil > Date.now()) return prev;
          return {
            ...prev,
            dustAttackByTeam: { ...prev.dustAttackByTeam, [targetTeamId]: undefined },
          };
        });
      }, Math.max(0, evt.data.disruptedUntil - Date.now()) + 50);
    });
    socket.on("team:phaseChanged", (evt) => setRoomState((prev) => (prev ? applyTeamPhaseChanged(prev, evt.data) : prev)));
    socket.on("dino:started", (evt) => setRoomState((prev) => (prev ? applyDinoStarted(prev, evt.data) : prev)));
    // 운석 피하기(ASSEMBLY)가 이제 발굴보다 먼저라 이 시점엔 아직 발견된 뼈가 하나도 없다 —
    // 예전엔 발굴이 먼저 끝난 뒤라 여기서 점수 비례로 조각을 미리 스냅해 "조립되는" 연출을
    // 줬지만, 지금 그대로 두면 발굴 시작 전에 뼈대가 이미 완성돼 보이는 버그가 된다. 실제
    // 조립 완료 연출은 발굴이 끝나 CHARGING_PRACTICE로 넘어갈 때 snapshotForTeam이 처리한다.
    socket.on("dino:hit", (evt) => setRoomState((prev) => (prev ? applyDinoHit(prev, evt.data) : prev)));
    socket.on("dino:bonus", (evt) => setRoomState((prev) => (prev ? applyDinoBonus(prev, evt.data) : prev)));
    socket.on("dino:playerDied", (evt) => setRoomState((prev) => (prev ? applyPlayerDied(prev, evt.data) : prev)));
    socket.on("dino:finished", (evt) => setRoomState((prev) => (prev ? applyDinoFinished(prev, evt.data) : prev)));
    socket.on("dino:teamResult", (evt) => setRoomState((prev) => (prev ? applyDinoTeamResult(prev, evt.data) : prev)));
    socket.on("energy:coreChanged", (evt) => {
      setRoomState((prev) => (prev ? applyCoreChanged(prev, evt.data) : prev));
      setEphemeral((prev) => ({
        ...prev,
        coreChangesAtByTeam: { ...prev.coreChangesAtByTeam, [evt.data.teamId]: evt.data.nextChangeAt },
      }));
    });
    socket.on("revival:formChanged", (evt) => {
      setRoomState((prev) => (prev ? applyRevivalFormChanged(prev, evt.data) : prev));
      bridge.send("REVIVAL_RESULT", { teamId: evt.data.teamId, form: evt.data.form, purified: evt.data.form === "NORMAL" });
    });
    socket.on("game:result", (evt) => {
      setRoomState((prev) => (prev ? applyGameResult(prev, evt.data) : prev));
      setGameResult(evt.data);
    });

    socket.on("trex:transform", (evt) => {
      setEphemeral((prev) => ({
        ...prev,
        trexByTeam: {
          ...prev.trexByTeam,
          [evt.data.teamId]: {
            position: evt.data.position,
            facing: evt.data.facing,
            activeCore: evt.data.activeCore,
            corePosition: evt.data.corePosition,
            activeCores: evt.data.activeCores,
            corePositions: evt.data.corePositions,
            chargingStage: evt.data.chargingStage,
            finalLives: evt.data.finalLives,
            finalCoreDeadlineAt: evt.data.finalCoreDeadlineAt,
            finalStunnedUntil: evt.data.finalStunnedUntil,
          },
        },
      }));
      bridge.send("TREX_TRANSFORM", {
        teamId: evt.data.teamId,
        position: evt.data.position,
        rotationDeg: evt.data.rotationDeg,
        facing: evt.data.facing,
        poseId: evt.data.poseId,
      });
    });
    socket.on("aim:playerMoved", (evt) => {
      const currentRoom = roomStateRef.current;
      const player = currentRoom?.players.find((candidate) => candidate.id === evt.data.playerId);
      if (!currentRoom || !player) return;

      pendingCrosshairsRef.current[evt.data.playerId] = {
        playerId: evt.data.playerId,
        teamId: evt.data.teamId,
        point: evt.data.point,
        color: player.color,
        receivedAt: Date.now(),
      };

      // CHARGING에서는 React 배틀 화면이 조준점을 직접 표시한다. 뒤에 남아 있는 Godot에도
      // 같은 고빈도 좌표를 중복 전송하면 두 렌더러가 동시에 갱신돼 프레임 드롭이 커진다.
      if (currentRoom.teams[evt.data.teamId].phase !== "CHARGING") {
        const nextCrosshairs = { ...ephemeralRef.current.crosshairsByPlayer, ...pendingCrosshairsRef.current };
        const teamCrosshairs = Object.values(nextCrosshairs)
          .filter((crosshair) => crosshair.teamId === evt.data.teamId)
          .map((crosshair) => ({
            playerId: crosshair.playerId,
            color: crosshair.color,
            point: crosshair.point,
            active: true,
          }));
        bridge.send("CROSSHAIRS", { teamId: evt.data.teamId, crosshairs: teamCrosshairs });
      }

      // 여러 플레이어가 각각 20Hz로 보내도 React 전체 배틀 화면은 최대 약 30Hz만 갱신한다.
      if (crosshairFlushTimerRef.current === null) {
        crosshairFlushTimerRef.current = window.setTimeout(() => {
          const pending = pendingCrosshairsRef.current;
          pendingCrosshairsRef.current = {};
          crosshairFlushTimerRef.current = null;
          setEphemeral((prev) => ({
            ...prev,
            crosshairsByPlayer: { ...prev.crosshairsByPlayer, ...pending },
          }));
        }, 33);
      }
    });
    socket.on("energy:shotResolved", (evt) => {
      setRoomState((prev) => (prev ? applyShotResolved(prev, evt.data) : prev));
      setEphemeral((prev) => ({ ...prev, hitFlashByTeam: { ...prev.hitFlashByTeam, [evt.data.teamId]: evt.data.hit ? "HIT" : "MISS" } }));
      window.setTimeout(() => {
        setEphemeral((prev) => ({ ...prev, hitFlashByTeam: { ...prev.hitFlashByTeam, [evt.data.teamId]: undefined } }));
      }, 250);

      // 배틀 화면의 발사 임팩트 연출용 — 900ms 뒤 스스로 사라지는 일회성 이벤트로만 취급한다.
      const isCoreHit = evt.data.hitZone === "HEART" || evt.data.hitZone === "SKULL" || evt.data.hitZone === "SPINE";
      const shotEventId = `${evt.data.playerId}-${evt.data.shotId}`;
      const impactPoint = evt.data.hitPoint ?? evt.data.aimPoint;
      const shooter = roomStateRef.current?.players.find((player) => player.id === evt.data.playerId);
      setEphemeral((prev) => ({
        ...prev,
        battleShotEvents: [
          ...prev.battleShotEvents,
          {
            id: shotEventId,
            team: evt.data.teamId,
            playerId: evt.data.playerId,
            playerColor: shooter?.color ?? roomStateRef.current?.teamStyles[evt.data.teamId].color ?? "#ffffff",
            playerName: shooter?.nickname ?? "플레이어",
            scoreDelta: evt.data.energyDelta,
            hit: evt.data.hit,
            core: isCoreHit,
            point: [impactPoint.x, impactPoint.y],
            ts: Date.now(),
          },
        ],
      }));
      window.setTimeout(() => {
        setEphemeral((prev) => ({ ...prev, battleShotEvents: prev.battleShotEvents.filter((e) => e.id !== shotEventId) }));
      }, 1200);

      bridge.send("ENERGY_HIT", {
        teamId: evt.data.teamId,
        hitZone: evt.data.hitZone,
        hitPoint: evt.data.hitPoint,
        energy: evt.data.energyAfter,
        stability: evt.data.stabilityAfter,
      });
    });

    return () => {
      if (crosshairFlushTimerRef.current !== null) window.clearTimeout(crosshairFlushTimerRef.current);
      socket.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - CROSSHAIR_STALE_MS;
      setEphemeral((prev) => {
        const next: Record<PlayerId, ChargingEphemeral["crosshairsByPlayer"][string]> = {};
        let changed = false;
        for (const [playerId, crosshair] of Object.entries(prev.crosshairsByPlayer)) {
          if (crosshair.receivedAt < cutoff) {
            changed = true;
            continue;
          }
          next[playerId] = crosshair;
        }
        return changed ? { ...prev, crosshairsByPlayer: next } : prev;
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 240 }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [joinUrl]);

  const handleCreateRoom = (roomName: string, maxPlayersPerTeam: number, teamAName: string, teamBName: string) => {
    setStartError(null);
    setCreating(true);
    socketRef.current?.emit(
      "room:create",
      {
        requestId: newRequestId(),
        roomName,
        settings: {
          maxPlayersPerTeam,
          roundDurationSec: 300,
          language: "ko",
          teamAName: teamAName.trim() || undefined,
          teamBName: teamBName.trim() || undefined,
        },
      },
      (ack: Ack<RoomCreateResponse>) => {
        setCreating(false);
        if (!ack.ok) {
          setStartError(describeAckError(ack.error.code));
          return;
        }
        hostSessionRef.current = { roomCode: ack.data.roomCode, hostReconnectToken: ack.data.hostReconnectToken };
        setJoinUrl(ack.data.joinUrl);
        setRoomState(ack.data.state);
      },
    );
  };

  useEffect(() => {
    if (!roomState) return;
    bridge.sendFullSnapshot({
      revision: roomState.revision,
      teams: {
        A: snapshotForTeam(roomState.teams.A),
        B: snapshotForTeam(roomState.teams.B),
      },
    });
  }, [roomState, bridge]);

  const handleEnterFromHome = () => {
    const audio = lobbyBgmRef.current;
    if (audio && !bgmMuted) void audio.play().catch(() => undefined);
    setHomeStarted(true);
  };

  const handleStart = () => {
    setStartError(null);
    socketRef.current?.emit("game:start", { requestId: newRequestId() }, (ack: Ack<GameStartResponse>) => {
      if (!ack.ok) setStartError(describeAckError(ack.error.code));
    });
  };

  if (!homeStarted) {
    return (
      <main className="desktop-lobby">
        <div className="home-screen">
          <div className="home-screen__scrim" />
          <button
            type="button"
            className="home-screen__settings"
            aria-label={bgmMuted ? "로비 음악 켜기" : "로비 음악 끄기"}
            onClick={() => setBgmMuted((muted) => !muted)}
          >
            {bgmMuted ? "🔇" : "🔊"}
          </button>
          <img className="home-screen__logo-mark" src="/images/logo.png" alt="내 티라노를 살려내!" />
          <div className="home-screen__corner">
            <button type="button" className="home-screen__cta" onClick={handleEnterFromHome} disabled={!connected || creating}>
              🦴 방 만들기
            </button>
            {!connected && <p className="home-screen__hint">서버에 연결하는 중…</p>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="desktop-lobby">
      {hostReconnectStatus === "reconnecting" && (
        <div className="host-reconnect-banner host-reconnect-banner--pending">서버와 연결이 끊어졌어요. 재연결 시도 중…</div>
      )}
      {hostReconnectStatus === "failed" && (
        <div className="host-reconnect-banner host-reconnect-banner--failed">
          방 연결을 되살리지 못했어요. 새로고침해서 다시 시작해주세요.
        </div>
      )}
      {(!roomState || roomState.roomPhase === "LOBBY" || roomState.roomPhase === "RESULT") && (
        <button
          type="button"
          className={`lobby-bgm-toggle${roomState?.roomPhase === "RESULT" ? " lobby-bgm-toggle--result" : ""}`}
          aria-label={bgmMuted ? "소리 켜기" : "소리 끄기"}
          onClick={() => setBgmMuted((muted) => !muted)}
        >
          {bgmMuted ? "🔇" : "🔊"}
        </button>
      )}
      {/* 사격 화면은 별도 Three.js WebGL을 사용한다. 이때 Godot까지 뒤에서 계속 렌더링하면
          GPU 컨텍스트 두 개가 경쟁하므로 사격 동안 iframe을 언마운트해 자원을 해제한다. */}
      {shouldRenderGodotStage && <GodotStage />}
      <div className="desktop-lobby__scrim" />

      <div className="desktop-lobby__overlay">
        {!connected && (
          <header className="lobby-header">
            <img className="lobby-header__logo" src="/images/logo.png" alt="내 티라노를 살려내!" />
            <p className="lobby-header__subtitle">죽은 티라노, 정말 살려드립니다</p>
          </header>
        )}

        {!roomState && !connected && (
          <section className="lobby-connecting">
            <div className="lobby-spinner" />
            <p className="lobby-connecting__title">서버에 연결하는 중…</p>
            <p className="lobby-connecting__hint">잠시만 기다려주세요</p>
          </section>
        )}

        {!roomState && connected && <CreateRoomForm onCreate={handleCreateRoom} creating={creating} error={startError} />}

        {roomState?.roomPhase === "LOBBY" && (
          <>
            <header className="lobby-header lobby-header--centered">
              <img className="lobby-header__logo lobby-header__logo--big" src="/images/logo.png" alt="내 티라노를 살려내!" />
              <p className="lobby-header__subtitle">죽은 티라노, 정말 살려드립니다</p>
            </header>

            <section className="lobby-main">
              <TeamCard roomState={roomState} teamId="A" />

              <div className="lobby-code-card lobby-code-card--qr-only">
                <div className="lobby-code-card__qr">
                  <h2 className="lobby-room-name">{roomState.roomName}</h2>
                  {qrDataUrl && <img src={qrDataUrl} alt="입장 QR 코드" width={220} height={220} />}
                  <span className="lobby-code-card__code">코드 {roomState.roomCode}</span>
                </div>
              </div>

              <TeamCard roomState={roomState} teamId="B" />
            </section>

            <div className="lobby-actions">
              {startError && (
                <div className="lobby-error-banner lobby-error-banner--inline">
                  <span className="lobby-error-banner__icon">⚠</span>
                  <span>{startError}</span>
                </div>
              )}

              <button type="button" className="lobby-start__button" onClick={handleStart}>
                게임 시작
              </button>
            </div>
          </>
        )}

        {roomState && roomState.roomPhase === "PLAYING" && <PlayArea roomState={roomState} ephemeral={ephemeral} />}
        {roomState && roomState.roomPhase === "RESULT" && (
          gameResult === null ? (
            <section className="ending-sequence ending-sequence--pending" aria-label="결과를 불러오는 중" />
          ) : (
            <EndingSequence
              key={gameResult.finishedAt}
              enabled={gameResult.teams.some((team) => team.form !== "NONE")}
              onDone={() => setResultBodyVisible(true)}
            >
              <ResultView
                roomState={roomState}
                gameResult={gameResult}
                socket={socketRef.current}
                onRematch={(state) => {
                  setRoomState(state);
                  setGameResult(null);
                  setStartError(null);
                }}
              />
            </EndingSequence>
          )
        )}

        <DebugPanel bridge={bridge} />
      </div>
    </main>
  );
}

function CreateRoomForm({
  onCreate,
  creating,
  error,
}: {
  onCreate: (roomName: string, maxPlayersPerTeam: number, teamAName: string, teamBName: string) => void;
  creating: boolean;
  error: string | null;
}): JSX.Element {
  const [roomName, setRoomName] = useState("");
  const [maxPlayersPerTeam, setMaxPlayersPerTeam] = useState(DEFAULT_MAX_PLAYERS_PER_TEAM);
  const [teamAName, setTeamAName] = useState("");
  const [teamBName, setTeamBName] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = roomName.trim();
    if (trimmed.length === 0 || creating) return;
    onCreate(trimmed, maxPlayersPerTeam, teamAName, teamBName);
  };

  return (
    <section className="lobby-connecting lobby-connecting--create">
      <div className="lobby-main__center">
        <img className="lobby-header__logo lobby-header__logo--big" src="/images/logo.png" alt="내 티라노를 살려내!" />
        <p className="lobby-header__subtitle">죽은 티라노, 정말 살려드립니다</p>
        <form className="lobby-create-card" onSubmit={handleSubmit}>
          <label className="lobby-create-card__field">
            <span>방 이름</span>
            <input
              className="lobby-create-card__input"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value.slice(0, ROOM_NAME_MAX_LENGTH))}
              maxLength={ROOM_NAME_MAX_LENGTH}
              placeholder="방 이름을 입력하세요"
              autoFocus
            />
          </label>
          <label className="lobby-create-card__field">
            <span>팀 A 이름</span>
            <input
              className="lobby-create-card__input"
              value={teamAName}
              onChange={(e) => setTeamAName(e.target.value.slice(0, TEAM_NAME_MAX_LENGTH))}
              maxLength={TEAM_NAME_MAX_LENGTH}
              placeholder={TEAM_DISPLAY_NAMES.A}
            />
          </label>
          <label className="lobby-create-card__field">
            <span>팀 B 이름</span>
            <input
              className="lobby-create-card__input"
              value={teamBName}
              onChange={(e) => setTeamBName(e.target.value.slice(0, TEAM_NAME_MAX_LENGTH))}
              maxLength={TEAM_NAME_MAX_LENGTH}
              placeholder={TEAM_DISPLAY_NAMES.B}
            />
          </label>
          <label className="lobby-create-card__field">
            <span>팀별 최대 인원</span>
            <input
              className="lobby-create-card__input"
              type="number"
              min={1}
              max={MAX_PLAYERS_PER_TEAM_CAP}
              value={maxPlayersPerTeam}
              onChange={(e) => setMaxPlayersPerTeam(Math.min(MAX_PLAYERS_PER_TEAM_CAP, Math.max(1, Number(e.target.value) || 1)))}
            />
          </label>
          {error && (
            <div className="lobby-error-banner lobby-error-banner--inline">
              <span className="lobby-error-banner__icon">⚠</span>
              <span>{error}</span>
            </div>
          )}
          <button type="submit" className="lobby-start__button" disabled={creating || roomName.trim().length === 0}>
            방 만들기
          </button>
        </form>
      </div>
    </section>
  );
}

function TeamCard({ roomState, teamId }: { roomState: RoomState; teamId: TeamId }): JSX.Element {
  const players = roomState.players.filter((p) => p.teamId === teamId);
  const emptySlots = Math.max(0, roomState.maxPlayersPerTeam - players.length);
  return (
    <div
      className={`lobby-team-card lobby-team-card--${teamId.toLowerCase()}`}
      style={{ "--team-color": roomState.teamStyles[teamId].color } as CSSProperties}
    >
      <div className="lobby-team-card__header">
        <span className="lobby-team-card__name">
          {roomState.teamStyles[teamId].emoji} {roomState.teamNames[teamId]}
        </span>
        <span className="lobby-team-card__count">
          {players.length}/{roomState.maxPlayersPerTeam}명
        </span>
      </div>
      <ul className="lobby-team-card__list">
        {players.map((p) => (
          <li key={p.id} className={`lobby-team-card__row${p.connected ? "" : " lobby-team-card__row--disconnected"}`}>
            <span className="lobby-team-card__dot" style={{ background: p.connected ? p.color : "#b8b0a6" }} />
            <span className="lobby-team-card__name-text">{p.nickname}</span>
            {!p.connected && <span className="lobby-team-card__status-text">연결 끊김</span>}
            <span className="lobby-team-card__status-icon">{p.connected && p.ready ? <ReadyCheckIcon /> : ""}</span>
          </li>
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <li key={`empty-${i}`} className="lobby-team-card__row lobby-team-card__row--empty">
            빈 자리
          </li>
        ))}
      </ul>
    </div>
  );
}

function snapshotForTeam(team: RoomState["teams"][TeamId]) {
  const totalPointsNeeded = boneCountForTeam(team.playerIds.length) * EXCAVATION_POINTS_PER_BONE;
  return {
    phase: team.phase,
    excavationPoints: team.excavation.points,
    excavationProgress: Math.min(100, Math.max(0, (team.excavation.points / totalPointsNeeded) * 100)),
    discoveredBoneIds: team.excavation.discoveredBoneIds,
    puzzlePieces: BONE_IDS.map((boneId) => ({
      boneId,
      transform: PUZZLE_TARGET_TRANSFORMS[boneId],
      // 발굴(EXCAVATION)을 이미 지나 영점 연습/사격/부활 단계면 조립 완료로 표시한다.
      // dinoRun.grade는 이제 운석 피하기가 먼저라 발굴 시작 전에 이미 채워져 있으므로
      // 더 이상 "조립 끝났다"의 기준으로 쓸 수 없다.
      fixed: team.phase === "CHARGING_PRACTICE" || team.phase === "CHARGING" || team.phase === "REVIVED",
    })),
    trex: { position: { x: 0.5, y: 0.5 }, rotationDeg: 0, facing: "RIGHT" as const, poseId: "IDLE" as const },
    energy: team.charging.energy,
    stability: team.charging.stability,
    form: team.charging.form,
  };
}
