import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const OUT = process.argv[2];
const browser = await chromium.launch();

async function ctxFor(role, w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.evaluate((r) => {
    localStorage.setItem("fieldnote-visited-v2", "1");
    localStorage.setItem("fieldnote-role", r);
  }, role);
  return { ctx, page };
}

// ---------- 1. kicker uppercase ----------
{
  const { ctx, page } = await ctxFor("guest");
  await page.goto(BASE + "/companies/northstar-cloud", {
    waitUntil: "networkidle",
  });
  const k = page.locator(".company-identity .kicker").first();
  console.log("== kicker ==");
  console.log("  text  :", await k.textContent());
  console.log(
    "  render:",
    await k.evaluate((e) => getComputedStyle(e).textTransform),
  );
  // and the .kicker on companies list card caption
  console.log(
    "  hero facts:",
    await page.locator(".company-facts").innerText(),
  );
  console.log("  chip:", await page.locator(".trust-chip").first().innerText());
  console.log(
    "  tabs:",
    (await page.locator(".company-tabs").innerText()).replace(/\n/g, " | "),
  );
  await ctx.close();
}

// ---------- 2. skip link + tab order ----------
{
  const { ctx, page } = await ctxFor("guest");
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  console.log("== tab order (first 14 stops on /) ==");
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return "none";
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return `${el.tagName}.${el.className || ""} "${(el.textContent || "").trim().slice(0, 24)}" outline=${cs.outlineWidth} ${cs.outlineColor} y=${Math.round(r.top)}`;
    });
    console.log(`  ${i + 1}. ${info}`);
  }
  await ctx.close();
}

// ---------- 3. hidden post leaks to home / account / direct url ----------
{
  const { ctx, page } = await ctxFor("admin");
  await page.goto(BASE + "/admin/content", { waitUntil: "networkidle" });
  const rows = page.locator(".admin-row");
  const title = await rows.nth(1).locator("strong").innerText();
  console.log("== blind leak ==");
  console.log("  blinding:", title);
  await rows.nth(1).locator("button").click();
  await page.click(".report-dialog .button.primary");
  await page.waitForTimeout(600);
  await page.goto(BASE + "/community", { waitUntil: "networkidle" });
  console.log(
    "  community contains?",
    (await page.locator(".feed").innerText()).includes(title),
  );
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  console.log(
    "  home story-list contains?",
    (await page.locator(".story-list").innerText()).includes(title),
  );
  await page.goto(BASE + "/account", { waitUntil: "networkidle" });
  console.log(
    "  account activity contains?",
    (await page.locator(".activity-list").innerText()).includes(title),
  );
  await ctx.close();
}

// ---------- 4. account authorship after writing a post ----------
{
  const { ctx, page } = await ctxFor("sales");
  await page.goto(BASE + "/posts/new", { waitUntil: "networkidle" });
  await page.fill('input[name="title"]', "리드 배분 기준을 물어본 방법");
  await page.fill(
    "#post-body",
    "분기 초에 계정 배분 기준을 어떻게 물어봤는지 정리했습니다. 길게 씁니다 테스트.",
  );
  await page.click(".form-panel button.primary");
  await page.waitForTimeout(1200);
  console.log("== authorship ==");
  console.log(
    "  post detail meta:",
    (await page.locator(".post-detail .post-meta").innerText()).replace(
      /\n/g,
      " | ",
    ),
  );
  await page.goto(BASE + "/community", { waitUntil: "networkidle" });
  console.log(
    "  community first author:",
    await page
      .locator(".feed article")
      .first()
      .locator(".post-meta")
      .innerText(),
  );
  await page.goto(BASE + "/account", { waitUntil: "networkidle" });
  console.log(
    "  account panel:",
    (await page.locator(".profile-panel").innerText()).replace(/\n/g, " | "),
  );
  console.log(
    "  activity:",
    (await page.locator(".activity-list").innerText()).replace(/\n/g, " | "),
  );
  await page.screenshot({
    path: `${OUT}/p-account-after-post.png`,
    fullPage: true,
  });
  await ctx.close();
}

// ---------- 5. comment authorship ----------
{
  const { ctx, page } = await ctxFor("verified");
  await page
    .goto(BASE + "/posts/p1", { waitUntil: "networkidle" })
    .catch(() => {});
  await page.goto(BASE + "/community", { waitUntil: "networkidle" });
  await page.locator(".feed article h2 a").first().click();
  await page.waitForTimeout(800);
  await page.fill(
    ".comment-form:not(.is-inline) textarea",
    "제 경험으로는 예산 질문을 두 번째 미팅에 넘기면 늦습니다.",
  );
  await page.click(".comment-form:not(.is-inline) button.primary");
  await page.waitForTimeout(800);
  console.log("== comment authorship ==");
  const arts = page.locator(".comments article");
  const n = await arts.count();
  for (let i = 0; i < n; i++)
    console.log(
      `  ${i}: ${(await arts.nth(i).innerText()).replace(/\n/g, " | ").slice(0, 90)}`,
    );
  await page.screenshot({ path: `${OUT}/p-comments.png`, fullPage: true });
  await ctx.close();
}

