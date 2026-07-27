/** 화면 하단 귀퉁이 레이건. 평시엔 무채색에 가깝고, 발사·명중 순간에만 팀 색이 강하게 발광한다. */

import { useMemo } from "react";
import type { BattleShotEvent, TeamId } from "./battleTypes";

export function BattleGun({ team, shotEvents }: { team: TeamId; shotEvents: BattleShotEvent[] }): JSX.Element {
  const own = useMemo(() => shotEvents.filter((e) => e.team === team), [shotEvents, team]);
  const last = own[own.length - 1];
  const hasCoreHit = own.some((e) => e.core);

  return (
    <div className={`battle-gun battle-gun--${team.toLowerCase()}`}>
      <div
        key={last?.id ?? "idle"}
        className={`battle-gun__body${last ? " battle-gun__body--recoil" : ""}${last?.hit ? " battle-gun__body--hit" : ""}${hasCoreHit ? " battle-gun__body--core" : ""}`}
      >
        <span className="battle-gun__barrel" />
        {last && <span className="battle-gun__flash" />}
      </div>
    </div>
  );
}
