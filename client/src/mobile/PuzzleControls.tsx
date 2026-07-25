/** Plan.md §5.2, §6.2. 뼈 선택 → 드래그 패드로 이동 → 회전 → 배치. */

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { PUZZLE_MOVE_MAX_HZ, type BoneId, type TeamState, type Transform2D } from "@trex/shared";
import type { AppSocket } from "../socket";
import { newRequestId } from "../util/requestId";

const DRAG_SENSITIVITY = 1.2;
const ROTATE_STEP_DEG = 15;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function PuzzleControls({ socket, team }: { socket: AppSocket; team: TeamState }): JSX.Element {
  const [selectedBoneId, setSelectedBoneId] = useState<BoneId | null>(null);
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [transform, setTransform] = useState<Transform2D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const seqRef = useRef(0);
  const dirtyRef = useRef(false);
  const transformRef = useRef<Transform2D | null>(null);
  transformRef.current = transform;

  const availablePieces = team.puzzle.pieces.filter(
    (p) => p.discovered && !p.fixed && p.claimedBy === null && (p.lockedUntil === null || p.lockedUntil < Date.now()),
  );

  const selectPiece = (boneId: BoneId) => {
    setError(null);
    socket.emit("puzzle:claim", { requestId: newRequestId(), boneId }, (ack) => {
      if (!ack.ok) {
        setError(ack.error.message);
        return;
      }
      setSelectedBoneId(boneId);
      setClaimToken(ack.data.claimToken);
      setTransform(ack.data.transform);
    });
  };

  const cancelSelection = () => {
    setSelectedBoneId(null);
    setClaimToken(null);
    setTransform(null);
  };

  useEffect(() => {
    if (!claimToken || !selectedBoneId) return undefined;
    const interval = window.setInterval(() => {
      if (!dirtyRef.current || !transformRef.current) return;
      dirtyRef.current = false;
      seqRef.current += 1;
      socket.emit("puzzle:move", {
        seq: seqRef.current,
        boneId: selectedBoneId,
        claimToken,
        transform: transformRef.current,
        clientTime: Date.now(),
      });
    }, 1000 / PUZZLE_MOVE_MAX_HZ);
    return () => window.clearInterval(interval);
  }, [socket, claimToken, selectedBoneId]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragOriginRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragOriginRef.current || !transform) return;
    const dx = event.clientX - dragOriginRef.current.x;
    const dy = event.clientY - dragOriginRef.current.y;
    dragOriginRef.current = { x: event.clientX, y: event.clientY };
    const rect = event.currentTarget.getBoundingClientRect();
    const next: Transform2D = {
      x: clamp01(transform.x + (dx / rect.width) * DRAG_SENSITIVITY),
      y: clamp01(transform.y + (dy / rect.height) * DRAG_SENSITIVITY),
      rotationDeg: transform.rotationDeg,
    };
    setTransform(next);
    dirtyRef.current = true;
  };

  const handlePointerUp = () => {
    dragOriginRef.current = null;
  };

  const rotate = (deltaDeg: number) => {
    if (!transform) return;
    let rotationDeg = transform.rotationDeg + deltaDeg;
    if (rotationDeg > 180) rotationDeg -= 360;
    if (rotationDeg < -180) rotationDeg += 360;
    setTransform({ ...transform, rotationDeg });
    dirtyRef.current = true;
  };

  const place = () => {
    if (!transform || !claimToken || !selectedBoneId) return;
    socket.emit("puzzle:place", { requestId: newRequestId(), boneId: selectedBoneId, claimToken, transform }, (ack) => {
      if (!ack.ok) {
        setError(ack.error.message);
        cancelSelection();
        return;
      }
      setError(ack.data.correct ? null : "아쉬워요! 2초 후 다시 시도할 수 있어요.");
      cancelSelection();
    });
  };

  if (!selectedBoneId || !transform) {
    return (
      <div className="puzzle-controls">
        <p>배치할 뼈를 선택하세요</p>
        {error && <p className="error">{error}</p>}
        <ul className="puzzle-controls__list">
          {availablePieces.map((piece) => (
            <li key={piece.boneId}>
              <button type="button" onClick={() => selectPiece(piece.boneId)}>
                🦴 {piece.boneId}
              </button>
            </li>
          ))}
        </ul>
        {availablePieces.length === 0 && <p className="hint">지금은 선택할 수 있는 뼈가 없어요. 잠시 기다려주세요.</p>}
      </div>
    );
  }

  return (
    <div className="puzzle-controls">
      <p>{selectedBoneId} 조작 중</p>
      <div
        className="drag-pad"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        드래그해서 이동
      </div>
      <div className="rotate-buttons">
        <button type="button" onClick={() => rotate(-ROTATE_STEP_DEG)}>
          ↺ {ROTATE_STEP_DEG}°
        </button>
        <button type="button" onClick={() => rotate(ROTATE_STEP_DEG)}>
          ↻ {ROTATE_STEP_DEG}°
        </button>
      </div>
      <button type="button" className="place-button" onClick={place}>
        배치하기
      </button>
      <button type="button" onClick={cancelSelection}>
        취소
      </button>
    </div>
  );
}
