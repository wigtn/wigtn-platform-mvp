import { describe, expect, it } from "vitest";
import { parseDemoAiAnswer } from "./demo-ai";

describe("AI 답변 파서", () => {
  it("Structured Output JSON을 화면 데이터로 검증한다", () => {
    expect(
      parseDemoAiAnswer(
        JSON.stringify({
          summary: "의사결정 구조를 먼저 확인하세요.",
          actions: ["사용자 대표를 확인합니다.", "승인자를 초대합니다."],
          caution: "예산부터 재촉하지 마세요.",
        }),
      ),
    ).toEqual({
      summary: "의사결정 구조를 먼저 확인하세요.",
      actions: ["사용자 대표를 확인합니다.", "승인자를 초대합니다."],
      caution: "예산부터 재촉하지 마세요.",
    });
  });

  it("이전 Markdown 답변의 기호를 제거하고 섹션을 복구한다", () => {
    const parsed = parseDemoAiAnswer(`**핵심 판단**
결재 담당자와 사용 부서를 함께 확인하세요.

**바로 해볼 행동**
- 사용자 대표를 확인합니다.
> 승인 담당자도 초대할 수 있는지 물어봅니다.

**주의할 점**
예산부터 재촉하지 마세요.`);
    expect(parsed.summary).toBe("결재 담당자와 사용 부서를 함께 확인하세요.");
    expect(parsed.actions).toEqual([
      "사용자 대표를 확인합니다.",
      "승인 담당자도 초대할 수 있는지 물어봅니다.",
    ]);
    expect(parsed.caution).toBe("예산부터 재촉하지 마세요.");
  });
});
