/**
 * 구독 계층 (contract-v0 §1.2, Track B). post.created → 지연 등록, comment.created → 마중물 취소,
 * 만기 도래 → pipeline 실행 → posted면 write-back.
 *
 * 지연 저장소(PendingAnswerStore)의 구현 = 현상 outbox `process_after`(게이트 Q, C3).
 * 봇 토큰(commentClient)의 구현 = 인증 봇 서비스계정(게이트 A). SDK는 인터페이스만 소유·주입받는다.
 */
import {
  isHumanAnswerCancel,
  runAnswerPipeline,
  type PipelineDeps,
  type PipelineResult,
} from "./pipeline";
import type { CommentApiClient } from "./write-back";
import type {
  CommentCreatedEvent,
  GuardrailRule,
  PostCreatedEvent,
} from "./types";

/** 지연 마중물 대기 저장소. 구현은 outbox process_after 기반(게이트 Q). */
export interface PendingAnswerStore {
  schedule(input: {
    postId: string;
    event: PostCreatedEvent;
    dueAt: number;
  }): Promise<void>;
  cancel(postId: string): Promise<boolean>;
  claimDue(
    nowMs: number,
    max: number,
  ): Promise<Array<{ event: PostCreatedEvent; enqueuedAt: number }>>;
}

export interface SubscriptionDeps {
  rule: GuardrailRule;
  pipeline: PipelineDeps;
  commentClient: CommentApiClient;
  pending: PendingAnswerStore;
  nowMs: () => number; // epoch ms(지연 계산·latency 계측)
}

/** post.created 수신 → 트리거 board면 delaySeconds 후로 예약(즉시 답변 안 함). */
export async function onPostCreated(
  event: PostCreatedEvent,
  deps: SubscriptionDeps,
): Promise<{ scheduled: boolean }> {
  const { boardType, postId } = event.data;
  if (!deps.rule.enabled || !deps.rule.triggers.boards.includes(boardType)) {
    return { scheduled: false };
  }
  const dueAt = deps.nowMs() + deps.rule.triggers.delaySeconds * 1000;
  await deps.pending.schedule({ postId, event, dueAt });
  return { scheduled: true };
}

/** comment.created 수신 → 사람(actor.type==='user') 댓글이면 해당 post 예약 취소(§1.2 ②). */
export async function onCommentCreated(
  event: CommentCreatedEvent,
  deps: SubscriptionDeps,
): Promise<{ cancelled: boolean }> {
  if (!isHumanAnswerCancel(event, deps.rule)) return { cancelled: false };
  return { cancelled: await deps.pending.cancel(event.data.postId) };
}

/**
 * 만기 도래 예약 처리(배치). pipeline 실행 → action=post면 write-back.
 * latency.queuedMs = 처리시각 - 예약시각으로 실계측(Track B M4).
 */
export async function processDueAnswers(
  deps: SubscriptionDeps,
  max = 25,
): Promise<PipelineResult[]> {
  // claimDue는 lease 계약(미ack 시 재배달). idempotencyKey=event.id로 재처리 안전.
  const due = await deps.pending.claimDue(deps.nowMs(), max);
  const results: PipelineResult[] = [];
  for (const { event, enqueuedAt } of due) {
    // per-item 격리: 한 건 실패가 배치 전체를 중단시키지 않는다.
    try {
      const result = await runAnswerPipeline(event, deps.rule, deps.pipeline);
      // 실계측 queuedMs 주입(pipeline 로그의 latency 보정)
      if (result.log) {
        result.log.latency = {
          queuedMs: Math.max(0, deps.nowMs() - enqueuedAt),
          inferenceMs: result.log.latency.inferenceMs,
        };
      }
      if (result.action === "post" && result.comment) {
        await deps.commentClient.postComment(result.comment);
      }
      results.push(result);
    } catch {
      continue;
    }
  }
  return results;
}

export type { GuardrailRule };
