import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: "text",
      include: ["src/**/*"],
      exclude: ["src/utils/*", "src/**/index.ts"],
      thresholds: {
        statements: 80,
        branches: 60,
        functions: 70,
        lines: 80,
      },
    },
  },
});
