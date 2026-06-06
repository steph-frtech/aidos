import { expect, test } from "@playwright/test";

/**
 * EL19 Playwright e2e — the /compound-besoin level-by-level FORCED wizard tunnel + the
 * /compound-besoin/doc requirements-doc generator.
 * mirror record: reflects=front/web/app/compound-besoin/CompoundBesoinWizard.tsx
 *               + front/web/app/compound-besoin/doc/RequirementsDocPanel.tsx
 *               + lib/besoin-requirements-doc.ts (EmitRequirementsDoc, the deterministic projector
 *               composing emitIdeas EL16 + redBacklog EL17 + levelMirrorForm EL10 + levelToProposes
 *               EL05), test_kind=e2e, cert_language=gherkin, liveness=alive, authority=above
 *
 * The screen is action-capable (ui-completeness, CLAUDE.md §7): every op has an executable control —
 * "Compléter ce niveau" (recompute the EL07 gate), "Rendre le scénario vide" (anti-gaming),
 * "Projeter vers idea-intake" (EmitRequirementsDoc → the real draft Ideas surface), "Ouvrir comme
 * goals" (REFUSED on an incomplete graph, EL09), "Générer le document" (byte-identical doc).
 *
 * ABOVE THE WALL: the screen PROPOSES Ideas, never writes the Kernel (HasMirror false).
 *
 * Scenario A: the journey step is LOCKED until product is enough (the gate made visible).
 * Scenario B: an EMPTY scenario (parses but vacant) does NOT unlock the next step (anti-gaming).
 * Scenario C: completing product unlocks the journey step.
 * Scenario D: "Projeter" surfaces the real Ideas live (topological order, NoEmit excluded).
 * Scenario E: "Ouvrir comme goals" is refused on an incomplete graph (EL09 gate).
 * Scenario F: the requirements doc is byte-identical for the same graph (stable graph_hash).
 */

test.describe("EL19 — /compound-besoin wizard tunnel", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin");
		await expect(page.getByTestId("compound-besoin-wizard")).toBeVisible({
			timeout: 10000,
		});
	});

	test("the journey step is LOCKED until product is enough (the gate made visible)", async ({
		page,
	}) => {
		const journey = page.getByTestId("wizard-step-journey");
		await expect(journey).toHaveAttribute("data-unlocked", "false");
		await expect(page.getByTestId("wizard-locked-journey")).toBeVisible();
		// product is the first rung — always unlocked.
		await expect(page.getByTestId("wizard-step-product")).toHaveAttribute(
			"data-unlocked",
			"true",
		);
	});

	test("an EMPTY scenario (parses but vacant) does NOT unlock the next step (anti-gaming)", async ({
		page,
	}) => {
		await page.getByTestId("wizard-vacant-product").click();
		// product stays not_enough → the journey step stays locked.
		await expect(page.getByTestId("wizard-step-product")).toHaveAttribute(
			"data-enough",
			"false",
		);
		await expect(page.getByTestId("wizard-step-journey")).toHaveAttribute(
			"data-unlocked",
			"false",
		);
	});

	test("completing product unlocks the journey step", async ({ page }) => {
		await page.getByTestId("wizard-complete-product").click();
		await expect(page.getByTestId("wizard-step-product")).toHaveAttribute(
			"data-enough",
			"true",
		);
		await expect(page.getByTestId("wizard-step-journey")).toHaveAttribute(
			"data-unlocked",
			"true",
		);
	});

	test("the ShrinkOptionSpace compounding integer is shown for product", async ({
		page,
	}) => {
		const shrink = page.getByTestId("wizard-shrink-product");
		await expect(shrink).toBeVisible();
		// a completed product selects ⊂ the declared OptionSpace → a strictly positive shrink.
		const text = await shrink.innerText();
		expect(Number(text)).toBeGreaterThan(0);
	});

	test('"Projeter" surfaces the real Ideas live (NoEmit-excluded count)', async ({
		page,
	}) => {
		// complete product + entity → 2 mapping rungs. (journey/view stay empty → NoEmit anchors.)
		await page.getByTestId("wizard-complete-product").click();
		await page.getByTestId("wizard-project").click();
		const ideas = page.getByTestId("wizard-ideas");
		await expect(ideas).toBeVisible();
		// only the resolved mapping rungs emit (product here) — the count excludes NoEmit rungs.
		await expect(page.getByTestId("wizard-idea-count")).toContainText("1");
		await expect(page.getByTestId("wizard-idea-product")).toBeVisible();
		// the link to the live /ideas board.
		await expect(page.getByTestId("wizard-ideas-link")).toBeVisible();
	});

	test('"Ouvrir comme goals" is REFUSED on an incomplete graph (EL09 gate)', async ({
		page,
	}) => {
		await page.getByTestId("wizard-complete-product").click();
		await page.getByTestId("wizard-open-goals").click();
		const verdict = page.getByTestId("wizard-goals-verdict");
		await expect(verdict).toBeVisible();
		await expect(verdict).toHaveAttribute("data-ok", "false");
	});

	test("the screen carries the wall note + the reuse OpenQuestion (never shown as acquired)", async ({
		page,
	}) => {
		await expect(page.getByTestId("wizard-wall-note")).toBeVisible();
		await expect(page.getByTestId("wizard-reuse")).toBeVisible();
	});
});

test.describe("EL19 — /compound-besoin/doc requirements doc", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/compound-besoin/doc");
		await expect(page.getByTestId("requirements-doc-panel")).toBeVisible({
			timeout: 10000,
		});
	});

	test("generates the deterministic doc with a stable graph_hash and a NoEmit-excluded Idea count", async ({
		page,
	}) => {
		await page.getByTestId("doc-generate").click();
		await expect(page.getByTestId("doc-output")).toBeVisible();
		await expect(page.getByTestId("doc-graph-hash")).toHaveText(
			"el19demographstable",
		);
		// product + entity map; journey + view are NoEmit → 2 Ideas.
		await expect(page.getByTestId("doc-idea-count")).toHaveText("2");
		await expect(page.getByTestId("doc-idea-product")).toBeVisible();
		await expect(page.getByTestId("doc-idea-entity")).toBeVisible();
	});

	test("the doc is byte-identical when re-generated for the same graph", async ({
		page,
	}) => {
		await page.getByTestId("doc-generate").click();
		const first = await page.getByTestId("doc-markdown").innerText();
		await page.getByTestId("doc-reset").click();
		await expect(page.getByTestId("doc-output")).toHaveCount(0);
		await page.getByTestId("doc-generate").click();
		const second = await page.getByTestId("doc-markdown").innerText();
		expect(second).toBe(first);
	});
});
