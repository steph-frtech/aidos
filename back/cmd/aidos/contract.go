// Package main is the `aidos` CLI — the tracer-bullet entrypoint of the AIDOS
// Runtime. At S03 it is a print-only STUB: each of the five core verbs
// (check / impact / stable / diff / explain) declares its own CONTRACT — name,
// purpose, and the inputs/outputs it will eventually own — and exits 0. No truth
// is written, no Postgres is touched (the wall, CLAUDE.md §2): the commands
// declare a future contract and are wired, tested and visualizable now.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the contracts are hand-written constants
// and the dispatcher is a pure function of (args, stdout) → exit code — no clock,
// no rng, no env-dependent ordering — so the same args always yield byte-identical
// stdout. The reproducibility mirror (contract_property_test.go) pins that.
package main

// Verb is the canonical name of a core CLI command. The set is declared, never
// discovered at runtime, so the command list is stable across runs and matches
// the Workbench /cli projection one-to-one.
type Verb string

const (
	// VerbCheck — run the red set / verify the truth graph (KRDCompiler `krd check`).
	VerbCheck Verb = "check"
	// VerbImpact — preview the red wave (vague de rouge) a kernel change triggers.
	VerbImpact Verb = "impact"
	// VerbStable — show the current stable Phase (the coherent DAG cut).
	VerbStable Verb = "stable"
	// VerbDiff — the SemanticDiff between two phases (real nature of a change).
	VerbDiff Verb = "diff"
	// VerbExplain — render a BlockReason / a truth's provenance (an actionable refusal).
	VerbExplain Verb = "explain"
)

// Contract is the declared, hand-written contract a command prints. It is the
// command's future shape, grounded in back/runtime/CONTEXT.md and the later step
// specs (impact→S22, explain→S13, stable/diff→S23/S24) — it is DECLARED, never
// invented. Status is "stub" until the owning step lands the real behaviour.
type Contract struct {
	// Verb is the command name (the heading the binary prints: "aidos <verb>").
	Verb Verb
	// Purpose is the one-line role of the command in AIDOS terms.
	Purpose string
	// FutureInputs names what the command will read when it is implemented.
	FutureInputs string
	// FutureOutputs names what the command will produce when it is implemented.
	FutureOutputs string
	// OwnedBy is the future step that lands the real behaviour (provenance, not a promise of done).
	OwnedBy string
	// Status is the lifecycle marker — "stub" at S03 (print-only, not yet specified).
	Status string
}

// contracts is the declared registry, in canonical order. Order is fixed so the
// /cli projection and the `aidos` help output never depend on map iteration.
var contracts = []Contract{
	{
		Verb:          VerbCheck,
		Purpose:       "verifie le graphe de verite (le KRDCompiler) — rejoue le set rouge et calcule l'etat objectif du systeme",
		FutureInputs:  "le graphe de verite (ideas, kernel, mirrors, context, changesets, projections, telemetrie)",
		FutureOutputs: "VALID/INVALID par loi KRD + la liste des miroirs rouges (le set rouge)",
		OwnedBy:       "S45 (AIDOS compiler)",
		Status:        "stub",
	},
	{
		Verb:          VerbImpact,
		Purpose:       "previsualise la vague de rouge qu'un changement de noyau declenche (depuis le miroir vers les projections)",
		FutureInputs:  "un hash de noyau modifie + les liens versionnes du sous-graphe affecte",
		FutureOutputs: "la cascade de liens perimes et de miroirs en echec, drainee dans la RedWorkQueue",
		OwnedBy:       "S22 (Impact / red wave)",
		Status:        "stub",
	},
	{
		Verb:          VerbStable,
		Purpose:       "montre la phase stable courante — la coupe coherente du DAG ou tout lien resout et tout senseur est vert",
		FutureInputs:  "le DAG des phases + les liens + l'etat des senseurs",
		FutureOutputs: "la phase stable courante (artefact content-addressed) ou la raison de non-stabilite",
		OwnedBy:       "S23 (Phase stable)",
		Status:        "stub",
	},
	{
		Verb:          VerbDiff,
		Purpose:       "calcule le SemanticDiff entre deux versions de noyau — la vraie nature d'un changement, pas un diff textuel",
		FutureInputs:  "un id de noyau + deux versions (--from / --to) a comparer (lecture seule)",
		FutureOutputs: "change_type (add/refine/override/rescope/reweight/deprecate) + blast_radius/requires_authority/red_wave references",
		OwnedBy:       "S21 (SemanticDiff)",
		Status:        "stub",
	},
	{
		Verb:          VerbExplain,
		Purpose:       "rend une refus actionnable (BlockReason) ou la provenance d'une verite — un mur sans BlockReason devient une prison",
		FutureInputs:  "un identifiant de refus/bloc ou de verite",
		FutureOutputs: "BlockReason{code, severity, explanation, how_to_fix[]} ou la chaine de provenance",
		OwnedBy:       "S13 (BlockReason)",
		Status:        "stub",
	},
}

// Contracts returns the declared command contracts in canonical order. The
// Workbench /cli panel and the CLI dispatcher both read this single source so the
// projection and the binary never diverge.
func Contracts() []Contract {
	out := make([]Contract, len(contracts))
	copy(out, contracts)
	return out
}

// lookup returns the contract for a verb, and whether it is a known core verb.
func lookup(verb string) (Contract, bool) {
	for _, c := range contracts {
		if string(c.Verb) == verb {
			return c, true
		}
	}
	return Contract{}, false
}
