package selftest

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// fakeHarness is the deterministic in-process fault adapter the fixture mirror drives:
// a tiny, reproducible, rollback-clean harness whose three faculties (sensors, wall,
// fitness) are configured per scenario. It is NOT the production harness (that wires
// the real S07 sensors / S04 wall via pgx); it is the test double that lets the fixture
// interpreter cover every guarantee without a database.
type fakeHarness struct {
	sensors       []string
	mutedSensor   map[string]bool // sensor id -> did NOT fire (a muted/dead guardrail)
	breached      map[string]bool // schema -> agent write ACCEPTED (the wall did not refuse)
	fitnessRows   []byte
	baselineHash  string
	fitnessWrites *int // incremented if Run ever writes the fitness (must stay 0)
}

func (h *fakeHarness) SensorInventory() []string { return h.sensors }

func (h *fakeHarness) ProbeSensor(id string) (string, bool) {
	fired := !h.mutedSensor[id]
	return "redden " + id + ": forbidden import injected", fired
}

func (h *fakeHarness) ProbeWall(schema string) (string, bool) {
	refused := !h.breached[schema]
	return "INSERT into " + schema + ".* as aidos_agent", refused
}

func (h *fakeHarness) FitnessRows() []byte { return h.fitnessRows }

func (h *fakeHarness) BaselineHash() string { return h.baselineHash }

// baselineFitness is the graven NIVEAU 3 baseline rows the healthy fixture uses; its
// content-hash (S02) is the baseline the fitness probe compares against.
var baselineFitness = []byte(`{"waterline":{"above":["kernel","mirrors","fitness"],"below":["runtime","gen"]},"definition_of_passed":"red_set_green AND prior_green_intact AND mutation_ge_threshold AND no_monster"}`)

func baselineHashOf(rows []byte) string {
	canon, err := records.Canonicalize(rows)
	if err != nil {
		panic(err)
	}
	return records.Hash(canon)
}

func healthyHarness() *fakeHarness {
	return &fakeHarness{
		sensors:      []string{"gofmt", "vet", "lint", "archtest", "affected"},
		mutedSensor:  map[string]bool{},
		breached:     map[string]bool{},
		fitnessRows:  baselineFitness,
		baselineHash: baselineHashOf(baselineFitness),
	}
}

const at = "2026-06-01T00:00:00Z"

// THE done criterion: a healthy harness passes the self-test (all guarantees hold).
func TestFixtureHealthyHarnessPassesSelfTest(t *testing.T) {
	report, br := Run(healthyHarness(), at)
	if br != nil {
		t.Fatalf("healthy harness must NOT block, got BlockReason %s", br.Code)
	}
	if report.Verdict != VerdictGreen {
		t.Fatalf("verdict = %q, want green", report.Verdict)
	}
	if !report.AllSensorsFired() {
		t.Fatalf("every sensor must have fired: %+v", report.SensorsChecked)
	}
	if report.SensorsFired() != 5 || report.SensorsTotal() != 5 {
		t.Fatalf("sensors fired %d/%d, want 5/5", report.SensorsFired(), report.SensorsTotal())
	}
	// The wall holds on kernel AND mirrors AND fitness.
	got := map[string]bool{}
	for _, a := range report.WallProbe.Attempts {
		got[a.Schema] = a.Refused
	}
	for _, s := range []string{SchemaKernel, SchemaMirrors, SchemaFitness} {
		if !got[s] {
			t.Fatalf("wall must refuse the agent write on %q", s)
		}
	}
	if !report.WallProbe.AllRefused() {
		t.Fatal("wall_probe.AllRefused must be true")
	}
	// The fitness is immutable.
	if !report.FitnessProbe.Unchanged {
		t.Fatalf("fitness must be unchanged: %+v", report.FitnessProbe)
	}
	if report.FitnessProbe.CurrentHash != report.FitnessProbe.BaselineHash {
		t.Fatal("current_hash must equal baseline_hash")
	}
	if report.At != at {
		t.Fatalf("at = %q, want %q (passed in, not time.Now)", report.At, at)
	}
}

