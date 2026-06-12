import { expect, test } from "@playwright/test";

/**
 * DP07 Playwright e2e — the connection-mode matrix on the /environments panel.
 * mirror record: reflects=DP07-connections, test_kind=e2e,
 * cert_language=playwright, liveness=live
 *
 * Proves the /environments route is EXTENDED with the service × environment →
 * mode matrix (resolveConnection — the DP07 pure projection, TS twin
 * byte-parity-pinned to the authoritative Go back/runtime/connresolve), that
 * SWITCHING the environment recalculates the modes ON SCREEN (the
 * ui-completeness control), that prod wires internal services docker_internal
 * (never localhost/IP), that cloud resolves managed_url from the environment
 * binding (secret-store ${VAR} reference, S91 — never a value), and that the
 * measure is DETERMINISTIC (measure twice → same Go-pinned address).
 *
 * THE WALL (CLAUDE.md §2): the screen measures — it writes no truth.
 */

// The Go-authoritative content address of the demo resolution matrix (pinned
// by the rapid mirror back/runtime/connresolve + the vitest twin
// lib/connections.test.ts).
const GO_MATRIX_HASH =
	"eb382dcff9243e410ceb6d7bbfe79a942d3845d3adba1f3732439bdb39f45772";

test.describe("DP07 — the connection-mode matrix (resolveConnection)", () => {
	test("the matrix renders on /environments: prod by default, modes per the closed rules, Go-pinned address", async ({
		page,
	}) => {
		await page.goto("/environments");
		await expect(page.getByTestId("connections-card")).toBeVisible();
		// prod is the default picked environment.
		await expect(page.getByTestId("matrix-env-prod")).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		await expect(page.getByTestId("connections-table")).toHaveAttribute(
			"data-environment",
			"prod",
		);
		// the closed rules in prod: public server = traefik_url, internal
		// datastore = docker_internal, cloud connector = managed_url.
		await expect(page.getByTestId("mode-server")).toHaveText("traefik_url");
		await expect(page.getByTestId("mode-db")).toHaveText("docker_internal");
		await expect(page.getByTestId("mode-crm")).toHaveText("managed_url");
		// the matrix address — Go-authoritative, byte-for-byte.
		await expect(page.getByTestId("matrix-hash")).toHaveText(GO_MATRIX_HASH);
	});

	test("switching the environment recalculates the modes on screen", async ({
		page,
	}) => {
		await page.goto("/environments");
		// local: no reverse proxy — the server itself becomes docker_internal.
		await page.getByTestId("matrix-env-local").click();
		await expect(page.getByTestId("connections-table")).toHaveAttribute(
			"data-environment",
			"local",
		);
		await expect(page.getByTestId("mode-server")).toHaveText("docker_internal");
		// future_cloud: the managed environment — EVERYTHING managed_url.
		await page.getByTestId("matrix-env-future_cloud").click();
		await expect(page.getByTestId("mode-server")).toHaveText("managed_url");
		await expect(page.getByTestId("mode-db")).toHaveText("managed_url");
		await expect(page.getByTestId("mode-cache")).toHaveText("managed_url");
		// back to prod: the modes recompute again.
		await page.getByTestId("matrix-env-prod").click();
		await expect(page.getByTestId("mode-server")).toHaveText("traefik_url");
		await expect(page.getByTestId("mode-db")).toHaveText("docker_internal");
	});

	test("no hardcoded endpoint: prod wires env-var references only — never localhost, never an IP", async ({
		page,
	}) => {
		await page.goto("/environments");
		// prod internal service: the /data/dockers container-name convention.
		await expect(page.getByTestId("conn-row-db")).toContainText(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${VAR} reference assertion.
			"${APP_NAME}-db:5432",
		);
		// the cloud connector resolves a secret-store reference (S91), never a value.
		await expect(page.getByTestId("conn-row-crm")).toContainText(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${VAR} reference assertion.
			"${CRM_MANAGED_URL}",
		);
		const table = page.getByTestId("connections-table");
		await expect(table).not.toContainText("localhost");
		await expect(table).not.toContainText("sagedesk");
	});

	test("the measure is deterministic: measure TWICE → the same Go-pinned address", async ({
		page,
	}) => {
		await page.goto("/environments");
		await page.getByTestId("matrix-measure").click();
		await expect(page.getByTestId("matrix-same")).toBeVisible();
		await expect(page.getByTestId("matrix-hash")).toHaveText(GO_MATRIX_HASH);
		const first = await page.getByTestId("matrix-hash").textContent();
		await page.getByTestId("matrix-measure").click();
		await expect(page.getByTestId("matrix-same")).toBeVisible();
		await expect(page.getByTestId("matrix-hash")).toHaveText(first ?? "");
		await expect(page.getByTestId("matrix-hash")).toHaveText(GO_MATRIX_HASH);
	});
});
