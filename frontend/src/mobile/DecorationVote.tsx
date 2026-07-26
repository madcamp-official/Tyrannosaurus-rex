/** Plan.md §5.2, §7. 티꾸 카테고리 투표 + 티라노 이름 투표. */

import { useState } from "react";
import { DECORATION_CATALOG, NAME_CANDIDATES, type DecorationCategory } from "@trex/shared";
import type { AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";

const CATEGORIES = Object.keys(DECORATION_CATALOG) as DecorationCategory[];

export function DecorationVote({ socket }: { socket: AppSocket }): JSX.Element {
  const [selectedCategory, setSelectedCategory] = useState<DecorationCategory>("HAT");
  const [votedItem, setVotedItem] = useState<Partial<Record<DecorationCategory, string>>>({});
  const [votedName, setVotedName] = useState<string | null>(null);

  const voteItem = (itemId: string) => {
    socket.emit("decoration:vote", { requestId: newRequestId(), category: selectedCategory, itemId }, (ack) => {
      if (ack.ok) setVotedItem((prev) => ({ ...prev, [selectedCategory]: itemId }));
    });
  };

  const voteName = (candidateId: string) => {
    socket.emit("name:vote", { requestId: newRequestId(), candidateId }, (ack) => {
      if (ack.ok) setVotedName(candidateId);
    });
  };

  return (
    <div className="decoration-vote">
      <p className="hint">티라노를 꾸며주세요</p>
      <div className="decoration-vote__categories">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            className={selectedCategory === category ? "active" : ""}
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="decoration-vote__items">
        {DECORATION_CATALOG[selectedCategory].map((item) => (
          <button
            key={item.id}
            type="button"
            className={votedItem[selectedCategory] === item.id ? "active" : ""}
            onClick={() => voteItem(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="hint">티라노 이름</p>
      <div className="decoration-vote__items">
        {NAME_CANDIDATES.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className={votedName === candidate.id ? "active" : ""}
            onClick={() => voteName(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>
    </div>
  );
}
