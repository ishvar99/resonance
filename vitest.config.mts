import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // `src/lib/environment.ts` validates on import; tests exercise logic, not
    // configuration, so validation is skipped and NODE_ENV pinned to `test`.
    env: {
      SKIP_ENV_VALIDATION: "1",
      NODE_ENV: "test",
    },
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/features/**/data/**", "src/features/**/server/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
      // `server-only` throws unless it is resolved through Next's
      // `react-server` condition, which Vitest does not apply.
      "server-only": path.resolve(root, "./node_modules/server-only/empty.js"),
    },
  },
});
