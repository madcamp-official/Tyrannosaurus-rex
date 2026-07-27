/** Plan.md §5.2, §7. 티라노 이름 투표. */

import { useState } from "react";
import { NAME_CANDIDATES } from "@trex/shared";
import type { AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";

export function NameVote({ socket }: { socket: AppSocket }): JSX.Element {
  const [votedName, setVotedName] = useState<string | null>(null);

  const voteName = (candidateId: string) => {
    socket.emit("name:vote", { requestId: newRequestId(), candidateId }, (ack) => {
      if (ack.ok) setVotedName(candidateId);
    });
  };

  return (
    <div className="decoration-vote">
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
