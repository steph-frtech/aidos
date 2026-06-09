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

	// The S117 SURFACE-COMPLETION verbs — the gestures CLAUDE.md (§ Repository
	// structure, the `aidos` CLI) promises, now wired as REAL sub-commands routed over
	// the S58 passerelle (gateway). Each is a thin, deterministic edge over a gateway
	// tool: the CLI never bypasses the wall — it runs the SAME gateway.Route the HTTP
	// surface runs, so a truth-write is refused identically at the CLI and the edge.

	// VerbGoal — promote an idea to truth via its mirror (KRD §56). Routes to the
	// ChangeSet door (changeset_open) — the ONLY legal path truth moves.
	VerbGoal Verb = "goal"
	// VerbGrill — challenge an Idea's intention above the wall (idea_grill).
	VerbGrill Verb = "grill"
	// VerbSpike — enter the /spike zone (ratchet OFF) to make a fuzzy idea falsifiable
	// (idea_spike).
	VerbSpike Verb = "spike"
	// VerbHarvest — harvest a spike/idea into a DRAFT candidate-truth (idea_harvest).
	VerbHarvest Verb = "harvest"
	// VerbTrim — propose a trim of kernel debt; it DELETES NOTHING, it opens an idea
	// (idea_capture) — the proposal door, never a direct delete.
	VerbTrim Verb = "trim"
	// VerbInit — initialise a new project (an isolated DAG root) — project_create.
	VerbInit Verb = "init"
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

// gatewayContracts is the S117 registry of the SURFACE-COMPLETION verbs. They are a
// SEPARATE list (Contracts() still returns exactly the five core verbs, so the S03
// /cli projection and its mirror are unchanged); they are reachable through lookup
// and listed under "Passerelle (S117)" in the help. Each names the gateway tool it
// routes over (the wall is the gateway's, applied identically at the CLI).
var gatewayContracts = []Contract{
	{
		Verb:          VerbGoal,
		Purpose:       "promeut une idee en verite via son miroir — ouvre la porte ChangeSet (changeset_open), le seul chemin par lequel la verite bouge",
		FutureInputs:  "une ref d'idee grillee + son miroir derive (lecture, ouvre un ChangeSet DRAFT)",
		FutureOutputs: "la decision de routage de la passerelle vers changeset_open (route — porte below-the-line)",
		OwnedBy:       "S117 (surface CLI) via S20 (changeset) / S56 (/goal)",
		Status:        "wired",
	},
	{
		Verb:          VerbGrill,
		Purpose:       "challenge l'intention d'une idee au-dessus du mur (sharp -> grilled, fuzzy -> spiking, mauvais -> rejected)",
		FutureInputs:  "une ref d'idee capturee",
		FutureOutputs: "la decision de routage de la passerelle vers idea_grill (route — below-the-line)",
		OwnedBy:       "S117 (surface CLI) via S64 (idea-intake)",
		Status:        "wired",
	},
	{
		Verb:          VerbSpike,
		Purpose:       "entre la zone /spike (cliquet OFF, rigueur T0, code jetable) pour rendre une idee floue falsifiable",
		FutureInputs:  "une ref d'idee floue (routee depuis /grill ou classify-truth)",
		FutureOutputs: "la decision de routage de la passerelle vers idea_spike (route — below-the-line)",
		OwnedBy:       "S117 (surface CLI) via S64 (idea-intake)",
		Status:        "wired",
	},
	{
		Verb:          VerbHarvest,
		Purpose:       "moissonne un spike/une idee en candidat-verite DRAFT (jamais applique) — la lecon durable, jamais une ecriture du noyau",
		FutureInputs:  "une ref de spike/idee",
		FutureOutputs: "la decision de routage de la passerelle vers idea_harvest (route — below-the-line)",
		OwnedBy:       "S117 (surface CLI) via S64 (idea-intake)",
		Status:        "wired",
	},
	{
		Verb:          VerbTrim,
		Purpose:       "propose une reduction de la dette du noyau (miroirs orphelins, fixtures perimees, mutants survivants) — NE SUPPRIME RIEN, ouvre une idee",
		FutureInputs:  "le scan de dette du noyau (S41)",
		FutureOutputs: "la decision de routage de la passerelle vers idea_capture (route — la proposition passe par une idee, jamais une suppression)",
		OwnedBy:       "S117 (surface CLI) via S41 (/trim) / S64 (idea-intake)",
		Status:        "wired",
	},
	{
		Verb:          VerbInit,
		Purpose:       "initialise un nouveau projet — une racine de DAG isolee (project_create), jamais une ecriture de verite du noyau",
		FutureInputs:  "le nom + le proprietaire du projet (scope identite/projet)",
		FutureOutputs: "la decision de routage de la passerelle vers project_create (route — below-the-line)",
		OwnedBy:       "S117 (surface CLI) via S54 (project)",
		Status:        "wired",
	},
}

// Contracts returns the declared CORE command contracts in canonical order. The
// Workbench /cli panel and the CLI dispatcher both read this single source so the
// projection and the binary never diverge. It returns EXACTLY the five core verbs
// (S117 gateway verbs are listed separately — see GatewayContracts).
func Contracts() []Contract {
	out := make([]Contract, len(contracts))
	copy(out, contracts)
	return out
}

// GatewayContracts returns the S117 surface-completion verbs (defensive copy). They
// are the new sub-commands routed over the passerelle.
func GatewayContracts() []Contract {
	out := make([]Contract, len(gatewayContracts))
	copy(out, gatewayContracts)
	return out
}

// lookup returns the contract for a verb, and whether it is a known verb — core OR
// the S117 gateway verbs.
func lookup(verb string) (Contract, bool) {
	for _, c := range contracts {
		if string(c.Verb) == verb {
			return c, true
		}
	}
	for _, c := range gatewayContracts {
		if string(c.Verb) == verb {
			return c, true
		}
	}
	return Contract{}, false
}
