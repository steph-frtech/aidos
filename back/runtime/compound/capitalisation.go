// Package compound is the CE02 runtime statement of the CAPITALISATION LOOP — the decision,
// proven by the CE01 spike (GO: a similar second goal cost 7800→1940 tokens, 75.1% ↓, with a
// dissimilar control at 16.6% ≤ the 20% false-positive ceiling, reproducible), graven as an
// ACCEPTED ADR and PINNED TO CODE so the document can never drift.
//
// THE DECISION (CE02). After a goal closes, its DURABLE pattern becomes REUSABLE — as a
// KindProcedural memory recall (the gesture units) and a candidate BEHAVIOR-MACRO (§24.6, the
// spec units) — but ONLY through the wall: firewall.ViaIdea → idée → miroir → /goal → human
// approval. Capture writes NO truth and NEVER touches the fitness. The capture is a pure
// extraction of the SHAREABLE motif; the goal's intrinsic substance is never reused.
//
// THE FRONTIER (the load-bearing CE02 invariant). CAPITALISATION ≠ LEARNING CRITERIA. The loop
// reuses a captured pattern to make the next goal cheaper; it NEVER edits a weight, a threshold,
// a waterline, or the fitness grammar — those are NIVEAU 3, declared above the line, never
// learned (CLAUDE.md §8). Everything that would change a truth goes via /goal; nothing skips it.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The boundary is a DECLARED table (code), not an LLM
// judgment; CapitalisationDecisions / Verdict are PURE, TOTAL derivations — same table ⇒ same
// rows. The behavior-macro EXPANSION (CE04) is itself a pure function (§24.6), not learning. An
// "LLM deciding what to capitalise" would be a determinism gap; the rule is code.
//
// THE WALL (CLAUDE.md §2). This package writes NOTHING — it returns VALUES (the decision table,
// its verdict, the ADR projection). It imports nothing from kernel/mirrors/fitness; the only
// capitalisation door it names is firewall.ViaIdea (the engine-side /brain, below the line).
package compound

// Channel is WHERE a captured pattern lands — the closed set of capitalisation sinks CE03/CE04
// wire. A pattern is reused as procedural recall, or as a candidate behavior-macro; nothing is
// invented at runtime, and NOTHING lands in the kernel/fitness directly.
type Channel string

const (
	// ChannelProceduralMemory — the GESTURE units (load context, run sensors, wire control…)
	// become a KindProcedural memory recall (S31). It is /brain fuel, below the line, never truth.
	ChannelProceduralMemory Channel = "procedural_memory"
	// ChannelBehaviorMacro — the SPEC units (mirror/fixture/contract shape) become a candidate
	// behavior-macro (§24.6) proposed via firewall.ViaIdea. It carries no version, no mirror; it
	// must STILL acquire its mirror via /goal to ever reach the kernel.
	ChannelBehaviorMacro Channel = "behavior_macro"
	// ChannelNone — there is NO capitalisation channel for this decision row (a frontier rule:
	// the thing it names is forbidden from any capture, e.g. the fitness).
	ChannelNone Channel = ""
)

// Disposition is the verdict for one capitalisation decision. CLOSED. Either the pattern is
// CAPITALISED (captured + reused via the wall), or it is FORBIDDEN (a frontier the loop must
// never cross — touching the fitness, learning a criterion, a direct kernel write).
type Disposition string

const (
	// DispositionCapitalise — the durable pattern is captured and reused VIA THE WALL.
	DispositionCapitalise Disposition = "capitalise"
	// DispositionForbidden — the loop must NEVER do this (the frontier): it would be learning a
	// criterion, touching the fitness, or writing truth without /goal.
	DispositionForbidden Disposition = "forbidden"
)

// Decision is one row of the CE02 capitalisation boundary: a named subject, its disposition, the
// channel it flows through (when capitalised), whether it crosses the wall via firewall.ViaIdea,
// and the rationale. The whole table is the precise "ce qu'on capitalise / ce qu'on ne touche
// jamais" — derived once, projected into the ADR (never typed twice).
type Decision struct {
	// Subject is the kind of thing the loop encounters at a goal's close.
	Subject string `json:"subject"`
	// Disposition is capitalise (reuse via the wall) or forbidden (a frontier).
	Disposition Disposition `json:"disposition"`
	// Channel is the sink for a capitalised pattern (procedural / behavior-macro); empty when
	// forbidden.
	Channel Channel `json:"channel"`
	// ViaWall is true iff reaching the sink crosses the wall through firewall.ViaIdea → idée →
	// miroir → /goal. It is true for EVERY capitalise row (no shortcut to the kernel) and false
	// for forbidden rows (there is no legal sink at all). The mirror pins this invariant.
	ViaWall bool `json:"via_wall"`
	// TouchesFitness is true iff the row would change the fitness/weights/criteria. It MUST be
	// false on every capitalise row — the load-bearing frontier (capitalisation ≠ learning).
	TouchesFitness bool `json:"touches_fitness"`
	// Rationale is the FR audit-voice reason, KRD terms verbatim.
	Rationale string `json:"rationale"`
}

// decisionOrder is the canonical, stable order the table and the ADR both render.
var decisionOrder = []string{
	"gesture_pattern",
	"spec_pattern",
	"intrinsic_substance",
	"fitness_weights_criteria",
	"direct_kernel_write",
}

