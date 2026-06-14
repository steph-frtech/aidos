import { expect, test } from "@playwright/test";

/**
 * DP31 Playwright e2e — the « Sauvegardes (backups déterministes) » panel of /app-ops.
 * mirror record: reflects=DP31-backup, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /app-ops route renders the DP31 DATA-BACKUP section and that the gesture
 * (ui-completeness, CLAUDE.md §7) EXECUTES from the screen — not a mere display:
 *
 *  (1) PLANIFIER un backup (horloge injectée côté twin) ⇒ un artefact RESTAURABLE
 *      apparaît (data-testid="backup-artifact", content-addressed, scopé project_id) et
 *      la ligne du backup arrive dans la liste append-only ;
 *  (2) RESTAURER ⇒ round-trip SANS PERTE (data-testid="restore-done" porte
 *      data-roundtrip="true" — l'état restauré ÉGALE l'état sauvegardé) ;
 *  (3) l'indicateur « aucun secret en clair » est présent et vert (S91 ScanEmission,
 *      data-testid="backup-no-secret" data-ok="true") ;
 *  (4) l'isolation PAR PROJET est affichée (data-testid="backup-project-isolated" —
 *      un backup de A est inaccessible depuis B, scope project_id).
 *
 * THE SOURCE est le TWIN PUR de RealizeBackup/RestoreBackup (lib/backup), horloge
 * INJECTÉE côté twin — jamais time.Now, jamais un LLM. Reproductibilité : même état +
 * même horloge ⇒ même artefact (le content-address ne bouge pas entre deux planifs).
 *
 * THE WALL (CLAUDE.md §2) : below-the-line. Le backup protège la DONNÉE (distinct du
 * rollback-par-phase DP28 qui ré-émet le CODE) ; il n'écrit AUCUNE vérité (kernel /
 * mirrors / fitness). Une restauration est une décision ENREGISTRÉE (append-only, §9).
 *
 * Anti-flake : chaque attente s'ancre sur un CHANGEMENT D'ÉTAT (un testid qui apparaît
 * après l'action), jamais sur un délai. Le twin est synchrone et déterministe.
 */

test.describe("DP31 — les sauvegardes déterministes (route additive /app-ops)", () => {
	test.setTimeout(60_000);

	test("la route rend la section backups + les indicateurs no-secret et isolation projet", async ({
		page,
	}) => {
		await page.goto("/app-ops");

		await expect(
			page.getByRole("heading", {
				level: 1,
				name: /Opérations de l'app|App operations/,
			}),
		).toBeVisible();

		// la section « Sauvegardes » est présente.
		const backups = page.getByTestId("app-ops-backups");
		await expect(backups).toBeVisible();

		// l'indicateur « aucun secret en clair » (S91 ScanEmission) est vert.
		const noSecret = page.getByTestId("backup-no-secret");
		await expect(noSecret).toBeVisible();
		await expect(noSecret).toHaveAttribute("data-ok", "true");

		// l'indicateur « isolation par projet » est présent (scope project_id).
		await expect(page.getByTestId("backup-project-isolated")).toBeVisible();
	});

	test("planifier un backup ⇒ un artefact restaurable apparaît et entre dans la liste append-only", async ({
		page,
	}) => {
		await page.goto("/app-ops");

		const list = page.getByTestId("backup-list");
		await expect(list).toBeVisible();
		const before = await list.getByTestId("backup-row").count();

		// le geste : PLANIFIER un backup (horloge injectée côté twin).
		await page.getByTestId("backup-schedule").click();

		// un artefact RESTAURABLE apparaît, content-addressed, scopé project_id.
		const artifact = page.getByTestId("backup-artifact");
		await expect(artifact).toBeVisible();
		await expect(artifact).toHaveAttribute("data-id", /.+/);
		await expect(artifact).toHaveAttribute("data-project", /.+/);

		// la liste append-only a grandi d'exactement une ligne, portant le projet.
		await expect
			.poll(() => list.getByTestId("backup-row").count())
			.toBe(before + 1);
		const newRow = list.getByTestId("backup-row").first();
		await expect(newRow).toHaveAttribute("data-project", /.+/);
	});

	test("restaurer ⇒ round-trip de la donnée SANS PERTE (backup→restore ⇒ même donnée)", async ({
		page,
	}) => {
		await page.goto("/app-ops");

		// planifier d'abord pour avoir un artefact à restaurer.
		await page.getByTestId("backup-schedule").click();
		await expect(page.getByTestId("backup-artifact")).toBeVisible();

		// le geste : RESTAURER.
		await page.getByTestId("backup-restore").click();

		// le round-trip est prouvé sans perte (l'état restauré ÉGALE l'état sauvegardé).
		const done = page.getByTestId("restore-done");
		await expect(done).toBeVisible();
		await expect(done).toHaveAttribute("data-roundtrip", "true");
	});
});
