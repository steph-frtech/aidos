// Package selftest is the AIDOS meta-meta self-test runner (KRD LIVRE XIII §70):
// the SessionStart fault-injection that proves, at every session start, the three
// INVIOLABLE guarantees of NIVEAU 3 — (1) every sensor still FIRES (break a
// known-green watched check → the detector goes red — the "mirror of the mirrors",
// KRD §60 « est-ce que ce détecteur détecte ? »), (2) the WALL still HOLDS (an
// agent-role write above the line on kernel · mirrors · fitness is refused), and
// (3) the FITNESS is UNCHANGED (Hash(Canonicalize(fitness rows)) equals the graven
// baseline — no loop edits its own fitness, the cardinal sin).
//
// The méta loop may ADD a guardrail, NEVER REMOVE one (CLAUDE.md §5; KRD §70): a
// removed guardrail is a red self-test. This package does NOT author the fitness it
// checks — NIVEAU 3 is graven, owned only by the human + reality; Run READS it
// (SELECT-only) and asserts it unchanged. There is NO level 4: the regress stops
// because the floor is DETERMINISTIC fault injection, not another LLM judge.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Run is a PURE function of the harness and the
// passed-in instant `at` — no time.Now(), no rng, no map-iteration-order leak — so
// Run(h, t) == Run(h, t) (the reproducibility mirror pins it). The three probes are
// behind a Harness port so the production hook wires the REAL S07 sensors / S04 wall
// / fitness baseline while the mirrors drive deterministic in-process fault adapters
// (the wall §2: this package PROBES the wall and the sensors, it never re-implements
// them, and it never writes truth — it is below the line).
package selftest

