// Package watch is the AIDOS Mirror engine of S69 — « MATÉRIALISER-ET-LE-VOIR-ROUGIR », the
// "watch it fail" of KRD made a user-triggered PRODUCT PATH (ROADMAP-app-builder S69; KRD §34, §56,
// LIVRE VI).
//
// THE STEP. S68 lets a human AUTHOR a red mirror (the three-shape editor). S69 is the next gesture:
// the human TRIGGERS materialization of that authored mirror toward its runner (Godog / rapid / the
// fixture interpreter) and watches the verdict stream RED → (stub) → GREEN live. This is the
// "watch it fail" discipline (KRD §56: the red set IS the goal) turned into a product feedback loop.
//
//	a Godog (gherkin) author → Materialize → RED against absent code → a stub → GREEN.
//
// MATERIALIZE IS A PURE FUNCTION. Materialize(Proposal) projects an S68 Proposal into a runnable
// MaterializedMirror: it (a) DISPATCHES by the mirror's TestKind to the right runner (the closed
// table — never a guess, never an LLM), and (b) renders a canonical, deterministic MaterializedSource
// from the parsed spec (same proposal → byte-identical materialized source). It is the /derive-mirror
// materialization gesture as code.
//
// THE VERDICT IS DETERMINISTIC. The "did it pass?" is decided by a CodeProbe — a pure seam reporting
// whether the code-under-test is present. Absent code ⇒ RED (the watch-it-fail); a stub present ⇒
// GREEN. The real probe (compile + run Godog/rapid/the fixture interpreter) is the single impure seam,
// owned by the runner shell; the verdict LOGIC here is a pure function of code-presence — never an LLM,
// never a clock (the reproducibility property pins same input → same stream, CLAUDE.md §6/§8).
//
// THE STREAM IS THE LIVE FEEDBACK. RunStream walks a fixed, ordered set of phases
// (Queued → Materialized → Running → Verdict), each carrying the live liveness so the Workbench panel
// can render the red/green progression as it happens. The stream is a deterministic projection of
// (materialized mirror, code-probe) — it adds no I/O, no clock; the front replays it as the live feed.
//
// THE WALL (CLAUDE.md §2). This package WRITES NOTHING. It materializes and computes a verdict as
// VALUES; it never freezes a mirror into the mirrors schema (that stays the propose → ChangeSet →
// approval path of S68/S20). The mirror authored by S68 is above-the-line, human-anchored; S69 only
// RUNS it (a read of the authored spec + a verdict), it never writes truth. No DB, no clock, no rng.
//
// REUSE, NEVER FORK. The Proposal/ParsedSpec types are shapeeditor.* (S68) verbatim; the verdict
// vocabulary reuses records.Liveness (S06: Alive=green, Dead=red). No new ADR — S69 freezes one new
// artifact (the materialize-and-run path); it shifts no prior contract.
package watch

import (
	"errors"
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/steph-frtech/aidos/back/runtime/shapeeditor"
)

// Runner is the test runner a materialized mirror dispatches to (KRD §34: the three mirror forms,
// one runner each). The CLOSED set — never invented downstream.
type Runner string

const (
	// RunnerGodog runs a gherkin (acceptance N0) mirror.
	RunnerGodog Runner = "godog"
	// RunnerRapid runs a property (invariant ∀ N1) mirror.
	RunnerRapid Runner = "rapid"
	// RunnerFixture runs a fixture (workflow N2) mirror via the Operation interpreter.
	RunnerFixture Runner = "fixture"
)

// testKindToRunner is the CLOSED dispatch table (KRD §34/§90). Read verbatim; a kind absent here has
// no runner — Materialize refuses it, never guesses one.
var testKindToRunner = map[records.TestKind]Runner{
	records.TestKindAcceptance: RunnerGodog,
	records.TestKindProperty:   RunnerRapid,
	records.TestKindFixture:    RunnerFixture,
}

