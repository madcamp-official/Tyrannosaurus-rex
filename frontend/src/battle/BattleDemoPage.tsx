/** 목업 데이터 자동 재생 데모. /battle-demo 라우트에서 단독으로 확인할 수 있다. */

import { useEffect, useState } from "react";
import { BattleScreen } from "./BattleScreen";
import { useBattleDemo } from "./useBattleDemo";

/** 실제 조준 입력이 없는 데모 전용 — 트리라노 주변을 랜덤으로 흔든다. */
function useMockAimPoints(playerIds: string[], trexX: number): Record<string, [number, number]> {
  const [points, setPoints] = useState<Record<string, [number, number]>>({});
  useEffect(() => {
    const roll = () => {
      setPoints(
        Object.fromEntries(
          playerIds.map((id, i) => {
            const angle = (i / playerIds.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const radius = 0.05 + Math.random() * 0.015;
            const x = Math.min(0.76, Math.max(0.24, trexX + Math.cos(angle) * radius * 1.5));
            const y = Math.min(0.86, Math.max(0.18, 0.56 + Math.sin(angle) * radius));
            return [id, [x, y]];
          }),
        ),
      );
    };
    roll();
    const id = window.setInterval(roll, 1200);
    return () => window.clearInterval(id);
  }, [playerIds, trexX]);
  return points;
}

export function BattleDemoPage(): JSX.Element {
  const { battle, shotEvents } = useBattleDemo();
  const playerIds = [...battle.teamA.players.map((p) => p.id), ...battle.teamB.players.map((p) => p.id)];
  const aimPoints = useMockAimPoints(playerIds, battle.trex.x);
  return <BattleScreen battle={battle} shotEvents={shotEvents} aimPoints={aimPoints} />;
}
