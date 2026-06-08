import { expect, test } from "@playwright/test";

/**
 * S82 Playwright e2e — the « Bac à sable par projet » Workbench panel.
 * mirror record: reflects=S82-workspace, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /workspace route is action-capable (ui-completeness law, CLAUDE.md §7): the PROVISION,
 * ACCESS-CHECK (cross-project isolation) and RESOURCE-CHECK (anti noisy-neighbor) controls are
 * reachable AND executable from the screen, bound to Server Actions running the REAL pure engine
 * (lib/workspace, the byte-twin of the Go package). The done-criteria of S82: project A cannot read
 * project B's tree nor the truth-store (SANDBOX_ESCAPE), a hello-world builds green inside, and a
 * runaway is killed by the resource limit (SANDBOX_RESOURCE_LIMIT).
 *
 * THE WALL (CLAUDE.md §2): every action is a dry-run value computation — the truth-store is OUTSIDE
 * every workspace root; the verdicts are code, never an LLM.
 */

test.describe("S82 — per-project sandbox (workspace)", () => {
	test("the route renders the provision + access + resource controls", async ({
		page,
	}) => {
		await page.goto("/workspace");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Per-project sandbox|Bac à sable par projet/i,
			}),
		).toBeVisible();
		await expect(page.getByTestId("provision-submit")).toBeVisible();
		await expect(page.getByTestId("access-submit")).toBeVisible();
		await expect(page.getByTestId("resource-submit")).toBeVisible();
	});

	test("provisioning yields the byte-identical workspace id + a green hello-world — the done-criterion", async ({
		page,
	}) => {
		await page.goto("/workspace");
		await page.getByTestId("provision-project").fill("proj-a");
		await page.getByTestId("provision-submit").click();
		const result = page.getByTestId("provision-result");
		await expect(result).toBeVisible();
		// the workspace id is byte-identical to the Go value (determinism, content-addressed).
		await expect(page.getByTestId("provision-id")).toHaveText(
			"9143e3c8bae17b5823a24ac63e4c3175073a16665f8128793985adc909814756",
		);
		await expect(page.getByTestId("provision-root")).toHaveText(
			".aidos/workspaces/proj-a",
		);
		// the ADR 0001 zones are realized under the isolated root.
		await expect(page.getByTestId("provision-zones")).toContainText("ideas");
		await expect(page.getByTestId("provision-zones")).toContainText(
			"kernel/spec",
		);
		// a confined hello-world builds green inside.
		await expect(page.getByTestId("provision-hello")).not.toHaveText("—");
	});

	test("project A cannot read project B's tree (SANDBOX_ESCAPE)", async ({
		page,
	}) => {
		await page.goto("/workspace");
		await page.getByTestId("access-project").fill("proj-a");
		await page
			.getByTestId("access-target")
			.fill(".aidos/workspaces/proj-b/src/secret.go");
		await page.getByTestId("access-submit").click();
		await expect(page.getByTestId("access-blocked")).toHaveText(
			"SANDBOX_ESCAPE",
		);
	});

	test("a runaway is killed by the resource limit (SANDBOX_RESOURCE_LIMIT)", async ({
		page,
	}) => {
		await page.goto("/workspace");
		await page.getByTestId("resource-project").fill("proj-a");
		await page.getByTestId("resource-cpu").fill("999999");
		await page.getByTestId("resource-submit").click();
		const killed = page.getByTestId("resource-killed");
		await expect(killed).toBeVisible();
		await expect(killed).toContainText("SANDBOX_RESOURCE_LIMIT");
	});
});
