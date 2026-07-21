export const moduleName = "api-contracts";

export { loadEnv, type LoadedEnv, type AppEnv } from "./env";

export const apiContractVersion = "0.1.0";

export const standardErrorEnvelopeFields = [
  "code",
  "message",
  "details",
  "traceId",
] as const;

export const dataClassifications = [
  "public",
  "internal",
  "personal",
  "sensitive",
  "secret",
] as const;

export const runtimeEnvironments = [
  "local",
  "internal-preview",
  "staging",
  "production",
] as const;

export const eventEnvelopeRequiredFields = [
  "specVersion",
  "id",
  "type",
  "occurredAt",
  "traceId",
  "actor",
  "subject",
  "data",
] as const;

export const adminOperationEffects = [
  "db-write",
  "file-write",
  "notification-send",
  "event-emit",
  "ai-call",
] as const;

export function isStandardEventType(type: string): boolean {
  return /^[a-z]+\.[a-z]+\.[a-z]+\.v[0-9]+$/.test(type);
}

export function isProductionOnlyRealDataEnvironment(env: string): boolean {
  return env === "production";
}
