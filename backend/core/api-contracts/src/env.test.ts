import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

const base = {
  NEXT_PUBLIC_APP_ENV: "local",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk_test",
  APP_DATABASE_URL: "postgres://app@localhost:54322/postgres",
};

describe("loadEnv", () => {
  it("passes with valid env", () => {
    expect(loadEnv(base).APP_ENV).toBe("local");
  });
  it("throws on missing required", () => {
    const { APP_DATABASE_URL, ...missing } = base;
    void APP_DATABASE_URL;
    expect(() => loadEnv(missing)).toThrow(/APP_DATABASE_URL/);
  });
  it("throws on bad app env", () => {
    expect(() => loadEnv({ ...base, NEXT_PUBLIC_APP_ENV: "prod" })).toThrow(
      /NEXT_PUBLIC_APP_ENV/,
    );
  });
  it("throws on hyphenated schema name", () => {
    expect(() =>
      loadEnv({ ...base, NEXT_PUBLIC_SUPABASE_SCHEMA: "stg_sales-community" }),
    ).toThrow(/SCHEMA/);
  });
  it("accepts snake schema name", () => {
    expect(() =>
      loadEnv({ ...base, NEXT_PUBLIC_SUPABASE_SCHEMA: "stg_sales_community" }),
    ).not.toThrow();
  });
  it("throws on short cron secret", () => {
    expect(() => loadEnv({ ...base, INTERNAL_CRON_SECRET: "short" })).toThrow(
      /CRON/,
    );
  });
});
