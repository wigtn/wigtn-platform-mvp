import { describe, expect, it } from "vitest";

import {
  validateRule,
  parseDenylist,
  RuleValidationError,
  SALES_COMMUNITY_RULE,
} from "../src/index";

describe("룰 검증 (§3)", () => {
  it("샘플 룰은 유효", () => {
    const r = validateRule(SALES_COMMUNITY_RULE);
    expect(r.project).toBe("sales-community");
    expect(r.triggers.boards).toContain("qna");
    expect(r.guardrails.post.onViolation).toBe("skip");
  });

  it("triggers.boards 비면 거부", () => {
    expect(() =>
      validateRule({
        ...SALES_COMMUNITY_RULE,
        triggers: { ...SALES_COMMUNITY_RULE.triggers, boards: [] },
      }),
    ).toThrow(RuleValidationError);
  });

  it("onViolation 잘못된 값 거부", () => {
    const bad = {
      ...SALES_COMMUNITY_RULE,
      guardrails: {
        ...SALES_COMMUNITY_RULE.guardrails,
        post: {
          ...SALES_COMMUNITY_RULE.guardrails.post,
          onViolation: "delete",
        },
      },
    };
    expect(() => validateRule(bad)).toThrow(RuleValidationError);
  });

  it("parseDenylist: 주석·빈 줄 무시 + 소문자화", () => {
    const terms = parseDenylist("# 회사명\n삼성전자\n\n  네이버  \n");
    expect(terms).toEqual(["삼성전자", "네이버"]);
  });
});
