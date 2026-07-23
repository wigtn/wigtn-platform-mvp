import { expect, type Page, test } from "@playwright/test";

async function switchRole(page: Page, roleName: string) {
  const control = page.getByTestId("role-switch");
  const desktopButton = control.getByRole("button", {
    name: roleName,
    exact: true,
  });
  if (await desktopButton.isVisible()) {
    await desktopButton.click();
    return;
  }
  await control.getByRole("button").click();
  await page
    .getByRole("dialog", { name: "다른 관점으로 둘러보기" })
    .getByRole("button", { name: roleName, exact: true })
    .click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    window.localStorage.removeItem("fieldnote-visited-v2"),
  );
  await page.reload();
  await page.getByRole("button", { name: "그냥 둘러보기 (비회원)" }).click();
});

test("첫 방문 역할 선택과 포커스 순환이 동작한다", async ({ page }) => {
  await page.evaluate(() =>
    window.localStorage.removeItem("fieldnote-visited-v2"),
  );
  await page.reload();
  const dialog = page.getByRole("dialog", {
    name: "어떤 역할로 둘러보시겠어요?",
  });
  await expect(dialog).toBeVisible();
  const guestCard = dialog.getByRole("button", {
    name: /비회원 회사 리뷰와 공개 커뮤니티를 읽습니다/,
  });
  await expect(guestCard).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "그냥 둘러보기 (비회원)" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(guestCard).toBeFocused();
  await dialog
    .getByRole("button", {
      name: /운영 관리자 리뷰 검수·회원 인증·콘텐츠 운영 화면을 엽니다/,
    })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator(".demo-role-bar")).toHaveClass(/role-admin/);
  await expect(page.locator(".demo-role-bar")).toHaveClass(/is-intro-pulse/);
  await expect(page.getByText("새로 볼 수 있는 것: 리뷰 검수")).toBeVisible();
});

test("헤더에서 권한별 데모 계정으로 로그인한다", async ({ page }) => {
  await page.getByRole("button", { name: "데모 계정 로그인" }).click();
  const dialog = page.getByRole("dialog", {
    name: "어떤 계정으로 로그인할까요?",
  });
  await expect(dialog).toBeVisible();
  const salesAccount = dialog.getByRole("button", {
    name: /일반 영업인 윤서진/,
  });
  await expect(salesAccount).toBeFocused();
  await expect(
    dialog.getByRole("button", { name: /인증 영업인 한도윤/ }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /운영 관리자 FIELDNOTE 운영팀/ }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: /인증 영업인 한도윤/ }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.locator(".demo-role-bar")).toHaveClass(/role-verified/);
  await expect(
    page.getByRole("heading", { name: "내 활동 관리" }),
  ).toBeVisible();
  await expect(
    page.getByText("새로 볼 수 있는 것: 재직 확인 리뷰"),
  ).toBeVisible();
});

