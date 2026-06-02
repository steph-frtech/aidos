// Package db is the AIDOS Runtime DB-PROJECTION emitter (KRD line 532:
// `db = migrations (expand-contract)`, a PROJECTION of `entity`, ai / BELOW the
// waterline) together with the DataTruthScope value object (KRD §44.3) and the pure
// RequireMigration guard.
//
// THE DB MIGRATION IS A PROJECTION (KRD line 532): EmitMigration READS the entity AST
// (a prior Kernel truth, S35, never authored here) and EMITS the Atlas migration that
// brings the schema to the new entity head, in an EXPAND-CONTRACT / FORWARD-ONLY shape:
//   - an additive column add is an EXPAND step (ALTER TABLE … ADD COLUMN) — never an
//     in-place ALTER that rewrites/drops historical data;
//   - a destructive/narrowing change (drop a column) is split EXPAND → BACKFILL →
//     CONTRACT and is FORBIDDEN as a single silent step — it is gated by a declared
//     DataTruthScope (RequireMigration).
//
// DETERMINISM-FIRST (CLAUDE.md §6): EmitMigration is a PURE, TOTAL, DETERMINISTIC
// function of the (entity, prior) pair — no clock, no RNG, no map-order leak, no
// absolute paths, normalized "\n" newlines, stable (sorted) field order. It REUSES
// S35's EmitDDL (the generators package) for the target CREATE TABLE shape and S02's
// records.Canonicalize/Hash for the content address — neither is forked.
//
// DATATRUTHSCOPE (KRD §44.3, verbatim): "Changer la vérité du code ne change pas
// automatiquement la vérité des données déjà produites." A change whose applies_to
// touches existing_records/historical_records (a HISTORICAL-IMPACT change) REQUIRES a
// declared migration (migration.required:true, a strategy in the closed §44.3 set,
// audit.preserve_old_truth:true); a new-records-only change does not. A historical-
// impact change with no declared migration is REJECTED with a BlockReason (the S13
// shape), never applied silently. The strategy set and the applies_to set are CLOSED:
// an unknown member is refused, never guessed (honesty, CLAUDE.md §8).
//
// THE WALL (CLAUDE.md §2): this package only READS the entity AST (SELECT-only on
// kernel) and the DataTruthScope (SELECT-only on runtime.data_truth_scope); it WRITES
// projections BELOW the line (back/gen/db). It writes no truth. A DataTruthScope is
// inserted only by the aidos CLI writer role via an approved ChangeSet; the agent
// reads it. back/gen/db is generated-only — never hand-edited (CLAUDE.md §4/§9).
package db

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// AppliesTo is one member of the CLOSED §44.3 applies_to set: the kind of records a
// new truth touches. The set is declared, never discovered — an unknown member is a
// BlockReason, never coerced.
type AppliesTo string

const (
	// AppliesNewRecords — only records produced AFTER the change. No historical impact.
	AppliesNewRecords AppliesTo = "new_records"
	// AppliesExistingRecords — records already produced under the old truth. Historical impact.
	AppliesExistingRecords AppliesTo = "existing_records"
	// AppliesHistoricalRecords — archived/past records under the old truth. Historical impact.
	AppliesHistoricalRecords AppliesTo = "historical_records"
)

// appliesToOrder is the canonical enumeration order (declared, never map-derived).
var appliesToOrder = []AppliesTo{AppliesNewRecords, AppliesExistingRecords, AppliesHistoricalRecords}

func isKnownAppliesTo(a AppliesTo) bool {
	for _, k := range appliesToOrder {
		if k == a {
			return true
		}
	}
	return false
}

// touchesHistorical reports whether an applies_to set touches data already produced
// (existing_records or historical_records) — i.e. the change has historical impact
// (KRD §44.3). new_records alone does not.
func touchesHistorical(set []AppliesTo) bool {
	for _, a := range set {
		if a == AppliesExistingRecords || a == AppliesHistoricalRecords {
			return true
		}
	}
	return false
}

