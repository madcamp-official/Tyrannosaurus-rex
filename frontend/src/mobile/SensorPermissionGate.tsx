/**
 * Plan.md §5.2. 팀 phase가 바뀔 때마다(발굴→조립→영점연습→사격) 시작 후 PHASE_START_GRACE_MS
 * 동안은 실제 조작 화면 대신 짧은 준비 화면을 보여준다. 센서 권한은 입장 폼 제출 시 이미
 * 요청해뒀으므로(§sensorPermissions) 버튼 없이 그냥 대기만 한다.
 */

import { useEffect, useState, type ReactNode } from "react";
import { PHASE_START_GRACE_MS } from "@trex/shared";
import { serverNow } from "../socket";

export function SensorPermissionGate({ phaseStartedAt, children }: { phaseStartedAt: number; children: ReactNode }): JSX.Element {
  // 폰과 데스크탑의 시스템 시계가 서로 어긋나 있으면 같은 phaseStartedAt을 기준으로 해도
  // 카운트다운이 서로 다르게 보인다 — 각 기기의 raw Date.now() 대신 서버 기준으로 보정된
  // serverNow()를 써서 모든 화면이 같은 숫자를 보게 한다.
  const [nowMs, setNowMs] = useState(() => serverNow());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(serverNow()), 200);
    return () => window.clearInterval(interval);
  }, []);

  const elapsed = nowMs - phaseStartedAt;
  const remainingSec = Math.max(0, Math.ceil((PHASE_START_GRACE_MS - elapsed) / 1000));

  return (
    <div className="sensor-gate-shell">
      <div className={remainingSec > 0 ? "sensor-gate-shell__content sensor-gate-shell__content--waiting" : "sensor-gate-shell__content"}>
        {children}
      </div>
      {remainingSec > 0 && (
        <div className="sensor-gate">
          <p className="mobile-game__title">🎮 준비 중…</p>
          <p className="mobile-game__hint">서버 카운트다운 후 시작합니다.</p>
          <p className="sensor-gate__countdown">{remainingSec}초 후 시작</p>
        </div>
      )}
    </div>
  );
}
