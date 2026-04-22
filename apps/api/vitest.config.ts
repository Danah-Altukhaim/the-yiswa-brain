import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**", "src/lib/prisma.ts", "src/lib/redis.ts"],
      // Ratchet-up coverage floor. Intent: set just below the current actuals
      // so regressions fail CI, and raise on a regular cadence as tests land.
      // Current actuals: lines 62, branches 81, functions 65, statements 62.
      thresholds: {
        lines: 60,
        branches: 70,
        functions: 60,
        statements: 60,
      },
    },
  },
});
