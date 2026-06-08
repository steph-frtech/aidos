// Package shapeeditor is the AIDOS Mirror engine of S68 — THE THREE-SHAPE MIRROR AUTHORING
// SURFACE with draft-level concurrency (ROADMAP-app-builder S68; KRD §34, §90, LIVRE VI).
//
// THE STEP. A human authors a mirror by its FORM, and the form is DERIVED — never chosen by
// hand — from the NATURE of the truth it reflects (KRD §90 the layer registry):
//
//	acceptance / journey (N0) → Gherkin   (test_kind=acceptance, cert=gherkin, run by Godog)
//	invariant ∀          (N1) → property  (test_kind=property,   cert=rapid,   run by rapid)
//	workflow             (N2) → fixture   (test_kind=fixture,    cert=fixture, state→cmd→events)
//
// DeriveShape is a PURE, TOTAL, DETERMINISTIC function of the truth-nature (the reproducibility
// property pins same nature → same shape). It is the single authoritative selector — the
// /derive-mirror gesture made code, never an LLM ("an LLM picking the form" would be a
// determinism gap; the rule is a closed table, §6).
//
// PARSING IS A PURE FUNCTION (the load-bearing det-criterion of S68). Each shape's source is
// validated by a deterministic parser (ParseGherkin / ParseProperty / ParseFixture) — never an
// LLM — that returns a typed ParsedSpec or a typed error naming the door. Same source bytes →
// same parse (the reproducibility property pins it).
//
// THE MIRROR IS BORN RED. A freshly authored mirror is RED by construction (Liveness=dead until
// it runs against code that does not yet exist — the "watch it fail" of KRD). ProposeMirror
// wraps the authored mirror as the mirror_delta of a DRAFT ChangeSet (S20), PROJECT-SCOPED, so
// the wall path (propose → ChangeSet → approval) freezes it into the mirrors schema later. This
// package WRITES NOTHING (WroteKernel/WroteMirror always false; the ChangeSet stays DRAFT).
//
// DRAFT-LEVEL CONCURRENCY (distinct from S110's truth-write conflict). Two authors editing the
// SAME pre-ChangeSet draft must never silently last-write-wins. MergeEdits is a deterministic
// CRDT-style merge over the draft's base version: two edits to DISJOINT fields MERGE; two edits
// to the SAME field with different values CONFLICT (a lock — refused with DRAFT_EDIT_CONFLICT,
// the human resolves), never an arbitrary overwrite. This is a draft-level (presence/lock)
// conflict, BELOW the wall — not a truth-write conflict (S110, optimistic-lock on the head).
//
// THE WALL (CLAUDE.md §2). No DB, no clock, no rng, no I/O; every function is pure and total.
// Persisting the DRAFT into the mirrors schema goes via the changeset door (S20) under human
// approval; the agent DB role can never write mirrors/kernel/fitness. The screen PROPOSES.
//
// REUSE, NEVER FORK. The mirror record types are records.* (S06) verbatim; the DRAFT ChangeSet
// is changeset.Open (S20) verbatim; the content address reuses kernrecords.Canonicalize/Hash
// (S02). No new ADR — S68 freezes one new artifact (the shape editor); it shifts no prior contract.
package shapeeditor

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	kernrecords "github.com/steph-frtech/aidos/back/kernel/records"
)

// TruthNature is the NATURE of the truth a mirror reflects (KRD §90). It is the input from which
// the mirror's FORM is derived — the closed set of natures the three-shape editor serves.
type TruthNature string

const (
	// NatureAcceptance — a journey / acceptance behaviour (N0): a Given/When/Then path.
	NatureAcceptance TruthNature = "acceptance"
	// NatureInvariant — an invariant ∀ (N1): a property true on all inputs.
	NatureInvariant TruthNature = "invariant"
	// NatureWorkflow — a workflow (N2): a state → command → events fixture.
	NatureWorkflow TruthNature = "workflow"
)

// Natures returns the three natures in canonical order, so the closed set is never invented
// downstream (the Workbench shape picker, the migration legend).
func Natures() []TruthNature { return []TruthNature{NatureAcceptance, NatureInvariant, NatureWorkflow} }

// Shape is the FORM of a mirror (KRD §34 the three mirror forms). Derived from TruthNature.
type Shape string

