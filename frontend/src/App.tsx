/** 데스크탑 공유 화면과 모바일 컨트롤러 라우트. */

import { Route, Routes } from "react-router-dom";
import { DesktopLobby } from "./desktop/DesktopLobby";
import { MobileJoin } from "./mobile/MobileJoin";
import { BattleDemoPage } from "./battle/BattleDemoPage";

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<DesktopLobby />} />
      <Route path="/join/:code" element={<MobileJoin />} />
      <Route path="/battle-demo" element={<BattleDemoPage />} />
    </Routes>
  );
}
