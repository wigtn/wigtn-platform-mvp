/**
 * 선제작 1호(영업인 커뮤니티) 샘플 룰 + denylist (contract-v0 §3, M1 산출물).
 * YAML 원본은 assets/rules/sales-community.yaml. 여기 상수는 검증된 형태(테스트·소비용).
 * 프로젝트 적용 = 이 룰 + 프롬프트 팩만 교체(Sangwoo 없이 Maximus/David 적용 — §3.2).
 */
import type { DenylistMap } from "./rule";
import type { GuardrailRule } from "./types";

export const SALES_COMMUNITY_RULE: GuardrailRule = {
  version: 1,
  project: "sales-community",
  enabled: true,
  triggers: { boards: ["qna"], delaySeconds: 90, skipIfHumanAnswered: true },
  provider: { name: "openai", model: "gpt-4o-mini", timeoutSeconds: 30 },
  promptPack: "sales-mentor-v1",
  guardrails: {
    pre: {
      moderation: true,
      blockCategories: ["self_harm", "sexual", "hate"],
      denylistRefs: ["company-names"],
    },
    post: {
      moderation: true,
      companyNameFilter: true,
      numericClaimFilter: true,
      legalRiskCategories: ["defamation", "medical_advice", "financial_advice"],
      denylistRefs: ["profanity-ko"],
      onViolation: "skip",
    },
  },
  fallback: { onSkip: "커뮤니티 답변을 기다려요", onError: "silent" },
  label: "🤖 AI 답변",
};

/** 샘플 denylist(축약). 실제 대용량 리스트는 assets/denylists/*.txt. */
export const SAMPLE_DENYLISTS: DenylistMap = {
  "company-names": ["삼성전자", "네이버", "카카오", "쿠팡", "토스"],
  "profanity-ko": ["시발", "개새끼", "병신"],
};
