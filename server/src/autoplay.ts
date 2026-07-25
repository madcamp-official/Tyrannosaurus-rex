/**
 * 혼자서 게임 한 판을 눈으로 확인하기 위한 자동 플레이 봇.
 *
 * 데스크탑에서 방을 만들어 두고:
 *   npm run autoplay -w server -- --room 9233
 * 봇들이 입장·준비하면 데스크탑에서 "게임 시작"을 누른다. 이후 발굴 → 퍼즐 →
 * 사격 → 부활/결과 → 티꾸 투표까지 봇이 전부 플레이하고, 사람은 화면만 본다.
 *
 * --room 없이 실행하면 스크립트가 호스트까지 직접 맡아 headless로 한 판을
 * 완주한다 (CI/스모크 검증용).
 */

import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import {
  DECORATION_CATALOG,
  NAME_CANDIDATES,
  PUZZLE_TARGET_TRANSFORMS,
  type BoneId,
  type ClientToServerEvents,
  type CoreZone,
  type NormalizedPoint,
  type RoomState,
  type ServerToClientEvents,
  type TeamId,
} from "@trex/shared";
import { CORE_OFFSETS } from "./game/charging.js";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const EXCAVATE_TICK_MS = 100;
const PUZZLE_STEP_MS = 400;
const FIRE_TICK_MS = 400;
const OVERALL_TIMEOUT_MS = 6 * 60_000;

function parseArg(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index !== -1 ? (argv[index + 1] ?? null) : null;
}

function connect(origin: string, role: "HOST" | "PLAYER"): AppSocket {
  return io(origin, { auth: { role, clientVersion: "1.0.0" }, autoConnect: true });
}

