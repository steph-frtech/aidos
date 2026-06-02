package db

import "github.com/steph-frtech/aidos/back/runtime/generators"

// ExampleOrderPrior is the S35 Order entity (id, total, discount) — the PRIOR head the
// db migration diffs against. Reused verbatim from generators.ExampleOrder() so the
// db projection and the entity source never drift.
func ExampleOrderPrior() generators.EntitySource { return generators.ExampleOrder() }

// ExampleOrderNew is the Order entity with an ADDITIVE column add (+ coupon: text) — the
// expand case (Fixture A). The emitter coins no field beyond these; `coupon` is the
// declared additive change the fixture pins, never invented at runtime.
func ExampleOrderNew() generators.EntitySource {
	return generators.EntitySource{
		ID:   "entity-order",
		Kind: generators.KindEntity,
		Name: "Order",
		Fields: []generators.Field{
			{Name: "id", Type: "text"},
			{Name: "total", Type: "numeric"},
			{Name: "discount", Type: "numeric"},
			{Name: "coupon", Type: "text"},
		},
	}
}

// ExampleOrderNarrowed is the Order entity with `discount` DROPPED — the narrowing case
// (Fixtures B/C): a destructive/narrowing change split EXPAND → BACKFILL → CONTRACT,
// gated by a declared DataTruthScope. Same as generators.ExampleOrderChanged().
func ExampleOrderNarrowed() generators.EntitySource { return generators.ExampleOrderChanged() }

// ExampleHistoricalChange is the narrowing change descriptor with NO declared migration
// (Fixture B): applies_to touches existing + historical records ⇒ a historical-impact
// change that REQUIRES a declared migration. The fixture pins the applies_to set; the
// guard never infers it.
func ExampleHistoricalChange() Change {
	return Change{
		ChangeType: "override",
		Entity:     "Order",
		AppliesTo:  []AppliesTo{AppliesExistingRecords, AppliesHistoricalRecords},
		Scope:      nil,
	}
}

// ExampleDeclaredScope is the §44.3 DataTruthScope that UNBLOCKS the historical-impact
// change (Fixture C): required:true, strategy:expand_contract, preserve_old_truth:true.
func ExampleDeclaredScope() DataTruthScope {
	return DataTruthScope{
		AppliesTo: []AppliesTo{AppliesExistingRecords, AppliesHistoricalRecords},
		Migration: Migration{Required: true, Strategy: StrategyExpandContract},
		Audit:     Audit{PreserveOldTruth: true},
	}
}

// ExampleNewRecordsOnlyChange is a change touching ONLY new_records (Fixture D) — no
// historical impact, no migration required.
func ExampleNewRecordsOnlyChange() Change {
	return Change{
		ChangeType: "add",
		Entity:     "Order",
		AppliesTo:  []AppliesTo{AppliesNewRecords},
		Scope:      nil,
	}
}

// ExampleUnknownStrategyChange is a change carrying a DataTruthScope with a strategy
// OUTSIDE the closed §44.3 set (Fixture F) — rejected (UNKNOWN_MIGRATION_STRATEGY),
// never guessed.
func ExampleUnknownStrategyChange() Change {
	scope := DataTruthScope{
		AppliesTo: []AppliesTo{AppliesExistingRecords},
		Migration: Migration{Required: true, Strategy: Strategy("teleport")},
		Audit:     Audit{PreserveOldTruth: true},
	}
	return Change{
		ChangeType: "override",
		Entity:     "Order",
		AppliesTo:  []AppliesTo{AppliesExistingRecords},
		Scope:      &scope,
	}
}
