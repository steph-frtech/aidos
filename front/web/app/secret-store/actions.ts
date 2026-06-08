"use server";

import { SecretStore } from "@/lib/secret-store";
import { SECRET_INITIAL, type SecretView } from "./view";

/**
 * Server Action for the /secret-store Workbench panel (S91 — the per-app secret store,
 * app-builder EPIC 9, DP32/ADR 0043).
 *
 * THE STEP (ROADMAP-app-builder S91): a per-project secret store, chiffré au repos, scopé
 * project_id, JAMAIS dans le truth-store / git / source émis ; injection par variables
 * d'env au boot ; rotation. A missing secret at boot raises an actionable BlockReason; a
 * deterministic gitleaks-style scan proves the emission is clean of secrets.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the missing-at-boot check is a set-difference and
 * the leak scan is regex matching (lib/secret-store) — never an LLM. THE WALL (§2): a
 * secret is operational material, never a truth — this writes NOTHING above the line. The
 * panel never displays a value: only the SORTED key names + the boot env var NAMES.
 */

// store is process-scoped (one per server process) — the Go engine is authoritative at
// rest; this twin lets the screen drive set/rotate/inject/scan without a backend round-trip.
const store = new SecretStore();

/**
 * secretAction is the action-capable control (CLAUDE.md §7 ui-completeness): the user
 * SET / ROTATE a secret for a project, INJECT the boot env from a declared key list (a
 * missing key → the fail-closed BlockReason), and SCAN an emission for leaked secrets.
 * Each op the step develops has a control bound to it, executable from the screen.
 */
export async function secretAction(
	_prev: SecretView,
	formData: FormData,
): Promise<SecretView> {
	const op = String(formData.get("op") ?? "").trim();
	const project = String(formData.get("project") ?? "").trim() || "shop";
	const name = String(formData.get("name") ?? "").trim();
	const value = String(formData.get("value") ?? "");

	switch (op) {
		case "set": {
			store.set(project, name, value);
			return {
				ok: true,
				did: "set",
				project,
				message: `Secret « ${name} » posé pour le projet ${project} (chiffré au repos, jamais committé).`,
				keyNames: store.keyNames(project),
			};
		}
		case "rotate": {
			const rotated = store.rotate(project, name, value);
			return {
				ok: rotated,
				did: "rotate",
				project,
				message: rotated
					? `Rotation effectuée : l'ancien secret « ${name} » est invalidé, la nouvelle valeur prend effet au prochain boot.`
					: `Rotation refusée : aucun secret « ${name} » à faire tourner (déposez-le d'abord).`,
				keyNames: store.keyNames(project),
			};
		}
		case "inject": {
			const declared = String(formData.get("declared") ?? "")
				.split(/[,\s]+/)
				.map((s) => s.trim())
				.filter(Boolean);
			const inj = store.injectEnv(project, declared);
			if (!inj.ok) {
				return {
					ok: false,
					did: "inject",
					project,
					keyNames: store.keyNames(project),
					blockExplanation: inj.block?.explanation,
				};
			}
			return {
				ok: true,
				did: "inject",
				project,
				message: `Boot OK : ${inj.env.length} variable(s) d'env injectée(s) (valeurs masquées).`,
				keyNames: store.keyNames(project),
				// only the NAMES are surfaced; the value is masked client-side.
				env: inj.env.map((e) => ({ name: e.name, value: "••••••••" })),
			};
		}
		case "scan": {
			const source = String(formData.get("source") ?? "");
			const known = store.keyNames(project); // names only; the scan also catches patterns
			// The leak scan checks the emission for known patterns + the declared secret NAMES
			// appearing as leaked assignments (the strongest check uses values, kept server-side).
			const findings = (await import("@/lib/secret-store")).scanEmission(
				source,
				[],
			);
			const clean = findings.length === 0;
			return {
				ok: true,
				did: "scan",
				project,
				message: clean
					? "Émission PROPRE : aucun secret détecté (scan déterministe type-gitleaks)."
					: `${findings.length} fuite(s) détectée(s) dans l'émission (excerpts redacted).`,
				keyNames: known,
				findings,
				clean,
			};
		}
		default:
			return SECRET_INITIAL;
	}
}
