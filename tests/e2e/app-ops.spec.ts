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

/**
 * DP32 Playwright e2e — the « Secrets (par projet) » section of /app-ops (piste DP, EPIC G).
 * mirror record: reflects=DP32-secrets, test_kind=e2e, cert_language=playwright, liveness=live
 *
 * Proves the /app-ops route renders the DP32 SECRET-STORE section (branche S91 sur le
 * provisioning) and that the gesture EXECUTES from the screen (ui-completeness §7):
 *
 *  (1) AJOUTER une RÉFÉRENCE de secret ⇒ une ligne apparaît portant la RÉFÉRENCE `${VAR}`
 *      (data-testid="secret-reference"), JAMAIS la valeur en clair ;
 *  (2) FAIRE TOURNER ⇒ data-testid="secret-rotated" : l'ancienne valeur est invalidée ;
 *  (3) l'indicateur « la valeur n'est jamais affichée » est présent (data-shown="false") ;
 *  (4) l'isolation PAR PROJET est affichée + « .env.example = références seules » est vert.
 *
 * THE SOURCE est le TWIN PUR de MergeBootEnv/RotateSecret/ScanEmission (lib/secret-boot),
 * ordre de merge GRAVÉ — jamais un LLM. THE WALL (§2) : below-the-line ; les secrets vivent
 * dans le store chiffré scopé project_id, JAMAIS le truth-store/git/source émis ; le panneau
 * ne rend QUE la référence `${VAR}` et le fingerprint, jamais la valeur.
 *
 * Anti-flake : chaque attente s'ancre sur un CHANGEMENT D'ÉTAT (un testid/attr qui apparaît
 * après l'action), jamais sur un délai. Le twin est synchrone et déterministe.
 */
test.describe("DP32 — le secret store par projet (section additive /app-ops)", () => {
	test.setTimeout(60_000);

	test("la section secrets rend les indicateurs value-hidden, isolation projet et refs-only", async ({
		page,
	}) => {
		await page.goto("/app-ops");

		// la section « Secrets (par projet) » est présente.
		const secrets = page.getByTestId("app-ops-secrets");
		await expect(secrets).toBeVisible();

		// l'indicateur « la valeur n'est jamais affichée » (data-shown=false).
		const hidden = page.getByTestId("secret-value-hidden");
		await expect(hidden).toBeVisible();
		await expect(hidden).toHaveAttribute("data-shown", "false");

		// l'isolation par projet est présente (scope project_id).
		await expect(page.getByTestId("secret-project-isolated")).toBeVisible();

		// « .env.example = références seules » est vert (S91 ScanEmission, zéro valeur).
		const refsOnly = page.getByTestId("envexample-refs-only");
		await expect(refsOnly).toBeVisible();
		await expect(refsOnly).toHaveAttribute("data-ok", "true");

		// l'ordre de merge gravé est affiché (références → store → overrides).
		await expect(page.getByTestId("secret-merge-order")).toBeVisible();
	});

	test("ajouter une référence ⇒ voir la RÉFÉRENCE dollar-brace (jamais la valeur) dans la liste", async ({
		page,
	}) => {
		await page.goto("/app-ops");

		const list = page.getByTestId("secret-list");
		await expect(list).toBeVisible();
		const before = await list.getByTestId("secret-row").count();

		// le geste : AJOUTER une référence (nom seulement — jamais un champ valeur).
		await page.getByTestId("secret-name-input").fill("APP_SECRET_DATABASE_URL");
		await page.getByTestId("secret-add").click();

		// la liste a grandi d'exactement une ligne, portant le nom + le projet.
		await expect
			.poll(() => list.getByTestId("secret-row").count())
			.toBe(before + 1);
		const row = list.getByTestId("secret-row").first();
		await expect(row).toHaveAttribute("data-name", "APP_SECRET_DATABASE_URL");
		await expect(row).toHaveAttribute("data-project", /.+/);

		// la RÉFÉRENCE dollar-brace est affichée — JAMAIS une valeur en clair.
		const ref = row.getByTestId("secret-reference");
		await expect(ref).toBeVisible();
		// biome-ignore lint/suspicious/noTemplateCurlyInString: the emitted reference text is a literal dollar-brace string, not a template interpolation.
		await expect(ref).toHaveText("${APP_SECRET_DATABASE_URL}");
	});

	test("faire tourner ⇒ l'ancienne valeur est invalidée (badge roté)", async ({
		page,
	}) => {
		await page.goto("/app-ops");

		// ajouter d'abord une référence à faire tourner.
		await page
			.getByTestId("secret-name-input")
			.fill("APP_SECRET_OAUTH_CLIENT_SECRET");
		await page.getByTestId("secret-add").click();
		const row = page
			.getByTestId("secret-list")
			.getByTestId("secret-row")
			.first();
		await expect(row).toHaveAttribute(
			"data-name",
			"APP_SECRET_OAUTH_CLIENT_SECRET",
		);

		// le geste : FAIRE TOURNER.
		await row.getByTestId("secret-rotate").click();

		// le badge « roté » apparaît (l'ancienne valeur est invalidée) — ancre sur l'état.
		const rotated = page.getByTestId("secret-rotated").first();
		await expect(rotated).toBeVisible();
		await expect(rotated).toHaveAttribute(
			"data-name",
			"APP_SECRET_OAUTH_CLIENT_SECRET",
		);
	});
});
