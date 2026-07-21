/**
 * AI 파이프라인 SDK — 동결 계약 타입 (contract-v0 §1·§2·§3).
 * 이 파일의 로깅 스키마·status enum은 "추가만 허용, 삭제·재정의 금지"(§2 고정 원칙).
 */

// ── §1.1 공통 이벤트 봉투 (DECISION-domain-event-envelope-v1 / C1) ──
export type ActorType = "user" | "admin" | "service" | "system";

export interface DomainEventEnvelope<T = Record<string, unknown>> {
  specVersion: "1";
  id: string; // UUIDv7 — 멱등성 키(§1.1)
  type: string; // <도메인>.<엔티티>.<동작>.v<N>
  occurredAt: string;
  traceId: string;
  actor: { type: ActorType; id: string };
  subject: { type: string; id: string };
  data: T;
}

// §1.2 구독 이벤트 2종
export interface PostCreatedData {
  postId: string;
  boardType: string;
  authorId: string;
  createdAt: string;
}
export interface CommentCreatedData {
  postId: string;
  commentId: string;
}
export type PostCreatedEvent = DomainEventEnvelope<PostCreatedData>;
export type CommentCreatedEvent = DomainEventEnvelope<CommentCreatedData>;

/** 답변 직전 재조회(§1.2 ①)한 원글 스냅샷. 삭제/블라인드면 available=false. */
export interface PostSnapshot {
  postId: string;
  boardType: string;
  title: string;
  body: string;
  available: boolean; // false → skipped_post_unavailable
}

// ── §2 로깅 status (동결: 추가만 허용) ──
export type AiStatus =
  | "posted"
  | "skipped_human_answered"
  | "skipped_pre_moderation"
  | "skipped_post_moderation"
  | "skipped_low_confidence"
  | "skipped_post_unavailable"
  | "failed_timeout"
  | "failed_provider";

export interface GuardrailLog {
  preBlocked: boolean;
  postBlocked: boolean;
  reasons: string[]; // ["company_name","numeric_claim","moderation:hate",...]
}

/** §2 전 프로젝트 공통 동결 로그. status·reasons·tokens·latency·costUsd 의미 불변. */
export interface AiLog {
  logId: string;
  projectId: string;
  eventId: string;
  postId: string;
  boardType: string;
  interactionType: "async_answer";
  provider: string;
  model: string;
  promptPackId: string;
  guardrailRuleVersion: string;
  status: AiStatus;
  guardrail: GuardrailLog;
  tokens: { prompt: number; completion: number; total: number };
  costUsd: number;
  latency: { queuedMs: number; inferenceMs: number };
  createdAt: string;
  meta?: Record<string, unknown>; // 프로젝트별 커스텀은 여기 하위로만(§2)
}

// ── §3 가드레일 룰 파일 ──
export type ViolationAction = "skip" | "redact";

export interface GuardrailRule {
  version: number;
  project: string;
  enabled: boolean;
  triggers: {
    boards: string[];
    delaySeconds: number;
    skipIfHumanAnswered: boolean;
  };
  provider: { name: string; model: string; timeoutSeconds: number };
  promptPack: string;
  guardrails: {
    pre: {
      moderation: boolean;
      blockCategories: string[];
      denylistRefs: string[];
    };
    post: {
      moderation: boolean;
      companyNameFilter: boolean;
      numericClaimFilter: boolean;
      legalRiskCategories: string[];
      denylistRefs: string[];
      onViolation: ViolationAction;
    };
  };
  fallback: { onSkip: string; onError: "silent" };
  label: string;
}
