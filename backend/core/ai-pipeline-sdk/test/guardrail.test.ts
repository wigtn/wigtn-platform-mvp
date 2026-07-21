import { describe, expect, it } from "vitest";

import {
  MockChatProvider,
  runPreGuard,
  runPostGuard,
  hasNumericClaim,
  matchDenylist,
  SALES_COMMUNITY_RULE,
  SAMPLE_DENYLISTS,
} from "../src/index";

const deps = (triggerCategories?: Record<string, string[]>) => ({
  moderation: new MockChatProvider({ triggerCategories }),
  denylists: SAMPLE_DENYLISTS,
});

describe("가드레일 엔진 (§3)", () => {
  it("matchDenylist: 소문자 부분일치", () => {
    expect(matchDenylist("삼성전자가 최고", ["삼성전자", "네이버"])).toEqual([
      "삼성전자",
    ]);
    expect(matchDenylist("평범한 문장", ["삼성전자"])).toEqual([]);
  });

  it("hasNumericClaim: 숫자+단위 단정 탐지", () => {
    expect(hasNumericClaim("전환율이 30% 오릅니다")).toBe(true);
    expect(hasNumericClaim("3배 성장합니다")).toBe(true);
    expect(hasNumericClaim("상황에 따라 다를 수 있어요")).toBe(false);
  });

  it("pre: 모더레이션 카테고리 ∩ blockCategories 만 차단", async () => {
    const blocked = await runPreGuard(
      "자해 관련 내용",
      SALES_COMMUNITY_RULE,
      deps({ self_harm: ["자해"] }),
    );
    expect(blocked.blocked).toBe(true);
    expect(blocked.reasons).toContain("moderation:self_harm");

    const ok = await runPreGuard("평범한 질문", SALES_COMMUNITY_RULE, deps());
    expect(ok.blocked).toBe(false);
  });

  it("pre: denylist(company-names) 매칭 시 차단", async () => {
    const r = await runPreGuard(
      "네이버 어떤가요?",
      SALES_COMMUNITY_RULE,
      deps(),
    );
    expect(r.blocked).toBe(true);
    expect(r.reasons).toContain("denylist:company-names");
  });

  it("post: companyNameFilter·numericClaim·profanity 각각 차단", async () => {
    const company = await runPostGuard(
      "삼성전자가 좋습니다",
      SALES_COMMUNITY_RULE,
      deps(),
    );
    expect(company.blocked).toBe(true);
    expect(company.reasons).toContain("company_name");

    const numeric = await runPostGuard(
      "전환율 30% 보장합니다",
      SALES_COMMUNITY_RULE,
      deps(),
    );
    expect(numeric.blocked).toBe(true);
    expect(numeric.reasons).toContain("numeric_claim");

    const profanity = await runPostGuard(
      "시발 몰라요",
      SALES_COMMUNITY_RULE,
      deps(),
    );
    expect(profanity.reasons).toContain("denylist:profanity-ko");
  });

  it("post: 깨끗한 답변은 통과", async () => {
    const r = await runPostGuard(
      "상황에 따라 다를 수 있으니 커뮤니티 의견도 참고하세요.",
      SALES_COMMUNITY_RULE,
      deps(),
    );
    expect(r.blocked).toBe(false);
    expect(r.reasons).toEqual([]);
  });
});
