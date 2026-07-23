import { chromium } from "@playwright/test";
import fs from "node:fs";

const OUT = process.argv[2] ?? "/tmp/tour";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";

const SIZES = [
  { name: "d", width: 1440, height: 900 },
  { name: "t", width: 768, height: 1024 },
  { name: "m", width: 390, height: 844 },
];

const browser = await chromium.launch();

async function newPage(size, role) {
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
  });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      console.log(
        `  [console:${size.name}:${m.type()}] ${m.text().slice(0, 200)}`,
      );
  });
  page.on("pageerror", (e) => console.log(`  [pageerror] ${e.message}`));
  await page.goto(BASE + "/");
  await page.evaluate((r) => {
    localStorage.setItem("fieldnote-visited-v2", "1");
    localStorage.setItem("fieldnote-role", r);
  }, role);
  return { ctx, page };
}

async function shot(page, name) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("shot " + name);
}

// --- Admin pages, all widths ---
const adminRoutes = [
  ["admin", "/admin"],
  ["adminreviews", "/admin/reviews"],
  ["adminmembers", "/admin/members"],
  ["admincontent", "/admin/content"],
  ["admincompanies", "/admin/companies"],
  ["adminplacements", "/admin/placements"],
];
for (const size of SIZES) {
  const { ctx, page } = await newPage(size, "admin");
  for (const [name, path] of adminRoutes) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await shot(page, `${size.name}-${name}`);
  }
  await ctx.close();
}

// --- Write forms ---
const formRoutes = [
  ["reviewsnew", "/reviews/new"],
  ["postsnew", "/posts/new"],
  ["questionsnew", "/questions/new"],
];
for (const size of SIZES) {
  const { ctx, page } = await newPage(size, "verified");
  for (const [name, path] of formRoutes) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await shot(page, `${size.name}-${name}`);
  }
  await ctx.close();
}

// --- guest views of the gated pages ---
{
  const { ctx, page } = await newPage(SIZES[0], "guest");
  for (const [name, path] of [...formRoutes, ["adminguest", "/admin"]]) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await shot(page, `g-${name}`);
  }
  await ctx.close();
}

// --- Validation: submit empty / too short ---
{
  const { ctx, page } = await newPage(SIZES[0], "verified");
  await page.goto(BASE + "/reviews/new", { waitUntil: "networkidle" });
  await page.click('button[type="submit"]');
  await shot(page, "v-review-empty");
  await page.fill('input[name="title"]', "짧음");
  await page.fill('textarea[name="body"]', "짧다");
  await page.click('button[type="submit"]');
  await shot(page, "v-review-short");

  await page.goto(BASE + "/posts/new", { waitUntil: "networkidle" });
  await page.click(".form-panel button.primary");
  await shot(page, "v-post-empty");

  await page.goto(BASE + "/questions/new", { waitUntil: "networkidle" });
  await page.click(".form-panel button.primary");
  await shot(page, "v-question-empty");
  await page.fill('[data-testid="question-title"]', "짧다");
  await page.click(".form-panel button.primary");
  await shot(page, "v-question-short");
  // now a single-char body
  await page.fill(
    '[data-testid="question-title"]',
    "엔터프라이즈 첫 미팅 준비 질문",
  );
  await page.fill("textarea", "ㅇ");
  await page.click(".form-panel button.primary");
  await page.waitForTimeout(1500);
  await shot(page, "v-question-submitted");
  await page.waitForTimeout(12000);
  await shot(page, "v-question-answered");
  await ctx.close();
}

// --- Dialogs at desktop + mobile ---
for (const size of [SIZES[0], SIZES[2]]) {
  const { ctx, page } = await newPage(size, "sales");
  await page.goto(BASE + "/posts/p1", { waitUntil: "networkidle" });
  await page.click(".post-action-report");
  await shot(page, `${size.name}-dlg-report`);
  await page.keyboard.press("Escape");

  await ctx.close();

  const { ctx: c2, page: p2 } = await newPage(size, "admin");
  await p2.goto(BASE + "/admin/reviews", { waitUntil: "networkidle" });
  await p2.click(".admin-review-row button");
  await shot(p2, `${size.name}-dlg-confirm`);
  await c2.close();

  // role picker = first visit
  const c3 = await browser.newContext({
    viewport: { width: size.width, height: size.height },
  });
  const p3 = await c3.newPage();
  await p3.goto(BASE + "/", { waitUntil: "networkidle" });
  await shot(p3, `${size.name}-dlg-rolepicker`);
  await c3.close();

  // account login dialog
  const { ctx: c4, page: p4 } = await newPage(size, "guest");
  await p4.goto(BASE + "/", { waitUntil: "networkidle" });
  await p4.click(".header-role");
  await shot(p4, `${size.name}-dlg-accountlogin`);
  await c4.close();
}

// --- mobile role sheet ---
{
  const { ctx, page } = await newPage(SIZES[2], "sales");
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.click(".mobile-role-trigger");
  await shot(page, "m-dlg-rolesheet");
  await ctx.close();
}

// --- 1440 desktop of the main routes ---
{
  const { ctx, page } = await newPage(SIZES[0], "sales");
  for (const [name, path] of [
    ["home", "/"],
    ["companies", "/companies"],
    ["company", "/companies/northstar-cloud"],
    ["compare", "/compare"],
    ["community", "/community"],
    ["post", "/posts/p1"],
    ["trust", "/trust"],
    ["account", "/account"],
    ["notfound", "/nope"],
    ["badcompany", "/companies/does-not-exist"],
    ["badpost", "/posts/zzz"],
  ]) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await shot(page, `d-${name}`);
  }
  await ctx.close();
}

await browser.close();
console.log("done");
