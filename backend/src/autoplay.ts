/**
 * 혼자서 게임 한 판을 눈으로 확인하기 위한 자동 플레이 봇.
 *
 * 데스크탑에서 방을 만들어 두고:
 *   npm run autoplay -w backend -- --room 9233
 * 봇들이 입장·준비하면 데스크탑에서 "게임 시작"을 누른다. 이후 발굴 → 퍼즐 →
 * 사격 → 부활/결과 → 이름 투표까지 봇이 전부 플레이하고, 사람은 화면만 본다.
 *
 * --room 없이 실행하면 스크립트가 호스트까지 직접 맡아 headless로 한 판을
 * 완주한다 (CI/스모크 검증용).
 */

import { io, type Socket } from "socket.io-client";
import { randomUUID } from "node:crypto";
import {
  DECORATION_VOTE_DURATION_MS,
  EXCAVATION_MAX_INPUTS_PER_SECOND,
  PHASE_START_GRACE_MS,
  SKY_OBJECT_FALL_MS,
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

// 사격 장면에서 티라노 이동이 눈에 보이도록, 봇 페이스를 사람처럼 느긋하게 잡는다.
// (예전엔 400ms마다 기계처럼 정확히 쐈다 — 그러니 움직여도 체감이 안 될 수밖에 없었다.)
const EXCAVATE_TICK_MS = 150;
// 예전엔 틱마다 5개씩 보내 초당 33개 시도 — 서버 상한(EXCAVATION_MAX_INPUTS_PER_SECOND)을
// 이미 넘어서 항상 최대 속도로 파고 있었다. 상한의 절반 정도로 낮춰서 실제로 체감되는
// 절반 속도를 만든다(둘 다 넘지 않으면 상한에 안 걸려 시도한 만큼 그대로 반영된다).
const EXCAVATE_COUNT_PER_TICK = Math.max(1, Math.round((EXCAVATION_MAX_INPUTS_PER_SECOND / 2) * (EXCAVATE_TICK_MS / 1000)));
const FIRE_TICK_MS = 1_200;
const FIRE_JITTER_MS = 600;
const DINO_POLL_MS = 80;
const OVERALL_TIMEOUT_MS = 6 * 60_000;
// 결과 화면 뒤 이만큼 시간 안에 "재경기"가 눌리지 않으면 더 기다리지 않고 봇을 종료한다.
const REMATCH_GRACE_MS = 3 * 60_000;

/**
 * BAD 봇은 일부러 못한다 — 조준이 부정확하고, 다이노런에서 가끔 아예 반응을 안 하거나
 * 늦게 반응한다. 실력이 섞여야 매번 완벽한 클리어/명중만 보고는 못 잡는 버그(빗나간 판정,
 * 탈락 처리, 무승부 등)를 눈으로 확인하기 쉽다. 봇을 절반씩 GOOD/BAD로 섞어서 투입한다.
 */
type Skill = "GOOD" | "BAD";
// 정규화 좌표 기준 조준 오차 반경 — 코어(0.05)/몸통(0.18) 판정 다 흔든다. GOOD 봇도 완전
// 무결점(100% 명중)이면 부자연스러워 보여서 작은 오차를 남겨 사격을 전체적으로 못하게 뒀다.
const GOOD_AIM_ERROR_RADIUS = 0.05;
const BAD_AIM_ERROR_RADIUS = 0.16;
// 운석 피하기: 이 시간 안에 들어오는 오브젝트에 미리 반응해 좌우로 움직인다. 서버는 운석이
// 떨어지기 시작하는 순간(스폰, hitAtMs - SKY_OBJECT_FALL_MS)에 그 시점 위치를 목표로
// 고정한다(§dinoMeteorLockState) — lookahead가 SKY_OBJECT_FALL_MS보다 짧으면 봇이 아직
// 반응하기 전에 고정돼버려 피하려던 자리가 아니라 옛 자리로 잠겨 맞을 수 있다. 안전하게
// SKY_OBJECT_FALL_MS보다 넉넉히 크게 잡아 스폰 시점엔 이미 반응이 끝나 있게 한다.
const DINO_LOOKAHEAD_MS = SKY_OBJECT_FALL_MS + 150;
const BAD_DINO_LOOKAHEAD_MS = 250;
const BAD_DINO_WRONG_DODGE_CHANCE = 0.35;

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
  finished: boolean;
};