// Errors.
var (
	// ErrNoMirror — a proposal with no mirror id (nothing to materialize).
	ErrNoMirror = errors.New("watch: proposal carries no mirror (nothing to materialize)")
	// ErrUnknownRunner — a mirror whose test-kind has no runner in the closed table.
	ErrUnknownRunner = errors.New("watch: mirror test-kind has no runner (KRD §34 closed table)")
	// ErrEmptySpec — a proposal whose parsed spec is empty (no source to materialize).
	ErrEmptySpec = errors.New("watch: proposal carries no parsed spec (no source to materialize)")
)

// MaterializedMirror is the runnable projection of an authored mirror: the dispatch target and the
// canonical, deterministic source the runner consumes. A VALUE — nothing written to disk here (the
// runner shell materializes it; this is the pure projection it materializes FROM).
type MaterializedMirror struct {
	MirrorID           string            `json:"mirror_id"`
	ProjectID          string            `json:"project_id"`
	Reflects           records.LayerRef  `json:"reflects"`
	TargetRunner       Runner            `json:"target_runner"`
	Shape              shapeeditor.Shape `json:"shape"`
	MaterializedSource string            `json:"materialized_source"`
}

// Materialize projects an S68 Proposal into a runnable MaterializedMirror — PURE, TOTAL, DETERMINISTIC
// (the reproducibility property pins same proposal → byte-identical result). It dispatches by the
// mirror's TestKind to the runner (closed table) and renders a canonical source from the parsed spec.
// A proposal with no mirror / empty spec / unknown kind is REFUSED, never given a guessed runner.
func Materialize(p shapeeditor.Proposal) (MaterializedMirror, error) {
	if p.Mirror.MirrorID == "" {
		return MaterializedMirror{}, ErrNoMirror
	}
	runner, ok := testKindToRunner[p.Mirror.TestKind]
	if !ok {
		return MaterializedMirror{}, fmt.Errorf("%w: %q", ErrUnknownRunner, p.Mirror.TestKind)
	}
	src, err := renderSource(p.Parsed)
	if err != nil {
		return MaterializedMirror{}, err
	}
	return MaterializedMirror{
		MirrorID:           p.Mirror.MirrorID,
		ProjectID:          p.ProjectID,
		Reflects:           p.Mirror.Reflects,
		TargetRunner:       runner,
		Shape:              p.Parsed.Shape,
		MaterializedSource: src,
	}, nil
}

// renderSource re-renders a parsed spec into the canonical runnable source for its runner — a PURE,
// deterministic projection (same spec → byte-identical text). It is the materialization the runner
// shell writes to disk for Godog/rapid/the fixture interpreter.
func renderSource(spec shapeeditor.ParsedSpec) (string, error) {
	var b strings.Builder
	switch spec.Shape {
	case shapeeditor.ShapeGherkin:
		if spec.Title == "" || len(spec.Steps) == 0 {
			return "", ErrEmptySpec
		}
		fmt.Fprintf(&b, "Scenario: %s\n", spec.Title)
		for _, s := range spec.Steps {
			fmt.Fprintf(&b, "%s %s\n", s.Keyword, s.Text)
		}
	case shapeeditor.ShapeProperty:
		if spec.Title == "" || len(spec.Quantifier) == 0 || spec.Predicate == "" {
			return "", ErrEmptySpec
		}
		fmt.Fprintf(&b, "property: %s\n", spec.Title)
		fmt.Fprintf(&b, "forall: %s\n", strings.Join(spec.Quantifier, ", "))
		fmt.Fprintf(&b, "holds: %s\n", spec.Predicate)
	case shapeeditor.ShapeFixture:
		if spec.Title == "" || spec.State == "" || spec.Command == "" || len(spec.Events) == 0 {
			return "", ErrEmptySpec
		}
		fmt.Fprintf(&b, "fixture: %s\n", spec.Title)
		fmt.Fprintf(&b, "state: %s\n", spec.State)
		fmt.Fprintf(&b, "command: %s\n", spec.Command)
		for _, e := range spec.Events {
			fmt.Fprintf(&b, "event: %s\n", e)
		}
	default:
		return "", fmt.Errorf("%w: unknown shape %q", ErrEmptySpec, spec.Shape)
	}
	return b.String(), nil
}

