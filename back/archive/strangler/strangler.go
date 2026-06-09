// Package strangler is the S104 Archive STRANGLER-FIG primitive of KRD §50 and the
// app-builder EPIC 11: how a legacy system is ABSORBED into the federation without a
// big-bang rewrite. The strangler-fig pattern (§50): you do NOT rewrite the legacy in
// place — you CARVE A CELL around it (S100 bounded context), FREEZE its CURRENT
// behaviour with CHARACTERIZATION TESTS (mirrors auto-generated over the observed
// input→output behaviour, NOT hand-authored intent), publish the cell's CONTRACT, then
// let the build-loop (S83) REFACTOR INSIDE the frozen cell — the characterization
// mirrors stay GREEN across the refactor (any behaviour change reddens them) and the
// published contract is HONORED. The fig grows around the host until the host can be
// removed; nothing the legacy did is silently lost.
//
// THE DISTINCTION (§50, the characterization-vs-intent honesty). A normal KRD mirror is
// written FIRST and red, from declared intent (mandate A). A CHARACTERIZATION mirror is
// the opposite: it is GENERATED from the legacy's OBSERVED behaviour — it pins "whatever
// the legacy currently does" as the invariant to preserve, INCLUDING bug-for-bug
// quirks, because a refactor must not change observable behaviour. It is a green net,
// not a red goal. The two never mix: a characterization mirror is tagged so completeness
// (S12) never mistakes it for an intent mirror, and a refactor that wants to CHANGE
// behaviour must go through idea→mirror→/goal (a new intent mirror), never by editing a
// characterization mirror.
//
// This package lands exactly that substrate as PURE total functions:
//
//   - Carve(legacy) → StranglerCell — draw the cell boundary around the legacy: its
//     bounded-context ref, its internal nodes (the legacy carved in), and its PUBLISHED
//     contract (the public surface the fig must keep honoring). A legacy with no observed
//     trace is REFUSED (STRANGLER_NO_OBSERVED_BEHAVIOUR) — you cannot freeze what you
//     have not observed; an unnamed cell is REFUSED (STRANGLER_UNNAMED_CELL).
//
//   - Freeze(cell) → []CharacterizationMirror — auto-generate one characterization
//     mirror per observed (input → output) trace of the legacy: a content-addressed
//     fixture mirror that asserts "given this input, the cell still returns this exact
//     output". Deterministic and reproducible: same observed behaviour ⇒ byte-identical
//     mirror set (the property mirror pins it). This is the §50 freeze.
//
//   - Refactor(frozen, observedAfter) → RefactorVerdict — run the frozen
//     characterization mirrors against the REFACTORED implementation's observed
//     behaviour. Every mirror must stay GREEN (same input ⇒ same output) AND the
//     published contract must stay honored. A diverging output reddens its mirror
//     (CharacterizationDrift) — the refactor is REFUSED until the cell matches the frozen
//     behaviour again. The done-criterion: "les miroirs de caractérisation restent verts
//     à travers un refactor interne ; le contrat publié est honoré".
//
// PURE (CLAUDE.md §6/§8 determinism-first): no DB, no clock, no rng, no I/O, no LLM.
// Every function is TOTAL and DETERMINISTIC — same input ⇒ same output — so the carve,
// the freeze and the refactor verdict are REPLAYABLE (the rapid property mirror pins
// this). Characterization-mirror generation is DETERMINISTIC CODE, never an LLM "write
// some tests for this": observed traces → fixture mirrors is a pure projection. The
// content-hash row id reuses the S02 records substrate (records.Hash(Canonicalize)) — it
// is NOT forked here. READ-ONLY against truth; it writes NOTHING (the wall, CLAUDE.md
// §2): the StranglerCell + its characterization mirrors persist via ChangeSet (the
// mirrors schema is above the line), never a direct write from here.
package strangler

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Trace is ONE observed (input → output) sample of the legacy's behaviour — the unit a
// characterization mirror freezes. It is PURE DATA: the input the legacy was given and
// the output it returned, both as opaque canonical bytes (the strangler treats the
// legacy as a black box — it pins observable behaviour, never internals). Name labels
// the trace for the mirror's scenario title (e.g. "create order, in stock").
type Trace struct {
	// Name is the human label of the observed case (the mirror scenario title).
	Name string `json:"name"`
	// Input is the canonical bytes of the input the legacy was given.
	Input json.RawMessage `json:"input"`
	// Output is the canonical bytes of the output the legacy returned for that input.
	Output json.RawMessage `json:"output"`
}

