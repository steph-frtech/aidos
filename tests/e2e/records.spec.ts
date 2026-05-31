import { expect, test } from "@playwright/test";

/**
 * S02 Playwright e2e — KRDCore records Workbench panel (/records).
 * mirror record: reflects=S02-krdcore-records, test_kind=journey,
 *               cert_language=gherkin, liveness=live
 *
 * The panel projects the seven content-addressed, append-only record schemas
 * (ideas.idea, kernel.truth/layer/link, mirrors.mirror, changesets.changeset,
 * dag.phase) — READ ONLY (the wall, CLAUDE.md §2). Whether Postgres is live or
 * the demo fixture is used, the seven record types render with a count and a
 * waterline badge, and a selected type shows its head rows with a JSONB preview.
 *
 * The governed write path — propose → ChangeSet → human approval — is surfaced
 * as a control that is PRESENT but disabled and marked « à venir (S20) », because
 * the changeset engine (S20) / idea-intake (S27) are not built yet. The screen
 * NEVER writes a record. These tests assert the read projection AND the disabled,
 * « à venir » propose control (the ui-completeness law under the wall).
 */

const KINDS = [
	"idea",
	"truth",
	"mirror",
	"layer",
	"link",
	"changeset",
	"phase",
] as const;

test.describe("S02 — KRDCore records (read projection, above the wall)", () => {
	test("the seven record types render", async ({ page }) => {
		await page.goto("/records");
		await expect(page.getByTestId("record-types")).toBeVisible();
		for (const kind of KINDS) {
			await expect(page.getByTestId(`record-type-${kind}`)).toBeVisible();
			await expect(page.getByTestId(`record-count-${kind}`)).toBeVisible();
			await expect(page.getByTestId(`record-authority-${kind}`)).toBeVisible();
		}
	});

	test("a source badge reports live or demo", async ({ page }) => {
		await page.goto("/records");
		const badge = page.getByTestId("records-source");
		await expect(badge).toBeVisible();
		const source = await badge.getAttribute("data-source");
		expect(source === "live" || source === "demo").toBeTruthy();
	});

	test("selecting a type shows its head rows with a JSONB body preview", async ({
		page,
	}) => {
		await page.goto("/records");
		await page.getByTestId("record-type-truth").click();
		await expect(page.getByTestId("record-detail-truth")).toBeVisible();
		// Either a head row with a body preview is shown, or the empty-table note.
		const rows = page.getByTestId("record-rows-truth");
		const empty = page.getByTestId("record-empty-truth");
		const hasRows = await rows.count();
		if (hasRows > 0) {
			await expect(page.getByTestId("record-body-truth-0")).toBeVisible();
		} else {
			await expect(empty).toBeVisible();
		}
	});

	test("kernel.truth carries the above-the-wall badge", async ({ page }) => {
		await page.goto("/records");
		await expect(page.getByTestId("record-authority-truth")).toContainText(
			/au-dessus du mur|above the wall/,
		);
		// ideas.idea is the one below-the-wall candidate kind.
		await expect(page.getByTestId("record-authority-idea")).toContainText(
			/sous le mur|below the wall/,
		);
	});
});

test.describe("S02 — governed write path (propose → ChangeSet, à venir S20)", () => {
	test("the propose control is present, disabled, and marked « à venir »", async ({
		page,
	}) => {
		await page.goto("/records");
		// The default-selected type (idea) shows its propose control.
		const propose = page.getByTestId("propose-idea");
		await expect(propose).toBeVisible();
		await expect(propose).toHaveAttribute("data-available", "false");

		const submit = page.getByTestId("propose-submit-idea");
		await expect(submit).toBeVisible();
		await expect(submit).toBeDisabled();

		await expect(page.getByTestId("propose-soon-idea")).toContainText(
			/à venir|coming/,
		);
	});

	test("the truth type's propose control is also gated (the wall holds)", async ({
		page,
	}) => {
		await page.goto("/records");
		await page.getByTestId("record-type-truth").click();
		const submit = page.getByTestId("propose-submit-truth");
		await expect(submit).toBeVisible();
		await expect(submit).toBeDisabled();
		await expect(page.getByTestId("propose-soon-truth")).toContainText(
			/à venir|coming/,
		);
	});

	test("the « why disabled » note explains the S20 forward-dependency", async ({
		page,
	}) => {
		await page.goto("/records");
		await page.getByTestId("propose-why-idea").click();
		const note = page.getByTestId("propose-note-idea");
		await expect(note).toBeVisible();
		await expect(note).toContainText(/S20/);
	});
});
