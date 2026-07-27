/** 하단 게이지 스트립: A/B 부활 에너지 카드 + 중앙 VS 배지. "안정도" 개념은 존재하지 않는다. */

import type { BattleState, TeamId } from "./battleTypes";

function TeamEnergyCard({ teamId, energy, target, totalHits, coreHits }: {
  teamId: TeamId;
  energy: number;
  target: number;
  totalHits: number;
  coreHits: number;
}): JSX.Element {
  const remaining = Math.max(0, Math.round(((target - energy) / target) * 100));
  const pct = Math.min(100, (energy / target) * 100);
  return (
    <div className={`battle-gauge battle-gauge--${teamId.toLowerCase()}`}>
      <div className="battle-gauge__top">
        <span className="battle-gauge__team">{teamId}팀</span>
        <span className="battle-gauge__caption">부활 에너지</span>
      </div>
      <div className="battle-gauge__value">
        {Math.round(energy)}
        <span className="battle-gauge__value-target">/{target}</span>
      </div>
      <div className="battle-gauge__bar">
        <div className="battle-gauge__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="battle-gauge__foot">
        남은 {remaining}% · 총 명중 {totalHits}회 · 코어 {coreHits}회
      </div>
    </div>
  );
}

export function BattleGaugeStrip({ battle }: { battle: BattleState }): JSX.Element {
  return (
    <div className="battle-gauge-strip">
      <TeamEnergyCard
        teamId="A"
        energy={battle.teamA.energy}
        target={battle.energyTarget}
        totalHits={battle.teamA.totalHits}
        coreHits={battle.teamA.coreHits}
      />
      <div className="battle-vs">
        <span className="battle-vs__badge">VS</span>
        <span className="battle-vs__round">ROUND 1</span>
        <span className="battle-vs__rule">먼저 {battle.energyTarget}%</span>
      </div>
      <TeamEnergyCard
        teamId="B"
        energy={battle.teamB.energy}
        target={battle.energyTarget}
        totalHits={battle.teamB.totalHits}
        coreHits={battle.teamB.coreHits}
      />
    </div>
  );
}
