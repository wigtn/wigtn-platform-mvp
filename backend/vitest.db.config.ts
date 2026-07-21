import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["supabase/tests/**/*.test.ts"],
    exclude: ["supabase/tests/ai_subscription_integration.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
