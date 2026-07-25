/** Plan.md §22.4, §22.6. 서버 시작 시 환경 변수를 검증하고 누락 시 즉시 종료한다. */

import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

// 이 파일은 server/src/env.ts. 저장소 루트의 .env(.local)을 읽는다(§22.6).
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, `.env.${process.env.NODE_ENV ?? "development"}.local`), override: true });
dotenv.config({ path: path.join(repoRoot, ".env.local"), override: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SERVER_PORT: z.coerce.number().int().positive().default(3001),
  CLIENT_ORIGIN: z.string().url(),
  PUBLIC_JOIN_ORIGIN: z.string().url(),
  APP_VERSION: z.string().min(1),
  API_VERSION: z.coerce.number().int().positive(),
  GODOT_ASSET_VERSION: z.string().min(1),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  ROOM_IDLE_TTL_MS: z.coerce.number().int().positive().default(1_800_000),
  ROUND_DURATION_MS: z.coerce.number().int().positive().default(300_000),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error("[env] invalid environment configuration:", result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}
