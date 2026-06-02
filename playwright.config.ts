import { defineConfig, devices } from "@playwright/test";

// AIDOS Workbench e2e. The webServer block starts the Next dev server itself,
// so hooks and CI work with no manual setup. The host port is overridable via
// PLAYWRIGHT_WEB_PORT (default 3000) so a run can target a fresh dev server on
// another port without disturbing a long-lived deployment already on :3000 — the
// default behaviour is unchanged.
const port = process.env.PLAYWRIGHT_WEB_PORT ?? "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
	testDir: "./tests/e2e",
	timeout: 30_000,
	retries: process.env.CI ? 2 : 0,
	reporter: [["html"], ["list"]],
	use: {
		baseURL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	webServer: {
		command: `npm run dev -w @aidos/web -- --port ${port}`,
		url: baseURL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