test("회사 탐색부터 익명 리뷰 통계 반영까지 연결된다", async ({ page }) => {
  // 비회원은 리뷰를 쓸 수 없다. 글·질문 폼과 같은 규칙이다.
  await switchRole(page, "일반 영업인");
  await page.goto("/");
  await page.getByRole("link", { name: "회사 탐색 시작" }).click();
  await page.getByTestId("company-search").fill("노스스타");
  await expect(
    page.getByRole("heading", { name: "노스스타 클라우드" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "노스스타 클라우드" }).click();

  // 6축 중 리드 품질의 현재 평균. 리뷰를 넣은 뒤 이 값이 움직여야 한다.
  const leadQuality = page
    .locator(".score-bars > div")
    .filter({ hasText: "리드 품질" })
    .locator("strong");
  const before = await leadQuality.innerText();

  await page.getByRole("link", { name: "익명 리뷰 작성" }).click();
  // 회사 페이지에서 왔으면 그 회사가 골라져 있어야 한다. 전에는 목록 첫
  // 회사가 떠 있어서, 그냥 등록하면 리뷰가 다른 회사에 달렸다.
  await expect(page.locator("select").first()).toHaveValue("northstar-cloud");
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
  /*
    전에는 "4.8 이 그대로 보인다"고 봤다. 축 점수는 공개된 리뷰 전체의
    평균이라, 내가 넣은 리뷰가 유일할 때만 맞는 기대였다. 시드에 리뷰가
    쌓이는 순간 4.8 은 나올 수 없다.

    확인할 것은 값이 얼마냐가 아니라 **내 리뷰가 통계에 반영됐는가**다.
    4.8 은 기존 평균보다 높으니 평균은 올라가야 한다.
  */
  await expect(leadQuality).not.toHaveText(before);
  expect(Number(await leadQuality.innerText())).toBeGreaterThan(Number(before));
});

test("일반 게시글과 이미지 첨부 메타데이터를 등록한다", async ({ page }) => {
  // 비회원은 글을 쓸 수 없다. 회원 역할로 바꾸고 시작한다.
  await switchRole(page, "일반 영업인");
  await page.goto("/posts/new");
  await page.getByLabel("게시판").selectOption("실적");
  await page.getByLabel("제목").fill("분기 목표를 초과한 파이프라인 운영 기록");
  await page
    .getByLabel("내용")
    .fill(
      "리드 응답 시간을 줄이고 매주 단계별 전환율을 확인해 막힌 구간부터 개선했습니다.",
    );
  // 브라우저 기본 칸을 숨기고 label 을 버튼으로 쓴다. 숨긴 입력은 라벨로
  // 못 찾으므로 직접 가리킨다.
  await page.locator('input[type="file"]').setInputFiles({
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
  // 비회원은 질문을 올릴 수 없다.
  await switchRole(page, "일반 영업인");
  /*
    이 테스트만 오래 걸린다. 질문을 큐에 넣으면 워커가 집어 가서 실제
    OpenAI 를 부르고, 그 답이 돌아와야 화면이 바뀐다.

    아래 대기는 50초인데 테스트 자체 제한이 기본 30초였다. 50초에 닿을
    방법이 없어서, 왕복이 30초를 넘는 순간 무조건 실패했다.
  */
  test.setTimeout(90_000);
  await page.goto("/questions/new");
  const context =
    "결재 담당자와 실제 사용 부서가 다릅니다. 다음 미팅 참석자를 어떻게 정해야 할까요?";
  await page
    .getByTestId("question-title")
    .fill("예산 질문을 자연스럽게 꺼내는 방법이 궁금합니다");
  await page.getByLabel("상황 설명").fill(context);
  await page.getByRole("button", { name: "질문 등록" }).click();
  await expect(page.getByText("질문 내용 검사")).toBeVisible();
  await expect(page.getByTestId("ai-answer-text")).not.toHaveText("", {
    timeout: 50_000,
  });
  await expect(page.getByText("다음 미팅에서 해볼 일")).toBeVisible();
  await expect(page.getByText("놓치기 쉬운 점")).toBeVisible();
  expect(
    await page.getByTestId("ai-answer-action").count(),
  ).toBeGreaterThanOrEqual(2);
  await page.getByRole("link", { name: "커뮤니티에서 보기" }).click();
  await expect(page.getByText(context)).toBeVisible();
});

test("회사 검색 빈 상태에서 조건을 바로 초기화할 수 있다", async ({ page }) => {
  await page.goto("/companies");
  await page.getByTestId("company-search").fill("없는 회사 이름");
  await expect(page.getByText("조건에 맞는 회사가 없습니다.")).toBeVisible();
  await page.getByRole("button", { name: "검색 조건 초기화" }).click();
  await expect(
    page.getByRole("heading", { name: "노스스타 클라우드" }),
  ).toBeVisible();
});

test("프로필 수정과 검증 배지 신청 상태가 저장된다", async ({ page }) => {
  await switchRole(page, "일반 영업인");
  await page.goto("/account");
  await page.getByLabel("표시 이름").fill("입찰 평가자");
  await page.getByLabel("경력 한 줄").fill("엔터프라이즈 세일즈 · 10년차");
  await page.getByRole("button", { name: "프로필 저장" }).click();
  await expect(
    page.getByRole("heading", { name: "입찰 평가자" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "샘플 자료 제출" }).click();
  await expect(page.getByText("검토중", { exact: true })).toBeVisible();
});

test("관리자 역할로 리뷰 블라인드와 복구를 체험한다", async ({ page }) => {
  await switchRole(page, "운영 관리자");
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("link", { name: "리뷰 운영" }).click();
  const blind = page
    .locator(".admin-row")
    .filter({ hasText: "계정 배분 기준이 공개돼 있어요" })
    .getByRole("button", { name: "블라인드" });
  await blind.click();
  // 남의 글을 안 보이게 만드는 동작이라 확인 창을 한 번 거친다.
  await expect(
    page.getByRole("dialog", { name: "이 리뷰를 블라인드할까요?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "블라인드", exact: true })
    .last()
    .click();
  await expect(page.getByRole("button", { name: "복구" })).toBeVisible();
});

test("관리자가 회사 수기 등록과 콘텐츠 블라인드를 실행한다", async ({
  page,
}) => {
  await switchRole(page, "운영 관리자");
  await page.goto("/admin/companies");
  await page.getByLabel("회사 수기 등록").fill("위그튼 세일즈랩");
  await page.getByRole("button", { name: "등록", exact: true }).click();
  await expect(page.getByText("위그튼 세일즈랩")).toBeVisible();
  await page.getByRole("button", { name: "후보 불러오기" }).click();
  await expect(page.getByText("32 신규 후보")).toBeVisible();

  await page.goto("/admin/content");
  await page.getByRole("button", { name: "블라인드" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "블라인드" })
    .click();
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

/**
 * 헤더 메뉴로 주요 화면 사이를 옮길 수 있는가.
 *
 * 모바일에서 헤더 메뉴가 `display: none` 인데 대체 수단이 없던 적이 있다.
 * 폰으로 들어오면 로고와 계정 버튼만 보이고, 회사 리뷰·영업 Q&A·회사
 * 비교·검증 정책 사이를 옮길 방법이 화면에 없었다.
 *
 * **e2e 는 그때도 전부 초록이었다.** 다른 테스트가 전부 `page.goto()` 로
 * 주소를 직접 찍고 들어가서, 헤더를 한 번도 안 눌러 봤기 때문이다.
 * mobile 프로젝트가 있는데도 못 잡았다.
 *
 * 그래서 여기서는 **클릭으로만** 이동한다. goto 를 쓰면 이 테스트도 같은
 * 이유로 아무것도 안 지키게 된다.
 */
test("헤더 메뉴만으로 주요 화면을 오갈 수 있다", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "주요 메뉴" });

  for (const [label, heading] of [
    ["회사 리뷰", "회사 리뷰 찾기"],
    ["영업 Q&A", "먼저 검색하고,"],
    ["회사 비교", "회사 비교"],
    ["검증 정책", "리뷰 작성자 보호 및 검증 정책"],
  ] as const) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: new RegExp(heading) }),
    ).toBeVisible();
  }

  // 현재 위치 표시. 메뉴가 보여도 어디 있는지 모르면 반쪽이다.
  await expect(
    nav.getByRole("link", { name: "검증 정책", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("잠긴 답변 기능에서 역할을 바로 전환할 수 있다", async ({ page }) => {
  /* 시드 id(`p1`)로 바로 들어가면 안 된다. DB 를 붙이면 글 id 가 uuid 라
     없는 주소가 된다. 목록에서 첫 글을 눌러 들어간다. */
  await page.goto("/community");
  await page.locator(".feed > article h2 a").first().click();
  await expect(page.getByText("현직자 답변 작성")).toBeVisible();
  await page
    .getByRole("button", {
      name: "일반 영업인으로 전환해서 체험하기",
    })
    .click();
  await expect(page.getByText("새로 볼 수 있는 것: 프로필 관리")).toBeVisible();
  await expect(page.getByLabel("답변 작성")).toBeVisible();
});