// Legacy is the read-only description of the legacy system to absorb: the cell ref the
// fig grows in, the legacy's internal node ids (carved into the cell), the PUBLISHED
// contract id (the public surface kept honored), and the OBSERVED traces of its current
// behaviour. The caller (a sensor/recorder) supplies the traces — the strangler never
// invents behaviour; it only freezes what was observed.
type Legacy struct {
	// Cell is the bounded-context ref the strangler cell carves (S100 identity space).
	Cell cell.Ref `json:"cell"`
	// InternalNodes are the legacy's internal node ids carved INTO the cell (its mass).
	InternalNodes []string `json:"internal_nodes"`
	// PublishedContract is the cell's public contract id (a contracts_with surface, S17)
	// the fig must keep honoring across the refactor. Empty means no published surface.
	PublishedContract string `json:"published_contract,omitempty"`
	// Observed are the (input → output) traces of the legacy's CURRENT behaviour, the
	// material Freeze turns into characterization mirrors. At least one is required.
	Observed []Trace `json:"observed"`
}

// StranglerCell is Carve's product: the cell boundary drawn around the legacy. It is a
// cell.Cell-shaped partition (its ref + carved-in internal node ids) plus the published
// contract id and the observed traces frozen into characterization mirrors. Content-
// addressed (Hash) and reproducible.
type StranglerCell struct {
	// Cell is the bounded-context the legacy was carved into.
	Cell cell.Ref `json:"cell"`
	// InternalNodes are the carved-in legacy node ids, sorted (the cell's mass).
	InternalNodes []string `json:"internal_nodes"`
	// PublishedContract is the public contract id kept honored across the refactor.
	PublishedContract string `json:"published_contract,omitempty"`
	// Observed are the frozen observed traces, sorted by name (the freeze material).
	Observed []Trace `json:"observed"`
	// Hash is the content address of the strangler cell (reproducible).
	Hash string `json:"hash"`
}

// CharacterizationMirror is ONE auto-generated mirror freezing one observed trace: a
// FIXTURE mirror (test_kind=fixture) asserting "given this input, the cell returns this
// exact output". It is tagged Characterization=true so completeness (S12) never confuses
// it with an intent mirror, and Reflects names the cell it freezes. Content-addressed.
type CharacterizationMirror struct {
	// ID is the content-addressed mirror id (reproducible: same trace ⇒ same id).
	ID string `json:"id"`
	// Cell is the strangler cell this mirror freezes (its Reflects target).
	Cell cell.Ref `json:"cell"`
	// Scenario is the observed case label (the trace name) — the mirror scenario title.
	Scenario string `json:"scenario"`
	// Input is the frozen input (the Given of the characterization fixture).
	Input json.RawMessage `json:"input"`
	// ExpectedOutput is the frozen output (the Then of the characterization fixture) — the
	// behaviour a refactor must preserve EXACTLY.
	ExpectedOutput json.RawMessage `json:"expected_output"`
	// Characterization is ALWAYS true: this mirror was GENERATED from observed behaviour,
	// not authored from intent. The flag keeps the two natures separate (§50).
	Characterization bool `json:"characterization"`
	// TestKind is always "fixture" — a characterization mirror is a state→output fixture.
	TestKind string `json:"test_kind"`
}

// MirrorVerdict is the green/red status of ONE characterization mirror against a
// refactored implementation's observed behaviour. Green iff the refactor returned the
// SAME output for the frozen input; red (CharacterizationDrift) iff it diverged.
type MirrorVerdict struct {
	// MirrorID is the characterization mirror's id.
	MirrorID string `json:"mirror_id"`
	// Scenario is the observed case label (echoed for the panel).
	Scenario string `json:"scenario"`
	// Green reports whether the refactor preserved the frozen output for this input.
	Green bool `json:"green"`
	// ActualOutput is the output the refactor returned for the frozen input (empty when the
	// refactor produced no output for the input — also a drift).
	ActualOutput json.RawMessage `json:"actual_output,omitempty"`
}

