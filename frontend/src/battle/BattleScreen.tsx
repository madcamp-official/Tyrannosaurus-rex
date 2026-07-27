/** 배틀 화면 구현 프롬프트 전문 기준 풀블리드 3D + 오버레이 HUD. 1920x1080 고정, 레터박스 스케일링. */

import type { BattleShotEvent, BattleState } from "./battleTypes";
import { STAGE_H, STAGE_W } from "./battleLayout";
import { useLetterboxScale } from "./useLetterboxScale";
import { BattleArena } from "./BattleArena";
import { BattleScoreboard } from "./BattleScoreboard";
import { BattleGaugeStrip } from "./BattleGaugeStrip";
import { BattleGun } from "./BattleGun";
import "./battle.css";

function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function BattleScreen({
  battle,
  shotEvents,
  aimPoints,
}: {
  battle: BattleState;
  shotEvents: BattleShotEvent[];
  aimPoints: Record<string, [number, number]>;
}): JSX.Element {
  const scale = useLetterboxScale();

  return (
    <div className="battle-viewport">
      <div
        className="battle-stage"
        style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}
      >
        <BattleArena battle={battle} shotEvents={shotEvents} aimPoints={aimPoints} />

        <div className="battle-topbar">
          <div className="battle-chip battle-chip--left">
            <span className="battle-chip__icon">🦖</span>
            <div className="battle-chip__text">
              <strong>부활 에너지 충전</strong>
              <span>{battle.siteName}</span>
            </div>
          </div>

          <div className="battle-timer">
            <span className="battle-timer__label">남은 시간</span>
            <span className="battle-timer__clock">{formatClock(battle.remainingSec)}</span>
            <div className="battle-timer__pill">
              <span className="battle-timer__dot" />
              활성 코어 · {battle.coreName} · {Math.max(0, Math.ceil(battle.coreMoveInSec))}s
            </div>
            {battle.coreMoveInSec <= 2 && <div className="battle-warning">⚠ 코어 이동 임박</div>}
          </div>

          <div className="battle-chip battle-chip--right">
            <span className="battle-chip__dot" />
            CHARGING · {battle.stage}단계
          </div>
        </div>

        <div className="battle-boards">
          <BattleScoreboard team={battle.teamA} teamId="A" />
          <BattleScoreboard team={battle.teamB} teamId="B" />
        </div>

        <BattleGun team="A" shotEvents={shotEvents} />
        <BattleGun team="B" shotEvents={shotEvents} />

        <BattleGaugeStrip battle={battle} />
      </div>
    </div>
  );
}
