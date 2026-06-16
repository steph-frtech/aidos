package requirementbench

// multimodal_dg05_fixture_test.go — DG05 fixtures: the multimodal panel's shape contract, the
// differential surplus a vision reading recovers over a literal recompile reading, and the WALL
// (no truth write — proposed holes ride firewall.ViaIdea, never ToKernel). Always run, HERMETIC: the
// mockup is a DATA representation (zones/fields/actions), never a real image; no network, no clock.
// The real vision model is the infra-gated VisionModel adapter (documented dependency, ADR 0088 DG05).

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
)

// demoMockup is a small checkout-ish screen mockup represented EN DONNÉE: a header (goal), a list
// (data + implied empty state), a form (inputs), and a footer with a primary submit + a cancel — the
// "review the cart then place the order" screen, declared as zones/fields/actions so the attendus are
// mockup-derived. It is NOT a real image binary.
func demoMockup() Mockup {
	return Mockup{
		ID: "checkout-review-mockup",
		Zones: []MockupZone{
			{Kind: ZoneHeader},
			{Kind: ZoneList, Fields: []MockupFieldKind{FieldDisplay, FieldDisplay}},
			{Kind: ZoneForm, Fields: []MockupFieldKind{FieldInput}},
			{Kind: ZoneFooter, Actions: []MockupActionKind{ActionPrimary, ActionSecondary}},
		},
	}
}

// TestMockupProposeDeterministic — the fixture multimodal adapter is byte-for-byte deterministic and
// produces the two differential candidates (single literal + vision lens). No network, no clock.
func TestMockupProposeDeterministic(t *testing.T) {
	mk := demoMockup()
	fm := FixtureMockupModel{}

	c1, err := fm.ProposeViewSpecs(mk)
	if err != nil {
		t.Fatalf("ProposeViewSpecs errored: %v", err)
	}
	if len(c1) != 2 {
		t.Fatalf("fixture mockup model should propose 2 candidates (single/vision), got %d", len(c1))
	}
	wantRoles := []string{"single", "vision"}
	for i, c := range c1 {
		if c.Role != wantRoles[i] {
			t.Fatalf("candidate %d role=%q, want %q", i, c.Role, wantRoles[i])
		}
	}
	c2, _ := fm.ProposeViewSpecs(mk)
	if !reflect.DeepEqual(c1, c2) {
		t.Fatalf("fixture mockup model not deterministic:\n c1=%+v\n c2=%+v", c1, c2)
	}
}

// TestMockupCompletenessMeasuredByDG03 — done-criterion (1): a mockup-fixture produces candidate
// view-specs whose completeness is MEASURED BY DG03 over the zone/field/action requirement TYPES. The
// vision reading covers the mockup's attendus fully; the literal recompile reading misses the
// cross-cutting facets (the empty state of the list, the success/error of the controls) — measured by
// the SAME deterministic judge (Metric), the surplus the multimodal panel reveals.
func TestMockupCompletenessMeasuredByDG03(t *testing.T) {
	mk := demoMockup()
	spec := SpecFromMockup(mk)

	// The attendus (what a complete view-spec from this mockup carries) are mockup-derived TYPES.
	if len(spec.ExpectedKinds) == 0 {
		t.Fatalf("mockup-derived spec must declare expected requirement types")
	}
	// The expected set must carry the zone/field/action facets the mockup draws.
	expectedSet := asSet(spec.ExpectedKinds)
	for _, k := range []RequirementKind{
		KindViewGoal, KindViewData, KindViewEmptyState,
		KindControl, KindControlTrigger, KindActionInvoke,
		KindEntityField,
	} {
		if !expectedSet[k] {
			t.Fatalf("mockup-derived attendus missing the expected facet %q", k)
		}
	}

	// The vision reading via DG03's Metric covers the attendus FULLY (the judge measures completeness).
	repVision, provVision := BenchMockup(FixtureMockupModel{}, mk)
	if provVision.UsedRealLLM {
		t.Fatalf("fixture mockup model must not claim usedRealLLM")
	}
	if provVision.FellBack {
		t.Fatalf("fixture mockup model is available; it must not fall back")
	}
	if repVision.MatchPct != 1.0 {
		t.Fatalf("vision reading must fully cover the mockup attendus, got MatchPct=%v missing=%v",
			repVision.MatchPct, repVision.MissingTypes)
	}
	if len(repVision.MissingTypes) != 0 {
		t.Fatalf("vision reading must leave no holes, got %v", repVision.MissingTypes)
	}

	// The LITERAL recompile reading alone misses the cross-cutting view facets — measured by DG03.
	repLiteral := Metric(spec, MockupRecompileReading(mk))
	if repLiteral.MatchPct >= repVision.MatchPct {
		t.Fatalf("literal reading should under-cover vs the vision reading (no surplus): literal=%v vision=%v",
			repLiteral.MatchPct, repVision.MatchPct)
	}
	literalMissing := asSet(repLiteral.MissingTypes)
	if !literalMissing[KindViewEmptyState] {
		t.Fatalf("literal mockup reading should miss the list's empty_state (the surplus a vision lens recovers); missing=%v",
			repLiteral.MissingTypes)
	}
}

