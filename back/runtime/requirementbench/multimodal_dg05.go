// multimodal_dg05.go — DG05: the MULTIMODAL panel behind the SAME RequirementBench port. Where
// markitdown is the doc→markdown ingestion frontier (ADR 0039) and DG04's ModelAdapter is the
// text→requirements differential, DG05 is the image-mockup→view-specs frontier: a MockupAdapter
// PROPOSES candidate view-spec outputs from a MOCKUP, and the port's pure DG03 judge ALWAYS re-judges
// that Text into a CompletenessReport before ANY use. The completeness is measured on the SAME closed
// taxonomy — here the view/control/action facets a mockup can carry (zone / field / action) — so a
// mockup's coverage is a COUNT of requirement TYPES, never a quality judgement of a generated screen.
//
// MODALITY-AGNOSTIC (the DG04 ModelAdapter analogue). A ModelAdapter maps a Spec → []LLMOutput; a
// MockupAdapter maps a Mockup → []LLMOutput. Both feed the IDENTICAL pure judge (Derive/Metric). The
// real vision model (a Gemma-vision / DiffusionGemma-multimodal that reads a real PNG) wires in as
// JUST ANOTHER MockupAdapter (a VisionModel implementing ProposeViewSpecs), behind THIS same port,
// re-judged by THIS same metric. It is a documented INFRA dependency (ADR 0088 addendum DG05, ADR
// 0079/0039): the real vision weights/GPU are NOT guaranteed here, so the contract is proven with a
// DETERMINISTIC FixtureMockup — a mockup represented EN DONNÉE (declared zones/fields/actions), never
// a real image binary. A real image never enters this package; the fixture is the door.
//
// THE WALL (CLAUDE.md §2). Everything here is READ-ONLY and below the line. A MockupAdapter PROPOSES
// Text; BenchMockup DERIVES a value report. NO DB, no truth-store, no write to kernel/mirrors/fitness,
// no clock, no rng, never panics. The report's MissingTypes are PROPOSED view-spec holes — they reach
// truth ONLY via firewall.ViaIdea → idea → mirror → /goal, NEVER ToKernel. ProposeViewSpecIdeas routes
// each proposed hole through that single legal door and returns WroteKernel=false. The deterministic
// completeness law stays authoritative (ADR 0072): the multimodal panel proposes, it never governs.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The mockup is a DATA representation, the fixture adapter is a
// pure mapping (mockup → tagged view-spec lines), and the judge is the pure Extract/Derive — same
// (mockup) → same candidates → same report (the reproducibility mirror replays it 100×). The LLM /
// vision model is the GATED EXCEPTION confined to VisionModel.ProposeViewSpecs; its Text is ALWAYS
// re-judged by Extract before any use. Multimodal absent ⇒ the subject stays usable on the DG04
// text-only differential — a governed degradation, never a screen error.
package requirementbench

import (
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
)

// MockupZoneKind is the CLOSED set of layout-zone roles a mockup can declare. It maps deterministically
// onto the view facets of the taxonomy (taxonomy.go) — a mockup is read as STRUCTURE (zones), never as
// pixels here. Declared above the line (§8), never learned, never expanded by a model.
type MockupZoneKind string

const (
	// ZoneHeader is a header/title zone — it carries the screen's reason-to-exist (view.goal).
	ZoneHeader MockupZoneKind = "header"
	// ZoneList is a list/collection zone — it displays data (view.displayed) and implies an
	// empty/zero state (view.empty_state), the facet a happy-path recompile most often misses.
	ZoneList MockupZoneKind = "list"
	// ZoneDetail is a detail/record zone — it displays data fields (view.displayed).
	ZoneDetail MockupZoneKind = "detail"
	// ZoneFooter is a footer/actions zone — a layout zone (view.zone) that hosts controls.
	ZoneFooter MockupZoneKind = "footer"
	// ZoneForm is a form/input zone — it displays editable fields (view.displayed) and binds inputs.
	ZoneForm MockupZoneKind = "form"
)

// MockupFieldKind is the CLOSED set of field roles a mockup zone can declare. Each maps onto a view /
// entity facet (a displayed datum, an entity field). Declared above the line, never learned.
type MockupFieldKind string

