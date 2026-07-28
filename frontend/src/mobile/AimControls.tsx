/** Plan.md §5.2, §6.3. 자이로 전용 조준 파이프라인 + 발사(터치패드 모드는 제거). */

import { useEffect, useRef, useState } from "react";
import { AIM_UPDATE_MAX_HZ, CHARGING_PRACTICE_DURATION_MS, SHOT_COOLDOWN_MS, type NormalizedPoint, type SensorPermission, type TeamState } from "@trex/shared";
import type { AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";

// 이만큼 기울이면 화면 절반 끝까지 이동 — 값이 클수록 덜 민감하다. 좌우(자이로 gamma)가
// 위아래(beta)보다 훨씬 민감하게 느껴져서 축마다 따로 둔다.
const GYRO_SENSITIVITY_X_DEG = 100;
const GYRO_SENSITIVITY_Y_DEG = 40;
const LOW_PASS_ALPHA = 0.5;
// DeviceOrientationEvent의 beta/gamma는 오일러 각이라 기기를 크게(특히 ±90도 근처까지)
// 기울이면 한 프레임 만에 값이 반대 부호로 튈 수 있다(짐벌락류 불연속) — 조준점이 순간적으로
// 반대 방향으로 튀는 버그의 원인. 한 프레임에 물리적으로 있을 수 없는 큰 변화(사람이 손으로
// 그렇게 빨리 못 돌림)가 감지되면 그 프레임은 필터에 반영하지 않고 그냥 버린다.
const MAX_FRAME_DELTA_DEG = 60;

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
  const [orientationPermission, setOrientationPermission] = useState<SensorPermission>("UNKNOWN");
  const [calibrated, setCalibrated] = useState(false);
  const [point, setPoint] = useState<NormalizedPoint>({ x: 0.5, y: 0.5 });
  const [cooldownActive, setCooldownActive] = useState(false);
  const [lastResult, setLastResult] = useState<"HIT" | "MISS" | null>(null);

  const pointRef = useRef(point);
  pointRef.current = point;
  const zeroRef = useRef<{ beta: number; gamma: number } | null>(null);
  const filteredRef = useRef({ beta: 0, gamma: 0 });
  const hasReadingRef = useRef(false);
  const seqRef = useRef(0);

  const practiceRemainingSec = usePracticeCountdown(practice, team?.phaseStartedAt ?? Date.now());

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
        hasReadingRef.current = true;
      } else {
        const rawDeltaBeta = Math.abs(event.beta - filteredRef.current.beta);
        const rawDeltaGamma = Math.abs(event.gamma - filteredRef.current.gamma);
        if (rawDeltaBeta > MAX_FRAME_DELTA_DEG || rawDeltaGamma > MAX_FRAME_DELTA_DEG) return;
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
      const dBeta = filteredRef.current.beta - zeroRef.current.beta;
      const dGamma = filteredRef.current.gamma - zeroRef.current.gamma;
      setPoint({
        x: clamp01(0.5 + dGamma / GYRO_SENSITIVITY_X_DEG / 2),
        // 폰 위쪽(윗변)을 몸에서 멀어지게 기울이면 아래로, 몸 쪽으로 기울이면 위로 — beta가
        // 늘어날수록(몸 쪽으로 기울일수록) 위로 가야 하므로 부호를 뒤집는다.
        y: clamp01(0.5 - dBeta / GYRO_SENSITIVITY_Y_DEG / 2),
      });
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
    zeroRef.current = { ...filteredRef.current };
    setCalibrated(true);
    setPoint({ x: 0.5, y: 0.5 });
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
