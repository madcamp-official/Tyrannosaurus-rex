/** 하단 게이지 스트립: A/B 부활 에너지 카드 + 중앙 VS 배지. "안정도" 개념은 존재하지 않는다. */

import type { BattleState, TeamId } from "./battleTypes";

function TeamEnergyCard({ teamId, teamName, energy, target, totalHits, coreHits }: {
  teamId: TeamId;
  teamName: string;
  energy: number;
  target: number;
  totalHits: number;
  coreHits: number;
}): JSX.Element {
  const remaining = Math.max(0, Math.round(((target - energy) / target) * 100));
  const pct = Math.min(100, (energy / target) * 100);
  // 중앙(VS 배지) 쪽으로 팀명이 오도록 A팀은 캡션-팀명, B팀은 팀명-캡션 순으로 좌우 대칭.
  const mirrored = teamId === "A";
  return (
    <div className={`battle-gauge battle-gauge--${teamId.toLowerCase()}`}>
      <div className="battle-gauge__top">
        {mirrored ? (
          <>
            <span className="battle-gauge__caption">부활 에너지</span>
            <span className="battle-gauge__team">{teamName}</span>
          </>
        ) : (
          <>
            <span className="battle-gauge__team">{teamName}</span>
            <span className="battle-gauge__caption">부활 에너지</span>
          </>
        )}
      </div>
      <div className="battle-gauge__value">
        {Math.round(energy)}
      </div>
      <div className="battle-gauge__bar">
        <div className="battle-gauge__bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="battle-gauge__foot">
        남은 {remaining}% · 약점 명중 {totalHits}회 · 이동 {coreHits}회
      </div>
    </div>
  );
}

export function BattleGaugeStrip({ battle }: { battle: BattleState }): JSX.Element {
  return (
    <div className="battle-gauge-strip">
      <TeamEnergyCard
        teamId="A"
        teamName={battle.teamA.name}
        energy={battle.teamA.energy}
        target={battle.energyTarget}
        totalHits={battle.teamA.totalHits}
        coreHits={battle.teamA.coreHits}
      />
      <div className="battle-vs">
        <span className="battle-vs__badge">VS</span>
        <span className="battle-vs__round">ROUND 1</span>
      </div>
      <TeamEnergyCard
        teamId="B"
        teamName={battle.teamB.name}
        energy={battle.teamB.energy}
        target={battle.energyTarget}
        totalHits={battle.teamB.totalHits}
        coreHits={battle.teamB.coreHits}
      />
    </div>
  );
}