const (
	// ShapeGherkin — the N0 journey form (a .feature, run by Godog).
	ShapeGherkin Shape = "gherkin"
	// ShapeProperty — the N1 invariant form (a property spec, run by rapid).
	ShapeProperty Shape = "property"
	// ShapeFixture — the N2 workflow form (a state→cmd→events fixture).
	ShapeFixture Shape = "fixture"
)

// Derivation is the deterministic mapping of a truth-nature to its mirror form and the typed
// record fields the mirror carries (KRD §34/§90). DECLARED, never learned.
type Derivation struct {
	Shape        Shape                `json:"shape"`
	TestKind     records.TestKind     `json:"test_kind"`
	CertLanguage records.CertLanguage `json:"cert_language"`
}

// natureToDerivation is the CLOSED selection table (KRD §90 the layer registry, /derive-mirror).
// READ verbatim, never invented (anti-Goodhart). A nature absent here has no shape — DeriveShape
// refuses it (ErrUnknownNature), never guesses one.
var natureToDerivation = map[TruthNature]Derivation{
	NatureAcceptance: {Shape: ShapeGherkin, TestKind: records.TestKindAcceptance, CertLanguage: records.CertGherkin},
	NatureInvariant:  {Shape: ShapeProperty, TestKind: records.TestKindProperty, CertLanguage: records.CertRapid},
	NatureWorkflow:   {Shape: ShapeFixture, TestKind: records.TestKindFixture, CertLanguage: records.CertFixture},
}

// Errors.
var (
	// ErrUnknownNature — a truth-nature not in the closed table; the form cannot be guessed.
	ErrUnknownNature = errors.New("shapeeditor: truth-nature is not in the closed derivation table (KRD §90)")
	// ErrNoReflects — a draft without a reflected layer ref; a mirror always proves a layer.
	ErrNoReflects = errors.New("shapeeditor: mirror reflects no layer (a mirror always proves a kernel layer)")
	// ErrNoProject — a draft without a project id; every authored mirror is project-scoped (S55).
	ErrNoProject = errors.New("shapeeditor: draft has no project id (mirrors are project-scoped, S55)")
	// ErrEmptySource — an empty source body; a red mirror still needs its authored spec text.
	ErrEmptySource = errors.New("shapeeditor: mirror source is empty (nothing to author)")
	// ErrParse — a shape source that does not parse for its form (typed below per shape).
	ErrParse = errors.New("shapeeditor: source does not parse for its shape")
)

// DeriveShape maps a truth-nature to its mirror form + typed fields — PURE, TOTAL, DETERMINISTIC.
// It is the single authoritative selector (the /derive-mirror gesture as code). An unknown nature
// is refused (ErrUnknownNature), never given a guessed shape (the honesty rule, the closed set).
func DeriveShape(nature TruthNature) (Derivation, error) {
	d, ok := natureToDerivation[nature]
	if !ok {
		return Derivation{}, fmt.Errorf("%w: %q", ErrUnknownNature, nature)
	}
	return d, nil
}

// ParsedSpec is the typed, deterministic parse of a shape source — the proof obligation the
// red mirror carries. Fields populated per shape; the shape names which fields are meaningful.
type ParsedSpec struct {
	Shape Shape `json:"shape"`
	// Steps is the ordered Given/When/Then steps of a Gherkin source (gherkin only).
	Steps []GherkinStep `json:"steps,omitempty"`
	// Title is the scenario/property/fixture title (all shapes).
	Title string `json:"title,omitempty"`
	// Quantifier is the ∀-bound variable list of a property source (property only).
	Quantifier []string `json:"quantifier,omitempty"`
	// Predicate is the property's predicate text (property only).
	Predicate string `json:"predicate,omitempty"`
	// State / Command / Events are the three sections of a fixture source (fixture only).
	State   string   `json:"state,omitempty"`
	Command string   `json:"command,omitempty"`
	Events  []string `json:"events,omitempty"`
}

// GherkinStep is one parsed Given/When/Then/And step.
type GherkinStep struct {
	Keyword string `json:"keyword"` // Given | When | Then | And
	Text    string `json:"text"`
}