import (
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Verdict is the self-test outcome. There are exactly two — green iff EVERY sensor
// fired ∧ EVERY above-the-line write was refused ∧ the fitness is unchanged.
type Verdict string

const (
	// VerdictGreen — all three guarantees hold; the session may start.
	VerdictGreen Verdict = "green"
	// VerdictRed — at least one guarantee failed; the session is blocked.
	VerdictRed Verdict = "red"
)

// The above-the-line schemas the wall must refuse the agent role on (the protected
// set, S04 / CLAUDE.md §2). Declared, never discovered — the self-test probes EXACTLY
// these three and invents no fourth.
const (
	SchemaKernel  = "kernel"
	SchemaMirrors = "mirrors"
	SchemaFitness = "fitness"
)

// protectedSchemas is the canonical above-the-line set, in canonical order, the wall
// probe attempts an agent write against. It is the S04 protected-schema set this step
// PROBES — it does not extend it.
var protectedSchemas = []string{SchemaKernel, SchemaMirrors, SchemaFitness}

// SensorProbe is one sensor's fault-injection result: the sensor id, a description of
// the deliberately-injected fault (the known-green watched check turned red), and
// whether the detector FIRED on it. A sensor that stays green on injected breakage is
// dead (CLAUDE.md §5) — a muted guardrail.
type SensorProbe struct {
	SensorID      string `json:"sensor_id"`
	InjectedFault string `json:"injected_fault"`
	Fired         bool   `json:"fired"`
}

// WallProbe is the wall guarantee's result: one attempted agent-role write per
// above-the-line schema, and whether each was REFUSED. refused==false for any schema
// is a breached wall.
type WallProbe struct {
	Attempts []WallAttempt `json:"attempts"`
}

// WallAttempt records one above-the-line write attempt as the agent role.
type WallAttempt struct {
	Schema         string `json:"schema"`
	AttemptedWrite string `json:"attempted_write"`
	Refused        bool   `json:"refused"`
}

// AllRefused reports whether every above-the-line write attempt was refused (the wall
// holds on kernel ∧ mirrors ∧ fitness).
func (w WallProbe) AllRefused() bool {
	if len(w.Attempts) == 0 {
		return false
	}
	for _, a := range w.Attempts {
		if !a.Refused {
			return false
		}
	}
	return true
}

// FitnessProbe is the fitness guarantee's result: the graven baseline content-hash, the
// recomputed current content-hash (Hash(Canonicalize(fitness rows)), reusing S02 —
// never forked), and whether they match. unchanged==false means a loop edited its own
// fitness (the cardinal sin).
type FitnessProbe struct {
	BaselineHash string `json:"baseline_hash"`
	CurrentHash  string `json:"current_hash"`
	Unchanged    bool   `json:"unchanged"`
}

// SelfTestReport is the green event of the self-test fixture (state → command →
// events): the per-sensor fault-injection results, the wall probe, the fitness probe,
// the computed verdict, and the instant `at` (passed in, never time.Now()).
type SelfTestReport struct {
	SensorsChecked []SensorProbe `json:"sensors_checked"`
	WallProbe      WallProbe     `json:"wall_probe"`
	FitnessProbe   FitnessProbe  `json:"fitness_probe"`
	Verdict        Verdict       `json:"verdict"`
	At             string        `json:"at"`
}

// SensorsFired returns how many of the checked sensors fired.
func (r SelfTestReport) SensorsFired() int {
	n := 0
	for _, s := range r.SensorsChecked {
		if s.Fired {
			n++
		}
	}
	return n
}

// SensorsTotal returns how many sensors were checked.
func (r SelfTestReport) SensorsTotal() int { return len(r.SensorsChecked) }

// AllSensorsFired reports whether every checked sensor fired (and at least one was
// checked — an empty inventory cannot prove the sensors fire).
func (r SelfTestReport) AllSensorsFired() bool {
	if len(r.SensorsChecked) == 0 {
		return false
	}
	for _, s := range r.SensorsChecked {
		if !s.Fired {
			return false
		}
	}
	return true
}

// Harness is the port the self-test PROBES (it never re-implements the sensors, the
// wall, or the fitness — it drives them and reads the result). The production hook
// wires the REAL S07 sensors / S04 wall (via a low-grant pgx connection) / the fitness
// baseline; the mirrors drive deterministic in-process fault adapters.
//
//   - SensorInventory: the declared sensor ids to fault-inject (S07's inventory). An
//     empty inventory is a malformed harness — Run yields a BlockReason, never a panic.
//   - ProbeSensor: inject the known-green fault into the sensor and report whether the
//     detector FIRED (true) — and a human description of the injected fault. A
//     deterministic fault that rolls back cleanly.
//   - ProbeWall: attempt an agent-role write above the line on `schema` and report
//     whether it was REFUSED (true). A transactional rollback / permission probe.
//   - FitnessRows: the raw fitness rows to content-hash (reused via S02 Canonicalize/
//     Hash). BaselineHash: the graven baseline the current hash is compared to.
type Harness interface {
	SensorInventory() []string
	ProbeSensor(sensorID string) (injectedFault string, fired bool)
	ProbeWall(schema string) (attemptedWrite string, refused bool)
	FitnessRows() []byte
	BaselineHash() string
}

// Run is the deep, well-named heart of the meta-meta self-test: a PURE function of the
// harness and the passed-in instant `at` that performs the three deterministic fault
// injections and returns a green SelfTestReport when all guarantees hold, or a
// BlockReason (with a non-empty how_to_fix) on the first violated guarantee. Run never
// writes truth and never mutates the harness — it reads and probes only.
//
// Verdict is GREEN iff: every sensor fired ∧ every above-the-line write was refused ∧
// the fitness is unchanged. Otherwise RED, with the precise BlockReason code:
// MUTED_SENSOR (a guardrail was removed), WALL_BREACHED (the agent could write truth),
// or FITNESS_MUTATED (a loop edited its own fitness).
func Run(h Harness, at string) (SelfTestReport, *blockreason.BlockReason) {
	// (1) Each sensor fires — fault-inject every declared sensor and assert it goes red.
	inventory := h.SensorInventory()
	sensors := make([]SensorProbe, 0, len(inventory))
	for _, id := range inventory {
		fault, fired := h.ProbeSensor(id)
		sensors = append(sensors, SensorProbe{SensorID: id, InjectedFault: fault, Fired: fired})
	}
	// Stable order regardless of inventory ordering (no map-iteration leak).
	sort.SliceStable(sensors, func(i, j int) bool { return sensors[i].SensorID < sensors[j].SensorID })

	// (2) The wall holds — attempt an agent-role write above the line on each schema.
	attempts := make([]WallAttempt, 0, len(protectedSchemas))
	for _, schema := range protectedSchemas {
		write, refused := h.ProbeWall(schema)
		attempts = append(attempts, WallAttempt{Schema: schema, AttemptedWrite: write, Refused: refused})
	}
	wall := WallProbe{Attempts: attempts}

	// (3) The fitness is unchanged — recompute the content-hash and compare to baseline.
	fitness := fitnessProbe(h)

	report := SelfTestReport{
		SensorsChecked: sensors,
		WallProbe:      wall,
		FitnessProbe:   fitness,
		At:             at,
	}

	// The verdict is COMPUTED from the three guarantees, never declared. The block
	// codes are checked in a fixed precedence (sensors → wall → fitness) so the same
	// harness always yields the same BlockReason (determinism).
	if !report.AllSensorsFired() {
		report.Verdict = VerdictRed
		br := mutedSensorBlockReason(report)
		return report, &br
	}
	if !wall.AllRefused() {
		report.Verdict = VerdictRed
		br := wallBreachedBlockReason(report)
		return report, &br
	}
	if !fitness.Unchanged {
		report.Verdict = VerdictRed
		br := fitnessMutatedBlockReason(report)
		return report, &br
	}
	report.Verdict = VerdictGreen
	return report, nil
}

// fitnessProbe recomputes Hash(Canonicalize(fitness rows)) (reusing S02 — never
// forked) and compares it to the graven baseline. A row that does not canonicalize
// (malformed) yields an empty current hash that cannot equal the baseline (unchanged
// stays false) — never a panic.
func fitnessProbe(h Harness) FitnessProbe {
	baseline := h.BaselineHash()
	rows := h.FitnessRows()
	canon, err := records.Canonicalize(rows)
	if err != nil {
		return FitnessProbe{BaselineHash: baseline, CurrentHash: "", Unchanged: false}
	}
	current := records.Hash(canon)
	return FitnessProbe{
		BaselineHash: baseline,
		CurrentHash:  current,
		Unchanged:    current == baseline,
	}
}
