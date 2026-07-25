/** Plan.md §8. 완성한 티라노를 전시하는 로컬 컬렉션 화면 (MVP 스캐폴딩). */

import { useEffect, useState } from "react";
import type { MuseumTyranno } from "@trex/shared";
import { loadMuseumEntries } from "./museumStorage";

export function MuseumPage(): JSX.Element {
  const [entries, setEntries] = useState<MuseumTyranno[]>([]);

  useEffect(() => {
    setEntries(loadMuseumEntries());
  }, []);

  return (
    <main className="museum-page">
      <h1>티라노박물관</h1>
      {entries.length === 0 ? (
        <p>아직 부활시킨 티라노가 없습니다. 게임을 완료하면 이곳에 전시됩니다.</p>
      ) : (
        <ul className="museum-page__list">
          {entries.map((entry) => (
            <li key={entry.id} className={`museum-entry museum-entry--${entry.form.toLowerCase()}`}>
              <h2>{entry.name}</h2>
              <p>{entry.form === "YRANNO" ? "와이라노" : "정상 부활"}</p>
              <p>팀 {entry.teamId} · {entry.teamMembers.join(", ")}</p>
              <p>명중률 {(entry.accuracy * 100).toFixed(0)}%</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
