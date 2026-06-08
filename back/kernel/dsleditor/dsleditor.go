// Package dsleditor is the S77 TYPED DSL EDITOR surface (KRD §24, EPIC 6): the
// Workbench authoring path by which a USER edits the four behaviour DSLs — Operation
// (validate/authorize/read/mutate/return, incl. the async/scheduled verbs of S73),
// Policy (the recursive ALLOW/DENY tree), and the verticale Control+Action
// (visible_when/enabled_when/triggers → invoke operation) — WITHOUT writing free
// code. Every edit is a TYPED FORM (a structured wire body, not a code string) that a
// PURE parser turns into the existing DSL AST (the S09/S10/S11 contracts, never a
// fork), validates, and PROPOSES as a DRAFT ChangeSet.
//
// THE NO-FREE-CODE LAW (KRD §24, "behaviour in DSL, never free code"). A DslDoc
// carries a `kind` ∈ {operation, policy, control, action} and a typed `body` whose
// shape is the DSL's wire shape — there is no `code` field, no `script`, no `eval`.
// ParseDoc is a TOTAL pure function from the typed body to the DSL AST; an unknown
// kind or a malformed body yields a TYPED error, never a guess (the honesty rule).
//
// THE WALL (CLAUDE.md §2). This package writes NOTHING. ProposeEdit runs the pure
// parser + the DSL's own Validate, then wraps the canonical AST into a DRAFT
// changeset.ChangeSet (spec_delta + mirror_delta, project-scoped target
// "dsl-edit@<kind>:<name>"). The changeset is `proposed` (DRAFT) — never APPLIED,
// WroteKernel stays false; freezing goes through the wall (idée → miroir → /goal →
// approbation humaine). A truth-write from the screen is impossible by construction.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). ParseDoc + ProposeEdit are PURE, TOTAL: no DB,
// no clock, no RNG, no I/O. Same doc+parent ⇒ byte-identical DRAFT (the content
// address pins it). The reproducibility mirror (dsleditor_property_test.go, rapid)
// proves it. The verticale fixture (dsleditor_fixture_test.go, state→cmd→events)
// proves an AUTHORIZED control triggers its AUTHORIZED operation and an enabled_when
// false BLOCKS the action — reusing the FROZEN control/action/operation/policy
// interpreters (S09/S10/S11), never a second evaluator.
package dsleditor

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/policy"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Kind is the CLOSED set of DSLs the typed editor serves (KRD §24.1–§24.4). Nothing
// outside this set is editable — there is no free-code kind.
type Kind string

const (
	// KindOperation — the Operation DSL (validate/authorize/read/mutate/return, S10/S73).
	KindOperation Kind = "operation"
	// KindPolicy — the Policy DSL (the recursive ALLOW/DENY tree, S09).
	KindPolicy Kind = "policy"
	// KindControl — the control-spec (visible_when/enabled_when/triggers, S11).
	KindControl Kind = "control"
	// KindAction — the action-spec (binds control → operation, S11).
	KindAction Kind = "action"
)

// kinds is the closed set in canonical order — the Workbench legend reads it, never invents one.
var kinds = []Kind{KindOperation, KindPolicy, KindControl, KindAction}

// Kinds returns the four editable DSL kinds in canonical order.
func Kinds() []Kind { return append([]Kind(nil), kinds...) }

// IsKind reports whether k is one of the four editable DSL kinds.
func IsKind(k string) bool {
	for _, kk := range kinds {
		if string(kk) == k {
			return true
		}
	}
	return false
}

// Typed editor errors — all TYPED, never a panic (the honesty rule).
var (
	// ErrUnknownKind — a DslDoc whose kind is not one of the four editable DSLs.
	ErrUnknownKind = errors.New("dsleditor: kind is not one of the four editable DSLs (no free-code kind)")
	// ErrFreeCode — a body carries a free-code escape (a `code`/`script`/`eval` field). The typed
	// editor forbids free code: behaviour is DSL all the way down (KRD §24).
	ErrFreeCode = errors.New("dsleditor: a typed editor forbids free code (no code/script/eval field, KRD §24)")
	// ErrEmptyName — a DslDoc with no name (every edited source is named, so the changeset target resolves).
	ErrEmptyName = errors.New("dsleditor: doc has no name")
	// ErrBadBody — the typed body does not parse for its kind (a malformed form). Wraps the DSL's parse error.
	ErrBadBody = errors.New("dsleditor: typed body does not parse for its kind")
)

// DslDoc is one TYPED EDITOR DOCUMENT: a kind, a name, and the typed wire body the
// user's form produced. There is NO code field — the body IS the DSL's structured
// shape. A control/action body additionally needs the known refs to validate (an
// orphan trigger/bind is a monster) — they are supplied on the doc, not the body, so
// the body stays a pure DSL fragment.
type DslDoc struct {
	// Kind is the DSL being edited (must be in Kinds()).
	Kind Kind `json:"kind"`
	// Name is the edited source's name (e.g. "createOrder", "can-checkout"). Required.
	Name string `json:"name"`
	// Body is the typed wire body — the DSL's own JSON shape (operationWire/policyWire/…). No free code.
	Body json.RawMessage `json:"body"`
	// KnownActions are the action refs a control's `triggers` may resolve to (control kind only).
	KnownActions []string `json:"known_actions,omitempty"`
	// KnownControls / KnownOperations are the refs an action's on/invoke may resolve to (action kind only).
	KnownControls   []string `json:"known_controls,omitempty"`
	KnownOperations []string `json:"known_operations,omitempty"`
}

