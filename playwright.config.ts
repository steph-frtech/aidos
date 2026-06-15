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
		// ADR 0074 — forward the gateway endpoint to the dev server so the cutover e2e can
		// target the live gateway (:8787 → source "live") or a blackhole port (unreachable
		// → declared "demo", the anti-silent-fallback fault-injection). An already-set
		// process.env var is NOT overridden by .env.local, so this value wins for the run.
		//
		// ISOLATION (le bug des 906 artefacts) : les e2e écrivent leurs projets dans un
		// dossier JETABLE, jamais le vrai .aidos-projects — sinon chaque run pollue le
		// magasin réel et noie le commutateur. AIDOS_PROJECTS_DIR par défaut isolé.
		env: {
			AIDOS_GATEWAY_HTTP_URL: process.env.AIDOS_GATEWAY_HTTP_URL ?? "",
			AIDOS_PROJECTS_DIR:
				process.env.AIDOS_PROJECTS_DIR ?? "/tmp/aidos-e2e-projects",
		},
	},
	projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
