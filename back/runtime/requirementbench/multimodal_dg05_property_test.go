package requirementbench

// multimodal_dg05_property_test.go — DG05's CONTRACT mirror (invariant ∀): the multimodal panel behind
// the RequirementBench port is re-judged by the DETERMINISTIC DG03 metric, and the JUDGE DOMINATES the
// (vision) model. Written RED-first (the done-criterion of DG05) and HERMETIC: every property runs on
// the deterministic FixtureMockupModel — the mockup is a DATA representation (zones/fields/actions),
// NO real image, NO network — so the guarantee rests on pure code. The real vision model is the
// infra-gated VisionModel adapter (documented dependency, ADR 0088 addendum DG05); it never enters the
// mirror.
//
// The properties proven (mapping the DG05 done-criteria, ROADMAP-diffusiongemma.md):
//
//  1. COMPLETENESS MEASURED BY DG03. A mockup-fixture produces candidate view-specs whose completeness
//     is the SAME pure Metric over the zone/field/action requirement TYPES — BenchMockup == Metric over
//     the produced candidates. The metric is the judge; the adapter only proposes Text.
//  2. JUDGE DOMINATES MODALITY IDENTITY. Two DIFFERENT mockup adapters emitting the SAME candidate
//     Texts yield the SAME report byte-for-byte. The modality/identity never influences the count.
//  3. NO TRUTH WRITE (the wall). Every proposed hole routed by ProposeViewSpecIdeas carries
//     WroteKernel=false and is a DRAFT idea — the holes ride firewall.ViaIdea → idea → /goal, never
//     ToKernel. The vision reading leaves no holes (full coverage of its own attendus); the literal
//     reading's holes are exactly the cross-cutting facets it misses, each routed as a draft idea.
//  4. MULTIMODAL ABSENT ⇒ GOVERNED FALLBACK. An unavailable vision adapter NEVER errors: BenchMockup
//     falls back to the deterministic literal reading, usedRealLLM=false. The subject stays usable.
//  5. AI OFF ⇒ REPLAY STAYS GREEN. With the AI off (FixtureMockupModel), the report is byte-for-byte
//     reproducible across 100 replays — the reproducibility mirror holds with zero network.

import (
	"reflect"
	"testing"

	"pgregory.net/rapid"
)

// genMockup draws a random mockup represented EN DONNÉE (declared zones, each with random fields and
// actions). NO image — pure data, so the mirror exercises mockup-derived attendus deterministically.
func genMockup(t *rapid.T) Mockup {
	zoneKindsPool := []MockupZoneKind{ZoneHeader, ZoneList, ZoneDetail, ZoneFooter, ZoneForm}
	fieldPool := []MockupFieldKind{FieldDisplay, FieldInput}
	actionPool := []MockupActionKind{ActionPrimary, ActionSecondary}

	nZones := rapid.IntRange(0, 4).Draw(t, "nZones")
	zones := make([]MockupZone, 0, nZones)
	for i := 0; i < nZones; i++ {
		zk := zoneKindsPool[rapid.IntRange(0, len(zoneKindsPool)-1).Draw(t, "zoneKind")]
		nFields := rapid.IntRange(0, 3).Draw(t, "nFields")
		fields := make([]MockupFieldKind, 0, nFields)
		for j := 0; j < nFields; j++ {
			fields = append(fields, fieldPool[rapid.IntRange(0, len(fieldPool)-1).Draw(t, "field")])
		}
		nActions := rapid.IntRange(0, 2).Draw(t, "nActions")
		actions := make([]MockupActionKind, 0, nActions)
		for j := 0; j < nActions; j++ {
			actions = append(actions, actionPool[rapid.IntRange(0, len(actionPool)-1).Draw(t, "action")])
		}
		zones = append(zones, MockupZone{Kind: zk, Fields: fields, Actions: actions})
	}
	return Mockup{ID: rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "id"), Zones: zones}
}

// staticMockupModel is a SECOND deterministic mockup adapter whose ProposeViewSpecs returns a FIXED
// slice of outputs — used to prove the report is invariant to which adapter produced identical Texts.
type staticMockupModel struct {
	outputs []LLMOutput
}

func (m staticMockupModel) ProposeViewSpecs(_ Mockup) ([]LLMOutput, error) { return m.outputs, nil }
func (m staticMockupModel) Available() bool                                { return true }
func (m staticMockupModel) Name() string                                   { return "static-mockup" }

// TestMockupCompletenessIsDG03Metric — property (1): BenchMockup's report is exactly the pure DG03
// Metric over the candidates the adapter produced — the judge is the metric; the adapter only proposes.
func TestMockupCompletenessIsDG03Metric(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		mk := genMockup(t)
		fm := FixtureMockupModel{}
		cands, err := fm.ProposeViewSpecs(mk)
		if err != nil {
			t.Fatalf("ProposeViewSpecs errored: %v", err)
		}
		rep, prov := BenchMockup(fm, mk)
		if prov.UsedRealLLM {
			t.Fatalf("fixture mockup model must never use the real LLM")
		}
		want := Metric(SpecFromMockup(mk), cands)
		if !reflect.DeepEqual(rep, want) {
			t.Fatalf("judge not authoritative — BenchMockup != Metric:\n got=%+v\n want=%+v", rep, want)
		}
		// Every present type is one Extract genuinely re-surfaces from a candidate Text (judge re-judges).
		reExtract := map[RequirementKind]bool{}
		for _, c := range cands {
			for _, k := range Extract(c.Text) {
				reExtract[k] = true
			}
		}
		for _, p := range rep.PresentTypes {
			if !reExtract[p] {
				t.Fatalf("report claims present type %q that Extract does not re-surface (judge bypassed)", p)
			}
		}
		// MatchPct is a real value in [0,1].
		if rep.MatchPct < 0 || rep.MatchPct > 1 {
			t.Fatalf("MatchPct out of [0,1]: %v", rep.MatchPct)
		}
	})
}

