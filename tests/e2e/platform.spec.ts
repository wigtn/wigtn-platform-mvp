import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    window.localStorage.removeItem("fieldnote-demo-v1"),
  );
  await page.reload();
});

test("회사 탐색부터 익명 리뷰 통계 반영까지 연결된다", async ({ page }) => {
  await page.getByRole("link", { name: "회사 탐색 시작" }).click();
  await page.getByTestId("company-search").fill("노스스타");
  await expect(
    page.getByRole("heading", { name: "노스스타 클라우드" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "노스스타 클라우드" }).click();
  await page.getByRole("link", { name: "익명 리뷰 작성" }).click();
  await page
    .getByLabel("한 줄 요약")
    .fill("코칭과 목표 조정이 실제로 연결됩니다");
  await page
    .getByLabel("상세 경험")
    .fill(
      "주간 파이프라인 리뷰에서 숫자만 묻지 않고 다음 행동과 막힌 의사결정을 함께 정리했습니다.",
    );
  await page.getByLabel("리드 품질").fill("4.8");
  await page.getByRole("button", { name: "리뷰 등록하고 통계 보기" }).click();
  await expect(
    page.getByText("코칭과 목표 조정이 실제로 연결됩니다"),
  ).toBeVisible();
  await expect(
    page.locator(".score-bars").getByText("4.8", { exact: true }),
  ).toBeVisible();
});

test("일반 게시글과 이미지 첨부 메타데이터를 등록한다", async ({ page }) => {
  await page.goto("/posts/new");
  await page.getByLabel("게시판").selectOption("실적");
  await page.getByLabel("제목").fill("분기 목표를 초과한 파이프라인 운영 기록");
  await page
    .getByLabel("내용")
    .fill(
      "리드 응답 시간을 줄이고 매주 단계별 전환율을 확인해 막힌 구간부터 개선했습니다.",
    );
  await page.getByLabel("이미지 첨부").setInputFiles({
    name: "achievement.png",
    mimeType: "image/png",
    buffer: Buffer.from("synthetic-image"),
  });
  await page.getByRole("button", { name: "게시글 등록" }).click();
  await expect(
    page.getByRole("heading", {
      name: "분기 목표를 초과한 파이프라인 운영 기록",
    }),
  ).toBeVisible();
  await expect(page.getByText("첨부 이미지 · achievement.png")).toBeVisible();
});

test("질문 등록 후 AI 첫 답변 상태 전이가 완료된다", async ({ page }) => {
  await page.goto("/questions/new");
  await page
    .getByTestId("question-title")
    .fill("예산 질문을 자연스럽게 꺼내는 방법이 궁금합니다");
  await page.getByRole("button", { name: "질문 등록" }).click();
  await expect(page.getByText("질문 내용 검사")).toBeVisible();
  await expect(
    page.getByText("예산 승인 절차와 결정 기준을 먼저 확인하세요."),
  ).toBeVisible({ timeout: 8_000 });
});

test("프로필 수정과 검증 배지 신청 상태가 저장된다", async ({ page }) => {
  await page.getByTestId("role-switch").selectOption("sales");
  await page.goto("/account");
  await page.getByLabel("표시 이름").fill("입찰 평가자");
  await page.getByLabel("경력 한 줄").fill("엔터프라이즈 세일즈 · 10년차");
  await page.getByRole("button", { name: "프로필 저장" }).click();
  await expect(
    page.getByRole("heading", { name: "입찰 평가자" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "샘플 자료로 신청" }).click();
  await expect(page.getByText("검토중", { exact: true })).toBeVisible();
});

test("관리자 역할로 리뷰 블라인드와 복구를 체험한다", async ({ page }) => {
  await page.getByTestId("role-switch").selectOption("admin");
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("link", { name: "리뷰 운영" }).click();
  const blind = page
    .locator(".admin-row")
    .filter({ hasText: "계정 배분 기준이 공개돼 있어요" })
    .getByRole("button", { name: "블라인드" });
  await blind.click();
  await expect(page.getByRole("button", { name: "복구" })).toBeVisible();
});

test("관리자가 회사 수기 등록과 콘텐츠 블라인드를 실행한다", async ({
  page,
}) => {
  await page.getByTestId("role-switch").selectOption("admin");
  await page.goto("/admin/companies");
  await page.getByLabel("회사 수기 등록").fill("위그튼 세일즈랩");
  await page.getByRole("button", { name: "등록", exact: true }).click();
  await expect(page.getByText("위그튼 세일즈랩")).toBeVisible();
  await page.getByRole("button", { name: "후보 불러오기" }).click();
  await expect(page.getByText("32 신규 후보")).toBeVisible();

  await page.goto("/admin/content");
  await page.getByRole("button", { name: "블라인드" }).first().click();
  await page.goto("/community");
  await expect(
    page.getByText("엔터프라이즈 첫 미팅에서 꼭 확인하는 세 가지는?"),
  ).toHaveCount(0);
});

test("모바일 핵심 화면에 수평 오버플로가 없다", async ({ page }) => {
  await page.goto("/companies");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await expect(page.getByTestId("role-switch")).toBeVisible();
});
