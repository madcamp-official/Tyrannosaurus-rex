/** Plan.md §10.4. 데스크탑/모바일/박물관 라우트. */

import { Route, Routes } from "react-router-dom";
import { DesktopLobby } from "./desktop/DesktopLobby";
import { MobileJoin } from "./mobile/MobileJoin";
import { MuseumPage } from "./museum/MuseumPage";

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<DesktopLobby />} />
      <Route path="/join/:code" element={<MobileJoin />} />
      <Route path="/museum" element={<MuseumPage />} />
    </Routes>
  );
}
