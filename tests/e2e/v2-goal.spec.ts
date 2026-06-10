import { expect, test } from "@playwright/test";

/**
 * WB2-11 Playwright e2e — l'écran /v2/goal : la transition idée → ÉCRIRE LE MIROIR → /goal → GEL
 * (KRD §116) comme wizard XState. Montre le MUR FRANCHI (HasMirror false→true, version gelée) ;
 * l'écran PROPOSE → un ChangeSet DRAFT ; une écriture-vérité directe est REFUSÉE (le mur, §2).
 * mirror record: reflects=WB2-11-goal, test_kind=e2e, cert_language=playwright, liveness=live,
 * authority=above (le geste /goal franchit le mur, PROPOSE — le mur intact).
 *
 * Les critères de done WB2-11, atteints depuis l'écran (action-capable, ui-completeness) :
 *   - au /goal l'idée DESCEND à sa coordonnée + reçoit une VERSION gelée (ChangeSet DRAFT) ;
 *   - le MUR franchi : HasMirror false → true ;
 *   - l'écriture-vérité DIRECTE est REFUSÉE (un BlockReason) ;
 *   - LE MUR : aucune requête d'écriture (POST/PUT/PATCH/DELETE) — l'écran PROPOSE, n'écrit pas ;
 *   - DÉTERMINISTE : même parcours → même version gelée au rechargement.
 */

test.describe("WB2-11 /v2/goal — idée → miroir → /goal → gel (wizard XState)", () => {
	test("au /goal l'idée descend à sa coordonnée + reçoit une version ; jamais une écriture directe", async ({
		page,
	}) => {
		const writes: string[] = [];
		page.on("request", (req) => {
			const m = req.method();
			if (["POST", "PUT", "PATCH", "DELETE"].includes(m)) {
				writes.push(`${m} ${req.url()}`);
			}
		});

		await page.goto("/v2/goal");
		await expect(page.getByTestId("v2-goal-title")).toBeVisible();
		await expect(page.getByTestId("v2-goal-wall-note")).toBeVisible();

		// STEPPER : les trois stades, l'étape active = idea.
		const stepper = page.getByTestId("v2-goal-stepper");
		await expect(stepper).toHaveAttribute("data-state", "idea");

		// L'IDÉE : hasMirror=false (PROPOSE), une coordonnée affichée.
		await expect(page.getByTestId("v2-goal-idea-has-mirror")).toContainText(
			"false",
		);
		await expect(page.getByTestId("v2-goal-idea-coordinate")).toContainText(
			"operation",
		);

		// LE MUR : tenter une écriture-vérité DIRECTE → REFUSÉE (BlockReason), aucune transition.
		await page.getByTestId("v2-goal-direct-write").click();
		await expect(page.getByTestId("v2-goal-block")).toBeVisible();
		await expect(page.getByTestId("v2-goal-block")).toContainText(
			"WALL_DIRECT_TRUTH_WRITE_FORBIDDEN",
		);
		await expect(stepper).toHaveAttribute("data-state", "idea"); // resté

		// 1 · ÉCRIRE LE MIROIR (le contexte porte déjà un texte de la bonne forme fixture_n2).
		await page.getByTestId("v2-goal-write-mirror").click();
		await expect(stepper).toHaveAttribute("data-state", "mirror_written");
		// le mur franchi : HasMirror false → true.
		await expect(page.getByTestId("v2-goal-mirror-flipped")).toContainText(
			"false → true",
		);

		// 2 · OUVRIR LE /goal → l'idée descend à sa coordonnée + reçoit une version gelée.
		await page.getByTestId("v2-goal-open-goal").click();
		await expect(stepper).toHaveAttribute("data-state", "frozen");

		const frozen = page.getByTestId("v2-goal-frozen");
		await expect(frozen).toBeVisible();
		// la version gelée (content-adressée, préfixe k:).
		await expect(page.getByTestId("v2-goal-version")).toContainText("k:");
		// le ChangeSet DRAFT (PROPOSE, jamais appliqué).
		await expect(page.getByTestId("v2-goal-changeset")).toContainText("DRAFT");
		await expect(page.getByTestId("v2-goal-changeset")).toContainText("cs:");
		// l'idée descendue à sa coordonnée.
		await expect(page.getByTestId("v2-goal-frozen-coordinate")).toContainText(
			"operation",
		);
		// le mur franchi + le mur tenu : hasMirror=true, wroteKernel=false.
		await expect(page.getByTestId("v2-goal-has-mirror")).toContainText("true");
		await expect(page.getByTestId("v2-goal-wrote-kernel")).toContainText(
			"false",
		);

		// LE MUR : aucune écriture-vérité réseau.
		expect(writes).toEqual([]);
	});

	test("DÉTERMINISTE : même parcours → même version gelée au rechargement", async ({
		page,
	}) => {
		const runJourney = async () => {
			await page.goto("/v2/goal");
			await page.getByTestId("v2-goal-write-mirror").click();
			await page.getByTestId("v2-goal-open-goal").click();
			await expect(page.getByTestId("v2-goal-version")).toBeVisible();
			return await page.getByTestId("v2-goal-version").textContent();
		};

		const v1 = await runJourney();
		const v2 = await runJourney();
		expect(v1).toBe(v2);
		expect(v1).not.toBeNull();
		expect(v1).toContain("k:");
	});
});