// Parse is the single entry: it parses a source for its (derived) shape via the shape's pure
// parser. PURE, TOTAL. Same (shape, source) → same ParsedSpec (the reproducibility property).
func Parse(shape Shape, source string) (ParsedSpec, error) {
	if strings.TrimSpace(source) == "" {
		return ParsedSpec{}, ErrEmptySource
	}
	switch shape {
	case ShapeGherkin:
		return ParseGherkin(source)
	case ShapeProperty:
		return ParseProperty(source)
	case ShapeFixture:
		return ParseFixture(source)
	default:
		return ParsedSpec{}, fmt.Errorf("%w: unknown shape %q", ErrParse, shape)
	}
}

var gherkinKeywords = map[string]bool{"given": true, "when": true, "then": true, "and": true}

// ParseGherkin parses a minimal Gherkin scenario (Scenario: + Given/When/Then/And steps). PURE.
// A source with no scenario title or no step is refused (ErrParse). It is a deterministic
// line-parser — never an LLM (the det-criterion of S68).
func ParseGherkin(source string) (ParsedSpec, error) {
	spec := ParsedSpec{Shape: ShapeGherkin}
	hasWhen, hasThen := false, false
	for _, raw := range strings.Split(source, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(strings.ToLower(line), "scenario:") {
			spec.Title = strings.TrimSpace(line[len("scenario:"):])
			continue
		}
		if strings.HasPrefix(strings.ToLower(line), "feature:") {
			continue
		}
		kw := strings.SplitN(line, " ", 2)
		if len(kw) != 2 || !gherkinKeywords[strings.ToLower(kw[0])] {
			return ParsedSpec{}, fmt.Errorf("%w (gherkin): line is neither a keyword step nor a header: %q", ErrParse, line)
		}
		lk := strings.ToLower(kw[0])
		keyword := strings.ToUpper(lk[:1]) + lk[1:]
		switch lk {
		case "when":
			hasWhen = true
		case "then":
			hasThen = true
		}
		spec.Steps = append(spec.Steps, GherkinStep{Keyword: keyword, Text: strings.TrimSpace(kw[1])})
	}
	if spec.Title == "" {
		return ParsedSpec{}, fmt.Errorf("%w (gherkin): no `Scenario:` title", ErrParse)
	}
	if len(spec.Steps) == 0 || !hasWhen || !hasThen {
		return ParsedSpec{}, fmt.Errorf("%w (gherkin): a scenario needs at least a When and a Then step", ErrParse)
	}
	return spec, nil
}

// ParseProperty parses a minimal property source:
//
//	property: <title>
//	forall: a, b, c
//	holds: <predicate>
//
// PURE. A property missing its forall-binding or its predicate is refused (ErrParse) — an ∃
// (a single example) is not a ∀ (the circularity ban, §8: the editor records, it never authors
// a ∀ it would satisfy). Deterministic — never an LLM.
func ParseProperty(source string) (ParsedSpec, error) {
	spec := ParsedSpec{Shape: ShapeProperty}
	for _, raw := range strings.Split(source, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		switch {
		case strings.HasPrefix(strings.ToLower(line), "property:"):
			spec.Title = strings.TrimSpace(line[len("property:"):])
		case strings.HasPrefix(strings.ToLower(line), "forall:"):
			for _, v := range strings.Split(line[len("forall:"):], ",") {
				if v = strings.TrimSpace(v); v != "" {
					spec.Quantifier = append(spec.Quantifier, v)
				}
			}
		case strings.HasPrefix(strings.ToLower(line), "holds:"):
			spec.Predicate = strings.TrimSpace(line[len("holds:"):])
		default:
			return ParsedSpec{}, fmt.Errorf("%w (property): unknown line %q (expected property:/forall:/holds:)", ErrParse, line)
		}
	}
	if spec.Title == "" {
		return ParsedSpec{}, fmt.Errorf("%w (property): no `property:` title", ErrParse)
	}
	if len(spec.Quantifier) == 0 {
		return ParsedSpec{}, fmt.Errorf("%w (property): no `forall:` binding — an ∃ is not a ∀ (KRD §8)", ErrParse)
	}
	if spec.Predicate == "" {
		return ParsedSpec{}, fmt.Errorf("%w (property): no `holds:` predicate", ErrParse)
	}
	return spec, nil
}