// TestMockupJudgeDominatesModalityIdentity — property (2): the report is INVARIANT to the adapter's
// identity. Two DIFFERENT mockup adapters emitting the SAME candidate Texts produce the SAME report.
func TestMockupJudgeDominatesModalityIdentity(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		mk := genMockup(t)
		fm := FixtureMockupModel{}
		cands, err := fm.ProposeViewSpecs(mk)
		if err != nil {
			t.Fatalf("ProposeViewSpecs errored: %v", err)
		}
		repA, provA := BenchMockup(fm, mk)
		repB, provB := BenchMockup(staticMockupModel{outputs: cands}, mk)
		if provA.UsedRealLLM || provB.UsedRealLLM {
			t.Fatalf("expected usedRealLLM=false on deterministic adapters")
		}
		if !reflect.DeepEqual(repA, repB) {
			t.Fatalf("report not invariant to modality identity:\n A=%+v\n B=%+v", repA, repB)
		}
	})
}

// TestMockupHolesNeverWriteTruth — property (3): NO truth write. Every proposed hole carries
// WroteKernel=false and is a DRAFT idea (rides firewall.ViaIdea, never ToKernel). Proven over the
// literal reading's holes (which are the cross-cutting facets the vision lens recovers).
func TestMockupHolesNeverWriteTruth(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		mk := genMockup(t)
		spec := SpecFromMockup(mk)
		rep := Metric(spec, MockupRecompileReading(mk))

		cands, err := ProposeViewSpecIdeas(rep)
		if err != nil {
			t.Fatalf("ProposeViewSpecIdeas errored: %v", err)
		}
		if len(cands) != len(rep.MissingTypes) {
			t.Fatalf("expected one idea per missing type: %d ideas for %d holes", len(cands), len(rep.MissingTypes))
		}
		for _, c := range cands {
			if c.WroteKernel {
				t.Fatalf("a proposed hole must NOT write the kernel (the wall)")
			}
			if c.Idea.Intent == "" {
				t.Fatalf("a proposed-hole idea must carry its tracing intent")
			}
		}
		// The vision reading covers its own attendus fully ⇒ no holes proposed (the surplus is recovered).
		visionRep := Metric(spec, []LLMOutput{
			{Role: "vision", Text: mockupTaggedText(mk, true)},
		})
		visionIdeas, err := ProposeViewSpecIdeas(visionRep)
		if err != nil {
			t.Fatalf("ProposeViewSpecIdeas (vision) errored: %v", err)
		}
		if len(visionIdeas) != 0 {
			t.Fatalf("the vision reading should leave no holes, got %d proposed ideas", len(visionIdeas))
		}
	})
}

// TestMockupAbsentGovernedFallback — property (4): an unavailable vision adapter NEVER errors;
// BenchMockup falls back to the deterministic literal reading, usedRealLLM=false.
func TestMockupAbsentGovernedFallback(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		mk := genMockup(t)
		rep, prov := BenchMockup(brokenMockupModel{}, mk)
		if prov.UsedRealLLM {
			t.Fatalf("a broken/absent vision model must not claim usedRealLLM=true")
		}
		if !prov.FellBack {
			t.Fatalf("a broken/absent vision model must mark FellBack=true (governed degradation)")
		}
		want := Metric(SpecFromMockup(mk), MockupRecompileReading(mk))
		if !reflect.DeepEqual(rep, want) {
			t.Fatalf("fallback report != literal-reading metric:\n got=%+v\n want=%+v", rep, want)
		}
		if rep.MatchPct < 0 || rep.MatchPct > 1 {
			t.Fatalf("fallback MatchPct out of [0,1]: %v", rep.MatchPct)
		}
	})
}

// TestMockupAIOffReplayStaysGreen — property (5): with the AI off (FixtureMockupModel), the report is
// byte-for-byte reproducible across 100 replays, zero network.
func TestMockupAIOffReplayStaysGreen(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		mk := genMockup(t)
		first, prov := BenchMockup(FixtureMockupModel{}, mk)
		if prov.UsedRealLLM {
			t.Fatalf("fixture mockup model must never use the real LLM")
		}
		for i := 0; i < 100; i++ {
			again, _ := BenchMockup(FixtureMockupModel{}, mk)
			if !reflect.DeepEqual(first, again) {
				t.Fatalf("AI-off replay %d non-reproducible:\n first=%+v\n again=%+v", i, first, again)
			}
		}
	})
}
