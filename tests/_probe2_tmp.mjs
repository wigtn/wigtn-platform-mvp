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
const snap = (e) => {
  const cs = getComputedStyle(e);
  return `bg=${cs.backgroundColor} col=${cs.color} bd=${cs.borderColor} sh=${cs.boxShadow.slice(0, 30)} tf=${cs.transform.slice(0, 30)} td=${cs.textDecorationLine}`;
};

// hover audit
{
  const { ctx, page } = await ctxFor("sales");
  const targets = [
    ["/companies", ".company-card"],
    ["/companies", ".company-card h3 a"],
    ["/", ".preview-company"],
    ["/", ".ranked-company"],
    ["/", ".story-list a"],
    ["/", ".text-link"],
    ["/community", ".feed article h2 a"],
    ["/community", ".rail-topic"],
    ["/community", ".post-actions button"],
    ["/admin", ".work-queue-row"],
  ];
  console.log("== hover audit ==");
  for (const [path, sel] of targets) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    const el = page.locator(sel).first();
    if (!(await el.count())) {
      console.log(`  ${path} ${sel}: NOT FOUND`);
      continue;
    }
    const before = await el.evaluate(snap);
    await el.hover();
    await page.waitForTimeout(350);
    const after = await el.evaluate(snap);
    console.log(
      `  ${path} ${sel}\n     before ${before}\n     after  ${after}\n     changed=${before !== after}`,
    );
  }
  await ctx.close();
}

// hero search focus visual
{
  const { ctx, page } = await ctxFor("guest");
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  const wrap = page.locator(".hero-search");
  const b = await wrap.evaluate(snap);
  await page.locator(".hero-search input").focus();
  await page.waitForTimeout(300);
  const a = await wrap.evaluate(snap);
  console.log(
    "== hero search focus ==\n  before",
    b,
    "\n  after ",
    a,
    "\n  changed=",
    b !== a,
  );
  await page.screenshot({
    path: `${OUT}/p-herosearch-focus.png`,
    clip: { x: 0, y: 400, width: 900, height: 200 },
  });
  await ctx.close();
}

// admin manual company 수정 dead end
{
  const { ctx, page } = await ctxFor("admin");
  await page.goto(BASE + "/admin/companies", { waitUntil: "networkidle" });
  await page.fill('input[name="companyName"]', "위그튼 세일즈랩");
  await page.click(".admin-inline-form button");
  await page.waitForTimeout(700);
  console.log("== admin companies ==");
  console.log(
    "  title count:",
    await page.locator(".admin-title-count").innerText(),
  );
  console.log(
    "  row:",
    (await page.locator(".admin-row").first().innerText()).replace(
      /\n/g,
      " | ",
    ),
  );
  await page.click(".admin-row button");
  await page.waitForTimeout(600);
  console.log(
    "  after 수정 click -> toast:",
    await page
      .locator(".toast")
      .innerText()
      .catch(() => "none"),
  );
  console.log("  dialog opened?", await page.locator(".report-dialog").count());
  // duplicate manual company?
  await page.fill('input[name="companyName"]', "위그튼 세일즈랩");
  await page.click(".admin-inline-form button");
  await page.waitForTimeout(700);
  console.log(
    "  rows after adding same name twice:",
    await page.locator(".admin-row").count(),
  );
  console.log(
    "  title count now:",
    await page.locator(".admin-title-count strong").innerText(),
  );
  await page.screenshot({
    path: `${OUT}/p-admincompanies-dup.png`,
    fullPage: true,
  });
  await ctx.close();
}

// header 리뷰 작성 on /reviews/new + nav aria-current on /posts/xx
{
  const { ctx, page } = await ctxFor("sales");
  await page.goto(BASE + "/reviews/new", { waitUntil: "networkidle" });
  console.log("== self links ==");
  console.log(
    "  on /reviews/new, header write href:",
    await page.locator(".header-write").getAttribute("href"),
  );
  console.log(
    "  nav active:",
    await page.locator("nav[aria-label='주요 메뉴'] a.active").count(),
  );
  await page.goto(BASE + "/posts/p1", { waitUntil: "networkidle" });
  console.log(
    "  on /posts/p1, nav active count:",
    await page.locator("nav[aria-label='주요 메뉴'] a.active").count(),
  );
  await page.goto(BASE + "/questions/new", { waitUntil: "networkidle" });
  console.log(
    "  on /questions/new, nav active count:",
    await page.locator("nav[aria-label='주요 메뉴'] a.active").count(),
  );
  await page.goto(BASE + "/compare", { waitUntil: "networkidle" });
  console.log(
    "  compare desc:",
    await page.locator(".page-title p").last().innerText(),
  );
  await ctx.close();
}

// admin queue toolbar keyboard + empty filter state
{
  const { ctx, page } = await ctxFor("admin");
  await page.goto(BASE + "/admin/reviews", { waitUntil: "networkidle" });
  console.log("== admin reviews ==");
  console.log(
    "  toolbar:",
    (await page.locator(".admin-queue-toolbar").innerText()).replace(
      /\n/g,
      " | ",
    ),
  );
  // blind all, then check counts
  const n = await page.locator(".admin-review-row").count();
  for (let i = 0; i < n; i++) {
    await page.locator(".admin-review-row button").first().click();
    await page.click(".report-dialog .button.primary");
    await page.waitForTimeout(400);
  }
  console.log(
    "  after blinding all -> title count:",
    await page.locator(".admin-title-count strong").innerText(),
  );
  console.log(
    "  toolbar:",
    (await page.locator(".admin-queue-toolbar div").innerText()).replace(
      /\n/g,
      " | ",
    ),
  );
  console.log(
    "  nav badge 리뷰 운영:",
    await page.locator(".admin-nav a", { hasText: "리뷰 운영" }).innerText(),
  );
  await page.goto(BASE + "/companies/northstar-cloud", {
    waitUntil: "networkidle",
  });
  console.log(
    "  company after blinding: score=",
    await page.locator(".score-monument strong").innerText(),
    " facts=",
    (await page.locator(".company-facts").innerText()).replace(/\n/g, " | "),
    " tabs=",
    (await page.locator(".company-tabs").innerText()).replace(/\n/g, " | "),
  );
  console.log(
    "  review list:",
    (await page.locator(".review-list").innerText())
      .replace(/\n/g, " | ")
      .slice(0, 120),
  );
  await page.screenshot({
    path: `${OUT}/p-company-all-blinded.png`,
    fullPage: true,
  });
  await ctx.close();
}

// slow load: does the page visibly change after DB arrives?
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  await page.route("**/rest/v1/**", async (r) => {
    await new Promise((s) => setTimeout(s, 3000));
    r.continue();
  });
  await page.route("**/auth/v1/**", async (r) => {
    await new Promise((s) => setTimeout(s, 3000));
    r.continue();
  });
  await page.goto(BASE + "/");
  await page.evaluate(() => localStorage.setItem("fieldnote-visited-v2", "1"));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/p-slow-early.png` });
  const early = await page
    .locator(".featured-company")
    .innerText()
    .catch(() => "none");
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${OUT}/p-slow-late.png` });
  const late = await page
    .locator(".featured-company")
    .innerText()
    .catch(() => "none");
  console.log("== slow load ==");
  console.log("  early:", early.replace(/\n/g, " | "));
  console.log("  late :", late.replace(/\n/g, " | "));
  console.log("  changed under the reader =", early !== late);
  await ctx.close();
}

await browser.close();