// ParseFixture parses a minimal state→command→events fixture source:
//
//	fixture: <title>
//	state: <state>
//	command: <command>
//	event: <event>          (one or more)
//
// PURE. A fixture missing state, command, or any event is refused (ErrParse). Deterministic —
// never an LLM.
func ParseFixture(source string) (ParsedSpec, error) {
	spec := ParsedSpec{Shape: ShapeFixture}
	for _, raw := range strings.Split(source, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		switch {
		case strings.HasPrefix(strings.ToLower(line), "fixture:"):
			spec.Title = strings.TrimSpace(line[len("fixture:"):])
		case strings.HasPrefix(strings.ToLower(line), "state:"):
			spec.State = strings.TrimSpace(line[len("state:"):])
		case strings.HasPrefix(strings.ToLower(line), "command:"):
			spec.Command = strings.TrimSpace(line[len("command:"):])
		case strings.HasPrefix(strings.ToLower(line), "event:"):
			if e := strings.TrimSpace(line[len("event:"):]); e != "" {
				spec.Events = append(spec.Events, e)
			}
		default:
			return ParsedSpec{}, fmt.Errorf("%w (fixture): unknown line %q (expected fixture:/state:/command:/event:)", ErrParse, line)
		}
	}
	if spec.Title == "" {
		return ParsedSpec{}, fmt.Errorf("%w (fixture): no `fixture:` title", ErrParse)
	}
	if spec.State == "" || spec.Command == "" {
		return ParsedSpec{}, fmt.Errorf("%w (fixture): a fixture needs a state: and a command:", ErrParse)
	}
	if len(spec.Events) == 0 {
		return ParsedSpec{}, fmt.Errorf("%w (fixture): a fixture needs at least one event:", ErrParse)
	}
	return spec, nil
}

// Draft is the pre-ChangeSet authoring state of a mirror — the brouillon two authors may edit
// concurrently. It is project-scoped (S55) and carries a monotone Version (the base for
// optimistic concurrency / CRDT merge). A Draft is NOT truth — it is below the wall, persisted
// only as a draft (never the mirrors schema) until ProposeMirror wraps it in a ChangeSet.
type Draft struct {
	// DraftID content-addresses the draft's identity (project + reflects + nature). Stable handle.
	DraftID   string           `json:"draft_id"`
	ProjectID string           `json:"project_id"`
	Reflects  records.LayerRef `json:"reflects"`
	Nature    TruthNature      `json:"nature"`
	Shape     Shape            `json:"shape"`
	// Title / Source are the two editable fields (the CRDT registers). Version is their base.
	Title   string `json:"title"`
	Source  string `json:"source"`
	Version int    `json:"version"`
}

// OpenDraft creates a fresh draft for a (project, layer, nature). The shape is DERIVED (never
// chosen). PURE. Refuses a missing project / reflects / unknown nature — never invents one.
func OpenDraft(projectID string, reflects records.LayerRef, nature TruthNature) (Draft, error) {
	if projectID == "" {
		return Draft{}, ErrNoProject
	}
	if reflects.LayerID == "" {
		return Draft{}, ErrNoReflects
	}
	d, err := DeriveShape(nature)
	if err != nil {
		return Draft{}, err
	}
	draft := Draft{
		ProjectID: projectID,
		Reflects:  reflects,
		Nature:    nature,
		Shape:     d.Shape,
		Version:   0,
	}
	id, err := draftID(draft)
	if err != nil {
		return Draft{}, err
	}
	draft.DraftID = id
	return draft, nil
}

// draftID content-addresses a draft over its identity fields (project + reflects + nature) —
// stable across edits (the editable Title/Source/Version are NOT part of identity). Reuses
// kernrecords.Canonicalize/Hash (S02). PURE.
func draftID(d Draft) (string, error) {
	body := struct {
		Kind      string           `json:"kind"`
		ProjectID string           `json:"project_id"`
		Reflects  records.LayerRef `json:"reflects"`
		Nature    TruthNature      `json:"nature"`
	}{Kind: "shapeeditor.draft", ProjectID: d.ProjectID, Reflects: d.Reflects, Nature: d.Nature}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	canon, err := kernrecords.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return kernrecords.Hash(canon), nil
}

// Edit is one author's proposed change to a draft, made against a BASE version. Only the fields
// the author actually touched are set (a nil pointer = "did not touch this field" — the CRDT
// register's tombstone-free representation). BaseVersion is the draft.Version the author started from.
type Edit struct {
	Author      string  `json:"author"`
	BaseVersion int     `json:"base_version"`
	Title       *string `json:"title,omitempty"`
	Source      *string `json:"source,omitempty"`
}