// RefactorVerdict is Refactor's product: per-mirror verdicts, whether ALL stayed green,
// whether the published contract is still honored, and a typed BlockReason when the
// refactor is refused (a characterization drift OR a broken published contract). It is
// the §50 done-criterion made a computed verdict, never declared.
type RefactorVerdict struct {
	// Cell is the strangler cell the refactor ran inside.
	Cell cell.Ref `json:"cell"`
	// Mirrors are the per-mirror verdicts, sorted by scenario (the frozen net's status).
	Mirrors []MirrorVerdict `json:"mirrors"`
	// AllGreen reports whether EVERY characterization mirror stayed green (behaviour
	// preserved across the refactor) — the first half of the done-criterion.
	AllGreen bool `json:"all_green"`
	// ContractHonored reports whether the published contract is still honored after the
	// refactor — the second half of the done-criterion.
	ContractHonored bool `json:"contract_honored"`
	// Accepted reports whether the refactor is ACCEPTED: AllGreen ∧ ContractHonored. A
	// refactor is accepted iff it changed NOTHING observable and kept its contract.
	Accepted bool `json:"accepted"`
	// Block is non-nil iff the refactor is REFUSED (a drift or a broken contract), naming
	// the door and the fix path.
	Block *BlockReason `json:"block,omitempty"`
}

// BlockReason is the S104-local typed refusal (KRD §44.5 shape) — it names the door,
// never a prison: Code + Message + HowToFix. It mirrors the runtime BlockReason shape
// without importing the runtime layer (this archive package stays free of runtime).
type BlockReason struct {
	Code     string   `json:"code"`
	Message  string   `json:"message"`
	HowToFix []string `json:"how_to_fix"`
}

func (b *BlockReason) Error() string { return b.Message }

// Refusal codes (S104-local SCREAMING — the /strangler panel surfaces them).
const (
	// CodeNoObservedBehaviour — a legacy with zero observed traces cannot be frozen.
	CodeNoObservedBehaviour = "STRANGLER_NO_OBSERVED_BEHAVIOUR"
	// CodeUnnamedCell — a strangler cell needs a bounded-context name.
	CodeUnnamedCell = "STRANGLER_UNNAMED_CELL"
	// CodeCharacterizationDrift — a refactor changed observable behaviour: a frozen
	// characterization mirror went red.
	CodeCharacterizationDrift = "STRANGLER_CHARACTERIZATION_DRIFT"
	// CodeContractBroken — a refactor broke the cell's published contract.
	CodeContractBroken = "STRANGLER_PUBLISHED_CONTRACT_BROKEN"
)

// Validation errors.
var (
	// ErrNoObservedBehaviour — Carve was handed a legacy with no observed traces.
	ErrNoObservedBehaviour = errors.New("strangler: a legacy with no observed behaviour cannot be frozen (record at least one input→output trace before carving)")
	// ErrUnnamedCell — Carve was handed an empty cell ref.
	ErrUnnamedCell = errors.New("strangler: a strangler cell needs a bounded-context name")
)

// Carve draws the cell boundary around the legacy (§50): it validates the legacy is
// observable (at least one trace) and named, then returns a content-addressed
// StranglerCell with its internal nodes + observed traces sorted canonically. A legacy
// with no observed behaviour is REFUSED (ErrNoObservedBehaviour) — you cannot freeze the
// unobserved; an unnamed cell is REFUSED (ErrUnnamedCell).
//
// PURE + TOTAL: no DB/clock/rng/I/O. Same legacy ⇒ byte-identical StranglerCell + hash
// (the property mirror pins it).
func Carve(l Legacy) (StranglerCell, error) {
	if l.Cell.IsEmpty() {
		return StranglerCell{}, ErrUnnamedCell
	}
	if len(l.Observed) == 0 {
		return StranglerCell{}, ErrNoObservedBehaviour
	}

	nodes := append([]string(nil), l.InternalNodes...)
	sort.Strings(nodes)

	obs := append([]Trace(nil), l.Observed...)
	sort.Slice(obs, func(i, j int) bool { return obs[i].Name < obs[j].Name })

	sc := StranglerCell{
		Cell:              l.Cell,
		InternalNodes:     nodes,
		PublishedContract: l.PublishedContract,
		Observed:          obs,
	}
	sc.Hash = cellHash(sc)
	return sc, nil
}

