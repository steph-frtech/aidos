import { expect, test } from "@playwright/test";

/**
 * S17 Playwright e2e — the versioned-links Workbench panel (/link-graph).
 * mirror record: reflects=S17-versioned-links, test_kind=e2e,
 *               cert_language=gherkin, liveness=alive, authority=above
 *
 * Scenario: The Workbench renders the six-kind link graph with per-edge resolved status (KRD §41–§42)
 *   Given the Workbench is running
 *   When I navigate to /link-graph
 *   Then the six link kinds appear as edges (projects_to, derives_from, contracts_with, triggers, binds, mirrors)
 *   And the head-pinned binds edge checkout-submit → createOrder@v3 is shown GREEN
 *   And when I toggle to the absent-target heads, the same edge is shown RED (absent) — the done criterion
 *   And the screen carries a tutorial and a worked example
 */

const KINDS = [
	"projects_to",
	"derives_from",
	"contracts_with",
	"triggers",
	"binds",
	"mirrors",
];

test.describe("S17 — the versioned-links panel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/link-graph");
		await expect(page.getByTestId("link-edge").first()).toBeVisible({
			timeout: 5000,
		});
	});

	test("the six KRD §41 link kinds appear as edges", async ({ page }) => {
		for (const kind of KINDS) {
			await expect(
				page.getByTestId("link-edge").filter({
					has: page.getByTestId("edge-kind").filter({ hasText: kind }),
				}),
			).toHaveCount(1);
		}
	});

	test("the head-pinned binds edge is shown GREEN", async ({ page }) => {
		const edge = page
			.getByTestId("link-edge")
			.filter({ hasText: "createOrder@v3" })
			.filter({ hasText: "binds" });
		await expect(edge).toHaveAttribute("data-status", "green");
		await expect(edge.getByTestId("edge-status")).toContainText("GREEN");
	});

	test("a link to an absent version is shown RED (absent) — the done criterion", async ({
		page,
	}) => {
		await page.getByTestId("heads-absent").click();
		const edge = page
			.getByTestId("link-edge")
			.filter({ hasText: "createOrder@v3" })
			.filter({ hasText: "binds" });
		await expect(edge).toHaveAttribute("data-status", "absent");
		await expect(edge.getByTestId("edge-status")).toContainText("ABSENT");
	});

	test("the screen carries a tutorial and a worked example", async ({
		page,
	}) => {
		await expect(page.getByTestId("tutorial")).toBeVisible();
		await expect(page.getByTestId("example")).toBeVisible();
	});
});
