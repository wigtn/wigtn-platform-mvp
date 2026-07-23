import { describe, expect, it } from "vitest";

import { companyScore, initialReviews } from "./domain";

describe("companyScore", () => {
  it("숨김 리뷰를 통계에서 제외한다", () => {
    const hidden = initialReviews.map((review) =>
      review.id === "r1" ? { ...review, status: "hidden" as const } : review,
    );
    expect(companyScore(hidden, "northstar-cloud", 0)).toBe(4.1);
  });

  /*
    전에는 공개 리뷰가 없으면 회사 레코드의 기준 점수로 되돌아갔다.

    관리자가 리뷰를 전부 블라인드하면 종합 점수가 4.3 에서 4.4 로 **올랐고**,
    바로 아래에는 "재직 확인 리뷰 0건 포함"이 찍혔다. 아무 리뷰도 없는데
    평점이 있는 상태다.

    없으면 없다고 말한다. 화면은 이 null 을 "집계 전"으로 쓴다.
  */
  it("공개 리뷰가 없으면 점수를 만들어 내지 않는다", () => {
    expect(companyScore([], "missing", 3.9)).toBeNull();
  });

  it("전부 숨기면 점수가 사라진다", () => {
    const allHidden = initialReviews.map((review) => ({
      ...review,
      status: "hidden" as const,
    }));
    expect(companyScore(allHidden, "northstar-cloud", 4.4)).toBeNull();
  });
});
