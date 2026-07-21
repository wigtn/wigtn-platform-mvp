/**
 * env 로더 (UNIFIED-PRD §2.6 S1).
 * 전체 계약 원본 = `packages/api-contracts/env.schema.json` (JSON Schema 2020-12).
 * v0는 외부 의존성 없이 load-bearing 규칙만 부팅 시 강제한다. 위반 시 즉시 throw → 잘못된 배포 차단.
 *
 * 정식 ajv 검증으로 승격:
 *   pnpm add ajv ajv-formats -F @<slug>/api-contracts
 *   → env.schema.json을 ajv.compile로 직접 컴파일해 이 파일을 교체 (스키마는 그대로, 단일 원본 유지).
 */

const APP_ENVS = [
  "local",
  "internal-preview",
  "staging",
  "production",
] as const;
export type AppEnv = (typeof APP_ENVS)[number];

const REQUIRED = [
  "NEXT_PUBLIC_APP_ENV",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "APP_DATABASE_URL",
] as const;

const SCHEMA_NAME_RE = /^[a-z][a-z0-9_]*$/; // internal-preview는 stg_<slug_snake>

export interface LoadedEnv {
  APP_ENV: AppEnv;
  [key: string]: string;
}

export function loadEnv(
  env: Record<string, string | undefined> = process.env,
): LoadedEnv {
  const errors: string[] = [];

  for (const key of REQUIRED) {
    const value = env[key];
    if (value === undefined || value.trim() === "") {
      errors.push(`missing required env: ${key}`);
    }
  }

  const appEnv = env.NEXT_PUBLIC_APP_ENV;
  if (appEnv !== undefined && !APP_ENVS.includes(appEnv as AppEnv)) {
    errors.push(
      `NEXT_PUBLIC_APP_ENV must be one of ${APP_ENVS.join(", ")} (got: ${appEnv})`,
    );
  }

  const schema = env.NEXT_PUBLIC_SUPABASE_SCHEMA;
  if (schema !== undefined && schema !== "" && !SCHEMA_NAME_RE.test(schema)) {
    errors.push(
      `NEXT_PUBLIC_SUPABASE_SCHEMA must match ${SCHEMA_NAME_RE} (got: ${schema})`,
    );
  }

  const cronSecret = env.INTERNAL_CRON_SECRET;
  if (cronSecret !== undefined && cronSecret.length < 16) {
    errors.push("INTERNAL_CRON_SECRET must be at least 16 chars");
  }

  if (errors.length > 0) {
    throw new Error(
      `환경변수 계약 위반 (env.schema.json 참조):\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  return { ...(env as Record<string, string>), APP_ENV: appEnv as AppEnv };
}
