/** Plan.md §5.2, §6.3. 자이로 전용 조준 파이프라인 + 발사(터치패드 모드는 제거). */

import { useEffect, useRef, useState } from "react";
import { AIM_UPDATE_MAX_HZ, SHOT_COOLDOWN_MS, type NormalizedPoint, type SensorPermission } from "@trex/shared";
import type { AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";

// 속도(rate-control) 방식은 데드존 안으로 정확히 돌아와야 멈춰서, 손떨림만으로도 "계속
// 미끄러진다"는 느낌을 줬다 — 기울인 각도가 곧 조준점 위치인 절대 위치(position-control)
// 방식으로 되돌렸다. 이 방식은 손이 그 자리에 있으면 조준점도 그 자리에 있으므로 "멈춤"
// 개념 자체가 필요 없다. 이 값들은 이전 실기기 테스트로 검증된 값을 기준으로 삼았다.
// 값이 클수록 화면 끝까지 가는 데 더 많이 기울여야 해서 덜 민감해진다. 너무 예민하다는
// 피드백에 따라 좌우/상하 모두 올렸다.
const GYRO_SENSITIVITY_X_DEG = 60;
const GYRO_SENSITIVITY_Y_DEG = 46;
// 0.75는 속도 방식 시절 값이다 — 그때는 이 필터 뒤로 속도 감쇠·위치 적분 단계가 하나 더
// 있어 센서 잡음을 한 번 더 걸러줬다. 절대 위치 방식은 이 필터 값을 바로 화면 위치로
// 쓰므로, 그대로 두면 잡음이 걸러지지 않고 조준점이 가만히 있어도 떨리는("튕김") 원인이
// 된다. 훨씬 낮춰서 이 필터 하나가 잡음을 충분히 눌러주게 했다.
const LOW_PASS_ALPHA = 0.18;
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

export function AimControls({ socket, practice = false }: { socket: AppSocket; practice?: boolean }): JSX.Element {
  const [orientationPermission, setOrientationPermission] = useState<SensorPermission>("UNKNOWN");
  const [calibrated, setCalibrated] = useState(false);
  const [point, setPoint] = useState<NormalizedPoint>({ x: 0.5, y: 0.5 });
  const [cooldownActive, setCooldownActive] = useState(false);
  const [lastResult, setLastResult] = useState<"HIT" | "MISS" | null>(null);

  const pointRef = useRef(point);
  pointRef.current = point;
  const zeroRef = useRef<{ beta: number; gamma: number } | null>(null);
  const filteredRef = useRef({ beta: 0, gamma: 0 });
  // 튐 판정은 반드시 직전 raw 값과 비교한다. 필터링된 값과 비교하면 정상적인 빠른
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
        filteredRef.current = { beta: event.beta, gamma: event.gamma };
        lastRawRef.current = { beta: event.beta, gamma: event.gamma };
        hasReadingRef.current = true;
      } else {
        const rawDeltaBeta = Math.abs(event.beta - lastRawRef.current.beta);
        const rawDeltaGamma = Math.abs(event.gamma - lastRawRef.current.gamma);
        const isGlitch = rawDeltaBeta > MAX_FRAME_DELTA_DEG || rawDeltaGamma > MAX_FRAME_DELTA_DEG;
        // raw 추적값은 글리치 여부와 무관하게 항상 갱신한다 — 그래야 다음 프레임의 비교
        // 기준이 실제 기기 자세를 계속 따라가고, 정상적인 빠른 움직임이 연쇄적으로 계속
        // 걸러지는 일이 없다. 글리치로 판단된 딱 그 한 프레임만 필터 반영에서 제외한다.
        lastRawRef.current = { beta: event.beta, gamma: event.gamma };
        if (isGlitch) return;
        filteredRef.current = {
          beta: filteredRef.current.beta + (event.beta - filteredRef.current.beta) * LOW_PASS_ALPHA,
          gamma: filteredRef.current.gamma + (event.gamma - filteredRef.current.gamma) * LOW_PASS_ALPHA,
        };
      }
      // "영점 잡기"를 실제로 누르기 전엔 임의의 초기 자세가 영점이 되어버려 조준이 엉뚱한
      // 방향으로 틀어지는 문제가 있었다 — 그래서 명시적으로 누르기 전까진 조준점을 화면
      // 중앙에 고정해두고 움직이지 않는다(필터 값 자체는 계속 갱신해 버튼을 누르는 순간
      // 이미 안정된 값을 영점으로 잡는다).
      if (!zeroRef.current) return;
      // 테스트 기기에서 오른쪽으로 기울이면 gamma가 감소하는 방향으로 들어오므로,
      // dGamma가 작아질수록(오른쪽으로 기울일수록) x가 커지도록 부호를 반전한다.
      const dGamma = filteredRef.current.gamma - zeroRef.current.gamma;
      const dBeta = angleDelta(filteredRef.current.beta, zeroRef.current.beta);
      const nextPoint = {
        x: clamp01(0.5 - dGamma / GYRO_SENSITIVITY_X_DEG / 2),
        y: clamp01(0.5 - dBeta / GYRO_SENSITIVITY_Y_DEG / 2),
      };
      pointRef.current = nextPoint;
      setPoint(nextPoint);
    };
    window.addEventListener("deviceorientation", handleOrientation);
    return () => window.removeEventListener("deviceorientation", handleOrientation);
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
    zeroRef.current = { ...filteredRef.current };
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
