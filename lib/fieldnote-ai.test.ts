import { describe, expect, it } from "vitest";

import { parseFieldnoteAiAnswer } from "./fieldnote-ai";

describe("parseFieldnoteAiAnswer", () => {
  it("parses the complete worker contract", () => {
    const answer = parseFieldnoteAiAnswer(
      JSON.stringify({
        summary: "승인자와 사용 부서의 판단 기준을 한 자리에서 맞춰야 합니다.",
        clarifyingQuestions: [
          "최종 승인자는 누구인가요?",
          "사용 부서의 필수 조건은 무엇인가요?",
          "결정 시점은 언제인가요?",
        ],
        actions: [
          "다음 미팅에 승인자와 사용자 대표를 함께 초대합니다.",
          "두 사람의 검토 기준을 문서 한 장으로 정리합니다.",
          "미팅 말미에 결정 담당자와 다음 일정을 확정합니다.",
        ],
        caution: "예산 금액부터 재촉하지 말고 의사결정 구조부터 확인하세요.",
        missingContext: ["현재 검토 단계"],
      }),
    );

    expect(answer.clarifyingQuestions).toHaveLength(3);
    expect(answer.actions).toHaveLength(3);
    expect(answer.missingContext).toEqual(["현재 검토 단계"]);
  });

  it("supports the previous three-field worker response during rollout", () => {
    const answer = parseFieldnoteAiAnswer(
      JSON.stringify({
        summary: "의사결정 구조를 먼저 확인하세요.",
        actions: ["승인자를 확인합니다.", "다음 일정을 정합니다."],
        caution: "예산만 먼저 묻지 마세요.",
      }),
    );

    expect(answer.clarifyingQuestions).toHaveLength(3);
  });

  it("rejects incomplete output", () => {
    expect(() =>
      parseFieldnoteAiAnswer(JSON.stringify({ summary: "짧은 답변" })),
    ).toThrow("답변 형식");
  });
});
