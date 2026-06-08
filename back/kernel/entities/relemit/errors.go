package relemit

import (
	"encoding/json"
	"errors"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Validation sentinels — the internal causes folded into a BlockReason at the Emit
// boundary. A malformed schema is never a panic and never a silent default.
var (
	// ErrNoProject — the schema pins no project namespace; paths are not addressable.
	ErrNoProject = errors.New("relemit: schema pins no project")
	// ErrNoEntities — the schema pins no entities; there is nothing to project.
	ErrNoEntities = errors.New("relemit: schema pins no entities")
	// ErrTargetNoIdentifier — a relation's FK/join target has no PRIMARY KEY to
	// reference; the FK cannot reference a guessed column, so this is refused.
	ErrTargetNoIdentifier = errors.New("relemit: relation target has no identifier to reference")
	// ErrAsyncNoName — an async operation pins no name; its worker is not addressable.
	ErrAsyncNoName = errors.New("relemit: async operation pins no name")
)

// mustJSON marshals a value the canonicaliser will re-sort; the input is a plain
// map/struct with no unmarshalable members, so an error here is a programmer fault.
func mustJSON(v any) []byte {
	raw, err := json.Marshal(v)
	if err != nil {
		panic("relemit: marshal schema body: " + err.Error())
	}
	return raw
}

// block folds a validation cause into the canonical S13 BlockReason for a refused
// emission. It carries a non-empty how_to_fix (no prison, KRD §44.5) and a code that
// names the family: an unknown relation target/kind reuses S71's UNKNOWN_RELATION_*; a
// malformed entity/async reuses the OUT_OF_SCOPE family. It NEVER renders a partial file.
func block(cause error) *blockreason.BlockReason {
	// Relation-shape causes get S71's actionable refusal verbatim (UNKNOWN_RELATION_*).
	if errors.Is(cause, ref.ErrUnknownTarget) ||
		errors.Is(cause, ref.ErrUnknownCardinality) ||
		errors.Is(cause, ref.ErrUnknownSemantic) ||
		errors.Is(cause, ref.ErrNoTarget) ||
		errors.Is(cause, ref.ErrNoName) {
		br := ref.BlockUnknownTarget(cause)
		return &br
	}
	br := blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Émission multi-entités refusée : le schéma est malformé (" + cause.Error() + "). " +
			"L'émetteur relation-aware REND exactement ce que le schéma épingle — entités typées, FK " +
			"vers de vraies tables, join table pour chaque N-N, worker+outbox pour chaque nœud async ; " +
			"il n'invente jamais une table, une colonne, une FK ni un identifiant (honnêteté). Une FK " +
			"sans PRIMARY KEY cible, ou un async sans nom, est refusée — jamais devinée.",
		HowToFix: []string{
			"pin_an_identifier : chaque cible de FK (1-1/1-N) et chaque bout d'un N-N porte exactement un attribut identifier — la FK référence sa PRIMARY KEY, jamais une colonne devinée.",
			"declare_the_target : une relation ne référence qu'une entité du jeu déclaré (S70) ; un target hors-jeu est UNKNOWN_RELATION_TARGET, jamais inventé.",
			"name_the_async : chaque opération async porte un nom — son worker et sa table outbox en dérivent.",
			"rerun aidos project : relancez l'émission une fois le schéma complet (entités + relations résolues + async nommés).",
		},
	}
	return &br
}

// asyncCauses keeps the linter honest that the operation sentinels are consulted (a
// malformed async block is surfaced through the OUT_OF_SCOPE family above; the explicit
// reference here documents the dependency and lets a future refinement special-case it).
var _ = []error{operation.ErrUnknownTriggerKind, operation.ErrCronMissingEcheance, entities.ErrNoName}
