/** Plan.md §5.1 발굴 화면. 팀 하나 분량의 발굴 게이지, 발견한 뼈, 팀원 기여도. */

import { CORE_BONE_COUNT, type PublicPlayer, type TeamState } from "@trex/shared";

export function ExcavationTeamPanel({ team, players }: { team: TeamState; players: PublicPlayer[] }): JSX.Element {
  const foundCount = team.excavation.discoveredBoneIds.length;
  const progressToNextBone = Math.min(1, team.excavation.points / team.excavation.nextBoneAt);

  return (
    <div className="excavation-view">
      <p className="excavation-view__count">
        {foundCount} / {CORE_BONE_COUNT} 뼈 발견
      </p>
      <div className="progress-bar" aria-label="다음 뼈까지 진행도">
        <div className="progress-bar__fill" style={{ width: `${progressToNextBone * 100}%` }} />
      </div>
      {team.excavation.efficiencyMultiplier < 1 && (
        <p className="excavation-view__debuff">⛰️ 돌 발견! 효율 {Math.round(team.excavation.efficiencyMultiplier * 100)}%</p>
      )}
      <ul className="excavation-view__bones">
        {team.excavation.discoveredBoneIds.map((boneId) => (
          <li key={boneId}>🦴 {boneId}</li>
        ))}
      </ul>
      {team.excavation.fossils > 0 && <p className="excavation-view__fossils">화석 수집 {team.excavation.fossils}개</p>}
      <ul className="excavation-view__players">
        {players.map((player) => (
          <li key={player.id} style={{ color: player.color }}>
            {player.nickname}: {player.stats.excavationInputs}
          </li>
        ))}
      </ul>
    </div>
  );
}
