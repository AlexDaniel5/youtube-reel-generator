import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Playwright specs live in e2e/ and run via `npm run test:e2e`.
    exclude: ["e2e/**", "node_modules/**"],
  },
});