// A muted sensor reddens the self-test (a guardrail was removed).
func TestFixtureMutedSensorReddens(t *testing.T) {
	h := healthyHarness()
	h.mutedSensor["archtest"] = true // archtest stays green on injected breakage = dead

	report, br := Run(h, at)
	if report.Verdict != VerdictRed {
		t.Fatalf("verdict = %q, want red", report.Verdict)
	}
	if br == nil || br.Code != CodeMutedSensor {
		t.Fatalf("BlockReason code = %v, want MUTED_SENSOR", br)
	}
	if len(br.HowToFix) == 0 {
		t.Fatal("BlockReason.how_to_fix must be non-empty (no prison)")
	}
	// archtest is the one that did not fire.
	for _, s := range report.SensorsChecked {
		if s.SensorID == "archtest" && s.Fired {
			t.Fatal("archtest must report fired == false")
		}
	}
}

// A breached wall reddens the self-test (the agent could write truth).
func TestFixtureBreachedWallReddens(t *testing.T) {
	h := healthyHarness()
	h.breached[SchemaKernel] = true // agent gained INSERT on kernel

	report, br := Run(h, at)
	if report.Verdict != VerdictRed {
		t.Fatalf("verdict = %q, want red", report.Verdict)
	}
	if br == nil || br.Code != CodeWallBreached {
		t.Fatalf("BlockReason code = %v, want WALL_BREACHED", br)
	}
	if report.WallProbe.AllRefused() {
		t.Fatal("wall_probe.AllRefused must be false when kernel is breached")
	}
	for _, a := range report.WallProbe.Attempts {
		if a.Schema == SchemaKernel && a.Refused {
			t.Fatal("kernel attempt must report refused == false")
		}
	}
}

// A mutated fitness reddens the self-test (a loop edited its own fitness — cardinal sin).
func TestFixtureMutatedFitnessReddens(t *testing.T) {
	h := healthyHarness()
	h.fitnessRows = []byte(`{"definition_of_passed":"anything I declare green","waterline":{"above":[],"below":["everything"]}}`)

	report, br := Run(h, at)
	if report.Verdict != VerdictRed {
		t.Fatalf("verdict = %q, want red", report.Verdict)
	}
	if br == nil || br.Code != CodeFitnessMutated {
		t.Fatalf("BlockReason code = %v, want FITNESS_MUTATED", br)
	}
	if report.FitnessProbe.Unchanged {
		t.Fatal("fitness_probe.unchanged must be false")
	}
	if report.FitnessProbe.CurrentHash == report.FitnessProbe.BaselineHash {
		t.Fatal("current_hash must differ from baseline_hash")
	}
}

// The self-test never writes the fitness it checks (read-only).
func TestFixtureSelfTestIsReadOnlyOnFitness(t *testing.T) {
	h := healthyHarness()
	before := string(h.FitnessRows())
	_, _ = Run(h, at)
	after := string(h.FitnessRows())
	if before != after {
		t.Fatal("fitness rows must be byte-identical before and after Run (read-only checker)")
	}
}

// A malformed harness (empty sensor inventory) yields a BlockReason, never a panic.
func TestFixtureMalformedHarnessBlocksNoPanic(t *testing.T) {
	h := healthyHarness()
	h.sensors = nil // missing sensor inventory

	report, br := Run(h, at)
	if br == nil {
		t.Fatal("a malformed harness must yield a BlockReason")
	}
	if br.Code != CodeMutedSensor {
		t.Fatalf("empty inventory BlockReason code = %v, want MUTED_SENSOR", br.Code)
	}
	if report.Verdict != VerdictRed {
		t.Fatalf("verdict = %q, want red", report.Verdict)
	}
}

// The self-test BlockReason shape is the S13 shape (code/severity/explanation/how_to_fix).
func TestFixtureBlockReasonShapeIsS13(t *testing.T) {
	br := mutedSensorBlockReason(SelfTestReport{SensorsChecked: []SensorProbe{{SensorID: "x", Fired: false}}})
	if br.Severity != blockreason.SeverityBlocking {
		t.Fatalf("severity = %q, want blocking", br.Severity)
	}
	if br.Explanation == "" || len(br.HowToFix) == 0 {
		t.Fatal("explanation + how_to_fix must be present (KRD §44.5)")
	}
}
