package control

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/expr"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// ErrParse is returned when a control body JSONB cannot be decoded into a Control.
var ErrParse = fmt.Errorf("control: malformed control-spec body")

// wireControl is the JSON body shape stored in kernel.control. The two conditions
// are stored as their Expr canonical JSONB (a nested AST), so the whole body reuses
// the SAME content-hash scheme as records / expr / policy (one address space, never
// a forked hashing path). `triggers` is the version-pinned control→action ref held
// INSIDE the body (KRD §28), not a separate link table.
type wireControl struct {
	Kind        string          `json:"kind"` // always "control" (the discriminator)
	Name        string          `json:"name"`
	View        string          `json:"view"`
	Label       string          `json:"label"`
	VisibleWhen json.RawMessage `json:"visible_when"`
	EnabledWhen json.RawMessage `json:"enabled_when"`
	Triggers    string          `json:"triggers"`
}

// Canonicalize returns the deterministic JSONB body of a Control: object keys sorted
// lexicographically (recursively), the two conditions as their canonical Expr ASTs.
// It is the form the control is hashed over (content-address), so
// records.Hash(Canonicalize(c)) is the kernel.control id/version. Reuses
// expr.Canonicalize for the nested ASTs and records.Canonicalize for the envelope —
// never a re-invented hashing path.
func Canonicalize(c Control) ([]byte, error) {
	if c.VisibleWhen == nil || c.EnabledWhen == nil {
		return nil, ErrMissingCondition
	}
	vw, err := expr.Canonicalize(c.VisibleWhen)
	if err != nil {
		return nil, fmt.Errorf("control: visible_when: %w", err)
	}
	ew, err := expr.Canonicalize(c.EnabledWhen)
	if err != nil {
		return nil, fmt.Errorf("control: enabled_when: %w", err)
	}
	w := wireControl{
		Kind:        "control",
		Name:        c.Name,
		View:        c.View,
		Label:       c.Label,
		VisibleWhen: vw,
		EnabledWhen: ew,
		Triggers:    c.Triggers,
	}
	raw, err := json.Marshal(w)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrParse, err)
	}
	// records.Canonicalize sorts keys recursively, giving the canonical envelope.
	return records.Canonicalize(raw)
}

// Parse decodes a Control from its canonical JSONB body, reusing expr.Parse for the
// two nested condition ASTs. The returned Control re-canonicalizes to the same bytes
// (the round-trip invariant the migration mirror pins).
func Parse(body []byte) (Control, error) {
	var w wireControl
	if err := json.Unmarshal(body, &w); err != nil {
		return Control{}, fmt.Errorf("%w: %v", ErrParse, err)
	}
	if w.Kind != "control" {
		return Control{}, fmt.Errorf("%w: kind=%q want control", ErrParse, w.Kind)
	}
	vw, err := expr.Parse(w.VisibleWhen)
	if err != nil {
		return Control{}, fmt.Errorf("control: visible_when: %w", err)
	}
	ew, err := expr.Parse(w.EnabledWhen)
	if err != nil {
		return Control{}, fmt.Errorf("control: enabled_when: %w", err)
	}
	return Control{
		Name:        w.Name,
		View:        w.View,
		Label:       w.Label,
		VisibleWhen: vw,
		EnabledWhen: ew,
		Triggers:    w.Triggers,
	}, nil
}