// ---------- 6. AI label on queued post + retry duplication ----------
{
  const { ctx, page } = await ctxFor("sales");
  await page.route("**/rest/v1/rpc/execute_demo_action", (r) => r.abort());
  await page.goto(BASE + "/questions/new", { waitUntil: "networkidle" });
  await page.fill(
    '[data-testid="question-title"]',
    "인바운드 리드가 갑자기 줄었을 때 무엇부터 봐야 할까요",
  );
  await page.fill(
    "textarea",
    "이번 달 인바운드 리드가 절반으로 줄었습니다. 어디부터 확인해야 할까요?",
  );
  await page.click(".form-panel button.primary");
  await page.waitForTimeout(3000);
  console.log("== ai error path ==");
  console.log(
    "  error card:",
    (
      await page
        .locator(".ai-result-error")
        .innerText()
        .catch(() => "none")
    ).replace(/\n/g, " | "),
  );
  await page.click(".ai-result-error button");
  await page.waitForTimeout(400);
  await page.click(".form-panel button.primary");
  await page.waitForTimeout(3000);
  await page.goto(BASE + "/community", { waitUntil: "networkidle" });
  const feed = await page.locator(".feed").innerText();
  const dup = (feed.match(/인바운드 리드가 갑자기 줄었을 때/g) || []).length;
  console.log("  duplicate question count in feed:", dup);
  console.log(
    "  shows 첫 답변 완료 on unanswered?",
    feed.includes("첫 답변 완료"),
  );
  await page.screenshot({
    path: `${OUT}/p-community-after-ai-fail.png`,
    fullPage: true,
  });
  await ctx.close();
}

// ---------- 7. empty model separator on AI card ----------
{
  const { ctx, page } = await ctxFor("sales");
  await page.goto(BASE + "/posts/p1", { waitUntil: "networkidle" });
  // inject a post with aiAnswer but no aiModel via the replay path is hard; read the p1 placeholder instead
  console.log("== p1 ai placeholder ==");
  console.log(
    " ",
    (
      await page
        .locator(".ai-answer")
        .innerText()
        .catch(() => "none")
    ).replace(/\n/g, " | "),
  );
  await ctx.close();
}

// ---------- 8. guest can submit a review? ----------
{
  const { ctx, page } = await ctxFor("guest");
  await page.goto(BASE + "/reviews/new", { waitUntil: "networkidle" });
  await page.fill('input[name="title"]', "비회원이 남긴 리뷰입니다");
  await page.fill(
    'textarea[name="body"]',
    "비회원 역할인데도 리뷰가 등록되는지 확인하는 테스트 본문입니다.",
  );
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1200);
  console.log("== guest review ==");
  console.log("  url after submit:", page.url());
  console.log(
    "  review list has it?",
    (await page.locator(".review-list").innerText()).includes(
      "비회원이 남긴 리뷰입니다",
    ),
  );
  await ctx.close();
}

// ---------- 9. validation scroll under sticky header ----------
{
  const { ctx, page } = await ctxFor("verified", 1440, 800);
  await page.goto(BASE + "/reviews/new", { waitUntil: "networkidle" });
  await page.click('button[type="submit"]');
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => {
    const el = document.activeElement;
    const r = el.getBoundingClientRect();
    const hdr = document.querySelector(".site-header").getBoundingClientRect();
    const bar = document
      .querySelector(".demo-role-bar")
      .getBoundingClientRect();
    return {
      field: el.name || el.tagName,
      top: Math.round(r.top),
      headerBottom: Math.round(hdr.bottom),
      barBottom: Math.round(bar.bottom),
    };
  });
  console.log("== validation scroll ==", JSON.stringify(info));
  await page.screenshot({ path: `${OUT}/p-validation-viewport.png` });
  await ctx.close();
}

// ---------- 10. hover / active states ----------
{
  const { ctx, page } = await ctxFor("guest");
  await page.goto(BASE + "/companies", { waitUntil: "networkidle" });
  const card = page.locator(".company-card").first();
  const before = await card.evaluate(
    (e) =>
      getComputedStyle(e).boxShadow + " | " + getComputedStyle(e).transform,
  );
  await card.hover();
  await page.waitForTimeout(400);
  const after = await card.evaluate(
    (e) =>
      getComputedStyle(e).boxShadow + " | " + getComputedStyle(e).transform,
  );
  console.log("== card hover ==\n  before:", before, "\n  after :", after);
  await ctx.close();
}

// ---------- 11. colour audit ----------
{
  const { ctx, page } = await ctxFor("sales");
  await page.goto(BASE + "/compare", { waitUntil: "networkidle" });
  console.log("== compare colours ==");
  console.log(
    "  leading row bg:",
    await page
      .locator(".compare-row.leading")
      .first()
      .evaluate(
        (e) =>
          getComputedStyle(e).backgroundColor +
          " / " +
          getComputedStyle(e).color,
      ),
  );
  console.log(
    "  legend mark:",
    await page
      .locator(".compare-legend-mark")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  );
  await page.goto(BASE + "/community", { waitUntil: "networkidle" });
  const badge = page.locator(".post-meta b").first();
  console.log(
    "  badge:",
    await badge.innerText(),
    await badge.evaluate(
      (e) =>
        getComputedStyle(e).color + " / " + getComputedStyle(e).backgroundColor,
    ),
  );
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  console.log(
    "  trend up:",
    await page
      .locator(".ranked-company-score small")
      .first()
      .evaluate((e) => getComputedStyle(e).color),
  );
  await page.goto(BASE + "/account", { waitUntil: "networkidle" });
  console.log(
    "  role chip:",
    await page
      .locator(".profile-panel .trust-chip")
      .evaluate(
        (e) =>
          getComputedStyle(e).color +
          " / " +
          getComputedStyle(e).backgroundColor,
      ),
  );
  console.log(
    "  access badge:",
    await page
      .locator(".role-access-badge")
      .first()
      .evaluate(
        (e) =>
          getComputedStyle(e).color +
          " / " +
          getComputedStyle(e).backgroundColor,
      ),
  );
  await ctx.close();
}

await browser.close();