// Freeze auto-generates the characterization mirrors of a carved strangler cell (§50):
// one FIXTURE mirror per observed trace, asserting "given this input, the cell returns
// this exact output". Each mirror is content-addressed (reproducible) and tagged
// Characterization=true so it is never confused with an intent mirror. The mirrors are
// returned sorted by scenario. This is DETERMINISTIC CODE — observed traces → fixture
// mirrors is a pure projection, NEVER an LLM "write some tests".
//
// PURE + TOTAL: same StranglerCell ⇒ byte-identical mirror set (the property mirror pins
// it).
func Freeze(sc StranglerCell) []CharacterizationMirror {
	mirrors := make([]CharacterizationMirror, 0, len(sc.Observed))
	for _, t := range sc.Observed {
		m := CharacterizationMirror{
			Cell:             sc.Cell,
			Scenario:         t.Name,
			Input:            t.Input,
			ExpectedOutput:   t.Output,
			Characterization: true,
			TestKind:         "fixture",
		}
		m.ID = mirrorHash(m)
		mirrors = append(mirrors, m)
	}
	sort.Slice(mirrors, func(i, j int) bool { return mirrors[i].Scenario < mirrors[j].Scenario })
	return mirrors
}

// RefactorObservation is the OBSERVED behaviour of the REFACTORED implementation: the
// (input-scenario → output) map the build-loop produced after refactoring inside the
// frozen cell, plus whether the published contract still verifies. The caller (the
// build-loop's sensor, S83/S84) supplies it — the strangler judges, it does not run code.
type RefactorObservation struct {
	// Outputs maps an observed scenario name to the output the REFACTORED cell returned for
	// that scenario's frozen input. A scenario missing here means the refactor produced no
	// output for it — a drift (the frozen behaviour was lost).
	Outputs map[string]json.RawMessage `json:"outputs"`
	// ContractHonored reports whether the cell's published contract still verifies after the
	// refactor (a Pact provider-verification, S101) — supplied by the caller. When the cell
	// publishes no contract, this is vacuously true.
	ContractHonored bool `json:"contract_honored"`
}

// Refactor runs the frozen characterization mirrors against a refactored
// implementation's observed behaviour (§50): every mirror is GREEN iff the refactor
// returned the SAME output for the frozen input (byte-equal canonical JSON), and the
// published contract must stay honored. A diverging or missing output reddens its mirror
// (CharacterizationDrift); a broken published contract refuses the refactor
// (ContractBroken). The refactor is ACCEPTED iff every mirror stayed green AND the
// contract is honored — the §50 done-criterion ("les miroirs de caractérisation restent
// verts à travers un refactor interne ; le contrat publié est honoré").
//
// PURE + TOTAL: no DB/clock/rng/I/O. Same (mirrors, observation) ⇒ same verdict (the
// property mirror pins it). It writes NOTHING (the wall): the verdict is a VALUE; a
// refactor that wants to CHANGE behaviour goes through idea→mirror→/goal, never by
// editing a characterization mirror.
func Refactor(sc StranglerCell, mirrors []CharacterizationMirror, obs RefactorObservation) RefactorVerdict {
	v := RefactorVerdict{
		Cell:            sc.Cell,
		Mirrors:         make([]MirrorVerdict, 0, len(mirrors)),
		ContractHonored: contractHonored(sc, obs),
	}
	allGreen := true
	for _, m := range mirrors {
		actual, present := obs.Outputs[m.Scenario]
		green := present && sameOutput(m.ExpectedOutput, actual)
		if !green {
			allGreen = false
		}
		mv := MirrorVerdict{
			MirrorID: m.ID,
			Scenario: m.Scenario,
			Green:    green,
		}
		if present {
			mv.ActualOutput = actual
		}
		v.Mirrors = append(v.Mirrors, mv)
	}
	sort.Slice(v.Mirrors, func(i, j int) bool { return v.Mirrors[i].Scenario < v.Mirrors[j].Scenario })

	v.AllGreen = allGreen
	v.Accepted = v.AllGreen && v.ContractHonored
	if !v.Accepted {
		v.Block = refusalFor(v)
	}
	return v
}

// contractHonored reports whether the cell's published contract is honored after the
// refactor. A cell that publishes NO contract is vacuously honored (nothing to break);
// otherwise the caller's observed verification result decides.
func contractHonored(sc StranglerCell, obs RefactorObservation) bool {
	if sc.PublishedContract == "" {
		return true
	}
	return obs.ContractHonored
}

