/** Plan.md §5.2, §6.1. 흔들기 센서 + 탭 폴백 발굴 컨트롤. */

import { useEffect, useRef, useState } from "react";
import {
  EXCAVATION_SHAKE_COOLDOWN_MS,
  MOBILE_INPUT_FLUSH_MS,
  type BoneId,
  type SensorPermission,
  type ServerEvent,
  type TeamId,
} from "@trex/shared";
import type { AppSocket } from "../socket";

// 흔드는 방향 — 세로로 든 폰 기준 y=위아래(파는 동작에 가장 자연스러움), x=좌우, z=앞뒤.
const SHAKE_AXIS: "x" | "y" | "z" = "y";
// 방향을 구분할 땐 중력을 뺀 event.acceleration 기준(그래야 폰을 어떻게 들어도 기준이 같다).
const SHAKE_AXIS_THRESHOLD = 10;
// event.acceleration을 못 주는 기기용 폴백 — 중력 포함 벡터 크기(accelerationIncludingGravity) 기준이라 방향 구분은 없다.
const SHAKE_MAGNITUDE_THRESHOLD = 14;
const MAX_COUNT_PER_PACKET = 5;

type MotionPermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

export function ExcavationControls({
  socket,
  teamId,
  result,
}: {
  socket: AppSocket;
  teamId: TeamId;
  result: "WIN" | "LOSE" | "DRAW" | null;
}): JSX.Element {
  const [motionPermission, setMotionPermission] = useState<SensorPermission>("UNKNOWN");
  const [shakeFlash, setShakeFlash] = useState(false);
  const motionCountRef = useRef(0);
  const tapCountRef = useRef(0);
  const seqRef = useRef(0);
  const lastShakeAtRef = useRef(0);

  useEffect(() => {
    if (typeof window.DeviceMotionEvent === "undefined") {
      setMotionPermission("UNSUPPORTED");
      return;
    }
    // 버튼 없이 바로 요청한다 — 입장 폼 제출 시 이미 한 번 요청해둬서(§sensorPermissions),
    // 대부분 여기서는 팝업 없이 캐시된 결과가 즉시 돌아온다.
    const api = window.DeviceMotionEvent as unknown as MotionPermissionApi;
    if (typeof api.requestPermission !== "function") {
      setMotionPermission("GRANTED");
      return;
    }
    api
      .requestPermission()
      .then((result) => setMotionPermission(result === "granted" ? "GRANTED" : "DENIED"))
      .catch(() => setMotionPermission("DENIED"));
  }, []);

  useEffect(() => {
    if (motionPermission !== "GRANTED") return undefined;
    const handleMotion = (event: DeviceMotionEvent) => {
      const now = Date.now();
      if (now - lastShakeAtRef.current < EXCAVATION_SHAKE_COOLDOWN_MS) return;

      let triggered: boolean;
      const pureAcc = event.acceleration;
      if (pureAcc && pureAcc[SHAKE_AXIS] !== null) {
        // 중력을 뺀 값이라 폰을 어느 각도로 들고 있든 SHAKE_AXIS 방향 흔들림만 잡아낸다.
        triggered = Math.abs(pureAcc[SHAKE_AXIS]!) >= SHAKE_AXIS_THRESHOLD;
      } else {
        const acc = event.accelerationIncludingGravity;
        if (!acc) return;
        const magnitude = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
        triggered = magnitude >= SHAKE_MAGNITUDE_THRESHOLD;
      }
      if (!triggered) return;

      lastShakeAtRef.current = now;
      motionCountRef.current += 1;
      setShakeFlash(true);
      window.setTimeout(() => setShakeFlash(false), 150);
    };
    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [motionPermission]);

  useEffect(() => {
    // 우리 팀이 뼈를 찾았을 때만 진동 — excavation:boneFound는 방 전체(양 팀)로 브로드캐스트되니
    // teamId로 걸러야 상대 팀이 찾았을 때까지 울리지 않는다.
    const onBoneFound = (evt: ServerEvent<{ teamId: TeamId; boneId: BoneId; index: number }>) => {
      if (evt.data.teamId !== teamId) return;
      // 배열(패턴) 대신 단일 지속시간이 기기별 구현체 차이에 덜 민감해서 더 안정적으로 동작한다.
      // iOS Safari는 Vibration API 자체가 없어(navigator.vibrate가 undefined) 조용히 무시된다.
      try {
        navigator.vibrate?.(200);
      } catch {
        // 정책상 막힌 기기 등 — 무시.
      }
    };
    socket.on("excavation:boneFound", onBoneFound);
    return () => {
      socket.off("excavation:boneFound", onBoneFound);
    };
  }, [socket, teamId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const motion = Math.min(MAX_COUNT_PER_PACKET, motionCountRef.current);
      const tap = Math.min(MAX_COUNT_PER_PACKET - motion, tapCountRef.current);
      motionCountRef.current = 0;
      tapCountRef.current = 0;
      const count = motion + tap;
      if (count === 0) return;
      seqRef.current += 1;
      socket.emit("excavate:input", {
        seq: seqRef.current,
        count,
        sourceCounts: { motion, tap },
        clientTime: Date.now(),
      });
    }, MOBILE_INPUT_FLUSH_MS);
    return () => window.clearInterval(interval);
  }, [socket]);

  const handleTap = () => {
    tapCountRef.current += 1;
    // 탭도 흔들기와 똑같이 삽 모션을 재생해서, 어느 방식으로 파든 파는 동작이 눈에 보이게 한다.
    setShakeFlash(true);
    window.setTimeout(() => setShakeFlash(false), 150);
  };

  if (result) {
    const label = result === "WIN" ? "🏆 발굴 완료!" : result === "DRAW" ? "무승부" : "발굴 완료";
    return (
      <div className="excavation-controls">
        <p className="excavation-controls__result">{label}</p>
        {result === "WIN" && <p className="hint">상대 팀을 기다리는 중…</p>}
      </div>
    );
  }

  return (
    <div className="excavation-controls">
      <p className="mobile-game__title">흔들어서 뼈를 발굴하세요!</p>
      {motionPermission === "DENIED" && <p className="mobile-game__hint">센서 권한이 꺼져 있어요. 아래 버튼으로 발굴하세요.</p>}
      {motionPermission === "UNSUPPORTED" && <p className="mobile-game__hint">이 기기는 흔들기를 지원하지 않아요. 아래 버튼으로 발굴하세요.</p>}
      {motionPermission === "GRANTED" && <p className="mobile-game__hint">흔드는 대로 자동으로 인식돼요.</p>}
      <div className={`excavation-controls__shovel${shakeFlash ? " excavation-controls__shovel--dig" : ""}`} aria-hidden="true">
        <svg viewBox="0 0 64 64">
          <path d="M38 6c2-4 8-5 11-2s2 9-2 11l-6 3-6-7 3-5Z" fill="currentColor" />
          <path d="m39 14 7 7-24 29-8-8 25-28Z" fill="currentColor" />
          <path d="M8 39c8-3 17 5 17 13 0 5-4 9-9 9S4 55 3 48c0-4 1-7 5-9Z" fill="currentColor" />
        </svg>
      </div>
      <button type="button" className={`dig-button${shakeFlash ? " dig-button--flash" : ""}`} onClick={handleTap}>
        파기
      </button>
    </div>
  );
}