async function waitForConnect(socket: AppSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", (err) => reject(err));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 방 전체 상태를 봇들이 공유하는 칠판. room:state는 구조적 변화 때만 오고
 * 조각 배치·뼈 발견은 가벼운 델타 이벤트로만 오므로(§10.2), 델타를 직접 반영해야
 * 같은 조각을 무한 반복 클레임하는 stall이 생기지 않는다.
 */
type Blackboard = {
  state: RoomState | null;
  trexByTeam: Partial<Record<TeamId, NormalizedPoint>>;
  coreByTeam: Partial<Record<TeamId, CoreZone>>;
  discoveredByTeam: Record<TeamId, Set<BoneId>>;
  fixedByTeam: Record<TeamId, Set<BoneId>>;
  finished: boolean;
};

type Bot = {
  socket: AppSocket;
  nickname: string;
  playerId: string;
  teamId: TeamId;
  excavateSeq: number;
  aimSeq: number;
  puzzleBusy: boolean;
};

function teamOf(board: Blackboard, teamId: TeamId): RoomState["teams"][TeamId] | null {
  return board.state ? board.state.teams[teamId] : null;
}

async function ackEmit<TRes>(
  emit: (ack: (res: { ok: true; data: TRes } | { ok: false; error: { code: string; message: string } }) => void) => void,
): Promise<{ ok: true; data: TRes } | { ok: false; error: { code: string; message: string } }> {
  return new Promise((resolve) => emit(resolve));
}

async function runBotLoop(bot: Bot, board: Blackboard, log: (msg: string) => void): Promise<void> {
  let lastFireAt = 0;
  let lastExcavateAt = 0;

  while (!board.finished) {
    const team = teamOf(board, bot.teamId);
    if (!team || board.state?.roomPhase !== "PLAYING") {
      await sleep(200);
      continue;
    }
    const now = Date.now();

    if (team.phase === "EXCAVATION") {
      if (now - lastExcavateAt >= EXCAVATE_TICK_MS) {
        lastExcavateAt = now;
        bot.excavateSeq += 1;
        bot.socket.emit("excavate:input", {
          seq: bot.excavateSeq,
          count: 5,
          sourceCounts: { motion: 0, tap: 5 },
          clientTime: now,
        });
      }
      await sleep(EXCAVATE_TICK_MS);
      continue;
    }

    if (team.phase === "ASSEMBLY") {
      // 조작권 충돌을 피하려고 팀의 첫 번째 봇만 퍼즐을 푼다.
      const isSolver = team.playerIds[0] === bot.playerId;
      if (!isSolver || bot.puzzleBusy) {
        await sleep(300);
        continue;
      }
      const discovered = board.discoveredByTeam[bot.teamId];
      const fixed = board.fixedByTeam[bot.teamId];
      const next = team.puzzle.pieces.find(
        (p) => (p.discovered || discovered.has(p.boneId)) && !p.fixed && !fixed.has(p.boneId),
      );
      if (!next) {
        await sleep(300);
        continue;
      }
      bot.puzzleBusy = true;
      const claim = await ackEmit<{ boneId: BoneId; claimToken: string }>((ack) =>
        bot.socket.emit("puzzle:claim", { requestId: randomUUID(), boneId: next.boneId }, ack),
      );
      if (claim.ok) {
        const target = PUZZLE_TARGET_TRANSFORMS[next.boneId];
        const place = await ackEmit<{ correct: boolean }>((ack) =>
          bot.socket.emit(
            "puzzle:place",
            { requestId: randomUUID(), boneId: next.boneId, claimToken: claim.data.claimToken, transform: target },
            ack,
          ),
        );
        if (place.ok && place.data.correct) {
          fixed.add(next.boneId);
          log(`[${bot.nickname}] ${next.boneId} 조각 배치 완료 (${fixed.size}/13)`);
        }
      }
      bot.puzzleBusy = false;
      await sleep(PUZZLE_STEP_MS);
      continue;
    }

    if (team.phase === "CHARGING") {
      const trex = board.trexByTeam[bot.teamId];
      const core = board.coreByTeam[bot.teamId] ?? team.charging.activeCore;
      if (!trex) {
        await sleep(100);
        continue;
      }
      if (now - lastFireAt >= FIRE_TICK_MS) {
        lastFireAt = now;
        const offset = CORE_OFFSETS[core];
        const point = {
          x: Math.min(1, Math.max(0, trex.x + offset.x)),
          y: Math.min(1, Math.max(0, trex.y + offset.y)),
        };
        bot.aimSeq += 1;
        bot.socket.emit("aim:update", { seq: bot.aimSeq, point, mode: "TOUCHPAD", calibrated: true, clientTime: now });
        await sleep(30); // 서버가 조준을 저장할 시간을 준 뒤 발사한다.
        await ackEmit((ack) =>
          bot.socket.emit("energy:fire", { requestId: randomUUID(), shotId: randomUUID(), clientTime: Date.now() }, ack),
        );
      }
      await sleep(50);
      continue;
    }

    // REVIVED 등: 라운드 종료 대기.
    await sleep(300);
  }
}

async function castVotes(bot: Bot): Promise<void> {
  for (const [category, items] of Object.entries(DECORATION_CATALOG)) {
    await ackEmit((ack) =>
      bot.socket.emit(
        "decoration:vote",
        { requestId: randomUUID(), category: category as keyof typeof DECORATION_CATALOG, itemId: items[0]!.id },
        ack,
      ),
    );
  }
  await ackEmit((ack) => bot.socket.emit("name:vote", { requestId: randomUUID(), candidateId: NAME_CANDIDATES[0]!.id }, ack));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const origin = process.env.SIMULATE_ORIGIN ?? "http://localhost:3001";
  const roomArg = parseArg(argv, "--room");
  const playerCount = Number.parseInt(parseArg(argv, "--players") ?? "4", 10);

  const board: Blackboard = {
    state: null,
    trexByTeam: {},
    coreByTeam: {},
    discoveredByTeam: { A: new Set(), B: new Set() },
    fixedByTeam: { A: new Set(), B: new Set() },
    finished: false,
  };
  const log = (msg: string) => console.log(`[autoplay] ${msg}`);

  let host: AppSocket | null = null;
  let roomCode: string;

  if (roomArg) {
    roomCode = roomArg;
    log(`기존 방 ${roomCode}에 봇 ${playerCount}명 입장 시도`);
  } else {
    host = connect(origin, "HOST");
    await waitForConnect(host);
    const created = await ackEmit<{ roomCode: string; state: RoomState }>((ack) =>
      host!.emit("room:create", { requestId: randomUUID(), settings: { maxPlayers: 10, roundDurationSec: 300, language: "ko" } }, ack),
    );
    if (!created.ok) throw new Error(`room:create 실패: ${created.error.code}`);
    roomCode = created.data.roomCode;
    board.state = created.data.state;
    log(`self-host 모드: 방 ${roomCode} 생성`);
  }

  const bots: Bot[] = [];
  for (let i = 0; i < playerCount; i += 1) {
    const socket = connect(origin, "PLAYER");
    await waitForConnect(socket);
    const nickname = `봇${i + 1}`;
    const joined = await ackEmit<{ playerId: string; teamId: TeamId; state: RoomState }>((ack) =>
      socket.emit("room:join", { requestId: randomUUID(), roomCode, nickname }, ack),
    );
    if (!joined.ok) throw new Error(`room:join 실패(${nickname}): ${joined.error.code} ${joined.error.message}`);
    board.state = joined.data.state;
    const bot: Bot = { socket, nickname, playerId: joined.data.playerId, teamId: joined.data.teamId, excavateSeq: 0, aimSeq: 0, puzzleBusy: false };
    bots.push(bot);
    log(`${nickname} → ${bot.teamId}팀 입장`);

    socket.on("room:state", (evt) => {
      board.state = evt.data;
    });
    socket.on("trex:transform", (evt) => {
      board.trexByTeam[evt.data.teamId] = evt.data.position;
    });
    socket.on("energy:coreChanged", (evt) => {
      board.coreByTeam[evt.data.teamId] = evt.data.to;
    });

    const ready = await ackEmit((ack) => socket.emit("player:setReady", { requestId: randomUUID(), ready: true }, ack));
    if (!ready.ok) throw new Error(`setReady 실패(${nickname})`);
  }

  // 결과 이벤트는 어떤 봇 소켓으로든 한 번만 처리하면 된다.
  const resultPromise = new Promise<void>((resolve) => {
    bots[0]!.socket.on("game:result", (evt) => {
      const winner = evt.data.winnerTeamId ? `${evt.data.winnerTeamId}팀 승리` : "무승부";
      log(`게임 결과: ${winner} (${evt.data.reason})`);
      for (const t of evt.data.teams) {
        log(`  ${t.teamId}팀 — form=${t.form} energy=${Math.round(t.energy)} stability=${Math.round(t.stability)}`);
      }
      board.finished = true;
      resolve();
    });
  });

  bots[0]!.socket.on("excavation:boneFound", (evt) => {
    board.discoveredByTeam[evt.data.teamId].add(evt.data.boneId);
    log(`${evt.data.teamId}팀 뼈 발견: ${evt.data.boneId}`);
  });
  bots[0]!.socket.on("puzzle:piecePlaced", (evt) => {
    if (evt.data.correct) board.fixedByTeam[evt.data.teamId].add(evt.data.boneId);
  });
  bots[0]!.socket.on("team:phaseChanged", (evt) => {
    // room:state가 항상 뒤따르지 않으므로 칠판의 팀 페이즈도 직접 갱신한다.
    if (board.state) board.state.teams[evt.data.teamId].phase = evt.data.to;
    log(`${evt.data.teamId}팀 페이즈: ${evt.data.from} → ${evt.data.to}`);
  });

  if (host) {
    const started = await ackEmit((ack) => host!.emit("game:start", { requestId: randomUUID() }, ack));
    if (!started.ok) throw new Error("game:start 실패");
    log("게임 시작 (self-host)");
  } else {
    log(`봇 ${playerCount}명 준비 완료 — 데스크탑에서 "게임 시작"을 눌러주세요.`);
  }

  const timeout = setTimeout(() => {
    log("시간 초과 — 종료합니다.");
    process.exit(1);
  }, OVERALL_TIMEOUT_MS);

  await Promise.all([resultPromise, ...bots.map((bot) => runBotLoop(bot, board, log))]);

  log("티꾸/이름 투표 중…");
  for (const bot of bots) await castVotes(bot);
  log("투표 완료. 데스크탑 결과 화면을 확인하세요. (20초 후 투표가 자동 확정됩니다)");

  clearTimeout(timeout);
  for (const bot of bots) bot.socket.close();
  host?.close();
  log("완료");
  process.exit(0);
}

main().catch((err) => {
  console.error("[autoplay] 실패:", err);
  process.exit(1);
});
