import { expect, test } from "@playwright/test";

/**
 * S92 Playwright e2e — the « Observabilité d'exploitation » Workbench panel.
 * mirror record: reflects=S92-ops-observability, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /ops-observability route is action-capable (ui-completeness law, CLAUDE.md §7): every op
 * the step develops has a control reachable AND executable from the screen, bound to the REAL pure
 * twin (lib/ops-observability, the twin of back/runtime/opsobservability). The S92 done-criteria,
 * reached from the screen:
 *   - the emitted app EMITS OTel signals (logs/spans/errors) — the emit controls;
 *   - the ops DASHBOARD renders them (request count, error rate, latency p50/p95/p99, log feed,
 *     error feed) — Godog done-criterion "l'app émise émet logs/traces, le dashboard d'ops les rend";
 *   - a secret a careless app logged is REDACTED in the rendered feed (never printed in the clear).
 *
 * THE WALL (CLAUDE.md §2 / property done-criterion): ops-observability writes NO truth — the panel
 * shows wroteKernel:false; the E12 RealityMirror is the only Kernel on-ramp. Every judgment is a
 * pure function, never an LLM.
 */

test.describe("S92 — ops observability of the emitted app", () => {
	test("the route renders the panel with every op control", async ({ page }) => {
		await page.goto("/ops-observability");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Observabilité d'exploitation|Ops observability/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("emit-signal")).toBeVisible();
		await expect(page.getByTestId("seed-demo")).toBeVisible();
		await expect(page.getByTestId("build-dashboard")).toBeVisible();
		// THE WALL: the panel proves it writes no truth.
		await expect(page.getByTestId("wrote-kernel")).toContainText("false");
	});

	test("emit a span then build the dashboard — it renders latency + requests", async ({ page }) => {
		await page.goto("/ops-observability");
		await page.getByTestId("field-kind").selectOption("span");
		await page.getByTestId("field-route").fill("POST /orders");
		await page.getByTestId("field-duration").fill("42");
		await page.getByTestId("emit-signal").click();
		await expect(page.getByTestId("signal-count")).toContainText("1");
		await page.getByTestId("build-dashboard").click();
		await expect(page.getByTestId("dashboard")).toBeVisible();
		await expect(page.getByTestId("metric-requests")).toContainText("1");
		await expect(page.getByTestId("metric-p95")).toContainText("42ms");
		// still wrote no truth after a build.
		await expect(page.getByTestId("wrote-kernel")).toContainText("false");
	});

	test("the demo set: dashboard renders the error rate, the error feed AND redacts a logged secret", async ({
		page,
	}) => {
		await page.goto("/ops-observability");
		await page.getByTestId("seed-demo").click();
		await expect(page.getByTestId("signal-count")).toContainText("6");
		await page.getByTestId("build-dashboard").click();
		await expect(page.getByTestId("dashboard")).toBeVisible();
		// 4 spans, 1 errored → 25% error rate; the error feed has the error log + the error event.
		await expect(page.getByTestId("metric-requests")).toContainText("4");
		await expect(page.getByTestId("metric-errorrate")).toContainText("25.0%");
		await expect(page.getByTestId("error-feed")).toBeVisible();
		// the logged secret is REDACTED and never printed in the clear (the S91 law).
		await expect(page.getByTestId("error-feed")).toContainText("[REDACTED]");
		await expect(page.getByTestId("error-feed")).not.toContainText("leakedsecret123");
		// the deterministic fingerprint is shown (same signals → same panel).
		await expect(page.getByTestId("fingerprint")).toBeVisible();
	});

	test("a foreign-kind cannot be emitted (closed set) — only log|span|error are options", async ({
		page,
	}) => {
		await page.goto("/ops-observability");
		const opts = await page.getByTestId("field-kind").locator("option").allInnerTexts();
		expect(opts.sort()).toEqual(["error", "log", "span"]);
	});
});
