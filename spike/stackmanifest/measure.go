// measure.go — THROWAWAY (DP01 spike). The deterministic measurement harness and the computed
// verdict. Everything here is a PURE function of the pinned fixture: byte-identity over N
// re-emissions (hash equality), round-trip, drift detection asymmetry (source vs static
// template), emission cost (bytes, a stable proxy), and the ≤3-form fit as a feature COUNT
// against DECLARED criteria. Go/no-go is a boolean conjunction over these measures — never an
// LLM opinion, never a declaration.
package stackmanifest

// Emissions is N — how many times the probe re-emits to measure byte-identity.
const Emissions = 100

// Measurement is what the probe MEASURED (each field is computed, none is asserted by hand).
type Measurement struct {
	Emissions             int    // N re-emissions performed
	ByteIdentical         bool   // all N emissions byte-equal (hash equality)
	SourceHash            string // content address of the manifest (the source)
	OutputHash            string // content address of the emitted compose
	EmittedBytes          int    // emission cost proxy: size of the emitted artifact
	RoundTripOK           bool   // emitted compose parses back to the manifest topology
	DriftDetectedOnSource bool   // a one-byte hand-edit is detected via recorded output-hash
	DriftDetectedOnTmpl   bool   // the static-template path detects the same edit (no hash ⇒ false)
}

// FormScore scores ONE candidate form against the four DECLARED criteria (declared above the
// line, never learned): does the form carry a body, is it content-addressed, is it governed by
// the wall (idea→mirror→/goal), is it append-only? Fit = the feature count.
type FormScore struct {
	Form             string
	CarriesBody      bool // can hold the services/volumes/network AST (JSONB body)
	ContentAddressed bool // version = hash of the canonical body
	WallGoverned     bool // written only via idea → mirror → /goal → approval
	AppendOnly       bool // nothing destroyed, head mutable
	Fit              int
}

// Verdict is the spike's computed go/no-go.
type Verdict struct {
	Go          bool
	Measurement Measurement
	Forms       [3]FormScore
	ChosenForm  string
	Rationale   string
}

// Measure runs the probe on the pinned fixture — pure, reproducible.
func Measure() Measurement {
	m := Fixture()
	first := Emit(m)
	identical := true
	for i := 0; i < Emissions; i++ {
		if Emit(m) != first {
			identical = false
			break
		}
	}
	recorded := OutputHash(first)
	edited := first[:len(first)-1] + "#" // a one-byte hand-edit of the projection
	topo, err := ParseCompose(first)

	return Measurement{
		Emissions:             Emissions,
		ByteIdentical:         identical,
		SourceHash:            SourceHash(m),
		OutputHash:            recorded,
		EmittedBytes:          len(first),
		RoundTripOK:           err == nil && TopologyEqual(m, topo),
		DriftDetectedOnSource: DriftDetected(recorded, edited),
		DriftDetectedOnTmpl:   TemplateCanDetectDrift(),
	}
}

// scoreForms scores the ≤3 candidate forms the roadmap names. The criteria values are the
// STRUCTURAL facts of each form (what it can carry by construction), the Fit is a count.
func scoreForms() [3]FormScore {
	forms := [3]FormScore{
		{
			// (1) first-rank Kernel record kind: a JSONB body, records.Hash∘Canonicalize,
			// written only through the wall, append-only like every kernel record.
			Form: "record-kind", CarriesBody: true, ContentAddressed: true, WallGoverned: true, AppendOnly: true,
		},
		{
			// (2) a TruthScope (S15) dimension: scope is {project, environment, …} coordinates —
			// it carries NO body, so a topology cannot live there (it can only SCOPE one).
			Form: "scope-dimension", CarriesBody: false, ContentAddressed: false, WallGoverned: true, AppendOnly: true,
		},
		{
			// (3) a pure below-the-line projection: hashable bytes, but nothing governs a
			// regenerable artifact — no wall, no append-only history (gen/ is overwritten).
			Form: "below-the-line-projection", CarriesBody: true, ContentAddressed: true, WallGoverned: false, AppendOnly: false,
		},
	}
	for i := range forms {
		fit := 0
		for _, ok := range []bool{forms[i].CarriesBody, forms[i].ContentAddressed, forms[i].WallGoverned, forms[i].AppendOnly} {
			if ok {
				fit++
			}
		}
		forms[i].Fit = fit
	}
	return forms
}

// Decide computes the verdict: GO iff the emitter is byte-identical N times AND the compose
// round-trips AND the source path detects drift the static template cannot. The chosen form is
// the deterministic max-fit (first wins ties — the array order is the roadmap's order).
func Decide() Verdict {
	meas := Measure()
	forms := scoreForms()
	chosen := forms[0]
	for _, f := range forms[1:] {
		if f.Fit > chosen.Fit {
			chosen = f
		}
	}

	carriesValue := meas.ByteIdentical && meas.RoundTripOK &&
		meas.DriftDetectedOnSource && !meas.DriftDetectedOnTmpl

	rationale := "no-go: the static template matches the source on every measure — a template suffices, the roadmap stops at DP01"
	if carriesValue {
		rationale = "go: emission is byte-identical (" + meas.OutputHash[:12] + "… stable over 100 re-emissions), the compose round-trips, and ONLY the content-addressed source detects a hand-edit drift (the template is drift-blind) — the source carries versioning/audit/anti-overwrite; form: " + chosen.Form
	}

	return Verdict{
		Go:          carriesValue,
		Measurement: meas,
		Forms:       forms,
		ChosenForm:  chosen.Form,
		Rationale:   rationale,
	}
}
