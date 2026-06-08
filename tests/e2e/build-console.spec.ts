import { expect, test } from "@playwright/test";

/**
 * S86 Playwright e2e — « Console de build » Workbench panel.
 * mirror record: reflects=S86-build-console, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /build-console route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * two ops the step develops each have a control reachable AND executable from the screen,
 * bound to a Server Action that computes the REAL deterministic op (the pure twins
 * lib/build-console, byte-identical to back/runtime/buildconsole). The screen lets a human:
 *   - PROJECT the build state from a recorded AgentRun and SEE the non-gameable faithfulness
 *     check (the streamed state EQUALS the recorded AgentRun), with a green sensor + a green
 *     breaker (a red fell to green);
 *   - RECORD a per-project stable phase at the §43 verdict;
 *   - see an INCONSISTENT cut REFUSED (STABLE_PHASE_INCONSISTENT_CUT).
 *
 * THE WALL (CLAUDE.md §2): both ops are read/compute below the line — they write NO truth; the
 * DAG node is recorded by the privileged `aidos` writer. No LLM enters; the judge is the pure
 * projection + the §43 engine.
 */

test.describe("S86 — Build console", () => {
	test("the route renders the build console", async ({ page }) => {
		await page.goto("/build-console");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Console de build|Build console/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("project-panel")).toBeVisible();
		await expect(page.getByTestId("stable-panel")).toBeVisible();
	});

	test("projecting a recorded run is FAITHFUL: the streamed state EQUALS the run, a red fell to green", async ({
		page,
	}) => {
		await page.goto("/build-console");
		// Defaults describe a green run: one authorised write (diff-1), the mirror
		// Order.checkout.feature fell to green, the breaker verdict is green.
		await page.getByTestId("project-submit").click();

		await expect(page.getByTestId("project-result")).toBeVisible();
		// the non-gameable faithfulness check holds.
		await expect(page.getByTestId("faithful")).toContainText(/FIDÈLE|FAITHFUL/);
		// one attempt, one green sensor (the red fell to green), green breaker.
		await expect(page.getByTestId("attempts-count")).toHaveText("1");
		await expect(page.getByTestId("sensors-count")).toHaveText("1");
		await expect(page.getByTestId("breaker-verdict")).toHaveText("green");
		// the approval gate surfaces the two pending proposals.
		await expect(page.getByTestId("pending-count")).toHaveText("2");
	});

	test("a green §43 cut records a per-project stable phase", async ({
		page,
	}) => {
		await page.goto("/build-console");
		// Defaults: heads createOrder@v3, link checkout@v1 -> createOrder@v3 (resolves),
		// sensor createOrder.fixture | ok ⇒ STABLE.
		await page.getByTestId("stable-submit").click();

		await expect(page.getByTestId("stable-result")).toBeVisible();
		await expect(page.getByTestId("stable-verdict")).toContainText(
			/STABLE|recordable|enregistrable/,
		);
	});

	test("an inconsistent cut is REFUSED (STABLE_PHASE_INCONSISTENT_CUT)", async ({
		page,
	}) => {
		await page.goto("/build-console");
		// Flip the sensor to red ⇒ the cut is unstable ⇒ refused, no node.
		await page.getByTestId("stable-sensors").fill("createOrder.fixture | red");
		await page.getByTestId("stable-submit").click();

		await expect(page.getByTestId("stable-result")).toBeVisible();
		await expect(page.getByTestId("stable-verdict")).toContainText(
			/INSTABLE|UNSTABLE/,
		);
		await expect(page.getByTestId("stable-block-code")).toHaveText(
			"STABLE_PHASE_INCONSISTENT_CUT",
		);
	});
});
