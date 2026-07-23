import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    /* 본문 거르기는 브라우저 파서를 쓴다. DOM 없이 돌리면 그 경로를 통째로
       못 보고 지나간다 - 정작 확인해야 할 것이 그 경로다. */
    environment: "jsdom",
  },
});
