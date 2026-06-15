package harness

// CRUD capability keys — the FOUR invariants a CRUD-bounded-context must hold,
// engraved verbatim from ADR 0082 §19 (« crud (CRUD-bounded-context — identité,
// validation, transitions, audit) »). The set is closed; the generator (T4) fills
// an ObservedCell.Has with exactly these keys for a CRUD cell.
const (
	CrudIdentity    = "identity"    // every entity has a stable identity
	CrudValidation  = "validation"  // writes are validated before they land
	CrudTransitions = "transitions" // state moves only along declared transitions
	CrudAudit       = "audit"       // every mutation leaves an audit trail
)

// requiresCapability builds a deterministic sensor that fires (Red) iff the
// observed cell does NOT declare the given capability. It is a PURE closure over
// `cap` — no clock, no RNG, no I/O — so the reproducibility and fault-injection
// mirrors are stable. A nil Has map reads as "no capability" (fires), never panics.
func requiresCapability(cap string) func(ObservedCell) Verdict {
	return func(cell ObservedCell) Verdict {
		if cell.Has[cap] {
			return Green
		}
		return Red
	}
}

// CrudFragment returns the concrete CRUD-bounded-context harness fragment — the
// FIRST real member of the closed catalogue (ADR 0082 §6 T1). It is a PURE
// deterministic constructor: same call ⇒ byte-identical fragment (and Hash). It
// carries, per §19:
//
//   - GUIDES (feedforward): the four expectations identity / validation /
//     transitions / audit, each with a golden statement.
//   - SENSORS (feedback): one deterministic `requiresCapability` detector per
//     guide — each FIRES (Red) when the matching capability is absent from the
//     observed cell, so each has a fault-injection (break the invariant ⇒ red).
//   - GOLDEN PATH: the canonical create → read → update → delete lifecycle.
//
// It cannot return an invalid fragment: it routes through NewFragment, which
// fails closed; for the engraved closed inputs that never errors, so this is
// total. (A panic here would mean the closed catalogue itself is malformed — a
// build-time bug, surfaced by the property test, not a runtime path.)
func CrudFragment() HarnessFragment {
	guides := []Guide{
		{Invariant: CrudIdentity, Expect: "every entity carries a stable, content-addressed identity"},
		{Invariant: CrudValidation, Expect: "every write is validated against the entity contract before it lands"},
		{Invariant: CrudTransitions, Expect: "state moves only along the entity's declared transitions"},
		{Invariant: CrudAudit, Expect: "every mutation leaves an append-only audit trail"},
	}
	sensors := []Sensor{
		{Invariant: CrudIdentity, Watches: "the cell declares an identity capability", Check: requiresCapability(CrudIdentity)},
		{Invariant: CrudValidation, Watches: "the cell declares a validation capability", Check: requiresCapability(CrudValidation)},
		{Invariant: CrudTransitions, Watches: "the cell declares a transitions capability", Check: requiresCapability(CrudTransitions)},
		{Invariant: CrudAudit, Watches: "the cell declares an audit capability", Check: requiresCapability(CrudAudit)},
	}
	gp := GoldenPath{
		Name:  "crud-lifecycle",
		Steps: []string{"create", "read", "update", "delete"},
	}
	f, err := NewFragment(TopologyCRUD, guides, sensors, gp)
	if err != nil {
		// Unreachable for the engraved closed inputs; a non-nil err here is a
		// build-time defect in the catalogue, caught by the property mirror.
		panic("harness: CrudFragment is malformed: " + err.Error())
	}
	return f
}

// CrudCapabilities returns the four CRUD capability keys in canonical order — the
// full required variety of the topology. Used by tests and by the generator (T4)
// to build a conformant ObservedCell, and by the fault-injection test to drop one.
func CrudCapabilities() []string {
	return []string{CrudIdentity, CrudValidation, CrudTransitions, CrudAudit}
}

// ConformantCrudCell builds an ObservedCell that declares ALL four CRUD
// capabilities — the cell against which every CRUD sensor passes (Green). Drop one
// key (the fault injection) and the matching sensor fires.
func ConformantCrudCell() ObservedCell {
	has := make(map[string]bool, len(CrudCapabilities()))
	for _, c := range CrudCapabilities() {
		has[c] = true
	}
	return ObservedCell{Has: has}
}
