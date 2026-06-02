package semanticdiff_test

// SemanticDiff classification fixture (two kernel versions old/new → Classify → change_type),
// interpreted in Go. reflects=runtime.semanticdiff.Classify · test_kind=fixture ·
// cert_language=operation-dsl/go · liveness=live · authority=above (the classification RULE —
// scope→rescope, incompatible enabled_when→override, cosmetic→load-bearing→reweight — is the
// human's, KRD §44.1/§11/§12/§96/§44.2).
//
// Materialized source: tests/runtime/semanticdiff_classify.fixture.md (the human-readable fixture,
// conceptually stored in the `mirrors` schema; persisted to Postgres at S06 — bootstrap exception).
// This test loads the eight fixture rows; if a fixture intention disappears the test breaks (no
// silent rot into a monster).
//
// The example artifacts (checkout-button, refund-policy, help-link, promo-banner, session,
// legacy-checkout) are REUSED from the prior pinned steps' examples; this step coins none. The
// bodies are the canonical JSONB the kernel rows carry (S02 substrate); Classify reads their nature.

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/semanticdiff"
)

// art builds an Artifact from a Go body value (marshaled to JSON) and a version tag.
func art(version string, body any) semanticdiff.Artifact {
	if body == nil {
		return semanticdiff.Artifact{Version: version}
	}
	b, err := json.Marshal(body)
	if err != nil {
		panic(err) // a fixture body must marshal; a panic here is a broken fixture, not a Classify crash
	}
	return semanticdiff.Artifact{Version: version, Body: b}
}

// classifyRow asserts Classify(old,new).ChangeType == want for a named fixture row.
func classifyRow(t *testing.T, name string, old, new semanticdiff.Artifact, want semanticdiff.ChangeType) {
	t.Helper()
	got := semanticdiff.Classify(old, new)
	if got.ChangeType != want {
		t.Fatalf("%s: Classify change_type = %q, want %q (open_question=%q)", name, got.ChangeType, want, got.OpenQuestion)
	}
}

// Row A — THE done criterion: an incompatible enabled_when is an OVERRIDE (a revoked promise).
// control "checkout-button" enabled_when "$.form.valid && !$.submitting" → "$.form.valid".
func TestRowA_IncompatibleEnabledWhen_Override(t *testing.T) {
	old := art("v1", map[string]any{
		"kind":         "control",
		"name":         "checkout-button",
		"enabled_when": map[string]any{"call": "&&", "args": []any{"$.form.valid", map[string]any{"call": "!", "args": []any{"$.submitting"}}}},
	})
	new := art("v2", map[string]any{
		"kind":         "control",
		"name":         "checkout-button",
		"enabled_when": "$.form.valid",
	})
	classifyRow(t, "A incompatible enabled_when", old, new, semanticdiff.ChangeOverride)
}

// Row B — THE done criterion: a scope change is a RESCOPE, not an override.
// rule "refund-policy" scope cells [EU] → [EU,US], body otherwise identical.
func TestRowB_ScopeChange_Rescope(t *testing.T) {
	old := art("v1", map[string]any{
		"kind":  "truth",
		"name":  "refund-policy",
		"scope": map[string]any{"cells": []any{"EU"}},
	})
	new := art("v2", map[string]any{
		"kind":  "truth",
		"name":  "refund-policy",
		"scope": map[string]any{"cells": []any{"EU", "US"}},
	})
	classifyRow(t, "B scope widened", old, new, semanticdiff.ChangeRescope)
}

// Row C — THE done criterion: cosmetic → load-bearing is a REWEIGHT.
// composes(parent=checkout, child=help-link) weight cosmetic → load-bearing.
func TestRowC_CosmeticToLoadBearing_Reweight(t *testing.T) {
	old := art("v1", map[string]any{
		"kind":      "link",
		"link_kind": "composes",
		"parent":    map[string]any{"id": "checkout", "version": "v1"},
		"child":     map[string]any{"id": "help-link", "version": "v1"},
		"weight":    "cosmetic",
	})
	new := art("v2", map[string]any{
		"kind":      "link",
		"link_kind": "composes",
		"parent":    map[string]any{"id": "checkout", "version": "v1"},
		"child":     map[string]any{"id": "help-link", "version": "v1"},
		"weight":    "load-bearing",
	})
	classifyRow(t, "C cosmetic→load-bearing", old, new, semanticdiff.ChangeReweight)
}

// Row D — a constraint in free space is an ADD (no prior version, KRD §11).
func TestRowD_FreeSpace_Add(t *testing.T) {
	old := art("", nil) // free space — no prior constraint touches the promo-banner region
	new := art("v1", map[string]any{
		"kind":         "control",
		"name":         "promo-banner",
		"visible_when": "$.promo.active",
	})
	classifyRow(t, "D free space", old, new, semanticdiff.ChangeAdd)
}

// Row E — a stricter consistent constraint is a REFINE (narrows, no contradiction, KRD §11).
// policy "session" allow "creds.valid" → adds deny_after "3 fails", allow unchanged.
func TestRowE_ConsistentNarrowing_Refine(t *testing.T) {
	old := art("v1", map[string]any{
		"kind":  "policy",
		"name":  "session",
		"allow": "creds.valid",
	})
	new := art("v2", map[string]any{
		"kind":       "policy",
		"name":       "session",
		"allow":      "creds.valid",
		"deny_after": "3 fails",
	})
	classifyRow(t, "E consistent narrowing", old, new, semanticdiff.ChangeRefine)
}

// Row F — a lifecycle move to deprecated is a DEPRECATE (body unchanged, KRD §44.2).
func TestRowF_LifecycleToDeprecated_Deprecate(t *testing.T) {
	old := art("v3", map[string]any{
		"kind":      "truth",
		"name":      "legacy-checkout",
		"lifecycle": "active",
	})
	new := art("v4", map[string]any{
		"kind":      "truth",
		"name":      "legacy-checkout",
		"lifecycle": "deprecated",
	})
	classifyRow(t, "F lifecycle→deprecated", old, new, semanticdiff.ChangeDeprecate)
}

// Row G — an unclassifiable change becomes an OpenQuestion, NEVER a guessed change_type.
// A shape Classify cannot map: an existing field is replaced by an unrelated one (not an add,
// not a clean refine, no scope/weight/enabled_when/lifecycle dimension).
func TestRowG_Unclassifiable_OpenQuestion(t *testing.T) {
	old := art("v1", map[string]any{
		"kind": "truth",
		"name": "x",
		"foo":  "alpha",
	})
	new := art("v2", map[string]any{
		"kind": "truth",
		"name": "x",
		"foo":  "beta", // an existing field CHANGED, no recognized dimension — not a §44.1 type here
	})
	diff := semanticdiff.Classify(old, new)
	if diff.ChangeType != semanticdiff.ChangeUnclassifiable {
		t.Fatalf("G unclassifiable: change_type = %q, want %q", diff.ChangeType, semanticdiff.ChangeUnclassifiable)
	}
	if diff.OpenQuestion == "" {
		t.Fatalf("G unclassifiable: an unclassifiable result MUST carry an OpenQuestion (provenance), not be silent")
	}
}

// Row H — identity ⇒ no change (old == new canonically) — never a spurious type.
func TestRowH_Identity_None(t *testing.T) {
	body := map[string]any{"kind": "truth", "name": "refund-policy", "scope": map[string]any{"cells": []any{"EU"}}}
	classifyRow(t, "H identity", art("v1", body), art("v1", body), semanticdiff.ChangeNone)
}
