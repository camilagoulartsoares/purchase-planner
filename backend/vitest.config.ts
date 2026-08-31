import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  const testDatabaseUrl = loadEnv(mode, process.cwd(), "").TEST_DATABASE_URL;

  return {
    test: {
      include: ["src/**/*.test.ts"],
      exclude: [
        "dist/**",
        "node_modules/**",
        ...(!testDatabaseUrl ? ["src/tests/api.test.ts"] : []),
      ],
      env: testDatabaseUrl
        ? { DATABASE_URL: testDatabaseUrl, NODE_ENV: "test" }
        : { NODE_ENV: "test" },
    },
  };
});
