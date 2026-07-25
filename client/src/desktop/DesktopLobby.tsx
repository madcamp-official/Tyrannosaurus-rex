/** Plan.md §5.1, §17.1, §17.4. 데스크탑 로비: 방 생성, QR, 팀 배정, 게임 시작. */

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { Ack, GameStartResponse, RoomCreateResponse, RoomState, TeamId } from "@trex/shared";
import { connectSocket, type AppSocket } from "../socket";
import { GodotStage, useGodotBridge } from "../godot/GodotStage";
import { DebugPanel } from "../DebugPanel";
import { newRequestId } from "../util/requestId";

export function DesktopLobby(): JSX.Element {
  const socketRef = useRef<AppSocket | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const { bridge } = useGodotBridge();

  useEffect(() => {
    const socket = connectSocket("HOST");
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit(
        "room:create",
        { requestId: newRequestId(), settings: { maxPlayers: 6, roundDurationSec: 300, language: "ko" } },
        (ack: Ack<RoomCreateResponse>) => {
          if (!ack.ok) {
            setStartError(ack.error.message);
            return;
          }
          setJoinUrl(ack.data.joinUrl);
          setRoomState(ack.data.state);
        },
      );
    });

    socket.on("room:state", (evt) => setRoomState(evt.data));

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, { margin: 1, width: 240 }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [joinUrl]);

  useEffect(() => {
    if (!roomState) return;
    bridge.sendFullSnapshot({
      revision: roomState.revision,
      teams: {
        A: snapshotForTeam(roomState.teams.A),
        B: snapshotForTeam(roomState.teams.B),
      },
    });
  }, [roomState, bridge]);

  const handleStart = () => {
    setStartError(null);
    socketRef.current?.emit("game:start", { requestId: newRequestId() }, (ack: Ack<GameStartResponse>) => {
      if (!ack.ok) setStartError(ack.error.message);
    });
  };

  return (
    <main className="desktop-lobby">
      <header>
        <h1>내 티라노사우루스 살려내!!!</h1>
        <p>죽은 티라노, 정말 살려드립니다</p>
      </header>

      {roomState?.roomPhase === "LOBBY" && (
        <section className="desktop-lobby__join">
          <div className="room-code">{roomState.roomCode}</div>
          {qrDataUrl && <img src={qrDataUrl} alt="입장 QR 코드" width={240} height={240} />}
          <TeamList roomState={roomState} />
          {startError && <p className="error">{startError}</p>}
          <button type="button" onClick={handleStart}>
            게임 시작
          </button>
        </section>
      )}

      {roomState && roomState.roomPhase !== "LOBBY" && <p>라운드가 진행 중입니다.</p>}

      <GodotStage />
      <DebugPanel bridge={bridge} />
    </main>
  );
}

function TeamList({ roomState }: { roomState: RoomState }): JSX.Element {
  const teamIds: TeamId[] = ["A", "B"];
  return (
    <div className="team-list">
      {teamIds.map((teamId) => (
        <div key={teamId} className={`team-list__team team-list__team--${teamId}`}>
          <h2>{teamId}팀</h2>
          <ul>
            {roomState.players
              .filter((p) => p.teamId === teamId)
              .map((p) => (
                <li key={p.id} style={{ color: p.color }}>
                  {p.nickname} {p.ready ? "✅" : "⏳"} {p.connected ? "" : "(연결 끊김)"}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function snapshotForTeam(team: RoomState["teams"][TeamId]) {
  return {
    phase: team.phase,
    excavationPoints: team.excavation.points,
    discoveredBoneIds: team.excavation.discoveredBoneIds,
    puzzlePieces: team.puzzle.pieces.map((piece) => ({
      boneId: piece.boneId,
      transform: piece.transform,
      fixed: piece.fixed,
    })),
    trex: { position: { x: 0.5, y: 0.5 }, rotationDeg: 0, facing: "RIGHT" as const, poseId: "IDLE" as const },
    energy: team.charging.energy,
    stability: team.charging.stability,
    form: team.charging.form,
  };
}
