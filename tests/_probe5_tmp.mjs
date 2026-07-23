import { chromium } from "@playwright/test";
const BASE = "http://localhost:3000";
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await c.newPage();
await p.goto(BASE + "/");
await p.evaluate(() => {
  localStorage.setItem("fieldnote-visited-v2", "1");
  localStorage.setItem("fieldnote-role", "sales");
  // replayActions 경로가 만드는 모양: aiAnswer 는 있고 aiModel 은 없다
  const post = {
    id: "px",
    board: "Q&A",
    title: "리드가 줄었을 때 무엇부터 봐야 하나요",
    body: "본문",
    author: "윤서진",
    likes: 0,
    saved: false,
    comments: [],
    ai: "posted",
    aiAnswer: JSON.stringify({
      summary: "파이프라인 유입 경로부터 나눠 보세요.",
      clarifyingQuestions: ["어느 채널이 줄었나요?"],
      actions: ["채널별 유입을 주 단위로 나눠 봅니다."],
      missingContext: [],
      caution: "한 주 데이터만 보고 판단하지 마세요.",
    }),
  };
  sessionStorage.setItem("fieldnote-pending-question-v1", JSON.stringify(post));
});
await p.goto(BASE + "/posts/px", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
console.log(
  "footer:",
  JSON.stringify(
    await p
      .locator(".fieldnote-answer-footer p")
      .innerText()
      .catch(() => "none"),
  ),
);
console.log(
  "mark:",
  JSON.stringify(
    await p
      .locator(".fieldnote-answer-mark")
      .innerText()
      .catch(() => "none"),
  ),
);
console.log(
  "caution glyph:",
  JSON.stringify(
    await p
      .locator(".fieldnote-answer-caution span")
      .innerText()
      .catch(() => "none"),
  ),
);
console.log(
  "status:",
  JSON.stringify(
    await p
      .locator(".fieldnote-answer-status")
      .innerText()
      .catch(() => "none"),
  ),
);
console.log(
  "footer link:",
  await p
    .locator(".fieldnote-answer-footer a")
    .innerText()
    .catch(() => "none"),
  await p
    .locator(".fieldnote-answer-footer a")
    .getAttribute("href")
    .catch(() => "none"),
);
await p.screenshot({
  path: process.argv[2] + "/p5-aicard.png",
  fullPage: true,
});
await b.close();
