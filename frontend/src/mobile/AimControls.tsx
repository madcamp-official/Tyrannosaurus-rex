/** Plan.md §5.2, §6.3. 자이로/터치패드 조준 공통 파이프라인 + 발사. */

import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  AIM_UPDATE_MAX_HZ,
  CHARGING_PRACTICE_DURATION_MS,
  SHOT_COOLDOWN_MS,
  type AimMode,
  type NormalizedPoint,
  type SensorPermission,
  type TeamState,
} from "@trex/shared";
import type { AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";

const GYRO_SENSITIVITY_DEG = 45; // 이만큼 기울이면 화면 절반 끝까지 이동
const LOW_PASS_ALPHA = 0.25;
const TOUCHPAD_SENSITIVITY = 1.4;

type OrientationPermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** CHARGING_PRACTICE 동안 표시하는 영점 조정 카운트다운. 서버 phaseStartedAt 기준이라 화면마다 어긋나지 않는다. */
function usePracticeCountdown(active: boolean, phaseStartedAt: number): number {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return undefined;
    let raf = 0;
    const loop = () => {
      setNowMs(Date.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return 0;
  const elapsed = nowMs - phaseStartedAt;
  return Math.max(0, Math.ceil((CHARGING_PRACTICE_DURATION_MS - elapsed) / 1000));
}

export function AimControls({ socket, team, practice = false }: { socket: AppSocket; team?: TeamState; practice?: boolean }): JSX.Element {
  const [aimMode, setAimMode] = useState<AimMode>("TOUCHPAD");
  const [orientationPermission, setOrientationPermission] = useState<SensorPermission>("UNKNOWN");
  const [calibrated, setCalibrated] = useState(false);
  const [point, setPoint] = useState<NormalizedPoint>({ x: 0.5, y: 0.5 });
  const [cooldownActive, setCooldownActive] = useState(false);
  const [lastResult, setLastResult] = useState<"HIT" | "MISS" | null>(null);

  const pointRef = useRef(point);
  pointRef.current = point;
  const zeroRef = useRef<{ beta: number; gamma: number } | null>(null);
  const filteredRef = useRef({ beta: 0, gamma: 0 });
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const seqRef = useRef(0);

  const practiceRemainingSec = usePracticeCountdown(practice, team?.phaseStartedAt ?? Date.now());

  useEffect(() => {
    if (typeof window.DeviceOrientationEvent === "undefined") setOrientationPermission("UNSUPPORTED");
  }, []);

  useEffect(() => {
    if (aimMode !== "GYRO" || orientationPermission !== "GRANTED") return undefined;
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      if (!zeroRef.current) {
        // "영점 잡기" 버튼을 안 눌러도 자이로가 바로 동작하도록, 첫 값을 필터 시작점 겸
        // 영점으로 삼는다 — 0에서부터 필터를 수렴시키면 첫 프레임에 조준점이 튄다.
        filteredRef.current = { beta: event.beta, gamma: event.gamma };
        zeroRef.current = { ...filteredRef.current };
        setCalibrated(true);
      } else {
        filteredRef.current = {
          beta: filteredRef.current.beta + (event.beta - filteredRef.current.beta) * LOW_PASS_ALPHA,
          gamma: filteredRef.current.gamma + (event.gamma - filteredRef.current.gamma) * LOW_PASS_ALPHA,
        };
      }
      const dBeta = filteredRef.current.beta - zeroRef.current.beta;
      const dGamma = filteredRef.current.gamma - zeroRef.current.gamma;
      setPoint({
        x: clamp01(0.5 + dGamma / GYRO_SENSITIVITY_DEG / 2),
        y: clamp01(0.5 + dBeta / GYRO_SENSITIVITY_DEG / 2),
      });
    };
    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, [aimMode, orientationPermission]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      seqRef.current += 1;
      socket.emit("aim:update", {
        seq: seqRef.current,
        point: pointRef.current,
        mode: aimMode,
        calibrated: aimMode === "GYRO" ? calibrated : true,
        clientTime: Date.now(),
      });
    }, 1000 / AIM_UPDATE_MAX_HZ);
    return () => window.clearInterval(interval);
  }, [socket, aimMode, calibrated]);

  const requestOrientationPermission = async () => {
    const api = window.DeviceOrientationEvent as unknown as OrientationPermissionApi;
    if (typeof api.requestPermission === "function") {
      try {
        const result = await api.requestPermission();
        setOrientationPermission(result === "granted" ? "GRANTED" : "DENIED");
      } catch {
        setOrientationPermission("DENIED");
      }
    } else {
      setOrientationPermission("GRANTED");
    }
  };

  const switchMode = (mode: AimMode) => {
    setAimMode(mode);
    setPoint({ x: 0.5, y: 0.5 });
    if (mode === "GYRO" && orientationPermission === "UNKNOWN") void requestOrientationPermission();
  };

  const calibrate = () => {
    zeroRef.current = { ...filteredRef.current };
    setCalibrated(true);
    setPoint({ x: 0.5, y: 0.5 });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (aimMode !== "TOUCHPAD") return;
    dragOriginRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (aimMode !== "TOUCHPAD" || !dragOriginRef.current) return;
    const dx = event.clientX - dragOriginRef.current.x;
    const dy = event.clientY - dragOriginRef.current.y;
    dragOriginRef.current = { x: event.clientX, y: event.clientY };
    const rect = event.currentTarget.getBoundingClientRect();
    setPoint((prev) => ({
      x: clamp01(prev.x + (dx / rect.width) * TOUCHPAD_SENSITIVITY),
      y: clamp01(prev.y + (dy / rect.height) * TOUCHPAD_SENSITIVITY),
    }));
  };
  const handlePointerUp = () => {
    dragOriginRef.current = null;
  };

  const fire = () => {
    if (cooldownActive) return;
    setCooldownActive(true);
    window.setTimeout(() => setCooldownActive(false), SHOT_COOLDOWN_MS);
    socket.emit("energy:fire", { requestId: newRequestId(), shotId: newRequestId(), clientTime: Date.now() }, (ack) => {
      if (!ack.ok) return;
      setLastResult(ack.data.hit ? "HIT" : "MISS");
      window.setTimeout(() => setLastResult(null), 400);
    });
  };

  return (
    <div className="aim-controls">
      {practice && (
        <p className="aim-controls__practice-banner">🎯 영점 조정 연습 중 · {practiceRemainingSec}초 뒤 사격 시작</p>
      )}

      <div className="aim-controls__mode">
        <button type="button" className={aimMode === "TOUCHPAD" ? "active" : ""} onClick={() => switchMode("TOUCHPAD")}>
          터치패드
        </button>
        <button type="button" className={aimMode === "GYRO" ? "active" : ""} onClick={() => switchMode("GYRO")}>
          자이로
        </button>
      </div>

      {aimMode === "GYRO" && orientationPermission !== "GRANTED" && (
        <p className="mobile-game__hint">
          {orientationPermission === "UNSUPPORTED" ? "이 기기는 자이로를 지원하지 않아요." : "자이로 권한이 필요해요."}
        </p>
      )}
      {aimMode === "GYRO" && orientationPermission === "GRANTED" && (
        <button type="button" className="mobile-game__button" onClick={calibrate}>
          {calibrated ? "다시 영점 잡기" : "화면 중앙을 겨눈 뒤 영점 잡기"}
        </button>
      )}

      <div
        className={`aim-pad${lastResult === "HIT" ? " aim-pad--hit" : ""}${lastResult === "MISS" ? " aim-pad--miss" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="aim-pad__crosshair" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />
      </div>

      <button type="button" className="fire-button" disabled={practice || cooldownActive} onClick={fire}>
        {practice ? "연습 중" : "발사"}
      </button>
    </div>
  );
}
