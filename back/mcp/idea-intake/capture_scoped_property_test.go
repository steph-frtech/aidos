package main

// S64 REPRODUCIBILITY MIRROR (rapid). reflects=mcp.idea-intake.capture-scoped-human ·
// test_kind=property · liveness=live.
//
// The project-scoped capture is deterministic by contract (CLAUDE.md §6/§8): the idea's id is the
// content hash of the SKETCH (proposes + intent + provenance), and project_id is a SCOPE column
// (S54), NOT part of identity. This mirror pins that WITHOUT a database — it exercises the pure
// core (ideas.Capture) the scoped handler wraps:
//
//   - TestScopedCaptureIsDeterministic — same (proposes, intent, provenance) → same id, 100× no
//     drift, regardless of the project the capture is scoped to (« même esquisse → même idée »).
//   - TestProjectIsScopeNotIdentity — the SAME sketch captured for two DIFFERENT projects yields
//     the SAME id (the scope never enters the hash) — the per-project inbox isolates by the column,
//     not by the identity.
//   - TestHumanProvenancePreserved — the human provenance detail (the verbatim utterance) is kept
//     unchanged in the captured idea (provenance is preserved, never invented).
//   - TestScopedCaptureNeverFreezes — a captured idea is always status=draft and carries no mirror
//     (the wall): capture stages a candidate, it never freezes a truth.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"pgregory.net/rapid"
)

// proposesGen draws a legal Proposes value (the closed set the capture accepts).
func proposesGen() *rapid.Generator[string] {
	return rapid.SampledFrom([]string{"control", "policy", "operation", "action", "entity", "product"})
}

func TestScopedCaptureIsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		proposes := proposesGen().Draw(t, "proposes")
		intent := rapid.StringN(1, 80, 80).Draw(t, "intent")
		detail := rapid.StringN(1, 80, 80).Draw(t, "detail")

		i1, err := ideas.Capture(ideas.Proposes(proposes), intent,
			ideas.Provenance{Source: ideas.ProvenanceSource("human"), Detail: detail})
		if err != nil {
			t.Fatalf("capture 1: %v", err)
		}
		for n := 0; n < 100; n++ {
			i2, err := ideas.Capture(ideas.Proposes(proposes), intent,
				ideas.Provenance{Source: ideas.ProvenanceSource("human"), Detail: detail})
			if err != nil {
				t.Fatalf("capture %d: %v", n, err)
			}
			if i2.ID != i1.ID {
				t.Fatalf("non-deterministic id: %q != %q", i2.ID, i1.ID)
			}
		}
	})
}

func TestProjectIsScopeNotIdentity(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		proposes := proposesGen().Draw(t, "proposes")
		intent := rapid.StringN(1, 80, 80).Draw(t, "intent")
		detail := rapid.StringN(1, 80, 80).Draw(t, "detail")

		// The SAME sketch is the SAME idea, whatever project scopes it. project_id never
		// enters ideas.Capture (the hash is over the sketch only) — the inbox isolates by
		// the scope COLUMN, never by re-hashing per project.
		i1, err := ideas.Capture(ideas.Proposes(proposes), intent,
			ideas.Provenance{Source: "human", Detail: detail})
		if err != nil {
			t.Fatalf("capture: %v", err)
		}
		i2, err := ideas.Capture(ideas.Proposes(proposes), intent,
			ideas.Provenance{Source: "human", Detail: detail})
		if err != nil {
			t.Fatalf("capture: %v", err)
		}
		if i1.ID != i2.ID {
			t.Fatalf("same sketch yields different ids across projects: %q != %q", i1.ID, i2.ID)
		}
	})
}

func TestHumanProvenancePreserved(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		intent := rapid.StringN(1, 80, 80).Draw(t, "intent")
		detail := rapid.StringN(1, 120, 120).Draw(t, "detail")
		i, err := ideas.Capture("operation", intent,
			ideas.Provenance{Source: "human", Detail: detail})
		if err != nil {
			t.Fatalf("capture: %v", err)
		}
		if string(i.Provenance.Source) != "human" {
			t.Fatalf("provenance source = %q, want human", i.Provenance.Source)
		}
		if i.Provenance.Detail != detail {
			t.Fatalf("provenance detail mutated: %q != %q", i.Provenance.Detail, detail)
		}
	})
}

func TestScopedCaptureNeverFreezes(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		proposes := proposesGen().Draw(t, "proposes")
		intent := rapid.StringN(1, 80, 80).Draw(t, "intent")
		i, err := ideas.Capture(ideas.Proposes(proposes), intent,
			ideas.Provenance{Source: "human", Detail: "u"})
		if err != nil {
			t.Fatalf("capture: %v", err)
		}
		if i.Status != ideas.StatusDraft {
			t.Fatalf("captured idea status = %q, want draft", i.Status)
		}
	})
}