// EditConflict is a draft-level (lock) conflict — two concurrent edits to the SAME field with
// DIFFERENT values. It is BELOW the wall (a brouillon conflict, not a truth-write conflict S110).
// It names the field and both candidate values so the human resolves the lock; it is NEVER an
// arbitrary last-write-wins.
type EditConflict struct {
	Field   string `json:"field"` // "title" | "source"
	AuthorA string `json:"author_a"`
	ValueA  string `json:"value_a"`
	AuthorB string `json:"author_b"`
	ValueB  string `json:"value_b"`
}

// Errors for the concurrency merge.
var (
	// ErrStaleBase — an edit made against a base version older than the draft's current version
	// AND touching a field the draft has since changed (a genuine stale write).
	ErrStaleBase = errors.New("shapeeditor: edit base version is stale and conflicts (re-base required)")
	// ErrDraftConflict — two concurrent edits collide on the same field (a draft-level lock).
	ErrDraftConflict = errors.New("shapeeditor: concurrent edits conflict on the same field (lock, not last-write-wins)")
)

// MergeEdits is the DRAFT-LEVEL CONCURRENCY merge (the load-bearing concurrency criterion of
// S68): it folds two CONCURRENT edits (a, b — both made against the same base) into the draft,
// CRDT-style. PURE, TOTAL, DETERMINISTIC (order of a,b does not change the verdict).
//
//   - disjoint fields (a touches title, b touches source) → MERGE both;
//   - same field, same value → MERGE (idempotent, no conflict);
//   - same field, DIFFERENT value → CONFLICT — refused with ErrDraftConflict + an EditConflict
//     naming both candidates (a LOCK; the human resolves), NEVER a silent last-write-wins;
//   - an edit whose base version != the draft's current version is REJECTED as stale.
//
// On success it returns the merged draft with Version bumped once. The original is never mutated.
func MergeEdits(d Draft, a, b Edit) (Draft, []EditConflict, error) {
	if a.BaseVersion != d.Version || b.BaseVersion != d.Version {
		return d, nil, ErrStaleBase
	}
	merged := d
	var conflicts []EditConflict

	// title register.
	switch {
	case a.Title != nil && b.Title != nil && *a.Title != *b.Title:
		conflicts = append(conflicts, EditConflict{Field: "title", AuthorA: a.Author, ValueA: *a.Title, AuthorB: b.Author, ValueB: *b.Title})
	case a.Title != nil:
		merged.Title = *a.Title
	case b.Title != nil:
		merged.Title = *b.Title
	}

	// source register.
	switch {
	case a.Source != nil && b.Source != nil && *a.Source != *b.Source:
		conflicts = append(conflicts, EditConflict{Field: "source", AuthorA: a.Author, ValueA: *a.Source, AuthorB: b.Author, ValueB: *b.Source})
	case a.Source != nil:
		merged.Source = *a.Source
	case b.Source != nil:
		merged.Source = *b.Source
	}

	sort.Slice(conflicts, func(i, j int) bool { return conflicts[i].Field < conflicts[j].Field })
	if len(conflicts) > 0 {
		// A lock: the draft is NOT advanced, both candidates surface, the human resolves.
		return d, conflicts, ErrDraftConflict
	}
	merged.Version = d.Version + 1
	return merged, nil, nil
}

// ApplyEdit folds ONE author's edit against the draft's current version — the non-concurrent
// path (single author). An edit whose base version != the current version is rejected as stale
// (never a last-write-wins). PURE.
func ApplyEdit(d Draft, e Edit) (Draft, error) {
	if e.BaseVersion != d.Version {
		return d, ErrStaleBase
	}
	merged := d
	if e.Title != nil {
		merged.Title = *e.Title
	}
	if e.Source != nil {
		merged.Source = *e.Source
	}
	merged.Version = d.Version + 1
	return merged, nil
}

// Proposal is what ProposeMirror RETURNS: the parsed (validated) red mirror record AND the DRAFT
// ChangeSet (S20) that PROPOSES freezing it into the mirrors schema. A VALUE — nothing persisted.
// WroteMirror is ALWAYS false (the wall). The mirror is born RED (Liveness=dead).
type Proposal struct {
	ProjectID string              `json:"project_id"`
	Mirror    records.Mirror      `json:"mirror"`
	Parsed    ParsedSpec          `json:"parsed"`
	ChangeSet changeset.ChangeSet `json:"changeset"`
	// WroteMirror is ALWAYS false — the screen proposes, the wall path freezes truth (S20+approval).
	WroteMirror bool `json:"wrote_mirror"`
}

