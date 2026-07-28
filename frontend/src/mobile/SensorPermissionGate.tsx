/**
 * Plan.md §5.2. 라운드가 시작되고 SENSOR_PERMISSION_GRACE_MS 동안은 실제 조작 화면(발굴 등)
 * 대신 센서 권한 안내를 보여준다. iOS는 DeviceMotion/DeviceOrientation 권한 요청이 탭(사용자
 * 제스처) 안에서만 동작하므로, 게임이 급하게 시작돼 버둥대지 않도록 짧은 준비 시간을 준다.
 */

import { useEffect, useState, type ReactNode } from "react";
import { SENSOR_PERMISSION_GRACE_MS } from "@trex/shared";

type PermissionApi = { requestPermission?: () => Promise<"granted" | "denied"> };

function needsGesture(ctor: unknown): boolean {
  return typeof (ctor as PermissionApi | undefined)?.requestPermission === "function";
}

async function requestIfSupported(ctor: unknown): Promise<void> {
  const api = ctor as PermissionApi;
  if (typeof api?.requestPermission !== "function") return;
  try {
    await api.requestPermission();
  } catch {
    // 무시 — 각 조작 화면(발굴/조준)에 이미 있는 권한 버튼으로 다시 시도할 수 있다.
  }
}

export function SensorPermissionGate({ roundStartedAt, children }: { roundStartedAt: number; children: ReactNode }): JSX.Element {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, []);

  const elapsed = nowMs - roundStartedAt;
  if (elapsed >= SENSOR_PERMISSION_GRACE_MS) return <>{children}</>;

  const remainingSec = Math.max(0, Math.ceil((SENSOR_PERMISSION_GRACE_MS - elapsed) / 1000));
  const showButton =
    typeof window.DeviceMotionEvent !== "undefined" && (needsGesture(window.DeviceMotionEvent) || needsGesture(window.DeviceOrientationEvent));

  const grantPermissions = () => {
    setRequested(true);
    void requestIfSupported(window.DeviceMotionEvent);
    void requestIfSupported(window.DeviceOrientationEvent);
  };

  return (
    <div className="sensor-gate">
      <p className="mobile-game__title">🎮 게임 시작 준비 중…</p>
      {showButton ? (
        <button type="button" className="mobile-game__button" onClick={grantPermissions}>
          {requested ? "권한 허용됨 ✅" : "센서 권한 허용하기"}
        </button>
      ) : (
        <p className="mobile-game__hint">잠시만 기다려주세요.</p>
      )}
      <p className="sensor-gate__countdown">{remainingSec}초 후 시작</p>
    </div>
  );
}