// Parsed is the result of ParseDoc: the kind + the canonical AST body (the bytes the
// changeset carries) plus the typed AST values for whichever DSL was edited (exactly
// one is non-nil). The caller reads the typed value for a Workbench preview; the
// changeset carries Canonical.
type Parsed struct {
	Kind      Kind                 `json:"kind"`
	Name      string               `json:"name"`
	Canonical json.RawMessage      `json:"canonical"`
	Operation *operation.Operation `json:"operation,omitempty"`
	Async     *operation.Async     `json:"async,omitempty"`
	Policy    *policy.Policy       `json:"policy,omitempty"`
	Control   *control.Control     `json:"control,omitempty"`
	Action    *action.Action       `json:"action,omitempty"`
}

// hasFreeCode reports whether a body smuggles a free-code escape — a top-level
// `code`, `script`, or `eval` field. The typed editor refuses it: behaviour is DSL,
// never free code (KRD §24). PURE.
func hasFreeCode(body json.RawMessage) bool {
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(body, &probe); err != nil {
		return false // a non-object body cannot smuggle a named code field; ParseDoc rejects it downstream.
	}
	for _, banned := range []string{"code", "script", "eval"} {
		if _, ok := probe[banned]; ok {
			return true
		}
	}
	return false
}

// ParseDoc is the PURE, TOTAL parse of a typed editor doc into its DSL AST. It rejects
// an unknown kind, a free-code escape, an empty name, and a malformed body (wrapping
// the DSL's own typed parse error). It NEVER evaluates and NEVER panics. The returned
// Parsed.Canonical re-canonicalises identically (the round-trip the property mirror
// pins). DETERMINISTIC: same doc ⇒ same Parsed.
func ParseDoc(d DslDoc) (Parsed, error) {
	if !IsKind(string(d.Kind)) {
		return Parsed{}, fmt.Errorf("%w: %q", ErrUnknownKind, d.Kind)
	}
	if d.Name == "" {
		return Parsed{}, ErrEmptyName
	}
	if hasFreeCode(d.Body) {
		return Parsed{}, ErrFreeCode
	}
	switch d.Kind {
	case KindOperation:
		return parseOperationDoc(d)
	case KindPolicy:
		return parsePolicyDoc(d)
	case KindControl:
		return parseControlDoc(d)
	case KindAction:
		return parseActionDoc(d)
	default:
		// Unreachable (IsKind gated above) — kept total.
		return Parsed{}, fmt.Errorf("%w: %q", ErrUnknownKind, d.Kind)
	}
}

// canonicalise marshals a value then re-canonicalises it through records.Canonicalize
// (S02) so the changeset body is key-order-stable and content-addressable. PURE.
func canonicalise(v any) (json.RawMessage, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(canon), nil
}

// Proposal is the result of proposing a typed edit: the parsed AST (echoed for the
// Workbench preview) plus a DRAFT ChangeSet carrying its canonical body — never
// APPLIED. The changeset's spec_delta carries the AST, project-scoped; its
// mirror_delta declares the proof obligation (completeness — a spec needs a mirror).
// Approval (apply) is the `aidos` CLI's job, gated by the AuthorityGraph — ProposeEdit
// only proposes.
type Proposal struct {
	Parsed    Parsed              `json:"parsed"`
	ChangeSet changeset.ChangeSet `json:"changeset"`
}

// ProposeEdit parses a typed editor doc and wraps its canonical AST into a DRAFT
// changeset.ChangeSet — the single legal way a DSL edit reaches truth. It WRITES
// NOTHING: changeset.Open is PURE. The returned changeset is `proposed` (DRAFT,
// WroteKernel false); a human approves (applies) or rejects it downstream — a reject
// leaves the kernel intact because ProposeEdit never touched it.
//
//   - parentPhase is the stable phase the proposal moves from (the project's current head).
//   - The spec_delta target is "dsl-edit@<kind>:<name>" so a reject/approve is project-scoped.
func ProposeEdit(d DslDoc, parentPhase string) (Proposal, error) {
	parsed, err := ParseDoc(d)
	if err != nil {
		return Proposal{}, err
	}
	target := fmt.Sprintf("dsl-edit@%s:%s", parsed.Kind, parsed.Name)
	label := fmt.Sprintf("dsleditor: propose %s edit %q", parsed.Kind, parsed.Name)
	spec := &changeset.Delta{Kind: "add", Target: target, Body: parsed.Canonical}
	mirror := &changeset.Delta{Kind: "add", Target: target + "#mirror"}
	cs, err := changeset.Open(label, parentPhase, spec, mirror)
	if err != nil {
		return Proposal{}, err
	}
	return Proposal{Parsed: parsed, ChangeSet: cs}, nil
}
