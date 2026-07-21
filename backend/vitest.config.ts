import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "test/**/*.test.ts",
      "core/*/test/**/*.test.ts",
      "core/api-contracts/src/**/*.test.ts",
    ],
    exclude: ["**/*.live.test.ts"],
    testTimeout: 15_000,
  },
});
