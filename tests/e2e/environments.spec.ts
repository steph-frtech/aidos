import { expect, test } from "@playwright/test";

/**
 * DP06 Playwright e2e — the « Environnements — les 5 cibles et leurs bindings »
 * Workbench panel.
 * mirror record: reflects=DP06-environments, test_kind=e2e,
 * cert_language=playwright, liveness=live
 *
 * Proves the /environments route renders the FIVE closed environments (the S15
 * trio + the DP06 additive local/future_cloud, ADR 0065) with their declared
 * connection bindings — ${VAR} references, never values — pinned to the
 * Go-authoritative projection address, and that the one control (« tester la
 * liaison », ui-completeness CLAUDE.md §7) executes from the screen: the PURE
 * A1 gate refuses prod + doltgres (DOLTGRES_NOT_ALLOWED_IN_PROD,
 * SPEC-stack-2026 verbatim) while doltgres stays opt-in off prod, and the
 * re-measured hash is DETERMINISTIC (twice the same — the reproducibility law).
 *
 * THE WALL (CLAUDE.md §2): the screen reads and measures — it writes no truth
 * (widening the closed set went through idea → mirror → /goal, ADR 0065).
 */

// The Go-authoritative content address of the bindings projection (pinned by
// the rapid mirror back/runtime/envbindings + the vitest twin lib/environments.test.ts).
const GO_BINDINGS_HASH =
	"aaca11ab05812777fbac50c18f6f38f5ad72030a67439f83ed32b002a519a419";

test.describe("DP06 — the five environments and their bindings", () => {
	test("the route renders the 5 closed environments, their bindings and the Go-pinned address", async ({
		page,
	}) => {
		await page.goto("/environments");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Environnements — les 5 cibles et leurs bindings|Environments — the 5 targets and their bindings/,
			}),
		).toBeVisible();

		// the five closed environments, canonical order (S15 prefix + DP06 appended).
		for (const env of ["prod", "staging", "dev", "local", "future_cloud"]) {
			await expect(page.getByTestId(`env-row-${env}`)).toBeVisible();
		}
		// prod imposes Postgres: default postgres, postgres the ONLY allowed datastore.
		await expect(page.getByTestId("env-row-prod")).toContainText("postgres");
		await expect(page.getByTestId("env-row-prod")).not.toContainText(
			"doltgres",
		);
		// dev carries the EXIGENCE-1 convention as an env-var REFERENCE, never a value.
		await expect(page.getByTestId("env-row-dev")).toContainText(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${VAR} reference assertion.
			"https://${APP_NAME}-dev.${DOMAIN}",
		);
		await expect(page.getByTestId("env-row-dev")).not.toContainText("sagedesk");
		// future_cloud is managed-only.
		await expect(page.getByTestId("env-row-future_cloud")).toContainText(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${VAR} reference assertion.
			"${MANAGED_URL}",
		);

		// the projection's content address — Go-authoritative, byte-for-byte.
		await expect(page.getByTestId("bindings-hash")).toHaveText(
			GO_BINDINGS_HASH,
		);
	});

	test("the A1 gate executes: prod + doltgres is REFUSED with its closed code", async ({
		page,
	}) => {
		await page.goto("/environments");
		await page.getByTestId("gate-env").selectOption("prod");
		await page.getByTestId("gate-datastore").selectOption("doltgres");
		await page.getByTestId("gate-test").click();

		await expect(page.getByTestId("gate-refusal")).toBeVisible();
		await expect(page.getByTestId("gate-code")).toHaveText(
			"DOLTGRES_NOT_ALLOWED_IN_PROD",
		);
	});

	test("doltgres stays opt-in off prod: dev + doltgres is admitted with the Go-pinned hash", async ({
		page,
	}) => {
		await page.goto("/environments");
		await page.getByTestId("gate-env").selectOption("dev");
		await page.getByTestId("gate-datastore").selectOption("doltgres");
		await page.getByTestId("gate-test").click();

		await expect(page.getByTestId("gate-verdict")).toBeVisible();
		await expect(page.getByTestId("verdict-url")).toHaveText(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: literal ${VAR} reference assertion.
			"https://${APP_NAME}-dev.${DOMAIN}",
		);
		await expect(page.getByTestId("verdict-hash")).toHaveText(GO_BINDINGS_HASH);
		await expect(page.getByTestId("verdict-same")).toHaveText(
			/oui — byte-identique|yes — byte-identical/,
		);
	});

	test("the measure is DETERMINISTIC: testing twice yields the SAME address both times", async ({
		page,
	}) => {
		await page.goto("/environments");
		await page.getByTestId("gate-env").selectOption("staging");
		await page.getByTestId("gate-datastore").selectOption("postgres");

		await page.getByTestId("gate-test").click();
		await expect(page.getByTestId("verdict-hash")).toHaveText(GO_BINDINGS_HASH);
		const first = await page.getByTestId("verdict-hash").textContent();

		await page.getByTestId("gate-test").click();
		await expect(page.getByTestId("verdict-hash")).toHaveText(GO_BINDINGS_HASH);
		const second = await page.getByTestId("verdict-hash").textContent();

		expect(second).toBe(first);
	});
});
