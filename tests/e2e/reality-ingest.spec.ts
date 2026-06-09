import { expect, test } from "@playwright/test";

/**
 * S106 Playwright e2e — the « boucle de réalité » Workbench panel (EPIC 12 / E12).
 * mirror record: reflects=S106-reality-ingest, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /reality-ingest route is action-capable (ui-completeness law, CLAUDE.md §7): a
 * control is reachable AND executable from the screen, bound to a Server Action running the REAL
 * pure ingestion pipeline (lib/reality-ingest, the TS twin of back/runtime/realityingest). The
 * S106 done-criterion, reached from the screen:
 *
 *   « une divergence télémétrie d'un miroir produit un RealityMirror project-scopé avec
 *     provenance=incident → une idée draft dont le texte est une projection template
 *     déterministe ; la réalité n'écrit JAMAIS de vérité directement. »
 *
 * THE WALL (CLAUDE.md §2): the screen only RENDERS values — reality writes no truth (wroteKernel
 * is false; the direct Reality→Kernel edge is refused). Detection AND rédaction are pure code.
 */

test.describe("S106 — reality loop (telemetry → RealityMirror → draft idea)", () => {
	test("the route renders the ingestion control", async ({ page }) => {
		await page.goto("/reality-ingest");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Boucle de réalité|Reality loop/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("ingest-divergence")).toBeVisible();
		await expect(page.getByTestId("healthy-toggle")).toBeVisible();
	});

	test("the done-criterion: a 30% telemetry divergence → a project-scoped RealityMirror with provenance=incident", async ({
		page,
	}) => {
		await page.goto("/reality-ingest");
		await page.getByTestId("ingest-divergence").click();

		await expect(page.getByTestId("ingest-result")).toBeVisible();
		// project-scoped.
		await expect(page.getByTestId("project-scope")).toHaveText("shop-42");
		// provenance = incident (the S106 done-criterion).
		await expect(page.getByTestId("provenance")).toHaveText("incident");
		// the divergence record names the operation, the kind, the observed gap and the mirror.
		await expect(page.getByTestId("divergence-operation")).toHaveText(
			"createOrder",
		);
		await expect(page.getByTestId("divergence-kind")).toHaveText("error_rate");
		await expect(page.getByTestId("divergence-observed")).toHaveText("30.0%");
		await expect(page.getByTestId("divergence-mirror")).toHaveText(
			"createOrder-succeeds",
		);
	});

	test("the idea text is a deterministic TEMPLATE projection (names the gap verbatim)", async ({
		page,
	}) => {
		await page.goto("/reality-ingest");
		await page.getByTestId("ingest-divergence").click();

		const ideaText = page.getByTestId("idea-text");
		await expect(ideaText).toBeVisible();
		// the template names the mirror, the project, the operation, the observed rate and the traffic.
		await expect(ideaText).toContainText("createOrder-succeeds");
		await expect(ideaText).toContainText("shop-42");
		await expect(ideaText).toContainText("30.0%");
		await expect(ideaText).toContainText("1000 calls");
		await expect(ideaText).toContainText(/incomplete by omission/);
		// THE WALL: reality writes no truth.
		await expect(page.getByTestId("wall-status")).toHaveText(
			/n'écrit pas le kernel|writes no kernel/,
		);
	});

	test("a healthy report within the mirror's promise produces NO idea (reality never invents a truth)", async ({
		page,
	}) => {
		await page.goto("/reality-ingest");
		await page.getByTestId("healthy-toggle").check();
		await page.getByTestId("ingest-divergence").click();

		// No divergence → the within-promise verdict, no draft idea.
		await expect(page.getByTestId("no-divergence")).toBeVisible();
		await expect(page.getByTestId("ingest-result")).toHaveCount(0);
	});
});
