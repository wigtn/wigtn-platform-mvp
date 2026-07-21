/**
 * 수신자 결정 규칙 (§9.2). 이벤트별로 "payload 수신자 힌트" vs "6위가 역조회"를 명시한다.
 * 이 규칙은 docs/UNIFIED-PRD.md C1/§9.2의 계약 코드화. 도메인은 이벤트만 발행, 수신자 판정은 여기.
 */
import type { DomainEvent } from "./types";

export type RecipientStrategy =
  | { kind: "payload"; path: string } // event.data[path] = recipientId | recipientId[]
  | { kind: "actor" } // 행위자에게
  | { kind: "subject-owner" } // subject 소유자 역조회(lookup 필요)
  | { kind: "role"; role: string }; // 특정 role 전원 역조회(lookup 필요)

export interface RecipientRule {
  eventType: string;
  strategy: RecipientStrategy;
  notificationType: string;
  title: string;
}

/** 역조회 어댑터(구현 = auth/content DB). SDK는 인터페이스만 소유. */
export interface RecipientLookup {
  subjectOwner(subject: { type: string; id: string }): Promise<string | null>;
  usersByRole(role: string): Promise<string[]>;
}

/** 선제작 1호 기본 규칙(§9.2). 프로젝트별 확장은 이 배열 교체. */
export const DEFAULT_RECIPIENT_RULES: RecipientRule[] = [
  {
    eventType: "identity.grade.application.approved.v1",
    strategy: { kind: "subject-owner" },
    notificationType: "grade_approved",
    title: "등급 신청이 승인되었습니다",
  },
  {
    eventType: "identity.grade.application.rejected.v1",
    strategy: { kind: "subject-owner" },
    notificationType: "grade_rejected",
    title: "등급 신청이 반려되었습니다",
  },
  {
    eventType: "identity.badge.revoked.v1",
    strategy: { kind: "subject-owner" },
    notificationType: "badge_revoked",
    title: "뱃지가 회수되었습니다",
  },
  {
    eventType: "community.content.moderated.v1",
    strategy: { kind: "subject-owner" },
    notificationType: "content_moderated",
    title: "게시물이 조치되었습니다",
  },
  {
    eventType: "community.comment.created.v1",
    strategy: { kind: "payload", path: "postAuthorId" },
    notificationType: "new_comment",
    title: "새 댓글이 달렸습니다",
  },
];

function asIds(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string");
  return typeof value === "string" ? [value] : [];
}

/** 이벤트 + 규칙 → 수신자 id 배열. subject-owner/role은 lookup 필요(없으면 빈 배열). */
export async function resolveRecipients(
  event: DomainEvent,
  rule: RecipientRule,
  lookup?: RecipientLookup,
): Promise<string[]> {
  switch (rule.strategy.kind) {
    case "payload":
      return asIds((event.data as Record<string, unknown>)[rule.strategy.path]);
    case "actor":
      return [event.actor.id];
    case "subject-owner": {
      if (!lookup) return [];
      const owner = await lookup.subjectOwner(event.subject);
      return owner ? [owner] : [];
    }
    case "role": {
      if (!lookup) return [];
      return lookup.usersByRole(rule.strategy.role);
    }
  }
}

/** 이벤트 type으로 규칙 찾기. */
export function findRecipientRule(
  eventType: string,
  rules: RecipientRule[] = DEFAULT_RECIPIENT_RULES,
): RecipientRule | undefined {
  return rules.find((r) => r.eventType === eventType);
}
