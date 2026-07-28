/**
 * Plan.md §5.2, §6.2. 모바일 운석 피하기: 화면 좌/우를 눌러(또는 폰을 좌우로 기울여) 공룡을
 * 움직여 떨어지는 운석을 피하고 보너스 아이템을 잡는다. 다이노런(장애물 점프) 대신이지만
 * 컴포넌트 이름과 이벤트 접두사(dino:*)는 리네임 범위를 줄이기 위해 그대로 두었다.
 */

import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  DINO_POSITION_UPDATE_MAX_HZ,
  DINO_RUN_DURATION_MS,
  METEOR_DODGE_LIVES,
  SKY_OBJECT_FALL_MS,
  type PlayerId,
  type SensorPermission,
  type TeamState,
} from "@trex/shared";
import type { AppSocket } from "../socket";

/** 이만큼 기울이면 화면 절반 끝까지 이동 — 값이 작을수록 더 민감하다. */
const GYRO_SENSITIVITY_DEG = 45;
const LOW_PASS_ALPHA = 0.3;
const FLASH_MS = 350;
/** 화면 좌/우를 누르고 있는 동안 한 틱마다 이동하는 비율(0~1 기준). */
const TAP_MOVE_STEP = 0.026;
const TAP_MOVE_INTERVAL_MS = 16;
/**
 * 운석·보너스가 착지하는(판정되는) 세로 위치 — 공룡이 서 있는 자리와 같은 줄이 되도록
 * 맞춘다. .dino-run__dino의 CSS bottom(16%)과 정확히 대응하는 값(100 - 16)이다.
 */
const LANDING_TOP_PERCENT = 84;

type OrientationPermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function DinoRunControls({
  socket,
  team,
  playerId,
  result,
}: {
  socket: AppSocket;
  team: TeamState;
  playerId: PlayerId;
  result: "WIN" | "LOSE" | "DRAW" | null;
}): JSX.Element {
  const [x, setX] = useState(0.5);
  const [orientationPermission, setOrientationPermission] = useState<SensorPermission>("UNKNOWN");
  const [flash, setFlash] = useState<"hit" | "bonus" | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const xRef = useRef(x);
  xRef.current = x;
  const zeroRef = useRef<number | null>(null);
  const filteredGammaRef = useRef(0);
  const seqRef = useRef(0);
  const moveIntervalRef = useRef<number | null>(null);

  const dead = team.dinoRun.deadPlayerIds.includes(playerId);
  const lives = team.dinoRun.livesByPlayer[playerId] ?? METEOR_DODGE_LIVES;
  const score = team.dinoRun.scoreByPlayer[playerId] ?? 0;

  const prevLivesRef = useRef(lives);
  const prevScoreRef = useRef(score);
  useEffect(() => {
    if (lives < prevLivesRef.current) {
      setFlash("hit");
      window.setTimeout(() => setFlash(null), FLASH_MS);
    } else if (score > prevScoreRef.current) {
      setFlash("bonus");
      window.setTimeout(() => setFlash(null), FLASH_MS);
    }
    prevLivesRef.current = lives;
    prevScoreRef.current = score;
  }, [lives, score]);

  useEffect(() => {
    if (typeof window.DeviceOrientationEvent === "undefined") {
      setOrientationPermission("UNSUPPORTED");
      return;
    }
    const api = window.DeviceOrientationEvent as unknown as OrientationPermissionApi;
    // iOS는 requestPermission을 사용자 제스처(탭) 안에서 호출해야 하므로 버튼을 눌러야
    // requestOrientationPermission이 실행된다. 그 외 브라우저는 별도 권한이 필요 없다.
    if (typeof api.requestPermission !== "function") setOrientationPermission("GRANTED");
  }, []);

  const requestOrientationPermission = async () => {
    const api = window.DeviceOrientationEvent as unknown as OrientationPermissionApi;
    if (typeof api.requestPermission !== "function") {
      setOrientationPermission("GRANTED");
      return;
    }
    try {
      const res = await api.requestPermission();
      setOrientationPermission(res === "granted" ? "GRANTED" : "DENIED");
    } catch {
      setOrientationPermission("DENIED");
    }
  };

  useEffect(() => {
    if (orientationPermission !== "GRANTED") return undefined;
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.gamma === null) return;
      if (zeroRef.current === null) {
        // 첫 값을 필터 시작점 겸 영점으로 삼아, 시작하자마자 자연스럽게 화면 중앙을 가리키게 한다.
        filteredGammaRef.current = event.gamma;
        zeroRef.current = event.gamma;
      } else {
        filteredGammaRef.current += (event.gamma - filteredGammaRef.current) * LOW_PASS_ALPHA;
      }
      const dGamma = filteredGammaRef.current - zeroRef.current;
      setX(clamp01(0.5 + dGamma / GYRO_SENSITIVITY_DEG / 2));
    };
    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, [orientationPermission]);

  const recalibrate = () => {
    zeroRef.current = filteredGammaRef.current;
    setX(0.5);
  };

  useEffect(() => {
    if (dead || result) return undefined;
    const interval = window.setInterval(() => {
      seqRef.current += 1;
      socket.emit("dino:position", { seq: seqRef.current, x: xRef.current, clientTime: Date.now() });
    }, 1000 / DINO_POSITION_UPDATE_MAX_HZ);
    return () => window.clearInterval(interval);
  }, [socket, dead, result]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setNowMs(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const startMove = (direction: 1 | -1) => {
    if (moveIntervalRef.current !== null) window.clearInterval(moveIntervalRef.current);
    setX((prev) => clamp01(prev + direction * TAP_MOVE_STEP));
    moveIntervalRef.current = window.setInterval(() => {
      setX((prev) => clamp01(prev + direction * TAP_MOVE_STEP));
    }, TAP_MOVE_INTERVAL_MS);
  };
  const stopMove = () => {
    if (moveIntervalRef.current !== null) {
      window.clearInterval(moveIntervalRef.current);
      moveIntervalRef.current = null;
    }
  };
  useEffect(() => {
    return () => {
      if (moveIntervalRef.current !== null) window.clearInterval(moveIntervalRef.current);
    };
  }, []);

  // 화면(트랙) 오른쪽을 누르면 오른쪽, 왼쪽을 누르면 왼쪽으로 누르고 있는 동안 이동한다.
  const handleTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const direction: 1 | -1 = event.clientX - rect.left > rect.width / 2 ? 1 : -1;
    event.currentTarget.setPointerCapture(event.pointerId);
    startMove(direction);
  };

  // 서버 phaseStartedAt(서버 시계)과 로컬 시계의 오차는 연출용으로만 쓴다 — 실제 판정은
  // 서버 수신 시각 기준이다 (§6.2).
  const elapsed = nowMs - team.phaseStartedAt;
  const remainingSec = Math.max(0, Math.ceil((DINO_RUN_DURATION_MS - elapsed) / 1000));

  if (result) {
    const label = result === "WIN" ? "🏆 승리!" : result === "DRAW" ? "무승부" : "패배";
    return (
      <div className="dino-run dino-run--result">
        <p className="dino-run__death">{label}</p>
        <p className="hint">점수 {score} · 잠시 후 사격으로 넘어갑니다…</p>
      </div>
    );
  }

  if (dead) {
    return (
      <div className="dino-run dino-run--dead">
        <div className="dino-run__hud">
          <span>⏱ {remainingSec}초</span>
          <span>점수 {score}</span>
        </div>
        <p className="dino-run__death">💀 운석에 맞아 탈락했어요!</p>
        <p className="hint">남은 시간 동안 팀원들을 응원해주세요.</p>
      </div>
    );
  }

  return (
    <div className={`dino-run${flash ? ` dino-run--flash-${flash}` : ""}`}>
      <div className="dino-run__hud">
        <span>⏱ {remainingSec}초</span>
        <span>
          {"❤️".repeat(lives)}
          {"🖤".repeat(Math.max(0, METEOR_DODGE_LIVES - lives))}
        </span>
        <span>점수 {score}</span>
      </div>
      <div
        className="dino-run__track"
        onPointerDown={handleTrackPointerDown}
        onPointerUp={stopMove}
        onPointerCancel={stopMove}
        onPointerLeave={stopMove}
      >
        {team.dinoRun.skyObjects.map((obj) => {
          const progress = (elapsed - (obj.hitAtMs - SKY_OBJECT_FALL_MS)) / SKY_OBJECT_FALL_MS;
          if (progress < -0.05 || progress > 1.05) return null;
          return (
            <div
              key={obj.id}
              className={`dino-run__sky-object${obj.kind === "BONUS" ? " dino-run__sky-object--bonus" : ""}`}
              style={{ left: `${obj.x * 100}%`, top: `${clamp01(progress) * LANDING_TOP_PERCENT}%` }}
            >
              {obj.kind === "BONUS" ? "💎" : "☄️"}
            </div>
          );
        })}
        <div className="dino-run__dino" style={{ left: `${x * 100}%` }}>
          🦖
        </div>
        <div className="dino-run__ground" />
      </div>
      {orientationPermission === "GRANTED" && (
        <button type="button" className="mobile-game__button" onClick={recalibrate}>
          다시 영점 잡기
        </button>
      )}
      {orientationPermission === "UNKNOWN" && (
        <button type="button" className="mobile-game__button" onClick={() => void requestOrientationPermission()}>
          자이로 켜기
        </button>
      )}
      <p className="mobile-game__hint">화면 왼쪽/오른쪽을 눌러 공룡을 움직여서 운석☄️을 피하고 보석💎을 잡으세요!</p>
    </div>
  );
}