// ProposeMirror validates a draft's authored source for its derived shape, builds the RED mirror
// record (Liveness=dead — born red, "watch it fail"), and wraps it as the mirror_delta of a fresh
// DRAFT ChangeSet (S20), PROJECT-SCOPED. PURE, TOTAL.
//
//   - the shape is the draft's DERIVED shape (never re-chosen);
//   - the source is PARSED by the pure parser — an unparseable source is refused (ErrParse), never
//     a mirror persisted from invalid text;
//   - the mirror is RED (Liveness=dead) and authority=above (a truth's mirror is human-anchored);
//   - the ChangeSet carries ONLY a mirror_delta (a mirror authoring touches the Mirror plane, no
//     spec_delta — so the S20 completeness gate's spec⇒mirror obligation is vacuously satisfied);
//   - it WRITES NOTHING (WroteMirror false; the ChangeSet stays DRAFT): freezing goes via the wall.
//
// A missing project / reflects is refused; an empty / unparseable source is refused.
func ProposeMirror(d Draft, parentPhase string) (Proposal, error) {
	if d.ProjectID == "" {
		return Proposal{}, ErrNoProject
	}
	if d.Reflects.LayerID == "" {
		return Proposal{}, ErrNoReflects
	}
	der, err := DeriveShape(d.Nature)
	if err != nil {
		return Proposal{}, err
	}
	if der.Shape != d.Shape {
		// Defensive: a draft's shape must equal its derived shape (it is derived, never hand-set).
		return Proposal{}, fmt.Errorf("%w: draft shape %q != derived shape %q", ErrParse, d.Shape, der.Shape)
	}
	parsed, err := Parse(d.Shape, d.Source)
	if err != nil {
		return Proposal{}, err
	}

	// The RED mirror record (born dead/red — it reflects a layer @version but does not yet pass).
	specBody := struct {
		Kind      string           `json:"kind"`
		ProjectID string           `json:"project_id"`
		Reflects  records.LayerRef `json:"reflects"`
		Shape     Shape            `json:"shape"`
		Source    string           `json:"source"`
	}{Kind: "shapeeditor.mirror", ProjectID: d.ProjectID, Reflects: d.Reflects, Shape: d.Shape, Source: d.Source}
	raw, err := json.Marshal(specBody)
	if err != nil {
		return Proposal{}, err
	}
	canon, err := kernrecords.Canonicalize(raw)
	if err != nil {
		return Proposal{}, err
	}
	mirrorID := kernrecords.Hash(canon)

	mirror := records.Mirror{
		MirrorID:     mirrorID,
		Reflects:     d.Reflects,
		TestKind:     der.TestKind,
		CertLanguage: der.CertLanguage,
		Authority:    records.AuthorityAbove, // a truth's mirror is human-anchored (test-as-goal).
		Liveness:     records.LivenessDead,   // born RED — it has not run green yet ("watch it fail").
		ContentHash:  mirrorID,
	}

	// Wrap as the mirror_delta of a DRAFT ChangeSet (S20). Only a mirror_delta — a mirror authoring
	// touches the Mirror plane; no spec_delta (the spec⇒mirror gate is vacuously satisfied).
	mirrorDelta := changeset.Delta{
		Kind:   "add",
		Target: d.Reflects.LayerID,
		Body:   canon,
	}
	label := fmt.Sprintf("author %s mirror reflecting %s@%s (project %s)", d.Shape, d.Reflects.LayerID, d.Reflects.Version, d.ProjectID)
	cs, err := changeset.Open(label, parentPhase, nil, &mirrorDelta)
	if err != nil {
		return Proposal{}, fmt.Errorf("shapeeditor: open DRAFT changeset: %w", err)
	}

	return Proposal{
		ProjectID:   d.ProjectID,
		Mirror:      mirror,
		Parsed:      parsed,
		ChangeSet:   cs,
		WroteMirror: false,
	}, nil
}

// IsRed reports whether a proposed mirror is born red (Liveness=dead) — the "watch it fail"
// invariant of S68: a freshly authored mirror is always red. PURE.
func IsRed(p Proposal) bool { return p.Mirror.Liveness == records.LivenessDead }
