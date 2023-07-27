import "dotenv/config"
import { defineConfig, devices } from "@playwright/test"
import { createTestFiles } from "./lib/utils"

createTestFiles(Number(process.env.MAILTEST_PARALLEL_TEST_FILES) || 1)

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["./reporters/emails"]],
  use: {
    trace: "on-first-retry",
  },
  webServer: {
    command: "yarn mail-server",
    url: `http://localhost:${Number(process.env.SMTP_SERVER_PORT) + 1}`,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },
    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },
  ],
})
