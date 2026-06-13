import { expect, test } from "@playwright/test";

/**
 * DP09 Playwright e2e — the environments cockpit on /environments.
 * mirror record: reflects=DP09-env-binding-cockpit, test_kind=e2e,
 * cert_language=playwright, liveness=live
 *
 * Proves the DONE CRITERIA from the screen (tout se fait par écran):
 *  - declare an environment binding → a ChangeSet is PROPOSED (DRAFT,
 *    content-addressed, spec_delta + mirror_delta together);
 *  - approve it → APPLIED and the connection matrix RECOMPUTES as the PURE
 *    DP07 projection (the recomputed address diverges from the Go-pinned
 *    zero-changeset one — never an estimation);
 *  - the DP08 sensor is GREEN (Go-pinned verdict address);
 *  - THE WALL: the gates refuse in the door (DP06 A1 prod+doltgres, DP08
 *    hardcoded endpoint) and a direct kernel_write through the S58 gateway
 *    is REFUSED with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET — the screen
 *    proposes, it never writes the Kernel.
 */

// The Go-authoritative DP07 zero-changeset matrix address (pinned by
// connections.spec.ts + lib/connections.test.ts).
const GO_MATRIX_HASH =
	"eb382dcff9243e410ceb6d7bbfe79a942d3845d3adba1f3732439bdb39f45772";

// The Go-authoritative DP08 GREEN verdict address (pinned by
// endpoints-fitness.spec.ts + lib/endpoint-fitness.test.ts).
const GO_GREEN_ADDRESS =
	"43f2e914534d162173904514b6e5e0d916584092df50ce47944564a264a52970";

test.describe("DP09 — the environments cockpit (propose → ChangeSet → approbation)", () => {
	test("the cockpit renders: the DP08 sensor is GREEN at the Go-pinned address", async ({
		page,
	}) => {
		await page.goto("/environments");
		await expect(page.getByTestId("dp09-sensor-card")).toBeVisible();
		await expect(page.getByTestId("dp09-sensor-state")).toHaveText("vert");
		await expect(page.getByTestId("dp09-sensor-address")).toHaveText(
			GO_GREEN_ADDRESS,
		);
		// the three DP09 controls are reachable (ui-completeness — no headless capability).
		await expect(page.getByTestId("cockpit-propose")).toBeVisible();
		await expect(page.getByTestId("wall-probe")).toBeVisible();
	});

	test("the gates refuse in the door: prod+doltgres (DP06 A1) and a hardcoded endpoint (DP08)", async ({
		page,
	}) => {
		await page.goto("/environments");
		// prod + doltgres → DOLTGRES_NOT_ALLOWED_IN_PROD (SPEC-stack-2026).
		await page.getByTestId("cockpit-env").selectOption("prod");
		await page.getByTestId("cockpit-datastore").selectOption("doltgres");
		await page.getByTestId("cockpit-propose").click();
		await expect(page.getByTestId("cockpit-refusal-code")).toHaveText(
			"DOLTGRES_NOT_ALLOWED_IN_PROD",
		);
		// a concrete IP endpoint in the url_pattern → refused with the DP08 closed reason.
		await page.getByTestId("cockpit-env").selectOption("dev");
		await page.getByTestId("cockpit-datastore").selectOption("postgres");
		await page.getByTestId("cockpit-url").fill("https://1.2.3.4:5432");
		await page.getByTestId("cockpit-propose").click();
		await expect(page.getByTestId("cockpit-refusal-code")).toHaveText(
			"HARDCODED_ENDPOINT_IN_BINDING",
		);
		await expect(page.getByTestId("cockpit-refusal-reason")).toHaveText(
			"ip_literal",
		);
	});

	test("declare → ChangeSet proposed (DRAFT) → approve → APPLIED → the matrix recomputes (pure DP07) and the sensor stays green", async ({
		page,
	}) => {
		await page.goto("/environments");
		// declare: dev becomes managed (a binding edit a human could want for a
		// managed dev database) — postgres, managed checked.
		await page.getByTestId("cockpit-env").selectOption("dev");
		await page.getByTestId("cockpit-datastore").selectOption("postgres");
		await page.getByTestId("cockpit-managed").check();
		await page.getByTestId("cockpit-propose").click();

		// the ChangeSet is PROPOSED: DRAFT, content-addressed, complete envelope.
		await expect(page.getByTestId("cockpit-proposal")).toBeVisible();
		await expect(page.getByTestId("proposal-status")).toHaveText("DRAFT");
		await expect(page.getByTestId("proposal-id")).toHaveText(/^[0-9a-f]{64}$/);
		await expect(page.getByTestId("proposal-spec")).toContainText(
			"kernel/binding/dev",
		);
		await expect(page.getByTestId("proposal-mirror")).toContainText(
			"mirrors/binding/dev",
		);

		// the human approves — the envelope applies in the sandbox.
		await page.getByTestId("cockpit-approve").click();
		await expect(page.getByTestId("cockpit-applied")).toBeVisible();
		await expect(page.getByTestId("applied-status")).toHaveText("APPLIED");

		// the matrix RECOMPUTES as the pure DP07 projection: dev is managed ⇒
		// every dev service resolves managed_url.
		await expect(page.getByTestId("cockpit-mode-server")).toHaveText(
			"managed_url",
		);
		await expect(page.getByTestId("cockpit-mode-db")).toHaveText(
			"managed_url",
		);
		// the recomputed address DIVERGES from the Go-pinned zero-changeset one.
		await expect(page.getByTestId("cockpit-matrix-hash")).toHaveText(
			/^[0-9a-f]{64}$/,
		);
		await expect(page.getByTestId("cockpit-matrix-hash")).not.toHaveText(
			GO_MATRIX_HASH,
		);
		await expect(page.getByTestId("cockpit-matrix-same")).toHaveText(
			"non — divergence",
		);
		// the DP08 sensor, re-sensed after the recompute, is GREEN.
		await expect(page.getByTestId("cockpit-sensor-state")).toHaveText("green");
	});

	test("the wall from the screen: kernel_write through the S58 gateway is REFUSED with a ChangeSet hint", async ({
		page,
	}) => {
		await page.goto("/environments");
		await page.getByTestId("wall-probe").click();
		await expect(page.getByTestId("wall-probe-result")).toBeVisible();
		await expect(page.getByTestId("wall-probe-code")).toHaveText(
			"GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET",
		);
	});
});
