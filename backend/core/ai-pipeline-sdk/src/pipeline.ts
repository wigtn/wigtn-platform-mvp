/**
 * 파이프라인 오케스트레이션 (contract-v0 §1). 이벤트 → 룰 → pre가드 → provider → post가드 → 등록/스킵 + 로그.
 * 지연(delaySeconds)은 outbox process_after가 담당(Track B) — 이 함수는 "처리 시점"에 호출된다.
 * 시계/ID는 주입(결정적 테스트). Date.now/random 직접 사용 안 함.
 */
import { runPostGuard, runPreGuard, type GuardDeps } from "./guardrail";
import { assembleMessages, type PromptPack } from "./prompt-pack";
import { buildAiLog, ruleVersionLabel } from "./logging";
import { ProviderError, type ChatProvider } from "./provider";
import type { DenylistMap } from "./rule";
import type {
  AiLog,
  AiStatus,
  CommentCreatedEvent,
  GuardrailRule,
  PostCreatedEvent,
  PostSnapshot,
} from "./types";

export interface PipelineDeps {
  provider: ChatProvider;
  denylists: DenylistMap;
  promptPack: PromptPack;
  fetchPost: (postId: string) => Promise<PostSnapshot>;
  newId: () => string; // logId 생성
  now: () => string; // ISO createdAt
  clock?: () => number; // inferenceMs 계측(옵션). 미주입 시 0
  costPerToken?: number; // costUsd = tokens.total * costPerToken
}

export interface PipelineResult {
  /** post = 봇 공개 API로 등록, skip = 등록 안 함, ignored = 트리거 대상 아님(로그 없음) */
  action: "post" | "skip" | "ignored";
  status: AiStatus | "ignored";
  comment?: { postId: string; content: string; idempotencyKey: string };
  log?: AiLog;
}

function toGuardDeps(deps: PipelineDeps): GuardDeps {
  return { moderation: deps.provider, denylists: deps.denylists };
}

/**
 * post.created 이벤트 처리. 트리거 아님 → ignored(로그 없음). 그 외 모든 경로는 로그 1건.
 */
export async function runAnswerPipeline(
  event: PostCreatedEvent,
  rule: GuardrailRule,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  const { postId, boardType } = event.data;

  if (!rule.enabled || !rule.triggers.boards.includes(boardType)) {
    return { action: "ignored", status: "ignored" };
  }

  const ruleVersion = ruleVersionLabel(rule.project, rule.version);
  const base = {
    logId: deps.newId(),
    projectId: rule.project,
    eventId: event.id,
    postId,
    boardType,
    provider: deps.provider.name,
    model: rule.provider.model,
    promptPackId: rule.promptPack,
    guardrailRuleVersion: ruleVersion,
    createdAt: deps.now(),
  };
  const skip = (
    status: AiStatus,
    guardrail: AiLog["guardrail"],
    extra?: Partial<AiLog>,
  ): PipelineResult => ({
    action: "skip",
    status,
    log: buildAiLog({ ...base, status, guardrail, ...extra }),
  });
  const noGuard = {
    preBlocked: false,
    postBlocked: false,
    reasons: [] as string[],
  };

  // §1.2 ① 답변 직전 재조회 — 삭제/블라인드면 skip
  const post = await deps.fetchPost(postId);
  if (!post.available) {
    return skip("skipped_post_unavailable", noGuard);
  }

  // pre 가드(입력)
  const pre = await runPreGuard(
    `${post.title}\n${post.body}`,
    rule,
    toGuardDeps(deps),
  );
  if (pre.blocked) {
    return skip("skipped_pre_moderation", {
      preBlocked: true,
      postBlocked: false,
      reasons: pre.reasons,
    });
  }

  // provider 호출(mock/OpenAI)
  const messages = assembleMessages(deps.promptPack, post);
  const startedAt = deps.clock ? deps.clock() : 0;
  let completion;
  try {
    completion = await deps.provider.complete({
      messages,
      model: rule.provider.model,
      timeoutMs: rule.provider.timeoutSeconds * 1000,
    });
  } catch (error) {
    const status: AiStatus =
      error instanceof ProviderError && error.kind === "timeout"
        ? "failed_timeout"
        : "failed_provider";
    return skip(status, noGuard);
  }
  const inferenceMs = deps.clock
    ? Math.max(0, Math.round(deps.clock() - startedAt))
    : 0;

  // 토큰을 이미 소비했으므로 비용은 성공/차단 무관 동일 기록(M6 — §2 costUsd 불변).
  const costUsd = deps.costPerToken
    ? completion.tokens.total * deps.costPerToken
    : 0;

  // post 가드(출력)
  const postGuard = await runPostGuard(
    completion.text,
    rule,
    toGuardDeps(deps),
  );
  if (postGuard.blocked) {
    // v0: onViolation redact도 안전하게 skip으로 수렴(정밀 redact는 첫 수주 이후 — H1)
    return skip(
      "skipped_post_moderation",
      { preBlocked: false, postBlocked: true, reasons: postGuard.reasons },
      {
        tokens: completion.tokens,
        costUsd,
        latency: { queuedMs: 0, inferenceMs },
      },
    );
  }

  // 등록
  return {
    action: "post",
    status: "posted",
    comment: { postId, content: completion.text, idempotencyKey: event.id },
    log: buildAiLog({
      ...base,
      status: "posted",
      guardrail: noGuard,
      tokens: completion.tokens,
      costUsd,
      latency: { queuedMs: 0, inferenceMs },
    }),
  };
}

/**
 * §1.2 ② 마중물 취소 판정. 지연 대기 중 사람(actor.type==='user') 댓글이 달리면 취소.
 * 봇/시스템 댓글은 취소하지 않는다(봉투 actor로 판정 — C1/C4, isBot 불필요).
 */
export function isHumanAnswerCancel(
  commentEvent: CommentCreatedEvent,
  rule: GuardrailRule,
): boolean {
  return (
    rule.triggers.skipIfHumanAnswered && commentEvent.actor.type === "user"
  );
}
