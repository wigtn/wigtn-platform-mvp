import { describe, expect, it } from "vitest";

import { companyScore, initialReviews } from "./domain";

describe("companyScore", () => {
  it("숨김 리뷰를 통계에서 제외한다", () => {
    const hidden = initialReviews.map((review) =>
      review.id === "r1" ? { ...review, status: "hidden" as const } : review,
    );
    expect(companyScore(hidden, "northstar-cloud", 0)).toBe(4.1);
  });

  it("리뷰가 없으면 기준 점수를 유지한다", () => {
    expect(companyScore([], "missing", 3.9)).toBe(3.9);
  });
});
