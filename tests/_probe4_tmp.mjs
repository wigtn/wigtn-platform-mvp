import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();
await page.goto(BASE + "/");
await page.evaluate(() => {
  localStorage.setItem("fieldnote-visited-v2", "1");
  localStorage.setItem("fieldnote-role", "sales");
});
const look = (e) => {
  const c = getComputedStyle(e);
  return `col=${c.color} td=${c.textDecorationLine} fw=${c.fontWeight} bd=${c.borderBottomWidth}`;
};
const checks = [
  ["/companies", ".company-card .caption", "caption text"],
  [
    "/companies/northstar-cloud",
    ".fit-checklist a",
    "현직자에게 확인 질문하기",
  ],
  ["/community", ".channel-guide a", "질문 올리기"],
  ["/community", ".answer-standard a", "검증 정책"],
  ["/compare", ".compare-grid .text-link", "리뷰 자세히 보기"],
  ["/questions/new", ".similar-box a", "유사 질문"],
  ["/", ".hero-explore-link", "회사 탐색 시작"],
  ["/", ".ranked-note a", "산정 방식 확인"],
];
for (const [p, sel, name] of checks) {
  await page.goto(BASE + p, { waitUntil: "networkidle" });
  const el = page.locator(sel).first();
  if (!(await el.count())) {
    console.log(name, "NOT FOUND");
    continue;
  }
  console.log(
    `${name}: "${(await el.innerText()).trim()}" ${await el.evaluate(look)}`,
  );
}
// companies search empty state + caption casing
await page.goto(BASE + "/companies", { waitUntil: "networkidle" });
console.log(
  "caption raw:",
  await page.locator(".company-card .caption").first().textContent(),
);
await page.fill('[data-testid="company-search"]', "zzzz");
await page.waitForTimeout(400);
console.log(
  "empty state:",
  (await page.locator(".empty-state").innerText()).replace(/\n/g, " | "),
);
console.log(
  "filter count line:",
  await page.locator(".filter-bar span").last().innerText(),
);
// report dialog label wrap
await page.goto(BASE + "/posts/p1", { waitUntil: "networkidle" });
await page.click(".post-action-report");
await page.waitForTimeout(400);
const lbl = page.locator(".report-details");
console.log(
  "report label:",
  JSON.stringify(await lbl.innerText()),
  await lbl.evaluate((e) => {
    const s = e.querySelector("span");
    return (
      getComputedStyle(s).display +
      " w=" +
      Math.round(e.getBoundingClientRect().width)
    );
  }),
);
// focus trap check in report dialog
const order = [];
for (let i = 0; i < 9; i++) {
  await page.keyboard.press("Tab");
  order.push(
    await page.evaluate(() => {
      const a = document.activeElement;
      return `${a.tagName}:${(a.textContent || a.value || a.type || "").trim().slice(0, 14)}`;
    }),
  );
}
console.log("dialog tab cycle:", order.join(" -> "));
await browser.close();