// capitalisationTable is the SINGLE authoritative CE02 decision — derived from the CE01 GO
// verdict. Two rows CAPITALISE the durable motif (procedural recall + behavior-macro, both via
// the wall, neither touching the fitness); three rows are FRONTIERS the loop must never cross
// (the goal's own substance is not reused, the fitness is never learned, the kernel is never
// written without /goal).
var capitalisationTable = map[string]Decision{
	"gesture_pattern": {
		Subject:        "gesture_pattern",
		Disposition:    DispositionCapitalise,
		Channel:        ChannelProceduralMemory,
		ViaWall:        true,
		TouchesFitness: false,
		Rationale:      "Le motif de GESTES d'un goal terminé (charger le ContextPack, dériver le miroir, lancer les sensors, câbler le contrôle) devient un recall PROCÉDURAL (KindProcedural, S31) — fuel /brain sous la ligne. Réutilisé par le router (CE05/MatchRole), il abaisse l'effort du goal suivant similaire (CE01 : 5 unités rejouées). Le mur reste le garant : la mémoire propose, elle ne déclare aucune vérité.",
	},
	"spec_pattern": {
		Subject:        "spec_pattern",
		Disposition:    DispositionCapitalise,
		Channel:        ChannelBehaviorMacro,
		ViaWall:        true,
		TouchesFitness: false,
		Rationale:      "Le motif de SPEC (forme miroir/fixture/contrat) devient une BEHAVIOR-MACRO candidate (§24.6) proposée via firewall.ViaIdea → idée draft → miroir → /goal. Son expansion (CE04) est une FONCTION PURE et idempotente, pas un apprentissage. Elle ne porte ni version ni miroir tant que /goal ne l'a pas figée : aucune écriture kernel hors du mur (CE01 : 2 unités rejouées par expansion).",
	},
	"intrinsic_substance": {
		Subject:        "intrinsic_substance",
		Disposition:    DispositionForbidden,
		Channel:        ChannelNone,
		ViaWall:        false,
		TouchesFitness: false,
		Rationale:      "La SUBSTANCE PROPRE d'un goal (son opération spécifique, son intent unique) n'est JAMAIS réutilisée — la capitalisation réutilise le MOTIF partagé, jamais le contenu intrinsèque. Fabriquer une réutilisation là où aucun motif n'est partagé est le faux positif que le contrôle dissimilaire de CE01 plafonne (16.6% ≤ 20%). Le goal suivant paie toujours plein son unité intrinsèque.",
	},
	"fitness_weights_criteria": {
		Subject:        "fitness_weights_criteria",
		Disposition:    DispositionForbidden,
		Channel:        ChannelNone,
		ViaWall:        false,
		TouchesFitness: true,
		Rationale:      "La FITNESS (grammaire NIVEAU 3, waterline, définition de « passé », poids, seuils) n'est JAMAIS touchée par la boucle. CAPITALISATION ≠ APPRENTISSAGE DE CRITÈRES : les poids sont DÉCLARÉS au-dessus de la ligne, jamais appris (CLAUDE.md §8). La boucle rend le goal suivant moins cher ; elle ne change pas ce qui définit « réussi ». C'est la frontière porteuse de CE02.",
	},
	"direct_kernel_write": {
		Subject:        "direct_kernel_write",
		Disposition:    DispositionForbidden,
		Channel:        ChannelNone,
		ViaWall:        false,
		TouchesFitness: false,
		Rationale:      "Écrire une vérité (kernel/mirrors) DIRECTEMENT depuis la capture est INTERDIT : TOUT passe par /goal. La seule porte est firewall.ViaIdea (idée → miroir → /goal → approbation humaine). Le ToKernel direct est toujours refusé (MEMORY_CANNOT_DECLARE_TRUTH) quelle que soit la confiance. Aucun raccourci mémoire → kernel.",
	},
}

// CapitalisationDecisions returns the CE02 boundary in canonical order. PURE, TOTAL — same table
// ⇒ same rows. This is the authoritative source the ADR projects and the mirror judges.
func CapitalisationDecisions() []Decision {
	out := make([]Decision, 0, len(decisionOrder))
	for _, k := range decisionOrder {
		out = append(out, capitalisationTable[k])
	}
	return out
}

// Verdict is the computed shape of the CE02 boundary — how many subjects are capitalised, how
// many are frontiers, and the two load-bearing invariants made explicit and testable: every
// capitalise row crosses the wall (no shortcut) and no capitalise row touches the fitness.
type Verdict struct {
	// Capitalise is the count of rows the loop captures + reuses (via the wall).
	Capitalise int `json:"capitalise"`
	// Forbidden is the count of frontier rows the loop must never cross.
	Forbidden int `json:"forbidden"`
	// AllCapitaliseViaWall is true iff EVERY capitalise row reaches its sink through
	// firewall.ViaIdea (idée → miroir → /goal). Anti-shortcut.
	AllCapitaliseViaWall bool `json:"all_capitalise_via_wall"`
	// NoCapitaliseTouchesFitness is true iff NO capitalise row changes the fitness/criteria —
	// the frontier "capitalisation ≠ apprentissage de critères".
	NoCapitaliseTouchesFitness bool `json:"no_capitalise_touches_fitness"`
}

// Compute derives the CE02 verdict from the authoritative table. PURE, TOTAL — same table ⇒
// same verdict. It is the deterministic statement the ADR headline and the mirror both read.
func Compute() Verdict {
	v := Verdict{AllCapitaliseViaWall: true, NoCapitaliseTouchesFitness: true}
	for _, d := range CapitalisationDecisions() {
		switch d.Disposition {
		case DispositionCapitalise:
			v.Capitalise++
			if !d.ViaWall {
				v.AllCapitaliseViaWall = false
			}
			if d.TouchesFitness {
				v.NoCapitaliseTouchesFitness = false
			}
		case DispositionForbidden:
			v.Forbidden++
		}
	}
	return v
}
