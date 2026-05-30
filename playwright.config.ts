import { defineConfig, devices } from "@playwright/test";

// AIDOS Workbench e2e. The webServer block starts the Next dev server itself,
// so hooks and CI work with no manual setup.
export default defineConfig({
	testDir: "./tests/e2e",
	timeout: 30_000,
	retries: process.env.CI ? 2 : 0,
	reporter: [["html"], ["list"]],
	use: {
		baseURL: "http://localhost:3000",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	webServer: {
		command: "npm run dev -w @aidos/web",
		url: "http://localhost:3000",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
