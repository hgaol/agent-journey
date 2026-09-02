import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4317",
    ...(process.env.CI ? {} : { channel: "chrome" }),
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "pnpm e2e:seed && AGENTJOURNEY_DATA_DIR=$PWD/.agentjourney/e2e AGENTJOURNEY_PLUGIN_DEV_DIRS=$PWD/examples/plugins/compact-renderer pnpm --filter @agentjourney/host start",
      url: "http://127.0.0.1:4317/api/v1/health",
      reuseExistingServer: false,
      timeout: 60_000
    },
    {
      command: "pnpm --filter @agentjourney/web dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: false,
      timeout: 60_000
    }
  ]
});
