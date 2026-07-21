/**
 * 가드레일 엔진 (contract-v0 §3). pre(입력)·post(출력) 검사.
 * post는 한국어 모더레이션 약점 보정용 load-bearing 계층.
 * v0 축소(H1): numericClaim·legalRisk는 정밀탐지 대신 보수적 패턴+denylist skip.
 */
import type { ChatProvider } from "./provider";
import type { DenylistMap } from "./rule";
import type { GuardrailRule } from "./types";

export interface GuardResult {
  blocked: boolean;
  reasons: string[];
}

export interface GuardDeps {
  moderation: ChatProvider;
  denylists: DenylistMap;
}

/** 텍스트에 등장하는 denylist 용어(소문자 부분일치). */
export function matchDenylist(
  text: string,
  terms: readonly string[],
): string[] {
  const lower = text.toLowerCase();
  return terms.filter((t) => t && lower.includes(t.toLowerCase()));
}

/** 보수적 수치 단정 탐지(v0 축소): 숫자+단위 패턴이 있으면 단정으로 간주. */
const NUMERIC_CLAIM_RE =
  /\d+\s*(%|퍼센트|배|원|만원|억|개월|개년|년|명|위|위권|등)/;
export function hasNumericClaim(text: string): boolean {
  return NUMERIC_CLAIM_RE.test(text);
}

function collectDenylistReasons(
  text: string,
  refs: string[],
  denylists: DenylistMap,
  label: string,
): string[] {
  const reasons: string[] = [];
  for (const ref of refs) {
    const terms = denylists[ref];
    if (terms && matchDenylist(text, terms).length > 0)
      reasons.push(`${label}:${ref}`);
  }
  return reasons;
}

/** 입력 검사(AI 호출 전). moderation 카테고리 ∩ blockCategories + pre denylist. */
export async function runPreGuard(
  text: string,
  rule: GuardrailRule,
  deps: GuardDeps,
): Promise<GuardResult> {
  const reasons: string[] = [];
  const pre = rule.guardrails.pre;
  if (pre.moderation) {
    const result = await deps.moderation.moderate(text);
    for (const category of result.categories) {
      if (pre.blockCategories.includes(category))
        reasons.push(`moderation:${category}`);
    }
  }
  reasons.push(
    ...collectDenylistReasons(
      text,
      pre.denylistRefs,
      deps.denylists,
      "denylist",
    ),
  );
  return { blocked: reasons.length > 0, reasons };
}

/** 출력 검사(등록 전). moderation + companyNameFilter + numericClaim + legalRisk denylist. */
export async function runPostGuard(
  text: string,
  rule: GuardrailRule,
  deps: GuardDeps,
): Promise<GuardResult> {
  const reasons: string[] = [];
  const post = rule.guardrails.post;
  if (post.moderation) {
    // provider가 플래그한 카테고리는 전부 위험으로 본다(안전측). OpenAI 모더레이션은
    // hate/violence/sexual/self_harm은 내지만 defamation/medical/financial은 못 냄 —
    // legalRiskCategories는 카테고리 필터가 아니라 프롬프트 가드(guardText)로 다룬다(M1).
    const result = await deps.moderation.moderate(text);
    for (const category of result.categories) {
      reasons.push(`moderation:${category}`);
    }
  }
  if (post.companyNameFilter) {
    const companyTerms = deps.denylists["company-names"] ?? [];
    if (matchDenylist(text, companyTerms).length > 0)
      reasons.push("company_name");
  }
  if (post.numericClaimFilter && hasNumericClaim(text)) {
    reasons.push("numeric_claim");
  }
  reasons.push(
    ...collectDenylistReasons(
      text,
      post.denylistRefs,
      deps.denylists,
      "denylist",
    ),
  );
  return { blocked: reasons.length > 0, reasons };
}
