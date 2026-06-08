import { expect, test } from "@playwright/test";

/**
 * S67 Playwright e2e — « attacher un behavior à la capture » Workbench panel.
 * mirror record: reflects=S67-behavior-capture, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * Proves the /behavior-capture route is action-capable (ui-completeness law, CLAUDE.md §7): the
 * attach control is reachable AND executable from the screen, bound to a Server Action that runs
 * the REAL engine (the ONE authoritative expand of S76, never a second implementation).
 *   - Attach: pick a behavior from the surfaced library + give the captured idea + entity → the
 *     dry-run expansion (byte-identical to S76) + a DRAFT ChangeSet PROPOSAL.
 *   - Refusal: a no-idea attach is refused with a traced message.
 *
 * THE WALL (CLAUDE.md §2): the screen PROPOSES a ChangeSet, it never writes the Kernel — the DRAFT
 * badge stays DRAFT (a proposal); the expansion is computed (the byte-identical content address).
 */

test.describe("S67 — Attach a behavior at capture", () => {
	test("the route renders the panel with the surfaced library + the attach control", async ({
		page,
	}) => {
		await page.goto("/behavior-capture");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Behavior à la capture|Behavior at capture/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("library")).toBeVisible();
		// The surfaced library is the S76 catalogue (ownable, soft-deletable, auditable).
		await expect(page.getByTestId("library-behavior").first()).toBeVisible();
		await expect(page.getByTestId("behavior-select")).toBeVisible();
	});

	test("attaching ownable to Order proposes a DRAFT ChangeSet with the owner-scoping expansion", async ({
		page,
	}) => {
		await page.goto("/behavior-capture");
		await page.getByTestId("idea-ref").fill("idea-capture-001");
		await page.getByTestId("entity").fill("Order");
		await page.getByTestId("behavior-select").selectOption("ownable");
		await page.getByTestId("attach-submit").click();

		// The action ran: the DRAFT ChangeSet proposal + the byte-identical expansion appear.
		const result = page.getByTestId("attach-result");
		await expect(result).toBeVisible();
		await expect(result).toHaveAttribute("data-ok", "true");
		await expect(page.getByTestId("draft-badge")).toContainText("DRAFT");
		// The byte-identical content address (S76 golden expansionId for ownable on Order).
		await expect(page.getByTestId("expansion-id")).toContainText(
			"5b504145ee692a189516b15366889239114b56cab9f274e3d696a27e327f76e7",
		);
		// The §24.6 owner-scoping pieces are previewed.
		await expect(
			page.getByTestId("piece").filter({ hasText: "owner_id" }),
		).toBeVisible();
		await expect(
			page.getByTestId("piece").filter({ hasText: "owner-scoping" }),
		).toBeVisible();
		await expect(page.getByTestId("piece-count")).not.toBeEmpty();
	});

	test("attaching soft-deletable proposes its own (different) DRAFT expansion", async ({
		page,
	}) => {
		await page.goto("/behavior-capture");
		await page.getByTestId("idea-ref").fill("idea-capture-002");
		// Entity "Order" so the content address matches the Go golden for soft-deletable.
		await page.getByTestId("entity").fill("Order");
		await page.getByTestId("behavior-select").selectOption("soft-deletable");
		await page.getByTestId("attach-submit").click();
		await expect(page.getByTestId("attach-result")).toHaveAttribute(
			"data-ok",
			"true",
		);
		await expect(
			page.getByTestId("piece").filter({ hasText: "deleted_at" }),
		).toBeVisible();
		await expect(page.getByTestId("expansion-id")).toContainText(
			"b398af5c1f8d5738684ab2cc71cb7700842b1cd2889e34a24c36e76927f8e064",
		);
	});

	test("an attach with no captured idea is refused (the screen never proposes nothing)", async ({
		page,
	}) => {
		await page.goto("/behavior-capture");
		await page.getByTestId("idea-ref").fill("");
		await page.getByTestId("entity").fill("Order");
		await page.getByTestId("attach-submit").click();
		await expect(page.getByTestId("attach-result")).toHaveAttribute(
			"data-ok",
			"false",
		);
	});

	test("the attach is deterministic — re-running yields the SAME content address", async ({
		page,
	}) => {
		await page.goto("/behavior-capture");
		await page.getByTestId("idea-ref").fill("idea-capture-001");
		await page.getByTestId("entity").fill("Order");
		await page.getByTestId("behavior-select").selectOption("ownable");
		await page.getByTestId("attach-submit").click();
		await expect(page.getByTestId("expansion-id")).toContainText(
			"5b504145ee692a189516b15366889239114b56cab9f274e3d696a27e327f76e7",
		);
		// Re-run: the dry-run is a pure function — byte-identical content address.
		await page.getByTestId("attach-submit").click();
		await expect(page.getByTestId("expansion-id")).toContainText(
			"5b504145ee692a189516b15366889239114b56cab9f274e3d696a27e327f76e7",
		);
	});
});
