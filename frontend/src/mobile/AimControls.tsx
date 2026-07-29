/** Plan.md §5.2, §6.3. 자이로 전용 조준 파이프라인 + 발사(터치패드 모드는 제거). */

import { useEffect, useRef, useState } from "react";
import { AIM_UPDATE_MAX_HZ, SHOT_COOLDOWN_MS, type NormalizedPoint, type SensorPermission } from "@trex/shared";
import type { AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";

// 별도 자이로 테스트에서 검증한 기울기 기반 속도 조준 설정.
const MAX_TILT_DEG = 24;
const MAX_AIM_SPEED = 0.4;
const TILT_FILTER_ALPHA = 0.35;
const GYRO_DEADZONE_DEG = 4;
const INPUT_CURVE_EXPONENT = 1.5;
const AXIS_PRIORITY_RATIO = 1.25;
const MINOR_AXIS_SCALE = 0.2;
const MOVE_RESPONSE = 9;
const BRAKE_RESPONSE = 20;
// DeviceOrientationEvent의 beta/gamma는 오일러 각이라 기기를 크게(특히 ±90도 근처까지)
// 기울이면 한 프레임 만에 값이 반대 부호로 튈 수 있다(짐벌락류 불연속) — 조준점이 순간적으로
// 반대 방향으로 튀는 버그의 원인. 한 프레임에 물리적으로 있을 수 없는 큰 변화(사람이 손으로
// 그렇게 빨리 못 돌림)가 감지되면 그 프레임은 필터에 반영하지 않고 그냥 버린다.
const MAX_FRAME_DELTA_DEG = 60;

type OrientationPermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function angleDelta(current: number, zero: number): number {
  return ((current - zero + 540) % 360) - 180;
}

function tiltControl(value: number): number {
  const magnitude = Math.abs(value);
  if (magnitude <= GYRO_DEADZONE_DEG) return 0;
  const amount = clamp01((magnitude - GYRO_DEADZONE_DEG) / (MAX_TILT_DEG - GYRO_DEADZONE_DEG));
  return Math.sign(value) * Math.pow(amount, INPUT_CURVE_EXPONENT);
}

export function AimControls({ socket, practice = false }: { socket: AppSocket; practice?: boolean }): JSX.Element {
  const [orientationPermission, setOrientationPermission] = useState<SensorPermission>("UNKNOWN");
  const [calibrated, setCalibrated] = useState(false);
  const [point, setPoint] = useState<NormalizedPoint>({ x: 0.5, y: 0.5 });
  const [cooldownActive, setCooldownActive] = useState(false);
  const [lastResult, setLastResult] = useState<"HIT" | "MISS" | null>(null);

  const pointRef = useRef(point);
  pointRef.current = point;
  const zeroRef = useRef<{ beta: number; gamma: number } | null>(null);
  const currentReadingRef = useRef({ beta: 0, gamma: 0 });
  const tiltRef = useRef({ roll: 0, pitch: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  // 튐 판정은 반드시 직전 raw 값과 비교한다. 필터링된 기울기와 비교하면 정상적인 빠른
  // 움직임도 누적 오차 때문에 글리치로 오인되어 조준이 멈출 수 있다.
  const lastRawRef = useRef({ beta: 0, gamma: 0 });
  const hasReadingRef = useRef(false);
  const seqRef = useRef(0);

  useEffect(() => {
    if (typeof window.DeviceOrientationEvent === "undefined") {
      setOrientationPermission("UNSUPPORTED");
      return;
    }
    // 버튼 없이 바로 요청한다 — 입장 폼 제출 시 이미 한 번 요청해둬서(§sensorPermissions),
    // 대부분 여기서는 팝업 없이 캐시된 결과가 즉시 돌아온다.
    const api = window.DeviceOrientationEvent as unknown as OrientationPermissionApi;
    if (typeof api.requestPermission !== "function") {
      setOrientationPermission("GRANTED");
      return;
    }
    api
      .requestPermission()
      .then((result) => setOrientationPermission(result === "granted" ? "GRANTED" : "DENIED"))
      .catch(() => setOrientationPermission("DENIED"));
  }, []);

  useEffect(() => {
    if (orientationPermission !== "GRANTED") return undefined;
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      if (!hasReadingRef.current) {
        currentReadingRef.current = { beta: event.beta, gamma: event.gamma };
        lastRawRef.current = { beta: event.beta, gamma: event.gamma };
        hasReadingRef.current = true;
      } else {
        const rawDeltaBeta = Math.abs(event.beta - lastRawRef.current.beta);
        const rawDeltaGamma = Math.abs(event.gamma - lastRawRef.current.gamma);
        const isGlitch = rawDeltaBeta > MAX_FRAME_DELTA_DEG || rawDeltaGamma > MAX_FRAME_DELTA_DEG;
        // raw 추적값은 글리치 여부와 무관하게 항상 갱신한다 — 그래야 다음 프레임의 비교
        // 기준이 실제 기기 자세를 계속 따라가고, 정상적인 빠른 움직임이 연쇄적으로 계속
        // 걸러지는 일이 없다. 글리치로 판단된 딱 그 한 프레임만 입력에서 제외한다.
        lastRawRef.current = { beta: event.beta, gamma: event.gamma };
        if (isGlitch) return;
        currentReadingRef.current = { beta: event.beta, gamma: event.gamma };
      }
      // "영점 잡기"를 실제로 누르기 전엔 임의의 초기 자세가 영점이 되어버려 조준이 엉뚱한
      // 방향으로 틀어지는 문제가 있었다 — 그래서 명시적으로 누르기 전까진 조준점을 화면
      // 중앙에 고정해두고 움직이지 않는다. 버튼을 누르는 순간 최신 센서값을 영점으로 잡는다.
      if (!zeroRef.current) return;
      const roll = currentReadingRef.current.gamma - zeroRef.current.gamma;
      const pitch = angleDelta(currentReadingRef.current.beta, zeroRef.current.beta);
      tiltRef.current = {
        roll: tiltRef.current.roll + (roll - tiltRef.current.roll) * TILT_FILTER_ALPHA,
        pitch: tiltRef.current.pitch + (pitch - tiltRef.current.pitch) * TILT_FILTER_ALPHA,
      };
    };

    let animationFrame = 0;
    let lastFrame = performance.now();
    const integrateAim = (now: number) => {
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      if (zeroRef.current) {
        // 테스트 기기에서 오른쪽 기울기가 gamma 음수로 들어오므로 좌우 입력만 반전한다.
        let vx = -tiltControl(tiltRef.current.roll);
        let vy = tiltControl(tiltRef.current.pitch);
        if (Math.abs(vx) > Math.abs(vy) * AXIS_PRIORITY_RATIO) vy *= MINOR_AXIS_SCALE;
        else if (Math.abs(vy) > Math.abs(vx) * AXIS_PRIORITY_RATIO) vx *= MINOR_AXIS_SCALE;

        const desiredX = vx * MAX_AIM_SPEED;
        const desiredY = -vy * MAX_AIM_SPEED;
        const braking = vx === 0 && vy === 0;
        const response = 1 - Math.exp(-(braking ? BRAKE_RESPONSE : MOVE_RESPONSE) * dt);
        velocityRef.current = {
          x: velocityRef.current.x + (desiredX - velocityRef.current.x) * response,
          y: velocityRef.current.y + (desiredY - velocityRef.current.y) * response,
        };
        if (Math.abs(velocityRef.current.x) > 0.0001 || Math.abs(velocityRef.current.y) > 0.0001) {
          const nextPoint = {
            x: clamp01(pointRef.current.x + velocityRef.current.x * dt),
            y: clamp01(pointRef.current.y + velocityRef.current.y * dt),
          };
          pointRef.current = nextPoint;
          setPoint(nextPoint);
        }
      }
      animationFrame = window.requestAnimationFrame(integrateAim);
    };

    window.addEventListener("deviceorientation", handleOrientation);
    animationFrame = window.requestAnimationFrame(integrateAim);
    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [orientationPermission]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      seqRef.current += 1;
      socket.emit("aim:update", {
        seq: seqRef.current,
        point: pointRef.current,
        mode: "GYRO",
        calibrated,
        clientTime: Date.now(),
      });
    }, 1000 / AIM_UPDATE_MAX_HZ);
    return () => window.clearInterval(interval);
  }, [socket, calibrated]);

  const calibrate = () => {
    if (!hasReadingRef.current) return;
    zeroRef.current = { ...currentReadingRef.current };
    tiltRef.current = { roll: 0, pitch: 0 };
    velocityRef.current = { x: 0, y: 0 };
    setCalibrated(true);
    const centeredPoint = { x: 0.5, y: 0.5 };
    pointRef.current = centeredPoint;
    setPoint(centeredPoint);
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
        <p className="aim-controls__practice-banner">🎯 영점을 맞춘 뒤 데스크탑 화면을 확인하세요</p>
      )}

      {orientationPermission !== "GRANTED" && (
        <p className="mobile-game__hint">
          {orientationPermission === "UNSUPPORTED" ? "이 기기는 자이로를 지원하지 않아요." : "자이로 권한이 필요해요."}
        </p>
      )}
      {orientationPermission === "GRANTED" && (
        <button type="button" className="mobile-game__button" onClick={calibrate}>
          {calibrated ? "다시 영점 잡기" : "화면 중앙을 겨눈 뒤 영점 잡기"}
        </button>
      )}

      <div className={`aim-pad${lastResult === "HIT" ? " aim-pad--hit" : ""}${lastResult === "MISS" ? " aim-pad--miss" : ""}`}>
        <div className="aim-pad__crosshair" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />
      </div>

      <button type="button" className="fire-button" disabled={practice || cooldownActive} onClick={fire}>
        {practice ? "연습 중" : "발사"}
      </button>
    </div>
  );
}