// CodeProbe is the single impure seam abstracted: does the code-under-test exist? The real probe
// compiles + runs the runner against the project's code; here it is the input the verdict is a pure
// function of. Present=false ⇒ RED (watch it fail); Present=true ⇒ GREEN (the stub passes).
type CodeProbe struct {
	// Present reports whether the code the mirror runs against exists (a stub or a real impl).
	Present bool `json:"present"`
}

// Phase is one ordered step of the live run stream (KRD §56 "watch it fail" rendered live).
type Phase string

const (
	// PhaseQueued — the run is accepted, not yet materialized.
	PhaseQueued Phase = "queued"
	// PhaseMaterialized — the source has been rendered for its runner.
	PhaseMaterialized Phase = "materialized"
	// PhaseRunning — the runner is executing against the (absent or present) code.
	PhaseRunning Phase = "running"
	// PhaseVerdict — the run finished; the event carries the final liveness (red/green).
	PhaseVerdict Phase = "verdict"
)

// RunEvent is one live event in the stream — its phase and the liveness known at that phase. Only the
// verdict event carries a meaningful terminal status; the earlier phases carry LivenessDead (pending).
type RunEvent struct {
	Phase  Phase            `json:"phase"`
	Runner Runner           `json:"runner"`
	Status records.Liveness `json:"status"`
	Detail string           `json:"detail"`
}

// Stream is the ordered live feed of a single run — the deterministic projection the Workbench panel
// renders as the red/green progression. PURE (no clock, no I/O); the front replays it as the feed.
type Stream struct {
	MirrorID string     `json:"mirror_id"`
	Runner   Runner     `json:"runner"`
	Events   []RunEvent `json:"events"`
}

// Final returns the terminal liveness of the stream (the verdict event's status). PURE.
func (s Stream) Final() records.Liveness {
	if len(s.Events) == 0 {
		return records.LivenessDead
	}
	return s.Events[len(s.Events)-1].Status
}

// IsRed reports whether the run ended RED (dead) — the "watch it fail" check. PURE.
func (s Stream) IsRed() bool { return s.Final() == records.LivenessDead }

// RunStream materializes the live run of a mirror against a code-probe — PURE, TOTAL, DETERMINISTIC
// (same (mirror, probe) → byte-identical stream). It walks the fixed phase order and decides the
// terminal verdict by CODE-PRESENCE: absent ⇒ RED (watch it fail), present ⇒ GREEN. The verdict is a
// pure function of the probe — never an LLM, never a clock (the reproducibility property pins it).
func RunStream(m MaterializedMirror, probe CodeProbe) (Stream, error) {
	if m.MirrorID == "" {
		return Stream{}, ErrNoMirror
	}
	if m.MaterializedSource == "" {
		return Stream{}, ErrEmptySpec
	}

	// The terminal verdict: absent code ⇒ RED; a stub present ⇒ GREEN.
	verdict := records.LivenessDead
	verdictDetail := fmt.Sprintf("no code under %s — the mirror fails (watch it fail)", m.Reflects.LayerID)
	if probe.Present {
		verdict = records.LivenessAlive
		verdictDetail = fmt.Sprintf("code under %s present — the mirror passes", m.Reflects.LayerID)
	}

	events := []RunEvent{
		{Phase: PhaseQueued, Runner: m.TargetRunner, Status: records.LivenessDead, Detail: "run accepted, awaiting materialization"},
		{Phase: PhaseMaterialized, Runner: m.TargetRunner, Status: records.LivenessDead, Detail: fmt.Sprintf("materialized %s source for %s", m.Shape, m.TargetRunner)},
		{Phase: PhaseRunning, Runner: m.TargetRunner, Status: records.LivenessDead, Detail: fmt.Sprintf("running %s against %s", m.TargetRunner, m.Reflects.LayerID)},
		{Phase: PhaseVerdict, Runner: m.TargetRunner, Status: verdict, Detail: verdictDetail},
	}
	return Stream{MirrorID: m.MirrorID, Runner: m.TargetRunner, Events: events}, nil
}
