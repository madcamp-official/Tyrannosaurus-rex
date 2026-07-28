/**
 * Plan.md §5.2, §6.2. 모바일 운석 피하기: 화면 좌/우를 눌러 공룡을 움직여 떨어지는 운석을
 * 피하고 보너스 아이템을 잡는다(터치 전용 — 자이로는 쓰지 않는다). 운석은 낙하를 시작하는
 * 순간 공룡이 있던 자리를 목표로 고정해 "공룡을 따라다니다 떨어지는" 느낌을 준다. 다이노런
 * (장애물 점프) 대신이지만 컴포넌트 이름과 이벤트 접두사(dino:*)는 리네임 범위를 줄이기
 * 위해 그대로 두었다.
 */

import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  DINO_POSITION_UPDATE_MAX_HZ,
  PHASE_START_GRACE_MS,
  DINO_RUN_DURATION_MS,
  METEOR_DODGE_LIVES,
  SKY_OBJECT_FALL_MS,
  type PlayerId,
  type TeamState,
} from "@trex/shared";
import type { AppSocket } from "../socket";

const FLASH_MS = 350;
/** 화면 좌/우를 누르고 있는 동안 초당 이동하는 비율(0~1 기준) — 매 프레임(rAF) 델타 타임에
 * 비례해 갱신해서 인터벌 틱 단위로 끊기지 않고 부드럽게 이동한다. */
const MOVE_SPEED_PER_SEC = 1.6;
/** 과일 종류를 오브젝트 id로 결정적으로 골라 시각적으로 다양하게 보이게 한다. */
const FRUIT_EMOJIS = ["🍎", "🍇", "🍓", "🍑", "🍉"];
/**
 * 운석·보너스가 착지하는(판정되는) 세로 위치 — 공룡이 서 있는 자리와 같은 줄이 되도록
 * 맞춘다. .dino-run__dino의 CSS bottom(16%)과 정확히 대응하는 값(100 - 16)이다.
 */
const LANDING_TOP_PERCENT = 84;

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
  const [flash, setFlash] = useState<"hit" | "bonus" | "heal" | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const xRef = useRef(x);
  xRef.current = x;
  const seqRef = useRef(0);
  const moveDirRef = useRef<0 | 1 | -1>(0);
  const lastFrameRef = useRef(0);
  // 운석이 낙하를 시작하는 순간(처음 화면에 나타나는 시점) 공룡의 위치를 그대로 목표로
  // 고정해 서버 판정(§dinoMeteorLockState)과 같은 지점에 떨어지는 것처럼 보이게 한다.
  const meteorLockRef = useRef<Map<number, number>>(new Map());

  const dead = team.dinoRun.deadPlayerIds.includes(playerId);
  const lives = team.dinoRun.livesByPlayer[playerId] ?? METEOR_DODGE_LIVES;
  const score = team.dinoRun.scoreByPlayer[playerId] ?? 0;

  const prevLivesRef = useRef(lives);
  const prevScoreRef = useRef(score);
  useEffect(() => {
    if (lives < prevLivesRef.current) {
      setFlash("hit");
      window.setTimeout(() => setFlash(null), FLASH_MS);
    } else if (lives > prevLivesRef.current) {
      setFlash("heal");
      window.setTimeout(() => setFlash(null), FLASH_MS);
    } else if (score > prevScoreRef.current) {
      setFlash("bonus");
      window.setTimeout(() => setFlash(null), FLASH_MS);
    }
    prevLivesRef.current = lives;
    prevScoreRef.current = score;
  }, [lives, score]);

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
    lastFrameRef.current = performance.now();
    const loop = () => {
      const frameNow = performance.now();
      const dt = (frameNow - lastFrameRef.current) / 1000;
      lastFrameRef.current = frameNow;
      setNowMs(Date.now());
      // 인터벌 틱이 아니라 매 프레임 델타 타임에 비례해 이동시켜 끊김 없이 부드럽게 움직인다.
      if (moveDirRef.current !== 0) {
        setX((prev) => clamp01(prev + moveDirRef.current * MOVE_SPEED_PER_SEC * dt));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const stopMove = () => {
    moveDirRef.current = 0;
  };

  // 화면(트랙) 오른쪽을 누르면 오른쪽, 왼쪽을 누르면 왼쪽으로 누르고 있는 동안 이동한다.
  const handleTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    moveDirRef.current = event.clientX - rect.left > rect.width / 2 ? 1 : -1;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  // 서버 phaseStartedAt(서버 시계)과 로컬 시계의 오차는 연출용으로만 쓴다 — 실제 판정은
  // 서버 수신 시각 기준이다 (§6.2).
  const elapsed = Math.max(0, nowMs - team.phaseStartedAt - PHASE_START_GRACE_MS);
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
          let objX = obj.x;
          if (obj.kind === "METEOR") {
            let locked = meteorLockRef.current.get(obj.id);
            if (locked === undefined) {
              locked = xRef.current;
              meteorLockRef.current.set(obj.id, locked);
            }
            objX = locked;
          }
          const emoji = obj.kind === "METEOR" ? "☄️" : obj.kind === "HEART" ? "❤️" : FRUIT_EMOJIS[obj.id % FRUIT_EMOJIS.length];
          return (
            <div
              key={obj.id}
              className={`dino-run__sky-object${obj.kind !== "METEOR" ? " dino-run__sky-object--bonus" : ""}`}
              style={{ left: `${objX * 100}%`, top: `${clamp01(progress) * LANDING_TOP_PERCENT}%` }}
            >
              {emoji}
            </div>
          );
        })}
        <div className="dino-run__dino" style={{ left: `${x * 100}%` }}>
          🦖
        </div>
        <div className="dino-run__ground" />
      </div>
      <p className="mobile-game__hint">화면 왼쪽/오른쪽을 눌러 운석☄️은 피하고 과일·하트❤️는 잡으세요!</p>
    </div>
  );
}
