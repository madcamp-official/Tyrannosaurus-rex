/** Plan.md §8. 완성한 티라노를 전시하는 컬렉션 화면 — 서버 DB(GET /api/museum)가 유일한 소스다. */

import { useEffect, useState } from "react";
import { TEAM_DISPLAY_NAMES, type MuseumTyranno } from "@trex/shared";

export function MuseumPage(): JSX.Element {
  const [entries, setEntries] = useState<MuseumTyranno[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/museum")
      .then((res) => {
        if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
        return res.json() as Promise<{ entries: MuseumTyranno[] }>;
      })
      .then((data) => {
        if (!cancelled) setEntries(data.entries);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "박물관을 불러오지 못했습니다");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="museum-page">
      <h1>티라노박물관</h1>
      {loading && <p>불러오는 중…</p>}
      {!loading && error && <p className="error">{error}</p>}
      {!loading && !error && entries.length === 0 && (
        <p>아직 부활시킨 티라노가 없습니다. 게임을 완료하면 이곳에 전시됩니다.</p>
      )}
      {!loading && !error && entries.length > 0 && (
        <ul className="museum-page__list">
          {entries.map((entry) => (
            <li key={entry.id} className={`museum-entry museum-entry--${entry.form.toLowerCase()}`}>
              <h2>{entry.tyrannoName ?? "이름 미정"}</h2>
              <p>{entry.form === "YRANNO" ? "와이라노" : "정상 부활"}{entry.isWinner ? " · 🏆 우승" : ""}</p>
              <p>{entry.roomName} · {TEAM_DISPLAY_NAMES[entry.teamId]} · {entry.teamMembers.join(", ")}</p>
              {entry.mvpNickname && <p>MVP {entry.mvpNickname} ({entry.mvpScore}점)</p>}
              <p>명중률 {(entry.accuracy * 100).toFixed(0)}%</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