const (
	// FieldDisplay is a read-only displayed datum (view.displayed + entity.field).
	FieldDisplay MockupFieldKind = "display"
	// FieldInput is an editable input bound to an entity field (view.displayed + entity.field).
	FieldInput MockupFieldKind = "input"
)

// MockupActionKind is the CLOSED set of action/control roles a mockup can declare (a button drawn on
// the mockup). Each maps onto a control/action facet. Declared above the line, never learned.
type MockupActionKind string

const (
	// ActionPrimary is a primary button — it exists (control.exists), binds to an action
	// (control.triggers), and invokes an operation (action.invoke).
	ActionPrimary MockupActionKind = "primary"
	// ActionSecondary is a secondary/cancel button — it exists (control.exists) and binds
	// (control.triggers); cancel hints an on_error path (action.on_error).
	ActionSecondary MockupActionKind = "secondary"
)

// MockupZone is ONE declared zone of a mockup — its role plus the fields and actions drawn inside it.
// This is the DATA representation of a mockup region (a designer's frame), never a raster. Declared
// above the line; a model never expands a zone's contents (the wall — the human owns the mockup truth).
type MockupZone struct {
	Kind    MockupZoneKind
	Fields  []MockupFieldKind
	Actions []MockupActionKind
}

// Mockup is the DETERMINISTIC, modality-agnostic representation of a screen mockup EN DONNÉE: an id +
// the declared zones (each with its fields/actions). It is NOT a real image binary — the real vision
// model that reads a PNG is the infra-gated VisionModel adapter (documented dependency). A Mockup is
// pure data fed to a pure function; the judge counts the requirement TYPES it surfaces.
type Mockup struct {
	ID    string
	Zones []MockupZone
}

// MockupAdapter is the DG05 seam — the MULTIMODAL analogue of DG04's ModelAdapter. ProposeViewSpecs
// maps a Mockup to the candidate view-spec outputs the bench compares (the recompile-only literal
// reading + ≥1 lensed reading). Available reports whether the adapter can actually produce (a real
// vision model with no weights/GPU reports false ⇒ governed fallback to the literal reading). Name is
// an opaque identity the bench NEVER lets influence the report (the judge dominates identity).
//
// The real vision model plugs in here as just another MockupAdapter — modality-agnostic by construction.
type MockupAdapter interface {
	// ProposeViewSpecs returns candidate view-spec outputs for the mockup. TOTAL (never panics). An
	// adapter that cannot produce returns (nil, err); BenchMockup then falls back deterministically.
	ProposeViewSpecs(mockup Mockup) ([]LLMOutput, error)
	// Available reports whether the adapter can produce without falling back (vision weights present).
	Available() bool
	// Name is the opaque identity of the adapter — display only; the report is invariant to it.
	Name() string
}

// FixtureMockupModel is the DETERMINISTIC, network-free multimodal adapter (the hermetic mirror's
// vision model). ProposeViewSpecs derives candidate view-spec outputs PURELY from the mockup's declared
// zones/fields/actions: a "single" literal reading (what a deterministic recompile of the mockup
// projects — the zones/fields/actions drawn) + a "vision" lens that additionally surfaces the
// cross-cutting view facets a literal reading misses (empty states for lists, the on_error of a cancel
// control). NO network, no clock, no rng — the reproducibility mirror replays it 100×.
type FixtureMockupModel struct{}

// statically assert FixtureMockupModel satisfies the multimodal adapter contract.
var _ MockupAdapter = FixtureMockupModel{}

func (FixtureMockupModel) Available() bool { return true }
func (FixtureMockupModel) Name() string    { return "fixture-mockup" }

// ProposeViewSpecs builds two deterministic candidates from the mockup's declared structure: a
// "single" literal reading and a "vision" lens. PURE: the same mockup yields the same candidate Texts
// (the kinds are emitted in canonical taxonomy order using the same closed marker vocabulary Extract
// parses), so the whole multimodal panel is reproducible. It never errors.
func (FixtureMockupModel) ProposeViewSpecs(mockup Mockup) ([]LLMOutput, error) {
	return []LLMOutput{
		{Role: "single", Text: mockupTaggedText(mockup, false)},
		{Role: "vision", Text: mockupTaggedText(mockup, true)},
	}, nil
}

