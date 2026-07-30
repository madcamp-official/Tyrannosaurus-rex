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
const GYRO_SENSITIVITY_Y_DEG = 45;
// 0.75는 속도 방식 시절 값이다 — 그때는 이 필터 뒤로 속도 감쇠·위치 적분 단계가 하나 더
// 있어 센서 잡음을 한 번 더 걸러줬다. 절대 위치 방식은 이 필터 값을 바로 화면 위치로
// 쓰므로, 그대로 두면 잡음이 걸러지지 않고 조준점이 가만히 있어도 떨리는("튕김") 원인이
// 된다. 훨씬 낮춰서 이 필터 하나가 잡음을 충분히 눌러주게 했다.
const LOW_PASS_ALPHA = 0.18;
// DeviceOrientationEvent의 beta/gamma는 오일러 각이라 기기를 크게(특히 ±90도 근처까지)
// 기울이면 한 프레임 만에 값이 반대 부호로 튈 수 있다(짐벌락류 불연속) — 조준점이 순간적으로
// 반대 방향으로 튀는 버그의 원인. 한 프레임에 물리적으로 있을 수 없는 큰 변화(사람이 손으로
// 그렇게 빨리 못 돌림)가 감지되면 그 프레임은 필터에 반영하지 않고 그냥 버린다.
const MAX_FRAME_DELTA_DEG = 75;
// gamma는 스펙상 ±90도로 클램프되는데, 그 경계 근처는 오일러각 특성상 값 자체가
// 불안정해진다(짐벌락류) — 한 프레임 튐이 아니라 여러 프레임에 걸쳐 계속 흔들릴 수도 있어
// MAX_FRAME_DELTA_DEG 필터만으로는 못 잡는다. raw gamma가 이 한계를 넘으면 그 프레임은
// 아예 필터 갱신을 건너뛰고 마지막 안정값을 유지한다 — 조준점이 그 구간에서 튀는 대신
// 가장자리에서 멈춰 있는 것처럼 보인다.
// 처음엔 80으로 뒀는데, GYRO_SENSITIVITY_X_DEG(60)와의 여유가 20도뿐이었다 — 영점(zeroRef)은
// "그 순간 손에 들고 있던 자세"를 그대로 잡으므로 gamma가 0이 아닌 채로 잡히는 게 흔하다.
// 영점이 예를 들어 +20이면 왼쪽 끝(dGamma=+60)에서 실제 gamma는 80으로 이 문턱에 바로
// 걸리는데, 오른쪽 끝(dGamma=-60)은 gamma=-40이라 전혀 안 걸린다 — 똑같이 움직여도 한쪽만
// 이 안전장치에 갇혀 "그쪽으로는 안 움직인다"로 보였다. 진짜 특이점 각도 근처의 아주
// 좁은 구간만 잡도록 여유를 넉넉히 뒀다.
const GAMMA_UNSTABLE_ZONE_DEG = 87;
// DeviceOrientationEvent는 alpha(Z)→beta(X')→gamma(Y'') 순서로 회전을 분해하는데, 가운데
// 회전인 beta가 ±90도에 가까워지면 alpha와 gamma가 서로 뒤엉키는 진짜 짐벌락 지점이다 —
// 화면을 위로 많이 젖힐 때(beta가 90도 쪽으로 붙을 때) 조준점이 위/아래는 멀쩡한데 좌우로
// 튀는 게 바로 이 증상이다(좌우=gamma가 그 근방에서 불안정해짐). beta가 90도(또는 -90도)
// 근처 이 마진 안에 들어오면 마찬가지로 그 프레임의 필터 반영을 건너뛴다.
// 처음엔 12도로 뒀는데 — GYRO_SENSITIVITY_Y_DEG(45)를 고려하면, 영점이 33~57도 근처에서
// 잡힌 흔한 파지 각도에서는 위쪽을 조준하는 정상적인 움직임 대부분이 이 구간에 걸려버려서
// 계속 얼어붙는 게 "렉"처럼 느껴졌다 — 진짜 특이점(정확히 90도) 근처의 아주 좁은 구간만
// 잡도록 대폭 줄였다.
const BETA_GIMBAL_LOCK_MARGIN_DEG = 5;

type OrientationPermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function angleDelta(current: number, zero: number): number {
  return ((current - zero + 540) % 360) - 180;
}