// Strategy is one member of the CLOSED §44.3 migration.strategy set. The set is
// declared, never discovered — an unknown strategy is a BlockReason
// (UNKNOWN_MIGRATION_STRATEGY), never guessed (honesty).
type Strategy string

const (
	// StrategyExpandContract — additive expand, then backfill, then contract (forward-only).
	StrategyExpandContract Strategy = "expand_contract"
	// StrategyBackfill — populate the new shape from the old data.
	StrategyBackfill Strategy = "backfill"
	// StrategyDualRead — read both old and new shapes during the transition.
	StrategyDualRead Strategy = "dual_read"
	// StrategyDualWrite — write both old and new shapes during the transition.
	StrategyDualWrite Strategy = "dual_write"
)

// strategyOrder is the canonical enumeration order (declared, never map-derived).
var strategyOrder = []Strategy{StrategyExpandContract, StrategyBackfill, StrategyDualRead, StrategyDualWrite}

// Strategies returns every Strategy in the closed §44.3 set, in canonical order. The
// Workbench legend and the property mirror read this single source so the set is never
// re-invented downstream.
func Strategies() []Strategy {
	out := make([]Strategy, len(strategyOrder))
	copy(out, strategyOrder)
	return out
}

func isKnownStrategy(s Strategy) bool {
	for _, k := range strategyOrder {
		if k == s {
			return true
		}
	}
	return false
}

// Migration is the §44.3 migration block of a DataTruthScope.
type Migration struct {
	Required bool     `json:"required"`
	Strategy Strategy `json:"strategy"`
}

// Audit is the §44.3 audit block of a DataTruthScope.
type Audit struct {
	PreserveOldTruth bool `json:"preserve_old_truth"`
}

// DataTruthScope is the KRD §44.3 value object, verbatim: the explicit declaration of
// what a new truth does to historical data. It is content-addressed (its id == version
// == Hash(Canonicalize(body)), S02 reused) and append-only in runtime.data_truth_scope
// (the head moves by a new row + superseded_by). The agent READS it; only the aidos
// writer role inserts it via an approved ChangeSet (the wall).
type DataTruthScope struct {
	AppliesTo []AppliesTo `json:"applies_to"`
	Migration Migration   `json:"migration"`
	Audit     Audit       `json:"audit"`
}

