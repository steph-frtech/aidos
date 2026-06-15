package harness

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Topology is the CLOSED enum of harness-fragment families, aligned verbatim on
// the Tome §48 (« CRUD-bounded-context, event processor, dashboard… »). A real
// app is a COMPOSITION of these (T2 AssembleHarness), never a single-select. A
// fifth family enters ONLY by an explicit ADR (ADR 0082 §27 — the méta-loop ADDs
// a topology, never removes one). An unknown topology is fail-closed.
type Topology string

const (
	// TopologyCRUD — a CRUD-bounded-context: identity, validation, transitions,
	// audit (ADR 0082 §19).
	TopologyCRUD Topology = "crud"
	// TopologyWorkflow — a multi-step workflow (state → command → events).
	TopologyWorkflow Topology = "workflow"
	// TopologyEventProcessor — a `*.requested` → reducer → events processor.
	TopologyEventProcessor Topology = "event-processor"
	// TopologyDashboard — a read-model dashboard (projection over events).
	TopologyDashboard Topology = "dashboard"
)

// Topologies returns the four families in canonical order. The set is closed; the
// selector and the Workbench projection read it so the family list is never
// invented. Adding a member is an ADR-gated, additive change (§27).
func Topologies() []Topology {
	return []Topology{TopologyCRUD, TopologyWorkflow, TopologyEventProcessor, TopologyDashboard}
}

// IsKnown reports whether t is one of the four closed families. Used by the pure
// constructor to fail-closed on an out-of-enum topology (never a default skeleton).
func (t Topology) IsKnown() bool {
	switch t {
	case TopologyCRUD, TopologyWorkflow, TopologyEventProcessor, TopologyDashboard:
		return true
	default:
		return false
	}
}

// Verdict is the closed two-value outcome of a sensor Check — the same binary
// regime as the per-diff computational drawer (back/runtime/CONTEXT.md: « exactly
// two verdicts »). A sensor either passes (green) or fires (red); there is no
// third, soft, advisory value.
type Verdict bool

const (
	// Green — the captured invariant holds on the observed cell.
	Green Verdict = true
	// Red — the captured invariant is broken; the sensor fires (ADR 0082 §25).
	Red Verdict = false
)

// Guide is one FEEDFORWARD expectation of a topology — a named invariant the
// generator is expected to honour, plus its golden reference text. It is data, not
// behaviour; the Sensor of the same Invariant key turns it into a check.
type Guide struct {
	// Invariant is the stable key of the expectation (e.g. "identity",
	// "validation"). It pairs a Guide (feedforward) with its Sensor (feedback).
	Invariant string `json:"invariant"`
	// Expect is the human-readable statement of what must hold.
	Expect string `json:"expect"`
}

// Sensor is one DETERMINISTIC `computational` detector of a fragment: given an
// observed cell, it returns Green iff the captured invariant holds, Red otherwise.
// Check is a PURE function (no clock, no RNG, no I/O) so the reproducibility and
// fault-injection mirrors are stable. A sensor that never fires is dead (§6) — so
// every Sensor here has a fault-injection test that breaks the invariant and
// asserts Red. Check is not serialised (a func has no JSON form); the content
// address is taken over the sensor's Invariant + Watches identity (see fragment
// body), so two fragments with the same declared sensors hash equally.
type Sensor struct {
	// Invariant is the key of the Guide this sensor verifies (the pairing key).
	Invariant string `json:"invariant"`
	// Watches is the human-readable description of what the detector inspects.
	Watches string `json:"watches"`
	// Check is the pure deterministic predicate. nil is illegal (a sensor that
	// cannot fire is dead) and is refused by the constructor.
	Check func(cell ObservedCell) Verdict `json:"-"`
}

// ObservedCell is the minimal, deterministic observation a Sensor inspects — the
// shape of an emitted cell as the harness sees it. It is intentionally small for
// T1: the closed set of capabilities the cell declares it carries. A generator
// (T4) fills this from the real emitted cell; the fault-injection test fills it by
// hand to break one invariant.
type ObservedCell struct {
	// Has is the set of capability keys the cell declares (e.g. "identity",
	// "validation"). A Sensor fires (Red) when an expected capability is absent.
	Has map[string]bool `json:"has"`
}

// GoldenPath is the reference happy-flow of a topology — the ordered steps a
// conformant cell walks. It is feedforward data the generator follows; an empty
// golden path is illegal (a topology with no reference path is a bare skeleton).
type GoldenPath struct {
	// Name is the path's stable label (e.g. "crud-lifecycle").
	Name string `json:"name"`
	// Steps are the ordered reference steps; never empty.
	Steps []string `json:"steps"`
}

// HarnessFragment is a pure, content-addressed bundle {guides, sensors,
// golden_path} attached to ONE Topology (ADR 0082 §19). It is the unit of variety
// reduction the selector composes (T2) and the generator attaches to a cell (T4).
type HarnessFragment struct {
	Topology   Topology   `json:"topology"`
	Guides     []Guide    `json:"guides"`
	Sensors    []Sensor   `json:"sensors"`
	GoldenPath GoldenPath `json:"golden_path"`
}

