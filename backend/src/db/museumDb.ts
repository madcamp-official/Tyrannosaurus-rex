/**
 * Plan.md §8 티라노박물관. 서버 권위 SQLite 저장소 — 예전 클라이언트 localStorage 방식을 대체한다.
 * Node 내장 `node:sqlite`를 쓴다(실험적 기능이지만 네이티브 컴파일이 필요 없어 팀 전체 환경에서 안정적으로 동작한다).
 */

import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { DecorationCategory, MuseumTyranno, RevivalForm, TeamId } from "@trex/shared";

// node:sqlite는 Node에 아주 최근 추가된 내장 모듈이라 Vite/vitest의 번들링 파이프라인이
// "node:" 접두사를 잘못 처리한다. 정적 import 대신 런타임 require로 우회한다.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };

type MuseumRow = {
  id: string;
  room_name: string;
  team_id: string;
  is_winner: number;
  form: string;
  tyranno_name: string | null;
  team_members: string;
  mvp_nickname: string | null;
  mvp_score: number | null;
  decorations: string;
  excavation_ms: number | null;
  assembly_ms: number | null;
  charging_ms: number | null;
  accuracy: number;
  fossils: number;
  created_at: number;
};

function rowToRecord(row: MuseumRow): MuseumTyranno {
  return {
    id: row.id,
    roomName: row.room_name,
    teamId: row.team_id as TeamId,
    isWinner: row.is_winner === 1,
    form: row.form as RevivalForm,
    tyrannoName: row.tyranno_name,
    teamMembers: JSON.parse(row.team_members) as string[],
    mvpNickname: row.mvp_nickname,
    mvpScore: row.mvp_score,
    decorations: JSON.parse(row.decorations) as Partial<Record<DecorationCategory, string>>,
    excavationMs: row.excavation_ms,
    assemblyMs: row.assembly_ms,
    chargingMs: row.charging_ms,
    accuracy: row.accuracy,
    fossils: row.fossils,
    createdAt: row.created_at,
  };
}

const DB_PATH = process.env.MUSEUM_DB_PATH ?? "data/museum.db";

function openDatabase(): DatabaseSyncType {
  const dir = dirname(DB_PATH);
  if (dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });

  const database = new DatabaseSync(DB_PATH);
  database.exec(`
    CREATE TABLE IF NOT EXISTS museum_tyrannos (
      id TEXT PRIMARY KEY,
      room_name TEXT NOT NULL,
      team_id TEXT NOT NULL,
      is_winner INTEGER NOT NULL,
      form TEXT NOT NULL,
      tyranno_name TEXT,
      team_members TEXT NOT NULL,
      mvp_nickname TEXT,
      mvp_score INTEGER,
      decorations TEXT NOT NULL,
      excavation_ms INTEGER,
      assembly_ms INTEGER,
      charging_ms INTEGER,
      accuracy REAL NOT NULL,
      fossils INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  return database;
}

const db = openDatabase();

const insertStatement = db.prepare(`
  INSERT INTO museum_tyrannos (
    id, room_name, team_id, is_winner, form, tyranno_name, team_members,
    mvp_nickname, mvp_score, decorations, excavation_ms, assembly_ms, charging_ms,
    accuracy, fossils, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function insertMuseumEntry(entry: MuseumTyranno): void {
  insertStatement.run(
    entry.id,
    entry.roomName,
    entry.teamId,
    entry.isWinner ? 1 : 0,
    entry.form,
    entry.tyrannoName,
    JSON.stringify(entry.teamMembers),
    entry.mvpNickname,
    entry.mvpScore,
    JSON.stringify(entry.decorations),
    entry.excavationMs,
    entry.assemblyMs,
    entry.chargingMs,
    entry.accuracy,
    entry.fossils,
    entry.createdAt,
  );
}

export function listMuseumEntries(limit: number): MuseumTyranno[] {
  const rows = db.prepare(`SELECT * FROM museum_tyrannos ORDER BY created_at DESC LIMIT ?`).all(limit) as unknown as MuseumRow[];
  return rows.map(rowToRecord);
}
