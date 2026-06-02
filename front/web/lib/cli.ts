/**
 * The `aidos` CLI command contracts — the Workbench /cli projection source.
 *
 * THE WALL (CLAUDE.md §2): the CLI is a print-only stub at S03; it writes no
 * truth. This module holds only the DECLARED contract data the binary prints, so
 * the /cli panel renders exactly what `aidos <cmd>` emits — one source, no drift.
 *
 * DETERMINISM-FIRST: this is a static, declared registry (no clock, no rng, no
 * I/O). It mirrors back/cmd/aidos/contract.go field-for-field; the reproducibility
 * mirror lib/cli.test.ts pins that the set is the five core verbs, in order.
 *
 * Prose is FR-first per ADR 0011; the page renders bilingual labels via next-intl,
 * while these contract strings are the binary's own French output (verbatim, so
 * the screen shows what the CLI prints).
 */

export type Verb = "check" | "impact" | "stable" | "diff" | "explain";

export interface CliContract {
	/** The command name; the binary heading is `aidos <verb>`. */
	verb: Verb;
	/** One-line role of the command in AIDOS terms (verbatim from the binary). */
	purpose: string;
	/** What the command will read once implemented. */
	futureInputs: string;
	/** What the command will produce once implemented. */
	futureOutputs: string;
	/** The future step that lands the real behaviour (provenance, not a promise). */
	ownedBy: string;
	/** Lifecycle marker — "stub" at S03 (print-only, not yet specified). */
	status: "stub";
}

// Canonical order — matches back/cmd/aidos/contract.go exactly.
export const CLI_CONTRACTS: readonly CliContract[] = [
	{
		verb: "check",
		purpose:
			"verifie le graphe de verite (le KRDCompiler) — rejoue le set rouge et calcule l'etat objectif du systeme",
		futureInputs:
			"le graphe de verite (ideas, kernel, mirrors, context, changesets, projections, telemetrie)",
		futureOutputs:
			"VALID/INVALID par loi KRD + la liste des miroirs rouges (le set rouge)",
		ownedBy: "S45 (AIDOS compiler)",
		status: "stub",
	},
	{
		verb: "impact",
		purpose:
			"previsualise la vague de rouge qu'un changement de noyau declenche (depuis le miroir vers les projections)",
		futureInputs:
			"un hash de noyau modifie + les liens versionnes du sous-graphe affecte",
		futureOutputs:
			"la cascade de liens perimes et de miroirs en echec, drainee dans la RedWorkQueue",
		ownedBy: "S22 (Impact / red wave)",
		status: "stub",
	},
	{
		verb: "stable",
		purpose:
			"montre la phase stable courante — la coupe coherente du DAG ou tout lien resout et tout senseur est vert",
		futureInputs: "le DAG des phases + les liens + l'etat des senseurs",
		futureOutputs:
			"la phase stable courante (artefact content-addressed) ou la raison de non-stabilite",
		ownedBy: "S23 (Phase stable)",
		status: "stub",
	},
	{
		verb: "diff",
		purpose:
			"calcule le SemanticDiff entre deux phases — la vraie nature d'un changement de noyau, pas un diff textuel",
		futureInputs: "deux phases (ou deux versions de noyau) a comparer",
		futureOutputs: "change_type, blast_radius, requires_authority, red_wave",
		ownedBy: "S24 (Version DAG) / SemanticDiff",
		status: "stub",
	},
	{
		verb: "explain",
		purpose:
			"rend une refus actionnable (BlockReason) ou la provenance d'une verite — un mur sans BlockReason devient une prison",
		futureInputs: "un identifiant de refus/bloc ou de verite",
		futureOutputs:
			"BlockReason{code, severity, explanation, how_to_fix[]} ou la chaine de provenance",
		ownedBy: "S13 (BlockReason)",
		status: "stub",
	},
] as const;

/** The exact heading the binary prints for a verb: `aidos <verb>`. */
export function heading(verb: Verb): string {
	return `aidos ${verb}`;
}

/** Returns a fresh copy of the declared contract registry, in canonical order. */
export function cliContracts(): CliContract[] {
	return CLI_CONTRACTS.map((c) => ({ ...c }));
}
