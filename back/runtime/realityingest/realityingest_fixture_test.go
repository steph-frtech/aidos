// S106 fixture mirror — the state→command→events proof of the EXTERNAL-LOOP INGESTION
// (ROADMAP-app-builder §S106, KRD §53/§67/§117/§1099): a deployed app's prod OpenTelemetry
// DIVERGENCE becomes a project-scoped RealityMirror (provenance=incident) → a DRAFT idea
// whose TEXT is a deterministic TEMPLATE projection, and reality NEVER writes truth.
//
// mirror record: reflects=realityingest "out-of-stock-during-checkout (prod)" ·
//
//	test_kind=fixture · cert_language=fixture · authority=above · liveness=alive
//
// The canonical S106 done cases are: (a) a 30%-error telemetry divergence on createOrder in
// project "shop-42" produces a RealityMirror with provenance=incident and the template text;
// (b) prod within the mirror's promise produces NO idea; (c) the direct Reality→Kernel edge
// is ALWAYS refused. This fixture is a MEANS-test toward the human/reality red, not a truth.
package realityingest_test

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/realityingest"
)

// outOfStockReport is the canonical S106 prod telemetry: createOrder fails 30% of the time
// (300 of 1000 calls) because items go out-of-stock between add-to-cart and pay — a case no
// fixture covered. expectation: the mirror "createOrder-succeeds" promises 0 errors.
func outOfStockReport() (realityingest.TelemetryReport, realityingest.MirrorExpectation) {
	return realityingest.TelemetryReport{
			Operation: "createOrder",
			Calls:     1000,
			Errors:    300,
			P99Ms:     220,
		}, realityingest.MirrorExpectation{
			MirrorRef:    "createOrder-succeeds",
			Operation:    "createOrder",
			MaxErrorRate: 0,
			MaxP99Ms:     500,
		}
}

// Scenario 1 — THE done case (a): a telemetry divergence of a mirror produces a RealityMirror
// with provenance=incident (ROADMAP §S106 done-criterion).
func TestFixture_Divergence_ProducesRealityMirrorWithIncidentProvenance(t *testing.T) {
	report, exp := outOfStockReport()

	div, err := realityingest.DetectDivergence("shop-42", report, exp)
	if err != nil {
		t.Fatalf("DetectDivergence: %v", err)
	}
	if div == nil {
		t.Fatal("a 30 percent error report against a 0-tolerance mirror MUST diverge (got nil)")
	}
	if div.Kind != realityingest.DivergenceErrorRate {
		t.Errorf("divergence kind: got %q want error_rate", div.Kind)
	}
	if div.ProjectID != "shop-42" {
		t.Errorf("divergence must be project-scoped: got project %q", div.ProjectID)
	}
	if div.Observed != 0.30 {
		t.Errorf("observed error rate: got %v want 0.30", div.Observed)
	}

	rec, err := realityingest.ToRealityMirror(*div)
	if err != nil {
		t.Fatalf("ToRealityMirror: %v", err)
	}
	if rec.ProjectID != "shop-42" {
		t.Errorf("RealityMirror must be project-scoped: got %q", rec.ProjectID)
	}
	// It is reality (incident_derived taint), never truth.
	if !containsTaint(rec.Incident.Taint, firewall.TaintIncidentDerived) {
		t.Errorf("RealityMirror must carry the incident_derived taint: %v", rec.Incident.Taint)
	}

	draft, err := realityingest.ToDraftIdea(rec)
	if err != nil {
		t.Fatalf("ToDraftIdea: %v", err)
	}
	// provenance = incident (the S106 done-criterion).
	if draft.Idea.Provenance.Source != ideas.ProvenanceIncident {
		t.Errorf("draft idea provenance source must be incident: got %q", draft.Idea.Provenance.Source)
	}
	if draft.Idea.Provenance.Detail != div.ID {
		t.Errorf("provenance detail must carry the divergence id verbatim: got %q want %q",
			draft.Idea.Provenance.Detail, div.ID)
	}
	if draft.Idea.Status != ideas.StatusDraft {
		t.Errorf("idea must be a draft: %q", draft.Idea.Status)
	}
	if draft.WroteKernel {
		t.Error("ingestion must NOT write the kernel (promotion is the /goal flow)")
	}
}

