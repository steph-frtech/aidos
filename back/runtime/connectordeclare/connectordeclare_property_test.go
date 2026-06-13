package connectordeclare_test

// Property mirror (∀) for the DP24 connector-declaration PROPOSE path.
// reflects=runtime.connectordeclare · test_kind=property · cert_language=rapid ·
// liveness=live · authority=above (the connector GOVERNANCE rule is the human's, graved
// through idée → miroir → /goal; these invariants are computational properties of the pure
// ProposeConnectorDeclaration — the agent has no GRANT to APPLY, only to PROPOSE §2).
// Run via `go test` (rapid is the frozen invariant slot, CLAUDE.md §3).
//
// The invariants (CLAUDE.md §2/§6/§8 + KRD §44):
//
//  1. ALWAYS DRAFT, NEVER APPLIED. ∀ valid source, the proposed ChangeSet is
//     StatusDraft with AppliedAt == nil (the wall — the agent never applies a truth-write).
//  2. DETERMINISTIC / REPRODUCIBLE. The same source ⇒ the SAME proposed ChangeSet (same id,
//     same status, same deltas) — ProposeConnectorDeclaration is pure (no clock/rng/I/O).
//  3. COMPLETE ENVELOPE (no monster). The proposed envelope always carries BOTH a spec_delta
//     and a mirror_delta, so changeset.SpecHasMirror admits it (it WOULD pass the gate).
//  4. SPEC BODY ROUND-TRIPS. The spec_delta body is byte-identical to connector.CanonicalBody
//     of the source (the exact bytes the aidos writer would grave) — the projection is PURE.
//  5. INVALID ⇒ NO DRAFT. ∀ source connector.Validate rejects, ProposeConnectorDeclaration
//     returns ErrInvalidConnector and an EMPTY ChangeSet (no DRAFT for a monster).

import (
	"bytes"
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/connector"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/connectordeclare"
	"pgregory.net/rapid"
)

func wellFormedAuthority() authority.AuthorityGraph {
	return authority.AuthorityGraph{
		Domain:    "connectors",
		TruthKind: "behavioral",
		Approvers: []authority.Role{"security"},
	}
}

func activeScope() scope.TruthScope {
	return scope.TruthScope{Region: scope.RegionFR, Environment: scope.EnvProd}
}

func drawKind(rt *rapid.T) connector.Kind {
	ks := connector.Kinds()
	return ks[rapid.IntRange(0, len(ks)-1).Draw(rt, "kind")]
}

func drawClassification(rt *rapid.T) connector.Classification {
	cs := connector.Classifications()
	return cs[rapid.IntRange(0, len(cs)-1).Draw(rt, "classification")]
}

func drawAccessScope(rt *rapid.T) connector.AccessScope {
	ss := connector.AccessScopes()
	return ss[rapid.IntRange(0, len(ss)-1).Draw(rt, "scope")]
}

// drawValid draws a well-formed ConnectorSource — non-ai classification (so a datastore
// egress never trips the invariant), RW carries an authority. The positive baseline.
func drawValid(rt *rapid.T) connector.ConnectorSource {
	cls := drawClassification(rt)
	if cls == connector.ClassAI {
		cls = connector.ClassExternal
	}
	acc := drawAccessScope(rt)
	c := connector.ConnectorSource{
		Layer:          connector.LayerAbove,
		Kind:           drawKind(rt),
		Name:           "conn-" + rapid.StringMatching(`[a-z]{3,8}`).Draw(rt, "name"),
		Classification: cls,
		Scope:          acc,
		Target:         connector.TargetGmail,
		EgressHosts:    []string{"api.example.com"},
		DataTruthScope: db.DataTruthScope{AppliesTo: []db.AppliesTo{db.AppliesNewRecords}},
		TruthScope:     activeScope(),
	}
	if acc == connector.ScopeReadWrite {
		c.Authority = wellFormedAuthority()
	}
	return c
}

// Invariant 1 + 3 — always DRAFT, never APPLIED, and a complete (committable) envelope.
func TestProp_Propose_AlwaysDraftComplete(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawValid(rt)
		cs, err := connectordeclare.ProposeConnectorDeclaration(c)
		if err != nil {
			rt.Fatalf("a valid source should propose, got %v", err)
		}
		if cs.Status != changeset.StatusDraft {
			rt.Fatalf("proposed status must be DRAFT (the wall), got %q", cs.Status)
		}
		if cs.AppliedAt != nil {
			rt.Fatalf("a proposed envelope is un-applied (no commit stamp), got %v", cs.AppliedAt)
		}
		if cs.SpecDelta == nil || cs.MirrorDelta == nil {
			rt.Fatalf("the envelope must carry BOTH a spec_delta and a mirror_delta (no monster)")
		}
		if br := changeset.SpecHasMirror(cs); br != nil {
			rt.Fatalf("the proposed envelope must be committable (no monster), got %s", br.Code)
		}
		if cs.ID == "" {
			rt.Fatalf("the proposed ChangeSet must be content-addressed")
		}
	})
}

// Invariant 2 — deterministic / reproducible: same source ⇒ same proposed ChangeSet.
func TestProp_Propose_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawValid(rt)
		a, err1 := connectordeclare.ProposeConnectorDeclaration(c)
		b, err2 := connectordeclare.ProposeConnectorDeclaration(c)
		if err1 != nil || err2 != nil {
			rt.Fatalf("valid source should propose twice cleanly, got %v / %v", err1, err2)
		}
		if a.ID != b.ID {
			rt.Fatalf("proposed id not stable: %q vs %q", a.ID, b.ID)
		}
		if a.Status != b.Status || a.Label != b.Label || a.ParentPhase != b.ParentPhase {
			rt.Fatalf("proposed envelope not reproducible across calls")
		}
		// A change to a content-bearing field of the source yields a different proposed id.
		c2 := c
		c2.Name = c.Name + "-x"
		other, err := connectordeclare.ProposeConnectorDeclaration(c2)
		if err != nil {
			rt.Fatalf("propose of the changed source failed: %v", err)
		}
		if other.ID == a.ID {
			rt.Fatalf("proposed id insensitive to a source change (content-address broken)")
		}
	})
}

// Invariant 4 — the spec_delta body round-trips the source's S02 canonical body.
func TestProp_Propose_SpecBodyRoundTrips(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawValid(rt)
		cs, err := connectordeclare.ProposeConnectorDeclaration(c)
		if err != nil {
			rt.Fatalf("valid source should propose, got %v", err)
		}
		want, err := connector.CanonicalBody(c)
		if err != nil {
			rt.Fatalf("canonical body of a valid source failed: %v", err)
		}
		if !bytes.Equal([]byte(cs.SpecDelta.Body), want) {
			rt.Fatalf("spec_delta body does not round-trip the source canonical body")
		}
	})
}

// Invariant 5 — an invalid source ⇒ ErrInvalidConnector + an EMPTY ChangeSet (no DRAFT).
func TestProp_Propose_InvalidNoDraft(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawValid(rt)
		// Break the source: an unknown kind always trips connector.Validate first.
		c.Kind = connector.Kind(rapid.StringMatching(`[A-Z]{3,6}`).Draw(rt, "bad_kind"))
		cs, err := connectordeclare.ProposeConnectorDeclaration(c)
		if !errors.Is(err, connectordeclare.ErrInvalidConnector) {
			rt.Fatalf("expected ErrInvalidConnector for an invalid source, got %v", err)
		}
		if cs.Status != "" || cs.ID != "" {
			rt.Fatalf("no DRAFT must be opened for an invalid source, got %+v", cs)
		}
	})
}
