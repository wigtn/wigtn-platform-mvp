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

// blind -> company propagation, using in-app navigation (no reload)
{
  const { ctx, page } = await ctxFor("admin");
  await page.goto(BASE + "/companies/northstar-cloud", {
    waitUntil: "networkidle",
  });
  console.log("== blind propagation ==");
  console.log(
    "  BEFORE score:",
    await page.locator(".score-monument strong").innerText(),
    "| tab:",
    await page.locator(".company-tabs a").last().innerText(),
    "| aside 현재 공개:",
    await page.locator(".review-guide dl div").last().innerText(),
  );
  await page.goto(BASE + "/admin/reviews", { waitUntil: "networkidle" });
  const rows = page.locator(".admin-review-row");
  const cnt = await rows.count();
  for (let i = 0; i < cnt; i++) {
    const t = await rows.nth(i).locator("strong").innerText();
    if (!(await rows.nth(i).innerText()).includes("노스스타")) continue;
    await rows.nth(i).locator("button").click();
    await page.click(".report-dialog .button.primary");
    await page.waitForTimeout(500);
    console.log("  blinded:", t);
  }
  console.log(
    "  queue title after:",
    await page
      .locator(".admin-title-count")
      .innerText()
      .then((s) => s.replace(/\n/g, " ")),
  );
  console.log(
    "  filters after:",
    (await page.locator(".admin-queue-toolbar div").innerText()).replace(
      /\n/g,
      " | ",
    ),
  );
  console.log(
    "  row statuses:",
    (await page.locator(".admin-row-status").allInnerTexts()).join(","),
  );
  // navigate in-app via header link
  await page.click("nav[aria-label='주요 메뉴'] a[href='/companies']");
  await page.waitForTimeout(900);
  await page.click(".company-card h3 a >> nth=0");
  await page.waitForTimeout(1200);
  console.log("  AFTER (in-app nav) url:", page.url());
  console.log(
    "  AFTER score:",
    await page.locator(".score-monument strong").innerText(),
    "| tab:",
    await page.locator(".company-tabs a").last().innerText(),
    "| facts:",
    (await page.locator(".company-facts").innerText()).replace(/\n/g, " | "),
    "| chip:",
    await page.locator(".trust-chip").first().innerText(),
  );
  console.log(
    "  review list count:",
    await page.locator(".review-list article").count(),
  );
  await page.screenshot({
    path: `${OUT}/p3-company-blinded.png`,
    fullPage: true,
  });
  await ctx.close();
}

// ranking order vs score column
{
  const { ctx, page } = await ctxFor("guest");
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  console.log("== home ranking ==");
  console.log(
    "  aside:",
    (await page.locator(".career-preview").innerText()).replace(/\n/g, " | "),
  );
  console.log(
    "  aside heading kicker:",
    await page
      .locator(".preview-head span span")
      .first()
      .innerText()
      .catch(() => "?"),
  );
  console.log(
    "  section h2:",
    await page.locator(".home-companies h2").innerText(),
  );
  const ranked = await page.locator(".ranked-company").allInnerTexts();
  ranked.forEach((r) => console.log("  ranked:", r.replace(/\n/g, " | ")));
  console.log(
    "  featured:",
    (await page.locator(".featured-company-signals").innerText()).replace(
      /\n/g,
      " | ",
    ),
  );
  console.log(
    "  proof:",
    (await page.locator(".preview-proof").innerText()).replace(/\n/g, " | "),
  );
  console.log(
    "  story-list first:",
    (await page.locator(".story-list a").first().innerText()).replace(
      /\n/g,
      " | ",
    ),
  );
  await ctx.close();
}

// question success -> where can you go
{
  const { ctx, page } = await ctxFor("sales");
  await page.goto(BASE + "/questions/new", { waitUntil: "networkidle" });
  await page.fill(
    '[data-testid="question-title"]',
    "테스트 질문 제목입니다 확인용",
  );
  await page.fill("textarea", "본문 테스트입니다.");
  await page.click(".form-panel button.primary");
  await page.waitForTimeout(20000);
  console.log("== question result ==");
  console.log(
    "  progress:",
    (await page.locator(".ai-progress").innerText())
      .replace(/\n/g, " | ")
      .slice(0, 400),
  );
  const links = await page.locator(".ai-progress a").allInnerTexts();
  console.log("  links:", JSON.stringify(links));
  const model = await page
    .locator(".fieldnote-answer-footer p")
    .innerText()
    .catch(() => "none");
  console.log("  footer:", model);
  await page.screenshot({
    path: `${OUT}/p3-question-result.png`,
    fullPage: true,
  });
  await ctx.close();
}

// reduce-motion / reveal animation
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("fieldnote-visited-v2", "1"));
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const anim = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.animationName !== "none")
        out.push(
          `${el.className} anim=${cs.animationName} ${cs.animationDuration}`,
        );
      if (cs.transitionDuration !== "0s" && out.length < 40)
        out.push(
          `${String(el.className).slice(0, 40)} trans=${cs.transitionDuration}`,
        );
    }
    return out.slice(0, 20);
  });
  console.log("== reduced motion still animating ==");
  anim.forEach((a) => console.log("  ", a));
  await ctx.close();
}

// 768 tablet admin + forms
{
  const { ctx, page } = await ctxFor("admin", 768, 1024);
  for (const p of ["/admin", "/admin/reviews", "/admin/companies"]) {
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(() => ({
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
    }));
    console.log(`== 768 ${p} overflow`, JSON.stringify(overflow));
  }
  await ctx.close();
}
{
  const { ctx, page } = await ctxFor("verified", 390, 844);
  for (const p of [
    "/",
    "/companies",
    "/companies/northstar-cloud",
    "/compare",
    "/community",
    "/posts/p1",
    "/account",
    "/reviews/new",
    "/questions/new",
    "/admin",
  ]) {
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    const o = await page.evaluate(() => {
      const wide = [];
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 1 && r.width > 20)
          wide.push(
            `${el.tagName}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`,
          );
      }
      return {
        docW: document.documentElement.scrollWidth,
        winW: window.innerWidth,
        wide: wide.slice(0, 5),
      };
    });
    console.log(`== 390 ${p}`, JSON.stringify(o));
  }
  await ctx.close();
}

await browser.close();
