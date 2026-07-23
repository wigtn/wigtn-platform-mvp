/*
  화면 크기별로 각 페이지를 찍는다. 눈으로 볼 용도의 임시 도구다.

  브라우저 확장으로는 창 폭을 못 줄여서 모바일을 확인할 수 없었다.
  playwright 로 폭을 직접 정해 찍는다.
*/
import { chromium } from "@playwright/test";

const WIDTHS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
];
const PAGES = [
  ["home", "/"],
  ["companies", "/companies"],
  ["company", "/companies/northstar-cloud"],
  ["compare", "/compare"],
  ["community", "/community"],
  ["post", "/posts/p1"],
  ["policy", "/policy"],
  ["account", "/account"],
  ["admin", "/admin"],
];

const out = process.argv[2] ?? "/tmp/shots";
const browser = await chromium.launch();
for (const size of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
  });
  const page = await context.newPage();
  // 첫 방문이면 역할 고르기 창이 화면을 덮는다. 한 번 골라 두고 찍는다.
  await page.goto("http://localhost:3000/");
  const pick = page.getByRole("button", { name: "이 역할로 시작" }).nth(1);
  if (await pick.isVisible().catch(() => false)) await pick.click();
  for (const [name, path] of PAGES) {
    await page.goto(`http://localhost:3000${path}`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: `${out}/${size.name}-${name}.png`,
      fullPage: true,
    });
    console.log(`${size.name}/${name}`);
  }
  await context.close();
}
await browser.close();