// Scenario 2 — the idea TEXT is the deterministic TEMPLATE projection: it names the gap
// (mirror, operation, observed vs expected, traffic) verbatim — NEVER an LLM summary.
func TestFixture_IdeaText_IsDeterministicTemplate(t *testing.T) {
	report, exp := outOfStockReport()
	div, err := realityingest.DetectDivergence("shop-42", report, exp)
	if err != nil || div == nil {
		t.Fatalf("DetectDivergence: %v (div=%v)", err, div)
	}

	text := realityingest.RenderIdeaText(*div)

	for _, want := range []string{
		"createOrder-succeeds", // the mirror
		"shop-42",              // the project scope
		"createOrder",          // the operation
		"30.0%",                // observed, fixed-precision (byte-stable)
		"0.0%",                 // expected
		"1000 calls",           // the traffic / evidence weight
		"incomplete by omission",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("template text must name %q; got:\n%s", want, text)
		}
	}

	// Determinism: rendering the SAME divergence twice is byte-identical (no LLM, no clock).
	if again := realityingest.RenderIdeaText(*div); again != text {
		t.Errorf("RenderIdeaText is not deterministic:\n a=%s\n b=%s", text, again)
	}
}

// Scenario 3 — prod WITHIN the mirror's promise produces NO idea (no divergence ⇒ nothing
// learned; reality never invents a truth from a healthy app).
func TestFixture_WithinPromise_ProducesNoIdea(t *testing.T) {
	_, exp := outOfStockReport()
	healthy := realityingest.TelemetryReport{Operation: "createOrder", Calls: 1000, Errors: 0, P99Ms: 220}

	div, err := realityingest.DetectDivergence("shop-42", healthy, exp)
	if err != nil {
		t.Fatalf("DetectDivergence: %v", err)
	}
	if div != nil {
		t.Errorf("a healthy report within the mirror's promise must NOT diverge: %+v", div)
	}

	draft, err := realityingest.Ingest("shop-42", healthy, exp)
	if err != nil {
		t.Fatalf("Ingest: %v", err)
	}
	if draft != nil {
		t.Errorf("a healthy report must produce NO draft idea: %+v", draft)
	}
}

// Scenario 4 — the direct Reality → Kernel edge is ALWAYS refused at the wall (reality never
// writes truth; the only door is idea → mirror → /goal → approval).
func TestFixture_RealityNeverWritesTruth(t *testing.T) {
	report, exp := outOfStockReport()
	draft, err := realityingest.Ingest("shop-42", report, exp)
	if err != nil {
		t.Fatalf("Ingest: %v", err)
	}
	if draft == nil {
		t.Fatal("the divergence must produce a draft")
	}
	if draft.WroteKernel {
		t.Error("Ingest must NOT write the kernel")
	}
	if draft.ToKernelRefusal == nil {
		t.Fatal("the direct Reality → Kernel edge must be refused (got nil — a kernel write would occur)")
	}
	if string(draft.ToKernelRefusal.Code) != "REALITY_CANNOT_DECLARE_TRUTH" {
		t.Errorf("refusal code: got %q want REALITY_CANNOT_DECLARE_TRUTH", draft.ToKernelRefusal.Code)
	}
	if len(draft.ToKernelRefusal.HowToFix) == 0 {
		t.Error("a BlockReason with an empty how_to_fix is a prison (forbidden)")
	}
}

// Scenario 5 — project scope is part of the content address: the SAME divergence in two
// projects yields TWO distinct records (multi-tenant isolation, S55).
func TestFixture_ProjectScope_IsPartOfTheAddress(t *testing.T) {
	report, exp := outOfStockReport()
	a, err := realityingest.DetectDivergence("shop-42", report, exp)
	if err != nil || a == nil {
		t.Fatalf("DetectDivergence A: %v", err)
	}
	b, err := realityingest.DetectDivergence("shop-99", report, exp)
	if err != nil || b == nil {
		t.Fatalf("DetectDivergence B: %v", err)
	}
	if a.ID == b.ID {
		t.Errorf("identical divergences in different projects must NOT collapse to one address: %q", a.ID)
	}
}

func containsTaint(ts []firewall.Taint, want firewall.Taint) bool {
	for _, t := range ts {
		if t == want {
			return true
		}
	}
	return false
}
