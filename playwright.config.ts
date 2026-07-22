import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  /*
    한 번에 하나씩 돌린다.

    desktop 과 mobile 이 같은 개발 서버·같은 Supabase·같은 AI 워커를 쓴다.
    병렬로 돌리면 서로의 데모 세션과 큐를 밟는다 - 관리자 블라인드가 다른
    실행의 상태를 보고, AI 답변은 워커가 순서대로 처리하느라 제한 시간을
    넘긴다. 개별 실행은 전부 통과하는데 전체 실행만 빨간불이었다.

    느려지지만, 믿을 수 없는 초록불보다 낫다.
  */
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: true,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    /*
      e2e 는 DB 없이 돈다.

      이 테스트들은 화면 흐름을 본다 - 어느 버튼을 누르면 어디로 가고
      무엇이 보이는지. Supabase 를 붙이면 매번 원격 DB 를 타서 느려지고,
      네트워크나 남이 남긴 데이터에 따라 결과가 흔들린다. 화면 테스트가
      DB 상태 때문에 빨간불이 되면 아무도 안 믿는다.

      설정이 없으면 앱은 lib/domain.ts 의 고정 데이터로 돈다. 그게 이
      테스트들이 처음부터 기대하던 값이다.

      DB 연동은 따로 확인한다(원장에 남는지, RLS 가 막는지 등).
    */
    /*
      AI 답변 테스트는 실제 DB·워커를 탄다. 큐에 넣고 워커가 처리한 결과를
      기다리는 흐름이라 흉내로는 검증이 안 된다. 나머지 화면 테스트도 같은
      서버를 쓰므로 여기서 DB 를 끄면 그 하나가 반드시 실패한다.
    */
    timeout: 120_000,
  },
});
