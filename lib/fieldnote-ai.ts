export type FieldnoteAiAnswer = {
  summary: string;
  clarifyingQuestions: string[];
  actions: string[];
  caution: string;
  missingContext: string[];
};

export const FIELDNOTE_AI_FALLBACK: FieldnoteAiAnswer = {
  summary:
    "지금 필요한 것은 예산 금액을 재촉하는 일이 아니라, 사용 부서와 승인자가 같은 기준으로 검토하도록 만드는 일입니다. 다음 미팅의 목표를 구매 결정이 아닌 검토 구조 합의로 잡으세요.",
  clarifyingQuestions: [
    "이 문제의 영향을 가장 크게 받는 사용 부서는 어디인가요?",
    "도입 여부를 최종 승인하는 사람과 그 사람이 보는 기준은 무엇인가요?",
    "다음 단계로 넘어가기 전에 반드시 확인해야 하는 내부 절차는 무엇인가요?",
  ],
  actions: [
    "다음 미팅에 사용자 대표와 승인 담당자가 함께 참석하도록 요청합니다.",
    "현재 문제, 기대 효과, 검토 기준을 한 장으로 정리해 미팅 전에 공유합니다.",
    "미팅 말미에 담당자별 후속 행동과 다음 결정 일정을 확정합니다.",
  ],
  caution:
    "예산 질문부터 꺼내면 상대가 방어적으로 반응할 수 있으니 내부 검토 순서와 판단 기준을 먼저 확인하세요.",
  missingContext: ["현재 검토 단계", "최종 승인자의 역할"],
};

const FALLBACK_QUESTIONS = [
  "이 사안을 최종 승인하는 사람은 누구인가요?",
  "실제 사용 부서가 중요하게 보는 판단 기준은 무엇인가요?",
  "다음 미팅에서 반드시 합의해야 하는 결정은 무엇인가요?",
];

function cleanText(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/^\s{0,3}(?:#{1,6}|>)\s*/gm, "")
        .replace(/^\s*(?:[-*]|\d+[.)])\s+/gm, "")
        .replace(/\*\*/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean).slice(0, max);
}

/**
 * 워커가 반환한 JSON을 화면 계약으로 좁힌다.
 *
 * Structured Outputs를 사용해도 네트워크·배포 순서·이전 워커 응답 때문에
 * 런타임 검증은 남겨 둔다. HTML/Markdown은 허용하지 않고 React 텍스트로만
 * 렌더링한다.
 */
export function parseFieldnoteAiAnswer(raw: string): FieldnoteAiAnswer {
  let value: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object")
      value = parsed as Record<string, unknown>;
  } catch {
    value = { summary: raw };
  }

  const summary = cleanText(value.summary);
  const actions = cleanList(value.actions, 3);
  const clarifyingQuestions = cleanList(value.clarifyingQuestions, 3);
  const caution = cleanText(value.caution);
  const missingContext = cleanList(value.missingContext, 3);

  if (!summary || actions.length < 2 || !caution) {
    throw new Error("AI 답변 형식이 올바르지 않습니다.");
  }

  return {
    summary,
    // 이전 워커가 만든 3필드 응답도 배포 전환 중에는 안전하게 표시한다.
    clarifyingQuestions:
      clarifyingQuestions.length >= 2
        ? clarifyingQuestions
        : FALLBACK_QUESTIONS,
    actions,
    caution,
    missingContext,
  };
}