// TestMockupHolesRideFirewallViaIdea — done-criterion (2): NO truth write. The proposed view-spec holes
// reach truth ONLY via firewall.ViaIdea → idea → mirror → /goal — NEVER ToKernel. Every returned
// candidate carries WroteKernel=false and is a DRAFT idea with no mirror.
func TestMockupHolesRideFirewallViaIdea(t *testing.T) {
	mk := demoMockup()
	spec := SpecFromMockup(mk)

	// Run the LITERAL reading so there ARE holes to propose (the vision reading leaves none).
	rep := Metric(spec, MockupRecompileReading(mk))
	if len(rep.MissingTypes) == 0 {
		t.Fatalf("expected the literal reading to leave proposable holes")
	}

	cands, err := ProposeViewSpecIdeas(rep)
	if err != nil {
		t.Fatalf("ProposeViewSpecIdeas errored: %v", err)
	}
	if len(cands) != len(rep.MissingTypes) {
		t.Fatalf("expected one idea per missing type: got %d ideas for %d holes", len(cands), len(rep.MissingTypes))
	}
	for _, c := range cands {
		// The wall: no kernel write, ever — the firewall proves it.
		if c.WroteKernel {
			t.Fatalf("a proposed hole must NOT write the kernel (the wall) — WroteKernel must be false")
		}
		// It is a DRAFT idea (still needs its mirror via /goal) — not a truth. The ideas.Idea type
		// makes a mirror UNREPRESENTABLE (there is no Version, no Mirror field) — that absence is what
		// keeps it a candidate, not a truth (the wall): promotion is the /goal flow, never here.
		if c.Idea.Status != ideas.StatusDraft {
			t.Fatalf("a proposed hole must be a DRAFT idea, got status %q", c.Idea.Status)
		}
		// The intent traces the proposed hole; provenance is human (S27 on-ramp), never a kernel write.
		if c.Idea.Intent == "" {
			t.Fatalf("a proposed-hole idea must carry the intent that traces it")
		}
	}
}

// TestMockupNoToKernelDoor — the wall, explicit: the only door used is ViaIdea; ToKernel is the
// forbidden direct edge and it ALWAYS refuses. We assert the firewall's ToKernel refuses for the same
// memory shape DG05 routes — proving DG05 cannot bypass the wall even if it tried.
func TestMockupNoToKernelDoor(t *testing.T) {
	mem, err := firewall.Capture(firewall.CaptureInput{
		Content:    "mockup completeness hole: spec=x missing requirement type=invariant.forall",
		Provenance: "requirementbench:dg05-mockup:x",
		Confidence: 1.0,
		Taint:      []firewall.Taint{firewall.TaintExternalSource},
	})
	if err != nil {
		t.Fatalf("Capture errored: %v", err)
	}
	// The forbidden direct edge Memory → Kernel ALWAYS returns a BlockReason (never nil, never a write).
	if br := firewall.ToKernel(mem); br == nil {
		t.Fatalf("ToKernel must ALWAYS refuse the direct Memory → Kernel edge (the wall)")
	}
}

// TestMockupAbsentTextOnlyStillUsable — done-criterion (3): the multimodal absent ⇒ the subject stays
// usable on the DG04 TEXT-ONLY differential — no screen error. A broken/absent mockup adapter falls
// back to the governed literal reading (BenchMockup never errors), AND the independent DG04 text-only
// BenchVia path still produces a valid report. The two panels are independent.
func TestMockupAbsentTextOnlyStillUsable(t *testing.T) {
	mk := demoMockup()

	// (a) The multimodal panel degrades gracefully when the vision adapter is absent.
	rep, prov := BenchMockup(brokenMockupModel{}, mk)
	if prov.UsedRealLLM {
		t.Fatalf("absent vision model must report usedRealLLM=false")
	}
	if !prov.FellBack {
		t.Fatalf("absent vision model must fall back (governed degradation, no screen error)")
	}
	wantFallback := Metric(SpecFromMockup(mk), MockupRecompileReading(mk))
	if !reflect.DeepEqual(rep, wantFallback) {
		t.Fatalf("fallback report != literal-reading metric:\n got=%+v\n want=%+v", rep, wantFallback)
	}

	// (b) The DG04 TEXT-ONLY differential is fully usable with NO mockup at all — the subject is not
	// blocked by the multimodal panel being absent.
	textSpec := demoSpec() // the DG04 text declared spec
	textRep, textProv := BenchVia(FixtureModel{}, textSpec)
	if textProv.UsedRealLLM {
		t.Fatalf("text-only fixture path must not claim usedRealLLM")
	}
	if textRep.MatchPct < 0 || textRep.MatchPct > 1 {
		t.Fatalf("text-only report MatchPct out of [0,1]: %v", textRep.MatchPct)
	}
	t.Logf("DG05 hermetic: multimodal absent -> literal fallback (matchPct=%.2f); text-only DG04 still usable (matchPct=%.2f)",
		rep.MatchPct, textRep.MatchPct)
}

// brokenMockupModel is an UNAVAILABLE multimodal adapter — ProposeViewSpecs errors and Available is
// false. It stands for "the real vision weights/GPU are absent": BenchMockup must fall back, never error.
type brokenMockupModel struct{}

func (brokenMockupModel) ProposeViewSpecs(_ Mockup) ([]LLMOutput, error) {
	return nil, errVisionUnavailable
}
func (brokenMockupModel) Available() bool { return false }
func (brokenMockupModel) Name() string    { return "broken-vision" }

// errVisionUnavailable mirrors the DG04 sentinel for the governed fallback trigger.
var errVisionUnavailable = &visionUnavailableError{}

type visionUnavailableError struct{}

func (*visionUnavailableError) Error() string {
	return "vision model unavailable (no weights/GPU): governed fallback to literal mockup reading"
}
