/** 목업 데이터 자동 재생 데모. /battle-demo 라우트에서 단독으로 확인할 수 있다. */

import { BattleScreen } from "./BattleScreen";
import { useBattleDemo } from "./useBattleDemo";

export function BattleDemoPage(): JSX.Element {
  const { battle, shotEvents } = useBattleDemo();
  return <BattleScreen battle={battle} shotEvents={shotEvents} />;
}