// MockupRecompileReading is the DETERMINISTIC "lecture littérale" of a mockup — the single-candidate
// baseline a deterministic recompile of the mockup projects, with NO vision model. It re-states exactly
// the zones/fields/actions drawn, surfacing NONE of the cross-cutting facets a vision lens infers. This
// is the floor BenchMockup falls back to when an adapter is absent, AND a valid one-candidate baseline.
// PURE, never errors, exported so the mirror can pin the fallback contract directly.
func MockupRecompileReading(mockup Mockup) []LLMOutput {
	return []LLMOutput{{Role: "single", Text: mockupTaggedText(mockup, false)}}
}

// zoneKinds maps a mockup zone to the requirement TYPES it surfaces. The literal reading (vision=false)
// surfaces only the directly-drawn facets; the vision lens (vision=true) additionally infers the
// cross-cutting view facets a literal reading misses (a list zone implies an empty state). DECLARED
// above the line, never learned. The mapping never invents a type the mockup doesn't declare (the wall
// — the model proposes within the human-drawn structure; the judge counts).
func zoneKinds(z MockupZone, vision bool) []RequirementKind {
	out := []RequirementKind{}

	switch z.Kind {
	case ZoneHeader:
		out = append(out, KindViewGoal, KindViewZone)
	case ZoneList:
		out = append(out, KindViewZone, KindViewData)
		if vision {
			// A vision lens infers the empty/zero state of a list — the facet a literal reading misses.
			out = append(out, KindViewEmptyState)
		}
	case ZoneDetail:
		out = append(out, KindViewZone, KindViewData)
	case ZoneFooter:
		out = append(out, KindViewZone)
	case ZoneForm:
		out = append(out, KindViewZone, KindViewData)
	}

	for _, f := range z.Fields {
		switch f {
		case FieldDisplay:
			out = append(out, KindViewData, KindEntityField)
		case FieldInput:
			out = append(out, KindViewData, KindEntityField)
		}
	}

	for _, a := range z.Actions {
		switch a {
		case ActionPrimary:
			out = append(out, KindControl, KindControlTrigger, KindActionInvoke)
			if vision {
				// A vision lens reads a primary submit as carrying a success effect.
				out = append(out, KindActionOnSuccess)
			}
		case ActionSecondary:
			out = append(out, KindControl, KindControlTrigger)
			if vision {
				// A cancel/secondary control hints the on_error/abort path.
				out = append(out, KindActionOnError)
			}
		}
	}
	return out
}

// mockupTaggedText renders a candidate view-spec output for a mockup: for each requirement TYPE the
// mockup surfaces (under the chosen reading), it emits one tagged line using that kind's FIRST declared
// marker (the same closed vocabulary Extract parses). PURE and deterministic: same (mockup, vision) →
// same text. The lines are emitted in canonical taxonomy order so the text is byte-stable.
func mockupTaggedText(mockup Mockup, vision bool) string {
	surfaced := map[RequirementKind]bool{}
	for _, z := range mockup.Zones {
		for _, k := range zoneKinds(z, vision) {
			surfaced[k] = true
		}
	}
	markers := kindMarkers()
	var b strings.Builder
	b.WriteString("# view-spec from mockup=" + mockup.ID + "\n")
	for _, k := range AllKinds() {
		if surfaced[k] {
			b.WriteString(markers[k][0] + " something\n")
		}
	}
	return b.String()
}