type Bot = {
  socket: AppSocket;
  nickname: string;
  playerId: string;
  teamId: TeamId;
  skill: Skill;
  excavateSeq: number;
  aimSeq: number;
  dinoSeq: number;
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
  let nextFireDelay = FIRE_TICK_MS + Math.random() * FIRE_JITTER_MS;

  while (!board.finished) {
    const team = teamOf(board, bot.teamId);
    if (!team || board.state?.roomPhase !== "PLAYING") {
      await sleep(200);
      continue;
    }
    const now = Date.now();

    // 사람 플레이어도 phase가 바뀔 때마다 PHASE_START_GRACE_MS 동안은 준비 화면만 보고
    // 조작을 못 하므로(§SensorPermissionGate), 봇도 같은 시간만큼 가만히 있어야 공정하다.
    if (now - team.phaseStartedAt < PHASE_START_GRACE_MS) {
      await sleep(200);
      continue;
    }

    if (team.phase === "EXCAVATION") {
      if (now - lastExcavateAt >= EXCAVATE_TICK_MS) {
        lastExcavateAt = now;
        bot.excavateSeq += 1;
        bot.socket.emit("excavate:input", {
          seq: bot.excavateSeq,
          count: EXCAVATE_COUNT_PER_TICK,
          sourceCounts: { motion: 0, tap: EXCAVATE_COUNT_PER_TICK },
          clientTime: now,
        });
      }
      await sleep(EXCAVATE_TICK_MS);
      continue;
    }

    if (team.phase === "ASSEMBLY") {
      // 운석 피하기: 곧 떨어질 오브젝트를 보고 좌우로 움직인다 — 운석이면 반대쪽으로,
      // 과일·하트면 그 자리로. BAD 봇은 훨씬 늦게 반응하고 가끔 반대로(운석 쪽으로) 움직인다.
      const elapsed = now - team.phaseStartedAt;
      const lookahead = bot.skill === "BAD" ? BAD_DINO_LOOKAHEAD_MS : DINO_LOOKAHEAD_MS;
      const upcoming = team.dinoRun.skyObjects.find((o) => o.hitAtMs >= elapsed && o.hitAtMs - elapsed <= lookahead);
      let targetX = 0.5;
      if (upcoming) {
        if (upcoming.kind !== "METEOR") {
          targetX = upcoming.x;
        } else {
          const wrongWay = bot.skill === "BAD" && Math.random() < BAD_DINO_WRONG_DODGE_CHANCE;
          targetX = wrongWay ? upcoming.x : upcoming.x > 0.5 ? 0.12 : 0.88;
        }
      }
      bot.dinoSeq += 1;
      bot.socket.emit("dino:position", {
        seq: bot.dinoSeq,
        x: Math.min(1, Math.max(0, targetX)),
        clientTime: now,
      });
      await sleep(DINO_POLL_MS);
      continue;
    }

    if (team.phase === "CHARGING") {
      const trex = board.trexByTeam[bot.teamId];
      const core = board.coreByTeam[bot.teamId] ?? team.charging.activeCore;
      if (!trex) {
        await sleep(100);
        continue;
      }
      if (now - lastFireAt >= nextFireDelay) {
        lastFireAt = now;
        nextFireDelay = FIRE_TICK_MS + Math.random() * FIRE_JITTER_MS;
        const offset = CORE_OFFSETS[core];
        // 코어/티라노 중심에서 랜덤하게 벗어나 조준한다 — BAD 봇은 크게, GOOD 봇도 작게는
        // 벗어나게 해서(완전 무결점이면 부자연스럽다) 몸통 명중이나 완전 빗나감(0점)도
        // 실제로 나오게 해서 판정 로직을 골고루 확인할 수 있다.
        const aimErrorRadius = bot.skill === "BAD" ? BAD_AIM_ERROR_RADIUS : GOOD_AIM_ERROR_RADIUS;
        const angle = Math.random() * Math.PI * 2;
        const radius = aimErrorRadius * Math.random();
        const errorX = Math.cos(angle) * radius;
        const errorY = Math.sin(angle) * radius;
        const point = {
          x: Math.min(1, Math.max(0, trex.x + offset.x + errorX)),
          y: Math.min(1, Math.max(0, trex.y + offset.y + errorY)),
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

/** 라운드 한 판을 끝까지 플레이하고, 결과 화면을 잠시 지켜본 뒤 돌아온다. */
async function playOneRound(bots: Bot[], board: Blackboard, log: (msg: string) => void): Promise<void> {
  board.finished = false;
  board.trexByTeam = {};
  board.coreByTeam = {};
  board.discoveredByTeam = { A: new Set(), B: new Set() };
  for (const bot of bots) {
    bot.excavateSeq = 0;
    bot.aimSeq = 0;
    bot.dinoSeq = 0;
  }

  const resultPromise = new Promise<void>((resolve) => {
    bots[0]!.socket.once("game:result", (evt) => {
      const winner = evt.data.winnerTeamId ? `${evt.data.winnerTeamId}팀 승리` : "무승부";
      log(`게임 결과: ${winner} (${evt.data.reason})`);
      for (const t of evt.data.teams) {
        log(`  ${t.teamId}팀 — form=${t.form} energy=${Math.round(t.energy)} stability=${Math.round(t.stability)}`);
      }
      board.finished = true;
      resolve();
    });
  });

  const timeout = setTimeout(() => {
    log("시간 초과 — 종료합니다.");
    process.exit(1);
  }, OVERALL_TIMEOUT_MS);

  await Promise.all([resultPromise, ...bots.map((bot) => runBotLoop(bot, board, log))]);
  clearTimeout(timeout);

  log("결과 화면 대기 중…");
  // 소켓을 여기서 바로 닫으면 서버가 방을 즉시 정리해버려서, 대기 마감 전에 방이 사라져
  // 박물관 저장 등 마감 시점 처리가 실행될 기회조차 없어진다.
  await sleep(DECORATION_VOTE_DURATION_MS + 2_000);
  log("대기 완료. 데스크탑 결과 화면과 박물관을 확인하세요.");
}

/** 결과 화면을 본 뒤 재경기가 눌려 라운드가 다시 시작되는지 잠시 기다린다. */
async function waitForRematch(board: Blackboard, graceMs: number): Promise<boolean> {
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (board.state?.roomPhase === "PLAYING") return true;
    await sleep(300);
  }
  return false;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const origin = process.env.SIMULATE_ORIGIN ?? "http://localhost:3001";
  const roomArg = parseArg(argv, "--room");
  const playerCount = Number.parseInt(parseArg(argv, "--players") ?? "4", 10);
  // --idle: 봇이 입장·준비만 하고 게임은 하지 않는다. 사람이 직접 플레이할 때
  // MIN_PLAYERS(2명)를 채우는 용도.
  const idle = argv.includes("--idle");

  const board: Blackboard = {
    state: null,
    trexByTeam: {},
    coreByTeam: {},
    discoveredByTeam: { A: new Set(), B: new Set() },
    finished: false,
  };
  const log = (msg: string) => console.log(`[autoplay] ${msg}`);
  // 처음 입장할 때 봇이 하나씩 들어오는 대로 바로 준비 상태가 되면 아직 안 들어온 팀원을
  // 기다리는 모습이 어색하니, 최초 1회는 전원을 한 번에 준비시킨다 — 그래서 그 전까지는
  // 이 플래그를 꺼 둔다. 재경기로 로비에 돌아왔을 때만(아래 room:state 핸들러) 자동으로
  // 다시 켠다(게임 시작 자체는 별도로 호스트가 game:start를 불러야 한다).
  let autoReadyArmed = false;

  let host: AppSocket | null = null;
  let roomCode: string;

  // --room이 없으면 서버에서 호스트가 붙어 있는 로비 방을 찾아 자동 입장한다.
  // (서버가 재시작될 때마다 방 코드가 바뀌어 손으로 옮겨 적으면 자꾸 어긋난다.)
  let detected: string | null = null;
  if (!roomArg) {
    try {
      const res = await fetch(`${origin}/api/debug/rooms`);
      if (res.ok) {
        const body = (await res.json()) as {
          rooms: Array<{ code: string; roomPhase: string; hostConnected: boolean; createdAt: number }>;
        };
        const lobby = body.rooms
          .filter((r) => r.roomPhase === "LOBBY" && r.hostConnected)
          .sort((a, b) => b.createdAt - a.createdAt)[0];
        if (lobby) detected = lobby.code;
      }
    } catch {
      // 서버가 debug 엔드포인트를 아직 안 가진 경우 등 — self-host로 넘어간다.
    }
  }

  if (roomArg || detected) {
    roomCode = (roomArg ?? detected)!;
    log(roomArg ? `기존 방 ${roomCode}에 봇 ${playerCount}명 입장 시도` : `열려 있는 로비 방 ${roomCode}를 찾았습니다 — 봇 ${playerCount}명 입장`);
  } else {
    host = connect(origin, "HOST");
    await waitForConnect(host);
    const created = await ackEmit<{ roomCode: string; state: RoomState }>((ack) =>
      host!.emit(
        "room:create",
        { requestId: randomUUID(), roomName: "봇 테스트 방", settings: { maxPlayersPerTeam: 5, roundDurationSec: 300, language: "ko" } },
        ack,
      ),
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
    // 절반은 못하는 봇으로 섞는다 — 매번 완벽한 플레이만 보고는 빗나간 판정·탈락·무승부 같은
    // 경로를 못 잡는다.
    const skill: Skill = i % 2 === 0 ? "GOOD" : "BAD";
    const joined = await ackEmit<{ playerId: string; teamId: TeamId; state: RoomState }>((ack) =>
      socket.emit("room:join", { requestId: randomUUID(), roomCode, nickname }, ack),
    );
    if (!joined.ok) {
      if (joined.error.code === "ROOM_NOT_FOUND") {
        throw new Error(
          `방 ${roomCode}가 서버에 없습니다. 서버가 재시작되면 방 코드가 바뀝니다 — ` +
            `데스크탑 화면의 최신 코드를 쓰거나, --room 없이 "npm run autoplay"로 실행하면 열린 방을 자동으로 찾습니다.`,
        );
      }
      throw new Error(`room:join 실패(${nickname}): ${joined.error.code} ${joined.error.message}`);
    }
    board.state = joined.data.state;
    const bot: Bot = {
      socket,
      nickname,
      playerId: joined.data.playerId,
      teamId: joined.data.teamId,
      skill,
      excavateSeq: 0,
      aimSeq: 0,
      dinoSeq: 0,
    };
    bots.push(bot);
    log(`${nickname}(${skill}) → ${bot.teamId}팀 입장`);

    socket.on("room:state", (evt) => {
      board.state = evt.data;
      // 재경기(game:rematch)는 전원의 ready를 false로 되돌린다. 봇은 사람 손을 타지 않으니
      // 로비로 돌아올 때마다 스스로 다시 준비 상태로 만들어야, 사람이 "게임 시작"만 눌러도
      // 바로 다음 라운드가 시작된다(준비까지 기다리게 하지 않으려고).
      const me = evt.data.players.find((p) => p.id === bot.playerId);
      if (autoReadyArmed && evt.data.roomPhase === "LOBBY" && me && !me.ready) {
        bot.socket.emit("player:setReady", { requestId: randomUUID(), ready: true }, () => {});
      }
    });
    socket.on("trex:transform", (evt) => {
      board.trexByTeam[evt.data.teamId] = evt.data.position;
    });
    socket.on("energy:coreChanged", (evt) => {
      board.coreByTeam[evt.data.teamId] = evt.data.to;
    });
  }

  // 마지막 봇이 준비를 마치기 전에는 방이 아직 열려 있어야 한다 — 그래서 전원을 먼저
  // 입장시킨 뒤 마지막에 한 번에 준비시킨다. 게임 시작은 이 뒤에 별도로 호출한다(호스트만
  // 가능 — self-host면 직접 game:start를 부르고, 아니면 사람이 데스크탑에서 눌러야 한다).
  // (이후 재경기로 로비에 돌아오면 위 room:state 핸들러가 알아서 다시 준비시킨다.)
  for (const bot of bots) {
    const ready = await ackEmit((ack) => bot.socket.emit("player:setReady", { requestId: randomUUID(), ready: true }, ack));
    if (!ready.ok) throw new Error(`setReady 실패(${bot.nickname})`);
  }
  autoReadyArmed = true;

  bots[0]!.socket.on("excavation:boneFound", (evt) => {
    board.discoveredByTeam[evt.data.teamId].add(evt.data.boneId);
    log(`${evt.data.teamId}팀 뼈 발견: ${evt.data.boneId}`);
  });
  bots[0]!.socket.on("team:phaseChanged", (evt) => {
    // room:state가 항상 뒤따르지 않으므로 칠판의 팀 페이즈도 직접 갱신한다.
    if (board.state) board.state.teams[evt.data.teamId].phase = evt.data.to;
    log(`${evt.data.teamId}팀 페이즈: ${evt.data.from} → ${evt.data.to}`);
  });
  bots[0]!.socket.on("dino:hit", (evt) => {
    const nickname = bots.find((b) => b.playerId === evt.data.playerId)?.nickname ?? evt.data.playerId;
    log(`[${nickname}] 운석 맞음 (남은 목숨 ${evt.data.livesLeft}, 점수 ${evt.data.score})`);
  });
  bots[0]!.socket.on("dino:bonus", (evt) => {
    const nickname = bots.find((b) => b.playerId === evt.data.playerId)?.nickname ?? evt.data.playerId;
    const label = evt.data.kind === "HEART" ? "하트" : "과일";
    log(`[${nickname}] ${label} 획득 (남은 목숨 ${evt.data.livesLeft}, 점수 ${evt.data.score})`);
  });
  bots[0]!.socket.on("dino:playerDied", (evt) => {
    const nickname = bots.find((b) => b.playerId === evt.data.playerId)?.nickname ?? evt.data.playerId;
    log(`[${nickname}] 목숨 소진 — 탈락`);
  });

  // 게임은 더 이상 전원 준비만으로 자동 시작되지 않는다 — 호스트가 "게임 시작"을 눌러야 한다.
  if (host) {
    const started = await ackEmit((ack) => host!.emit("game:start", { requestId: randomUUID() }, ack));
    if (!started.ok) throw new Error(`game:start 실패: ${started.error.code}`);
    log("게임 시작 (self-host, 전원 준비 완료 → game:start 호출)");
  } else if (idle) {
    log(`대기 봇 ${playerCount}명 준비 완료 — 다른 팀원이 아직 준비 전이면 대기 중, 전원 준비되면 데스크탑에서 "게임 시작"을 눌러주세요.`);
  } else {
    log(`봇 ${playerCount}명 준비 완료 — 전원 준비되면 데스크탑에서 "게임 시작"을 눌러주세요.`);
  }

  if (idle) {
    // idle 모드는 봇이 플레이하지 않고 사람이 직접 플레이한 결과만 기다린다.
    // 사람이 로비에서 뜸 들이는 시간까지 감안해 넉넉히 잡는다.
    const timeout = setTimeout(() => {
      log("시간 초과 — 종료합니다.");
      process.exit(1);
    }, 15 * 60_000);
    await new Promise<void>((resolve) => {
      bots[0]!.socket.once("game:result", (evt) => {
        const winner = evt.data.winnerTeamId ? `${evt.data.winnerTeamId}팀 승리` : "무승부";
        log(`게임 결과: ${winner} (${evt.data.reason})`);
        resolve();
      });
    });
    clearTimeout(timeout);
  } else if (host) {
    // self-host 스모크 테스트: 사람이 재경기를 누를 일이 없으니 한 판만 플레이하고 종료한다.
    await playOneRound(bots, board, log);
  } else {
    // 실제 방에 붙은 경우: 봇은 로비로 돌아올 때마다 스스로 다시 준비하므로, 사람이 "재경기"를
    // 누른 뒤 "게임 시작"만 다시 눌러주면 다음 라운드도 이어서 계속 플레이한다(게임 시작은
    // 더 이상 자동으로 되지 않으니 매 라운드 호스트가 눌러야 한다).
    let roundNumber = 1;
    for (;;) {
      log(`=== ${roundNumber}라운드 시작 ===`);
      await playOneRound(bots, board, log);
      const rematched = await waitForRematch(board, REMATCH_GRACE_MS);
      if (!rematched) {
        log("재경기가 감지되지 않아 종료합니다.");
        break;
      }
      log("재경기 감지 — 다음 라운드로 이어서 플레이합니다.");
      roundNumber += 1;
    }
  }

  for (const bot of bots) bot.socket.close();
  host?.close();
  log("완료");
  process.exit(0);
}

main().catch((err) => {
  console.error("[autoplay] 실패:", err);
  process.exit(1);
});
