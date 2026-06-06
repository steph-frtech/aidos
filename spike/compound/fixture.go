// fixture.go — THROWAWAY (CE01 spike). Two SIMILAR AIDOS goals, modelled as ordered work-units.
// "Similar" = they share most of the gesture/spec units (the motif) and differ only in the
// intrinsic, goal-specific unit. The token costs are estimates calibrated to the real per-step
// loop (CLAUDE.md §6): loading the ContextPack and writing the code dominate; sensors are cheap.
//
// The two goals model a realistic compound case: both add a CRUD-style operation to a kernel
// entity with the same mirror form (a fixture), the same projection target (Go + TS), and the
// same sensor pass — they differ only in the specific entity/operation derived. This is exactly
// the case the roadmap targets: "chaque goal terminé facilite le suivant".
package compound

// goal1 — "add an `archive` operation to the Order entity". The FIRST goal: nothing is captured
// yet, so every unit is derived from scratch (the baseline).
func goal1() Goal {
	return Goal{
		ID: "goal-order-archive",
		Units: []Unit{
			{Name: "load_context_pack", Tokens: 1200, Shareable: true}, // route the ContextPack (S33-style)
			{Name: "derive_mirror", Tokens: 900, Shareable: true},      // pick the mirror form (fixture)
			{Name: "write_fixture", Tokens: 1100, Shareable: true},     // state->cmd->events scaffold
			{Name: "scaffold_package", Tokens: 700, Shareable: true},   // back/<sub>/<id>/ skeleton
			{Name: "write_operation", Tokens: 1800, Shareable: false},  // INTRINSIC: the archive op itself
			{Name: "project_go_ts", Tokens: 800, Shareable: true},      // emit Go struct + TS type
			{Name: "wire_ui_control", Tokens: 1000, Shareable: true},   // action-capable Workbench control
			{Name: "run_sensors", Tokens: 300, Shareable: true},        // PostToolUse green
		},
	}
}

// goal2 — "add an `archive` operation to the Invoice entity". The SECOND, SIMILAR goal: same
// shape, same mirror form, same projection + UI + sensors; only the intrinsic operation differs
// (Invoice vs Order). With capture, every shareable unit can be replayed from goal-1's pattern.
func goal2() Goal {
	return Goal{
		ID: "goal-invoice-archive",
		Units: []Unit{
			{Name: "load_context_pack", Tokens: 1200, Shareable: true},
			{Name: "derive_mirror", Tokens: 900, Shareable: true},
			{Name: "write_fixture", Tokens: 1100, Shareable: true},
			{Name: "scaffold_package", Tokens: 700, Shareable: true},
			{Name: "write_operation", Tokens: 1800, Shareable: false}, // INTRINSIC: Invoice differs from Order
			{Name: "project_go_ts", Tokens: 800, Shareable: true},
			{Name: "wire_ui_control", Tokens: 1000, Shareable: true},
			{Name: "run_sensors", Tokens: 300, Shareable: true},
		},
	}
}

// dissimilarGoal — a control: a goal that is NOT similar to goal-1 (a different shape, almost no
// shareable overlap). Used by TestCaptureHelpsOnlySimilar to assert capture does NOT fabricate a
// saving where there is no shared motif (no false positive — the compound claim is honest).
func dissimilarGoal() Goal {
	return Goal{
		ID: "goal-unrelated-migration",
		Units: []Unit{
			{Name: "load_context_pack", Tokens: 1200, Shareable: true}, // the ONLY overlap
			{Name: "design_migration", Tokens: 2000, Shareable: false},
			{Name: "expand_contract_ddl", Tokens: 1500, Shareable: false},
			{Name: "backfill_data", Tokens: 1800, Shareable: false},
			{Name: "verify_atlas", Tokens: 600, Shareable: false},
		},
	}
}
