import { expect, test } from "@playwright/test";

/**
 * S73 Playwright e2e — the « operation asynchrone / planifiée + outbox » Workbench panel.
 * mirror record: reflects=S73-async-operation, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /async-operation route is action-capable (ui-completeness law, CLAUDE.md §7): the control
 * is reachable AND executable from the screen, bound to a Server Action running the REAL pure engine
 * (lib/async-operation, the TS twin of back/kernel/operation async.go). The done-criteria of S73:
 *   - fixture — a scheduled operation FIRES at its echeance and emits its events (tick over an
 *     injected clock); the outbox REPLAYS an undispatched effect after a crash WITHOUT a duplicate;
 *   - property — scheduling is DETERMINISTIC on the injected clock (before the echeance: nothing fires);
 *   - the scheduler is CODE, never an LLM.
 *
 * THE WALL (CLAUDE.md §2): the screen only TICKS, SCHEDULES and DISPATCHES — it writes no truth; the
 * outbox is a runtime datastore table. The logic is a pure function (never an LLM).
 */

test.describe("S73 — async/scheduled operation + outbox", () => {
	test("the route renders the panel with the schedule-run control", async ({
		page,
	}) => {
		await page.goto("/async-operation");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Operation asynchrone \/ planifiée \+ outbox|Async \/ scheduled operation \+ outbox/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("run-submit")).toBeVisible();
		await expect(page.getByTestId("clock-now")).toBeVisible();
		await expect(page.getByTestId("op-name")).toHaveText("sendReminder");
		await expect(page.getByTestId("trigger-kind")).toContainText("cron");
	});

	test("at the echeance the operation fires + the outbox dispatches exactly-once", async ({
		page,
	}) => {
		await page.goto("/async-operation");
		// the clock defaults to the echeance 2026-06-08T09:00:00Z.
		await page.getByTestId("run-submit").click();

		const result = page.getByTestId("run-result");
		await expect(result).toHaveAttribute("data-fired", "true");
		// the content-addressed effect id (the idempotency key) is shown and non-empty.
		await expect(page.getByTestId("effect-id")).toHaveText(/^[0-9a-f]{64}$/);
		// the outbox delivered the effect once (at-least-once after a crash).
		await expect(page.getByTestId("delivered")).toHaveText("1");
		// the at-least-once REDELIVERY was suppressed (the replay).
		await expect(page.getByTestId("suppressed")).toHaveText("1");
		// the OBSERVABLE delivery count stays exactly 1 (exactly-once relative).
		await expect(page.getByTestId("observable")).toHaveAttribute(
			"data-count",
			"1",
		);
	});

	test("determinism — before the echeance the operation does NOT fire", async ({
		page,
	}) => {
		await page.goto("/async-operation");
		// one second before the echeance: the deterministic scheduler fires nothing.
		await page.getByTestId("clock-now").fill("2026-06-08T08:59:59Z");
		await page.getByTestId("run-submit").click();

		const result = page.getByTestId("run-result");
		await expect(result).toHaveAttribute("data-fired", "false");
		await expect(page.getByTestId("fired-badge")).toBeVisible();
	});

	test("after the echeance the operation still fires (now ≥ echeance)", async ({
		page,
	}) => {
		await page.goto("/async-operation");
		await page.getByTestId("clock-now").fill("2026-06-08T12:00:00Z");
		await page.getByTestId("run-submit").click();

		const result = page.getByTestId("run-result");
		await expect(result).toHaveAttribute("data-fired", "true");
		// still exactly-once relative on the outbox.
		await expect(page.getByTestId("observable")).toHaveAttribute(
			"data-count",
			"1",
		);
	});
});
