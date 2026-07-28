/**
 * Plan.md §5.2. 라운드가 시작되고 SENSOR_PERMISSION_GRACE_MS 동안은 실제 조작 화면(발굴 등)
 * 대신 짧은 준비 화면을 보여준다. 센서 권한은 입장 폼 제출 시 이미 요청해뒀으므로
 * (§sensorPermissions) 버튼 없이 그냥 대기만 한다.
 */

import { useEffect, useState, type ReactNode } from "react";
import { SENSOR_PERMISSION_GRACE_MS } from "@trex/shared";

export function SensorPermissionGate({ roundStartedAt, children }: { roundStartedAt: number; children: ReactNode }): JSX.Element {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, []);

  const elapsed = nowMs - roundStartedAt;
  if (elapsed >= SENSOR_PERMISSION_GRACE_MS) return <>{children}</>;

  const remainingSec = Math.max(0, Math.ceil((SENSOR_PERMISSION_GRACE_MS - elapsed) / 1000));

  return (
    <div className="sensor-gate">
      <p className="mobile-game__title">🎮 게임 시작 준비 중…</p>
      <p className="mobile-game__hint">잠시만 기다려주세요.</p>
      <p className="sensor-gate__countdown">{remainingSec}초 후 시작</p>
    </div>
  );
}