// body re-serializes a DataTruthScope into the canonical JSON body the kernel stores,
// with applies_to in canonical (declared) order so the content address does not depend
// on the order the members were written. It marshals through records.Canonicalize, so
// object-key order never leaks into the hash.
func (s DataTruthScope) body() ([]byte, error) {
	norm := s
	norm.AppliesTo = sortedAppliesTo(s.AppliesTo)
	raw, err := json.Marshal(norm)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// ID returns the S02 content address of the scope body: Hash(Canonicalize(body)). Any
// byte change to the body yields a new id (a new version) — content-addressed, S02
// reused, never forked. It panics only on an internal marshalling bug (the body is a
// fixed struct); callers holding untrusted scopes get a BlockReason via RequireMigration.
func (s DataTruthScope) ID() string {
	b, err := s.body()
	if err != nil {
		// A fixed struct cannot fail to marshal; treat as programming bug, not a guess.
		panic(fmt.Sprintf("db: DataTruthScope body marshal failed: %v", err))
	}
	return records.Hash(b)
}

// CanonicalBody returns the canonical JSONB body the runtime.data_truth_scope row
// stores. Test-facing + the aidos writer use it to round-trip the row content-addressed.
func (s DataTruthScope) CanonicalBody() ([]byte, error) { return s.body() }

// sortedAppliesTo returns the applies_to members in canonical (declared) order,
// de-duplicated. It copies — never mutates the caller's slice.
func sortedAppliesTo(set []AppliesTo) []AppliesTo {
	seen := make(map[AppliesTo]bool, len(set))
	for _, a := range set {
		seen[a] = true
	}
	out := make([]AppliesTo, 0, len(set))
	for _, a := range appliesToOrder {
		if seen[a] {
			out = append(out, a)
		}
	}
	// Preserve any unknown member (so RequireMigration can refuse it) in stable order.
	var unknown []AppliesTo
	for a := range seen {
		if !isKnownAppliesTo(a) {
			unknown = append(unknown, a)
		}
	}
	sort.Slice(unknown, func(i, j int) bool { return unknown[i] < unknown[j] })
	return append(out, unknown...)
}

// Change is the change descriptor RequireMigration reads. It carries the SemanticDiff
// change_type (S21, REFERENCED never recomputed), the affected entity name, the
// applies_to set the change touches, and the OPTIONAL declared DataTruthScope. It is the
// pure input of the guard — RequireMigration fetches nothing (no DB, no clock, no RNG).
type Change struct {
	// ChangeType is the S21 SemanticDiff change_type, surfaced for provenance / the panel.
	ChangeType string `json:"change_type"`
	// Entity is the affected entity name (the db projection's table).
	Entity string `json:"entity"`
	// AppliesTo is the §44.3 applies_to set the change touches (read from the descriptor,
	// never inferred). Empty ⇒ treated as new-records-only (no historical impact).
	AppliesTo []AppliesTo `json:"applies_to"`
	// Scope is the OPTIONAL declared DataTruthScope. nil ⇒ no migration declared.
	Scope *DataTruthScope `json:"scope,omitempty"`
}

// RequireMigration is the pure §44.3 guard. It returns (required, BlockReason?):
//   - a change whose applies_to touches existing/historical records (historical impact)
//     with NO declared DataTruthScope ⇒ required=true, Blocked(HISTORICAL_IMPACT_REQUIRES_MIGRATION);
//   - a declared scope with a strategy OUTSIDE the closed §44.3 set ⇒ Blocked(UNKNOWN_MIGRATION_STRATEGY);
//   - a declared scope with an applies_to member outside the closed set ⇒ Blocked(UNKNOWN_MIGRATION_STRATEGY?) —
//     no: unknown applies_to is a separate honesty refusal, surfaced as OUT_OF_SCOPE? — see below;
//   - a historical-impact change WITH a valid declared migration (required:true, known strategy,
//     preserve_old_truth:true) ⇒ required=true, no block (allowed under the declared migration);
//   - a new-records-only change ⇒ required=false, no block.
//
// RequireMigration is PURE, TOTAL, DETERMINISTIC and NEVER PANICS. It reads the
// descriptor argument only; it never fetches the change_type, the entity, or the scope.
// "required" means "this change needs a declared migration to proceed"; the BlockReason
// is non-nil exactly when the requirement is unmet or the declaration is malformed.
func RequireMigration(c Change) (required bool, br *blockreason.BlockReason) {
	historical := touchesHistorical(c.AppliesTo)

	// A declared scope is validated FIRST (honesty: an unknown strategy is refused
	// before anything else, never silently coerced).
	if c.Scope != nil {
		if !isKnownStrategy(c.Scope.Migration.Strategy) {
			reason := blockreason.For(blockreason.CodeUnknownMigrationStrategy)
			return historical, &reason
		}
	}

	if !historical {
		// New-records-only: no historical migration needed (the rule binds historical impact only).
		return false, nil
	}

	// Historical impact from here on: a declared migration is REQUIRED.
	if c.Scope == nil || !c.Scope.Migration.Required {
		reason := blockreason.For(blockreason.CodeHistoricalImpactRequiresMigration)
		return true, &reason
	}

	// A declared, required migration with a known strategy. Honesty: a required migration
	// MUST preserve the old truth (§44.3 audit.preserve_old_truth:true) — else it is the
	// silent-rewrite the rule forbids.
	if !c.Scope.Audit.PreserveOldTruth {
		reason := blockreason.For(blockreason.CodeHistoricalImpactRequiresMigration)
		return true, &reason
	}

	// Allowed: a historical-impact change under a fully-declared migration.
	return true, nil
}
