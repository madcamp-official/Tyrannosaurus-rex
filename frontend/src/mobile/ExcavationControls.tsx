/** Plan.md §5.2, §6.1. 흔들기 센서 + 탭 폴백 발굴 컨트롤. */

import { useEffect, useRef, useState } from "react";
import { EXCAVATION_SHAKE_COOLDOWN_MS, MOBILE_INPUT_FLUSH_MS, type SensorPermission } from "@trex/shared";
import type { AppSocket } from "../socket";

const SHAKE_MAGNITUDE_THRESHOLD = 14; // m/s^2, accelerationIncludingGravity 크기 기준 경험적 임계값
const MAX_COUNT_PER_PACKET = 5;

type MotionPermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

export function ExcavationControls({
  socket,
  result,
}: {
  socket: AppSocket;
  result: "WIN" | "LOSE" | null;
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
    }
  }, []);

  useEffect(() => {
    if (motionPermission !== "GRANTED") return undefined;
    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const magnitude = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
      const now = Date.now();
      if (magnitude < SHAKE_MAGNITUDE_THRESHOLD) return;
      if (now - lastShakeAtRef.current < EXCAVATION_SHAKE_COOLDOWN_MS) return;
      lastShakeAtRef.current = now;
      motionCountRef.current += 1;
      setShakeFlash(true);
      window.setTimeout(() => setShakeFlash(false), 150);
    };
    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [motionPermission]);

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

  const requestMotionPermission = async () => {
    const api = window.DeviceMotionEvent as unknown as MotionPermissionApi;
    if (typeof api.requestPermission === "function") {
      try {
        const result = await api.requestPermission();
        setMotionPermission(result === "granted" ? "GRANTED" : "DENIED");
      } catch {
        setMotionPermission("DENIED");
      }
    } else {
      // Android 등 권한 API가 없는 브라우저는 즉시 사용 가능하다고 가정한다.
      setMotionPermission("GRANTED");
    }
  };

  const handleTap = () => {
    tapCountRef.current += 1;
  };

  if (result) {
    return (
      <div className="excavation-controls">
        <p className="excavation-controls__result">{result === "WIN" ? "🏆 발굴 완료!" : "발굴 완료"}</p>
        <p className="hint">상대 팀을 기다리는 중…</p>
      </div>
    );
  }

  return (
    <div className="excavation-controls">
      <p>흔들어서 뼈를 발굴하세요!</p>
      {motionPermission === "UNKNOWN" && (
        <button type="button" onClick={() => void requestMotionPermission()}>
          흔들기 센서 켜기
        </button>
      )}
      {motionPermission === "DENIED" && <p className="hint">센서 권한이 꺼져 있어요. 아래 버튼으로 발굴하세요.</p>}
      {motionPermission === "UNSUPPORTED" && <p className="hint">이 기기는 흔들기를 지원하지 않아요. 아래 버튼으로 발굴하세요.</p>}
      {motionPermission === "GRANTED" && <p className="hint">흔드는 대로 자동으로 인식돼요.</p>}
      <button type="button" className={`dig-button${shakeFlash ? " dig-button--flash" : ""}`} onClick={handleTap}>
        🦴 파기
      </button>
    </div>
  );
}
