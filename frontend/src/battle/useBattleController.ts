/** Battle 상태 갱신 훅. 실시간 소켓이든 데모 오토플레이든 이 훅을 통해 상태를 주입한다. */

import { useCallback, useRef, useState } from "react";
import type { BattleShotEvent, BattleState } from "./battleTypes";

const SHOT_EVENT_TTL_MS = 900;

export function useBattleController(initial: BattleState) {
  const [battle, setBattleState] = useState<BattleState>(initial);
  const [shotEvents, setShotEvents] = useState<BattleShotEvent[]>([]);
  const shotSeq = useRef(0);

  const update = useCallback((patch: Partial<BattleState> | ((prev: BattleState) => BattleState)) => {
    setBattleState((prev) => (typeof patch === "function" ? patch(prev) : { ...prev, ...patch }));
  }, []);

  const fireShot = useCallback((event: Omit<BattleShotEvent, "id" | "ts">) => {
    shotSeq.current += 1;
    const full: BattleShotEvent = { ...event, id: `shot-${shotSeq.current}`, ts: Date.now() };
    setShotEvents((prev) => [...prev, full]);
    window.setTimeout(() => {
      setShotEvents((prev) => prev.filter((e) => e.id !== full.id));
    }, SHOT_EVENT_TTL_MS);
  }, []);

  return { battle, shotEvents, update, fireShot };
}
