/**
 * 룰 파일 로더/검증 (contract-v0 §3). YAML 파싱은 호출측(app)이 하고,
 * SDK는 파싱된 객체를 검증한다(외부 yaml 의존성 0). denylist는 텍스트 → 배열.
 */
import type { GuardrailRule } from "./types";

export class RuleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleValidationError";
  }
}

function req(obj: Record<string, unknown>, key: string): unknown {
  if (!(key in obj))
    throw new RuleValidationError(`rule missing required key: ${key}`);
  return obj[key];
}

/** 파싱된 룰 객체(unknown) → 검증된 GuardrailRule. 위반 시 throw. */
export function validateRule(raw: unknown): GuardrailRule {
  if (typeof raw !== "object" || raw === null) {
    throw new RuleValidationError("rule must be an object");
  }
  const r = raw as Record<string, unknown>;
  const triggers = req(r, "triggers") as Record<string, unknown>;
  const provider = req(r, "provider") as Record<string, unknown>;
  const guardrails = req(r, "guardrails") as Record<string, unknown>;
  const pre = req(guardrails, "pre") as Record<string, unknown>;
  const post = req(guardrails, "post") as Record<string, unknown>;
  const fallback = req(r, "fallback") as Record<string, unknown>;

  const boards = triggers.boards;
  if (!Array.isArray(boards) || boards.length === 0) {
    throw new RuleValidationError("triggers.boards must be a non-empty array");
  }
  const onViolation = post.onViolation;
  if (onViolation !== "skip" && onViolation !== "redact") {
    throw new RuleValidationError(
      'guardrails.post.onViolation must be "skip" or "redact"',
    );
  }
  const project = req(r, "project");
  if (typeof project !== "string" || !project.trim()) {
    throw new RuleValidationError("project must be a non-empty string");
  }

  return {
    version: Number(req(r, "version")),
    project,
    enabled: Boolean(r.enabled ?? true),
    triggers: {
      boards: boards.map(String),
      delaySeconds: Number(triggers.delaySeconds ?? 0),
      skipIfHumanAnswered: Boolean(triggers.skipIfHumanAnswered ?? true),
    },
    provider: {
      name: String(req(provider, "name")),
      model: String(req(provider, "model")),
      timeoutSeconds: Number(provider.timeoutSeconds ?? 30),
    },
    promptPack: String(req(r, "promptPack")),
    guardrails: {
      pre: {
        moderation: Boolean(pre.moderation ?? true),
        blockCategories: Array.isArray(pre.blockCategories)
          ? pre.blockCategories.map(String)
          : [],
        denylistRefs: Array.isArray(pre.denylistRefs)
          ? pre.denylistRefs.map(String)
          : [],
      },
      post: {
        moderation: Boolean(post.moderation ?? true),
        companyNameFilter: Boolean(post.companyNameFilter ?? false),
        numericClaimFilter: Boolean(post.numericClaimFilter ?? false),
        legalRiskCategories: Array.isArray(post.legalRiskCategories)
          ? post.legalRiskCategories.map(String)
          : [],
        denylistRefs: Array.isArray(post.denylistRefs)
          ? post.denylistRefs.map(String)
          : [],
        onViolation,
      },
    },
    fallback: {
      onSkip: String(fallback.onSkip ?? ""),
      onError: "silent",
    },
    label: String(r.label ?? "🤖 AI 답변"),
  };
}

/** denylist 텍스트 파일 → 용어 배열 (# 주석·빈 줄 무시, 소문자 정규화). */
export function parseDenylist(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.toLowerCase());
}

/** denylistRefs 이름 → 실제 용어 배열 매핑 묶음(로더가 준비해 가드에 넘긴다). */
export type DenylistMap = Readonly<Record<string, readonly string[]>>;
