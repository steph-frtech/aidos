package dsleditor_test

// dsleditor_property_test.go — the S77 REPRODUCIBILITY mirror (rapid, KRD §6/§8
// determinism-first). The typed DSL parse + propose is a PURE function: same doc+parent
// ⇒ byte-identical Parsed.Canonical and byte-identical DRAFT ChangeSet id; the proposal
// is ALWAYS DRAFT and never carries applied_at (the wall). Parsing DSL = pure function.

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/dsleditor"
	"pgregory.net/rapid"
)

// policyDocGen draws a typed policy editor doc with a random name/target/effect.
func policyDocGen(t *rapid.T) dsleditor.DslDoc {
	name := rapid.StringMatching(`[a-z]{1,10}`).Draw(t, "name")
	target := rapid.StringMatching(`[a-z]{1,10}`).Draw(t, "target")
	effect := rapid.SampledFrom([]string{"ALLOW", "DENY"}).Draw(t, "effect")
	sel := rapid.SampledFrom([]string{"$.auth", "$.input", "$.cart"}).Draw(t, "sel")
	body, _ := json.Marshal(map[string]any{
		"kind": "policy", "name": name, "scope": "OPERATION", "target": target,
		"effect": effect, "rule": map[string]any{"kind": "exists", "sel": sel},
	})
	return dsleditor.DslDoc{Kind: dsleditor.KindPolicy, Name: name, Body: body}
}

// TestParseDeterministic — same doc ⇒ byte-identical canonical body and changeset id.
func TestParseDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		d := policyDocGen(t)
		p1, err1 := dsleditor.ProposeEdit(d, "phase-0")
		p2, err2 := dsleditor.ProposeEdit(d, "phase-0")
		if (err1 == nil) != (err2 == nil) {
			t.Fatalf("non-deterministic error: %v vs %v", err1, err2)
		}
		if err1 != nil {
			return
		}
		if !bytes.Equal(p1.Parsed.Canonical, p2.Parsed.Canonical) {
			t.Fatalf("canonical not byte-identical:\n%s\n%s", p1.Parsed.Canonical, p2.Parsed.Canonical)
		}
		if p1.ChangeSet.ID != p2.ChangeSet.ID {
			t.Fatalf("changeset id not stable: %s vs %s", p1.ChangeSet.ID, p2.ChangeSet.ID)
		}
	})
}

// TestProposeAlwaysDraft — every successful proposal is DRAFT, never APPLIED.
func TestProposeAlwaysDraft(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		d := policyDocGen(t)
		p, err := dsleditor.ProposeEdit(d, "phase-0")
		if err != nil {
			return
		}
		if p.ChangeSet.Status != changeset.StatusDraft {
			t.Fatalf("proposal not DRAFT: %s", p.ChangeSet.Status)
		}
		if p.ChangeSet.AppliedAt != nil {
			t.Fatalf("proposal carried applied_at (the wall is breached)")
		}
	})
}

// TestParseDocPureRoundTrip — ParseDoc is total over the generator and re-canonicalises stably.
func TestParseDocPureRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		d := policyDocGen(t)
		a, errA := dsleditor.ParseDoc(d)
		b, errB := dsleditor.ParseDoc(d)
		if (errA == nil) != (errB == nil) {
			t.Fatalf("ParseDoc not deterministic on error")
		}
		if errA != nil {
			return
		}
		if !bytes.Equal(a.Canonical, b.Canonical) {
			t.Fatalf("ParseDoc canonical drift")
		}
	})
}