// Construction errors (fail-closed, never a default skeleton).
var (
	// ErrUnknownTopology — the topology is outside the closed §48 enum.
	ErrUnknownTopology = errors.New("harness: unknown topology (a fifth family needs an ADR)")
	// ErrEmptyGuides — a fragment with no feedforward expectation is a skeleton.
	ErrEmptyGuides = errors.New("harness: fragment carries no guides")
	// ErrEmptySensors — a fragment with no feedback detector cannot regulate
	// (Ashby: no variety, no regulation).
	ErrEmptySensors = errors.New("harness: fragment carries no sensors")
	// ErrSensorNoCheck — a sensor with a nil Check can never fire (a dead sensor,
	// §6 hook-honesty).
	ErrSensorNoCheck = errors.New("harness: sensor has a nil Check (a sensor that never fires is dead)")
	// ErrSensorUnguided — a sensor whose invariant has no matching guide is an
	// orphan detector (a monster).
	ErrSensorUnguided = errors.New("harness: sensor invariant has no matching guide")
	// ErrEmptyGoldenPath — a topology with no reference path is a bare skeleton.
	ErrEmptyGoldenPath = errors.New("harness: golden path is empty")
)

// NewFragment is the PURE constructor of a HarnessFragment. It fails CLOSED on an
// unknown topology, on an empty guide/sensor set, on a golden path with no steps,
// on a nil-Check sensor (a dead sensor), and on a sensor whose invariant has no
// guide (an orphan detector). It NEVER returns a default/skeleton fragment on a
// bad input — the regulator either holds the required variety or is refused
// (Ashby §136). On success the returned fragment is ready to content-address.
func NewFragment(t Topology, guides []Guide, sensors []Sensor, gp GoldenPath) (HarnessFragment, error) {
	if !t.IsKnown() {
		return HarnessFragment{}, fmt.Errorf("%w: %q", ErrUnknownTopology, t)
	}
	if len(guides) == 0 {
		return HarnessFragment{}, ErrEmptyGuides
	}
	if len(sensors) == 0 {
		return HarnessFragment{}, ErrEmptySensors
	}
	if len(gp.Steps) == 0 {
		return HarnessFragment{}, ErrEmptyGoldenPath
	}
	guided := make(map[string]bool, len(guides))
	for _, g := range guides {
		guided[g.Invariant] = true
	}
	for _, s := range sensors {
		if s.Check == nil {
			return HarnessFragment{}, fmt.Errorf("%w: %q", ErrSensorNoCheck, s.Invariant)
		}
		if !guided[s.Invariant] {
			return HarnessFragment{}, fmt.Errorf("%w: %q", ErrSensorUnguided, s.Invariant)
		}
	}
	return HarnessFragment{Topology: t, Guides: guides, Sensors: sensors, GoldenPath: gp}, nil
}

// fragmentBody is the canonical, SERIALISABLE projection of a fragment used for
// content-addressing. The Sensor.Check func has no JSON form, so a sensor is
// projected by its declared identity (invariant + watches) — two fragments with
// the same declared topology/guides/sensors/golden-path hash equally, which is
// exactly the determinism law (same fragment ⇒ same address). Keys are sorted by
// records.Canonicalize, so field/map order never leaks into the hash.
type fragmentBody struct {
	Topology   Topology     `json:"topology"`
	Guides     []Guide      `json:"guides"`
	Sensors    []sensorBody `json:"sensors"`
	GoldenPath GoldenPath   `json:"golden_path"`
}

type sensorBody struct {
	Invariant string `json:"invariant"`
	Watches   string `json:"watches"`
}

// canonicalBody marshals the fragment's serialisable projection through
// records.Canonicalize (S02 reused, never forked) so the bytes are stable under
// key reordering. Sensors are emitted in declared order; guides likewise — order
// is part of the fragment's identity (the golden path is ordered).
func (f HarnessFragment) canonicalBody() ([]byte, error) {
	sb := make([]sensorBody, len(f.Sensors))
	for i, s := range f.Sensors {
		sb[i] = sensorBody{Invariant: s.Invariant, Watches: s.Watches}
	}
	body := fragmentBody{
		Topology:   f.Topology,
		Guides:     f.Guides,
		Sensors:    sb,
		GoldenPath: f.GoldenPath,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// Hash is the content address of the fragment — records.Hash over its canonical
// body (S02 reused, never forked). Same fragment ⇒ byte-identical address (the
// reproducibility mirror, ADR 0082 §21). The Sensor.Check closures do NOT enter
// the address; the declared sensor identity does.
func (f HarnessFragment) Hash() (string, error) {
	canon, err := f.canonicalBody()
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// Inspect runs every sensor of the fragment against an observed cell and returns
// the keys of the sensors that FIRED (Red), in declared order. An empty result
// means the cell conforms to the fragment's full required variety. This is the
// deterministic regulation step: a PURE function of (fragment, cell) — no clock,
// no RNG — so the same cell always yields the same firing set.
func (f HarnessFragment) Inspect(cell ObservedCell) []string {
	var fired []string
	for _, s := range f.Sensors {
		if s.Check(cell) == Red {
			fired = append(fired, s.Invariant)
		}
	}
	return fired
}

// Invariants returns the sorted set of invariant keys the fragment's guides
// declare. Used by the Workbench projection (T5) and by tests to assert the
// fragment's required variety without depending on slice order.
func (f HarnessFragment) Invariants() []string {
	out := make([]string, 0, len(f.Guides))
	for _, g := range f.Guides {
		out = append(out, g.Invariant)
	}
	sort.Strings(out)
	return out
}
