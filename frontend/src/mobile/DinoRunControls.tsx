/** Plan.md §5.2, §6.2. 모바일 다이노런: 달리는 공룡, 다가오는 장애물, 탭 점프. */

import { useEffect, useRef, useState } from "react";
import { DINO_RUN_DURATION_MS, type Ack, type DinoJumpResponse, type PlayerId, type TeamState } from "@trex/shared";
import type { AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";

const JUMP_ANIM_MS = 500;
/** 장애물이 화면 오른쪽 끝에서 공룡까지 오는 데 걸리는 시간(연출용). */
const OBSTACLE_TRAVEL_MS = 1_600;
/** 공룡이 서 있는 지점의 가로 위치 (0=왼쪽, 1=오른쪽). */
const DINO_X = 0.18;

export function DinoRunControls({
  socket,
  team,
  playerId,
}: {
  socket: AppSocket;
  team: TeamState;
  playerId: PlayerId;
}): JSX.Element {
  const seqRef = useRef(0);
  const [jumping, setJumping] = useState(false);
  const [clearedCount, setClearedCount] = useState(0);
  const [dead, setDead] = useState(() => team.dinoRun.deadPlayerIds.includes(playerId));
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const onPlayerDied = (evt: { data: { teamId: string; playerId: PlayerId } }) => {
      if (evt.data.playerId === playerId) setDead(true);
    };
    socket.on("dino:playerDied", onPlayerDied);
    return () => {
      socket.off("dino:playerDied", onPlayerDied);
    };
  }, [socket, playerId]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setNowMs(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 서버 phaseStartedAt(서버 시계)과 로컬 시계의 오차는 LAN 기준 수십 ms 수준이라
  // 연출용으로만 쓴다. 실제 클리어 판정은 서버 수신 시각 기준이다 (§6.2).
  const elapsed = nowMs - team.phaseStartedAt;
  const remainingSec = Math.max(0, Math.ceil((DINO_RUN_DURATION_MS - elapsed) / 1000));

  const jump = () => {
    if (jumping || dead) return;
    setJumping(true);
    window.setTimeout(() => setJumping(false), JUMP_ANIM_MS);
    seqRef.current += 1;
    socket.emit(
      "dino:jump",
      { requestId: newRequestId(), seq: seqRef.current, clientTime: Date.now() },
      (ack: Ack<DinoJumpResponse>) => {
        if (ack.ok) setClearedCount(ack.data.clearedCount);
      },
    );
  };

  if (dead) {
    return (
      <div className="dino-run dino-run--dead">
        <div className="dino-run__hud">
          <span>⏱ {remainingSec}초</span>
          <span>클리어 {clearedCount}</span>
        </div>
        <p className="dino-run__death">💀 선인장에 걸려 넘어졌어요!</p>
        <p className="hint">남은 시간 동안 팀원들을 응원해주세요.</p>
      </div>
    );
  }

  return (
    <div className="dino-run" onPointerDown={jump}>
      <div className="dino-run__hud">
        <span>⏱ {remainingSec}초</span>
        <span>클리어 {clearedCount}</span>
      </div>
      <div className="dino-run__track">
        <div className={`dino-run__dino${jumping ? " dino-run__dino--jump" : ""}`} style={{ left: `${DINO_X * 100}%` }}>
          🦖
        </div>
        {team.dinoRun.obstacleOffsetsMs.map((offsetMs, index) => {
          // 장애물이 정확히 offsetMs 시점에 공룡 위치를 지나도록 역산해 배치한다.
          const progress = (elapsed - (offsetMs - OBSTACLE_TRAVEL_MS)) / OBSTACLE_TRAVEL_MS;
          const x = 1 - (1 - DINO_X) * progress;
          if (x < -0.1 || x > 1.05) return null;
          return (
            <div key={index} className="dino-run__obstacle" style={{ left: `${x * 100}%` }}>
              🌵
            </div>
          );
        })}
        <div className="dino-run__ground" />
      </div>
      <p className="hint">화면을 탭해서 장애물을 뛰어넘으세요! 잘 달릴수록 골격이 튼튼하게 조립됩니다.</p>
    </div>
  );
}