export function AimControls({
  socket,
  practice = false,
  stunnedUntil = null,
}: {
  socket: AppSocket;
  practice?: boolean;
  stunnedUntil?: number | null;
}): JSX.Element {
  const [orientationPermission, setOrientationPermission] = useState<SensorPermission>("UNKNOWN");
  const [calibrated, setCalibrated] = useState(false);
  const [point, setPoint] = useState<NormalizedPoint>({ x: 0.5, y: 0.5 });
  const [cooldownActive, setCooldownActive] = useState(false);
  const [lastResult, setLastResult] = useState<"HIT" | "CORE_HIT" | "MISS" | null>(null);
  const [stunned, setStunned] = useState(false);

  useEffect(() => {
    const update = () => setStunned(stunnedUntil !== null && Date.now() < stunnedUntil);
    update();
    if (!stunnedUntil || Date.now() >= stunnedUntil) return undefined;
    const interval = window.setInterval(update, 50);
    return () => window.clearInterval(interval);
  }, [stunnedUntil]);

  const pointRef = useRef(point);
  pointRef.current = point;
  const laserAudioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    laserAudioRef.current = new Audio("/audio/laser-fire.wav");
    laserAudioRef.current.preload = "auto";
    laserAudioRef.current.volume = 0.35;
    return () => {
      laserAudioRef.current = null;
    };
  }, []);
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
        const isNearGammaGimbalLock = Math.abs(event.gamma) > GAMMA_UNSTABLE_ZONE_DEG;
        const isNearBetaGimbalLock = Math.abs(Math.abs(event.beta) - 90) < BETA_GIMBAL_LOCK_MARGIN_DEG;
        // raw 추적값은 글리치/불안정 여부와 무관하게 항상 갱신한다 — 그래야 다음 프레임의
        // 비교 기준이 실제 기기 자세를 계속 따라가고, 정상적인 빠른 움직임이 연쇄적으로
        // 계속 걸러지는 일이 없다. 딱 이 프레임의 필터 반영만 건너뛴다.
        lastRawRef.current = { beta: event.beta, gamma: event.gamma };
        if (isGlitch || isNearGammaGimbalLock || isNearBetaGimbalLock) return;
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
    if (cooldownActive || stunned) return;
    setCooldownActive(true);
    window.setTimeout(() => setCooldownActive(false), SHOT_COOLDOWN_MS);
    socket.emit("energy:fire", { requestId: newRequestId(), shotId: newRequestId(), clientTime: Date.now() }, (ack) => {
      if (!ack.ok) return;
      // hitZone이 "BONE"이면 몸통에 맞은 일반 명중이고, 그 외(HEART/SKULL/SPINE)면 그 순간의
      // 활성 코어(약점)를 맞춘 것 — 이때만 진동과 함께 더 강하게 번쩍이게 한다. 발사 버튼
      // 터치의 사용자 제스처 안에서 실행해야 모바일 브라우저의 진동 정책에 막히지 않는다.
      const isCoreHit = ack.data.hit && ack.data.hitZone !== null && ack.data.hitZone !== "BONE";
      setLastResult(isCoreHit ? "CORE_HIT" : ack.data.hit ? "HIT" : "MISS");
      if (ack.data.hit) {
        // 매 발사가 아니라 명중했을 때만 재생한다.
        const laserAudio = laserAudioRef.current;
        if (laserAudio) {
          laserAudio.currentTime = 0;
          void laserAudio.play().catch(() => undefined);
        }
      }
      if (isCoreHit) navigator.vibrate?.([90, 45, 150]);
      else if (ack.data.hit) navigator.vibrate?.(110);
      window.setTimeout(() => setLastResult(null), isCoreHit ? 500 : 400);
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

      <div
        className={`aim-pad${lastResult === "HIT" ? " aim-pad--hit" : ""}${lastResult === "CORE_HIT" ? " aim-pad--core-hit" : ""}${lastResult === "MISS" ? " aim-pad--miss" : ""}`}
      >
        <div className="aim-pad__crosshair" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} />
      </div>

      {stunned && <p className="mobile-game__hint">피격 복구 중 · 2초간 발사 불가</p>}
      <button type="button" className="fire-button" disabled={practice || cooldownActive || stunned} onClick={fire}>
        {practice ? "연습 중" : "발사"}
      </button>
    </div>
  );
}
