/**
 * 로깅 (contract-v0 §2 동결 스키마). 모든 AI 호출은 성공/실패/스킵 무관 1건 로그.
 * projectId는 봉투에 없고 룰 파일 project 값을 SDK가 자기 로그에만 주입(§1.1).
 */
import type { AiLog, AiStatus, GuardrailLog } from "./types";

export interface BuildLogInput {
  logId: string;
  projectId: string;
  eventId: string;
  postId: string;
  boardType: string;
  provider: string;
  model: string;
  promptPackId: string;
  guardrailRuleVersion: string; // "sales-community@1"
  status: AiStatus;
  guardrail: GuardrailLog;
  tokens?: { prompt: number; completion: number; total: number };
  costUsd?: number;
  latency?: { queuedMs: number; inferenceMs: number };
  createdAt: string;
  meta?: Record<string, unknown>;
}

const EMPTY_GUARDRAIL: GuardrailLog = {
  preBlocked: false,
  postBlocked: false,
  reasons: [],
};

export function buildAiLog(input: BuildLogInput): AiLog {
  return {
    logId: input.logId,
    projectId: input.projectId,
    eventId: input.eventId,
    postId: input.postId,
    boardType: input.boardType,
    interactionType: "async_answer",
    provider: input.provider,
    model: input.model,
    promptPackId: input.promptPackId,
    guardrailRuleVersion: input.guardrailRuleVersion,
    status: input.status,
    guardrail: input.guardrail ?? EMPTY_GUARDRAIL,
    tokens: input.tokens ?? { prompt: 0, completion: 0, total: 0 },
    costUsd: input.costUsd ?? 0,
    latency: input.latency ?? { queuedMs: 0, inferenceMs: 0 },
    createdAt: input.createdAt,
    ...(input.meta ? { meta: input.meta } : {}),
  };
}

/** guardrailRuleVersion 문자열 "project@version" 조립. */
export function ruleVersionLabel(project: string, version: number): string {
  return `${project}@${version}`;
}