// refusalFor builds the typed BlockReason for a refused refactor — a characterization
// drift takes precedence (it names the diverging scenarios), then a broken contract.
func refusalFor(v RefactorVerdict) *BlockReason {
	if !v.AllGreen {
		drifted := []string{}
		for _, m := range v.Mirrors {
			if !m.Green {
				drifted = append(drifted, m.Scenario)
			}
		}
		return &BlockReason{
			Code:    CodeCharacterizationDrift,
			Message: fmt.Sprintf("refactor of cell %q changed observable behaviour: %d characterization mirror(s) went red (%v) — a refactor must preserve behaviour exactly (§50 strangler-fig)", v.Cell, len(drifted), drifted),
			HowToFix: []string{
				"restore the frozen behaviour: make the refactored cell return the SAME output for each frozen input (the characterization mirrors are the green net)",
				"or, if the behaviour change is INTENDED, open a new INTENT mirror through idea→mirror→/goal — never edit a characterization mirror to make it pass (that erases the legacy's behaviour silently)",
			},
		}
	}
	return &BlockReason{
		Code:    CodeContractBroken,
		Message: fmt.Sprintf("refactor of cell %q broke its published contract %q — the fig must keep honoring the contract the rest of the federation depends on", v.Cell, v.Cell),
		HowToFix: []string{
			"restore the published contract: the refactored cell must still satisfy the Pact contract its neighbors consume (S101 provider-verification)",
			"or re-negotiate the contract through the Context-Map (S101) before changing the published surface — never break it silently",
		},
	}
}

// sameOutput reports whether two outputs are byte-equal under canonicalisation (a
// characterization mirror is green iff the refactor returns the SAME canonical output —
// key order and whitespace insignificant). An invalid-JSON output falls back to raw
// byte-equality (defensive; the recorder supplies canonical JSON).
func sameOutput(expected, actual json.RawMessage) bool {
	ce, ee := records.Canonicalize(expected)
	ca, ea := records.Canonicalize(actual)
	if ee == nil && ea == nil {
		return string(ce) == string(ca)
	}
	return string(expected) == string(actual)
}

// cellHash content-addresses a strangler cell (reproducible) by reusing the S02 records
// substrate: Hash(Canonicalize(body)) over the cell's stable fields (Hash excluded).
func cellHash(sc StranglerCell) string {
	body, err := json.Marshal(struct {
		Cell              cell.Ref `json:"cell"`
		InternalNodes     []string `json:"internal_nodes"`
		PublishedContract string   `json:"published_contract,omitempty"`
		Observed          []Trace  `json:"observed"`
	}{
		Cell:              sc.Cell,
		InternalNodes:     sc.InternalNodes,
		PublishedContract: sc.PublishedContract,
		Observed:          sc.Observed,
	})
	if err != nil {
		return ""
	}
	canon, err := records.Canonicalize(body)
	if err != nil {
		return records.Hash(body)
	}
	return records.Hash(canon)
}

// mirrorHash content-addresses a characterization mirror (reproducible) over its frozen
// fields (ID excluded), so the same observed trace always yields the same mirror id.
func mirrorHash(m CharacterizationMirror) string {
	body, err := json.Marshal(struct {
		Cell             cell.Ref        `json:"cell"`
		Scenario         string          `json:"scenario"`
		Input            json.RawMessage `json:"input"`
		ExpectedOutput   json.RawMessage `json:"expected_output"`
		Characterization bool            `json:"characterization"`
		TestKind         string          `json:"test_kind"`
	}{
		Cell:             m.Cell,
		Scenario:         m.Scenario,
		Input:            m.Input,
		ExpectedOutput:   m.ExpectedOutput,
		Characterization: m.Characterization,
		TestKind:         m.TestKind,
	})
	if err != nil {
		return ""
	}
	canon, err := records.Canonicalize(body)
	if err != nil {
		return records.Hash(body)
	}
	return records.Hash(canon)
}

// SerializeMirrorBody renders a minimal mirrors.mirror body for a characterization mirror
// so it rides INSIDE a content-addressed body (S02) when the ChangeSet (above the line)
// proposes it. The "kind":"mirror" discriminator matches records.Validate; the body is
// what the ChangeSet would carry — this package never writes it (the wall).
func SerializeMirrorBody(m CharacterizationMirror) ([]byte, error) {
	body := map[string]any{
		"kind":             string(records.KindMirror),
		"cell":             string(m.Cell),
		"scenario":         m.Scenario,
		"input":            json.RawMessage(m.Input),
		"expected_output":  json.RawMessage(m.ExpectedOutput),
		"characterization": m.Characterization,
		"test_kind":        m.TestKind,
	}
	return json.Marshal(body)
}