// MockupExpected DERIVES the "attendus" (the MatchPct denominator) from the mockup's own declared
// structure — the multimodal analogue of DG03's ExpectedFromSpec. PURE and DETERMINISTIC: a mockup's
// drawn zones/fields/actions are projected onto the closed taxonomy as the requirement TYPES a COMPLETE
// view-spec from this mockup must carry. This is what DG03's Metric measures coverage against. A model
// never expands this set (the wall — the human draws the mockup; the judge counts).
//
// The expected set is the UNION of the vision-lens reading across all zones: it includes the
// cross-cutting view facets (empty state of a list, on_success/on_error of the controls) the mockup
// IMPLIES, so a literal recompile that misses them is honestly counted as INCOMPLETE — exactly the
// surplus the multimodal panel is meant to reveal.
func MockupExpected(mockup Mockup) []RequirementKind {
	expected := map[RequirementKind]bool{}
	for _, z := range mockup.Zones {
		for _, k := range zoneKinds(z, true) {
			expected[k] = true
		}
	}
	out := make([]RequirementKind, 0, len(expected))
	for k := range expected {
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

// SpecFromMockup builds a Spec whose ExpectedKinds is DERIVED from the mockup's declared structure
// (MockupExpected). The id reuses the mockup id; the SpecText is a terse rendering. PURE: same mockup →
// same Spec. This is how DG05 feeds the UNCHANGED DG02 port / DG03 metric — the mockup becomes a Spec
// whose attendus are mockup-faithful, judged by the SAME pure Derive.
func SpecFromMockup(mockup Mockup) Spec {
	return Spec{
		ID:            mockup.ID,
		SpecText:      "# mockup " + mockup.ID,
		ExpectedKinds: MockupExpected(mockup),
	}
}

// BenchMockup runs a MockupAdapter behind the port and ALWAYS re-judges its output with the pure DG03
// Metric — the determinism-first heart of DG05: the (vision) model PROPOSES view-spec Text, the
// deterministic judge COUNTS the requirement TYPES, the judge DOMINATES. PURE w.r.t. the judge: given
// the SAME candidate Texts, BenchMockup returns the SAME report regardless of which adapter produced
// them. Governed degradation: if the adapter is unavailable OR ProposeViewSpecs errors OR yields no
// candidates, it falls back to the deterministic literal MockupRecompileReading — it NEVER returns an
// error to a screen. The Provenance records, honestly, whether a real vision model was used and whether
// it fell back. (Multimodal absent ⇒ the literal reading; the subject also stays usable text-only via
// DG04 BenchVia — the panels are independent.)
func BenchMockup(adapter MockupAdapter, mockup Mockup) (CompletenessMetric, Provenance) {
	spec := SpecFromMockup(mockup)
	prov := Provenance{ModelName: adapter.Name()}

	var cands []LLMOutput
	if adapter.Available() {
		out, err := adapter.ProposeViewSpecs(mockup)
		if err == nil && len(out) > 0 {
			cands = out
			prov.UsedRealLLM = mockupUsedRealLLM(adapter)
		}
	}
	if len(cands) == 0 {
		// Governed fallback: the deterministic literal reading. Never an error, never a screen crash.
		cands = MockupRecompileReading(mockup)
		prov.FellBack = true
		prov.UsedRealLLM = false
	}

	// The judge ALWAYS re-derives the report from the candidate Texts (pure Metric / Extract).
	return Metric(spec, cands), prov
}

// mockupUsedRealLLM dispatches via the shared realLLMReporter (DG04): a MockupAdapter that opts in
// (a real VisionModel that actually ran) reports true; any deterministic adapter is false by default.
func mockupUsedRealLLM(a MockupAdapter) bool {
	if r, ok := a.(realLLMReporter); ok {
		return r.usedRealLLM()
	}
	return false
}

// ProposeViewSpecIdeas routes a mockup's PROPOSED view-spec holes (the metric's MissingTypes) through
// the SINGLE legal door to truth: firewall.ViaIdea → idea → mirror → /goal. It writes NOTHING (the
// wall, §2): it returns DRAFT idea candidates, each carrying WroteKernel=false (proven by the firewall).
// One idea per missing requirement TYPE (deterministic order, no LLM): the multimodal panel PROPOSES,
// it never declares truth. ToKernel is NEVER called here — only ViaIdea. PURE: no DB, no clock, no rng.
func ProposeViewSpecIdeas(metric CompletenessMetric) ([]firewall.IdeaCandidate, error) {
	out := make([]firewall.IdeaCandidate, 0, len(metric.MissingTypes))
	for _, missing := range metric.MissingTypes {
		// A proposed hole is captured as a memory-shaped candidate, then routed via the ONLY legal door.
		mem, err := firewall.Capture(firewall.CaptureInput{
			Content: "mockup completeness hole: spec=" + metric.SpecID +
				" missing requirement type=" + string(missing),
			Provenance: "requirementbench:dg05-mockup:" + metric.SpecID,
			Confidence: 1.0,
			Taint:      []firewall.Taint{firewall.TaintExternalSource},
		})
		if err != nil {
			return nil, err
		}
		cand, err := firewall.ViaIdea(mem)
		if err != nil {
			return nil, err
		}
		out = append(out, cand)
	}
	return out, nil
}
