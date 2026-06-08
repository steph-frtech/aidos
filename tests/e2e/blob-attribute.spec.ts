import { expect, test } from "@playwright/test";

/**
 * S72 Playwright e2e — the « type blob/fichier + stockage objet par projet » Workbench panel.
 * mirror record: reflects=S72-blob-attribute, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /blob-attribute route is action-capable (ui-completeness law, CLAUDE.md §7): the control
 * is reachable AND executable from the screen, bound to a Server Action running the REAL pure engine
 * (lib/blob-attribute, the TS twin of back/kernel/entities/blob). The done-criteria of S72:
 *   - property — a blob round-trips as a content-addressed AST AND emits a deterministic upload handler;
 *   - fixture — a blob of project A is inaccessible from project B (BLOB_CROSS_PROJECT);
 *   - an upload out-of-MIME is refused BLOB_MIME_REFUSED; over-size, BLOB_SIZE_REFUSED (never coerced).
 *
 * THE WALL (CLAUDE.md §2): the screen only VALIDATES, SCOPES and EMITS — it writes no truth; the bytes
 * never enter the truth-store nor git. The logic is a pure function (never an LLM).
 */

test.describe("S72 — Entity AST blob/file node", () => {
	test("the route renders the panel with the upload-validation control", async ({
		page,
	}) => {
		await page.goto("/blob-attribute");
		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Type blob\/fichier de l'Entity AST|Blob\/file type of the Entity AST/,
			}),
		).toBeVisible();
		await expect(page.getByTestId("upload-submit")).toBeVisible();
		await expect(page.getByTestId("upload-mime")).toBeVisible();
		await expect(page.getByTestId("upload-size")).toBeVisible();
		await expect(page.getByTestId("node-name")).toHaveText("avatar");
	});

	test("a conforming upload round-trips + emits a deterministic handler + is project-scoped", async ({
		page,
	}) => {
		await page.goto("/blob-attribute");
		// the form defaults to image/png @ 50000 B (a declared MIME, under the 1 MiB ceiling).
		await page.getByTestId("upload-submit").click();

		const result = page.getByTestId("upload-result");
		await expect(result).toHaveAttribute("data-verdict", "accepted");
		// the content address (round-trip) is shown and non-empty.
		const id = page.getByTestId("blob-id");
		await expect(id).toHaveText(/^[0-9a-f]{64}$/);
		// the project-scoped storage key (a blob of A is namespaced by projA).
		await expect(page.getByTestId("storage-key")).toContainText(
			"projA/User/avatar/",
		);
		// the deterministic emitted handler is shown (proves it emits).
		await expect(page.getByTestId("handler-head")).toContainText(
			"AIDOS-GENERATED",
		);
		// the cross-project probe: A reaches it, B is refused (project scoping).
		await expect(page.getByTestId("cross-a")).toHaveAttribute(
			"data-reachable",
			"true",
		);
		await expect(page.getByTestId("cross-b")).toHaveAttribute(
			"data-reachable",
			"false",
		);
	});

	test("fault-injection — an out-of-MIME upload is refused BLOB_MIME_REFUSED", async ({
		page,
	}) => {
		await page.goto("/blob-attribute");
		await page.getByTestId("upload-mime").fill("application/pdf");
		await page.getByTestId("upload-submit").click();

		const result = page.getByTestId("upload-result");
		await expect(result).toHaveAttribute("data-verdict", "refused");
		await expect(page.getByTestId("block-code")).toHaveAttribute(
			"data-code",
			"BLOB_MIME_REFUSED",
		);
		// the refusal is not a prison: a non-empty fix path is shown.
		await expect(
			page.getByTestId("how-to-fix").locator("li").first(),
		).toBeVisible();
		// honesty: no storage key was minted for a refused upload.
		await expect(page.getByTestId("storage-key")).toHaveCount(0);
	});

	test("fault-injection — an over-size upload is refused BLOB_SIZE_REFUSED", async ({
		page,
	}) => {
		await page.goto("/blob-attribute");
		await page.getByTestId("upload-mime").fill("image/png");
		// 1 MiB + 1 byte — one byte over the declared ceiling.
		await page.getByTestId("upload-size").fill("1048577");
		await page.getByTestId("upload-submit").click();

		const result = page.getByTestId("upload-result");
		await expect(result).toHaveAttribute("data-verdict", "refused");
		await expect(page.getByTestId("block-code")).toHaveAttribute(
			"data-code",
			"BLOB_SIZE_REFUSED",
		);
		await expect(
			page.getByTestId("how-to-fix").locator("li").first(),
		).toBeVisible();
	});
});
