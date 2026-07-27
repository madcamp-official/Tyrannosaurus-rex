/** 발굴 중 화면이 꺼져서 흔들기 입력이 끊기는 문제를 막는다. 미지원 브라우저는 조용히 무시. */

import { useEffect } from "react";

type WakeLockSentinel = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } };

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const nav = navigator as NavigatorWithWakeLock;
    if (!nav.wakeLock) return undefined;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await nav.wakeLock!.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // 권한 거부·배터리 절약 모드 등으로 실패해도 게임 진행에는 지장 없으니 무시한다.
      }
    };
    void acquire();

    // 화면이 꺼졌다 다시 켜지면(탭 전환 등) wake lock이 자동 해제되므로 다시 요청한다.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !sentinel) void acquire();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (sentinel) void sentinel.release();
    };
  }, [active]);
}
