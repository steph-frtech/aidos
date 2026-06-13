package connector_test

// Property mirror (∀) for the ConnectorSource governance type (DP20).
// reflects=kernel.connector_source · test_kind=property · cert_language=rapid ·
// liveness=live · authority=below (the invariants are computational properties of the
// pure Validate / ContentID — the governance RULE itself is the human's, above the line,
// graved through idée → miroir → /goal; the agent has no GRANT to write a Connector
// INSTANCE, only the TYPE + its Validation + its content-addressing, which is code §2).
// Run via `go test` (rapid is the frozen invariant slot, CLAUDE.md §3).
//
// The invariants (DP19 spike promoted + CLAUDE.md §2/§8 + KRD §13.7/§13.8/§44.3):
//
//  1. ROUND-TRIP CONTENT-ADDRESS. A ConnectorSource hashes to a STABLE id: the same
//     record byte-canonicalises to the same ContentID (S02 records.Hash reused), and
//     ANY field change yields a different id. ContentID is total + deterministic.
//  2. CLOSED CLASSIFICATION SET. A classification outside {internal,external,ai,cloud}
//     ⇒ Validate errors UNKNOWN_CONNECTOR_CLASS. A member always passes that gate.
//  3. CLOSED SCOPE SET. A scope outside {read_only,read_write} ⇒ Validate errors
//     UNKNOWN_CONNECTOR_SCOPE. A member always passes that gate.
//  4. AI-NEVER-DIRECT-TO-DB (the load-bearing DECLARED invariant, §44.3 / A3). A
//     connector classified `ai` whose egress_hosts include ANY datastore host ⇒ Validate
//     errors AI_DIRECT_DB_ACCESS_FORBIDDEN. The datastore set is a DECLARED closed set
//     (pure set-membership, never inferred). A non-ai connector with the same host passes.
//  5. RW-NEEDS-AUTHORITY. A read_write connector with NO well-formed AuthorityGraph ⇒
//     Validate errors CONNECTOR_RW_REQUIRES_AUTHORITY. A read_only connector needs none.
//  6. PURE / TOTAL / DETERMINISTIC. Validate never panics and returns the SAME verdict
//     for the same input (the reproducibility mirror, CLAUDE.md §6/§8).

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/connector"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"pgregory.net/rapid"
)

// wellFormedAuthority is an S16 graph that always Validates (a single approver, no veto).
func wellFormedAuthority() authority.AuthorityGraph {
	return authority.AuthorityGraph{
		Domain:    "connectors",
		TruthKind: "behavioral",
		Approvers: []authority.Role{"security"},
	}
}

// activeScope is a non-empty S15 scope (an active source must carry one).
func activeScope() scope.TruthScope {
	return scope.TruthScope{Region: scope.RegionFR, Environment: scope.EnvProd}
}

// drawKind draws one of the three closed connector kinds.
func drawKind(rt *rapid.T) connector.Kind {
	ks := connector.Kinds()
	return ks[rapid.IntRange(0, len(ks)-1).Draw(rt, "kind")]
}

// drawClassification draws a member of the closed classification set.
func drawClassification(rt *rapid.T) connector.Classification {
	cs := connector.Classifications()
	return cs[rapid.IntRange(0, len(cs)-1).Draw(rt, "classification")]
}

// drawAccessScope draws a member of the closed access-scope set.
func drawAccessScope(rt *rapid.T) connector.AccessScope {
	ss := connector.AccessScopes()
	return ss[rapid.IntRange(0, len(ss)-1).Draw(rt, "scope")]
}

// drawValid draws a well-formed ConnectorSource (no AI+datastore egress, RW carries
// an authority). It is the positive baseline every gate must admit.
func drawValid(rt *rapid.T) connector.ConnectorSource {
	cls := drawClassification(rt)
	// Force a non-ai classification so a datastore egress never trips invariant 4 here.
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

// Invariant 1 — round-trip content-address: stable id, change ⇒ new id.
func TestProp_ContentID_StableAndSensitive(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawValid(rt)
		id1 := connector.ContentID(c)
		id2 := connector.ContentID(c)
		if id1 != id2 {
			rt.Fatalf("ContentID not stable: %q vs %q", id1, id2)
		}
		if id1 == "" {
			rt.Fatalf("ContentID is empty")
		}
		// Any change to a content-bearing field yields a different id.
		c2 := c
		c2.Name = c.Name + "-x"
		if connector.ContentID(c2) == id1 {
			rt.Fatalf("ContentID insensitive to name change")
		}
	})
}

// Invariant 2 — closed classification set.
func TestProp_UnknownClassification_Rejected(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawValid(rt)
		c.Classification = connector.Classification(rapid.StringMatching(`[A-Z]{3,6}`).Draw(rt, "bad"))
		if err := connector.Validate(c); !errors.Is(err, connector.ErrUnknownClassification) {
			rt.Fatalf("expected ErrUnknownClassification, got %v", err)
		}
	})
}

// Invariant 3 — closed access-scope set.
func TestProp_UnknownScope_Rejected(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawValid(rt)
		c.Scope = connector.AccessScope(rapid.StringMatching(`[A-Z]{3,6}`).Draw(rt, "bad"))
		if err := connector.Validate(c); !errors.Is(err, connector.ErrUnknownScope) {
			rt.Fatalf("expected ErrUnknownScope, got %v", err)
		}
	})
}

// Invariant 4 — AI never direct to DB: an ai connector with a datastore egress is refused;
// the SAME host on a non-ai connector passes.
func TestProp_AIDirectDB_Forbidden(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		hosts := connector.DatastoreHosts()
		ds := hosts[rapid.IntRange(0, len(hosts)-1).Draw(rt, "datastore")]

		// An ai connector that egresses to a datastore is refused (read_only ⇒ no RW gate).
		ai := drawValid(rt)
		ai.Classification = connector.ClassAI
		ai.Scope = connector.ScopeReadOnly
		ai.Authority = authority.AuthorityGraph{}
		ai.EgressHosts = []string{"api.ok.com", string(ds)}
		if err := connector.Validate(ai); !errors.Is(err, connector.ErrAIDirectDBForbidden) {
			rt.Fatalf("ai+datastore egress %q must be ErrAIDirectDBForbidden, got %v", ds, err)
		}

		// The SAME datastore host on a non-ai connector is NOT this refusal (the invariant
		// is DECLARED for the ai plane only, never inferred for everyone).
		ext := drawValid(rt)
		ext.Classification = connector.ClassExternal
		ext.Scope = connector.ScopeReadOnly
		ext.Authority = authority.AuthorityGraph{}
		ext.EgressHosts = []string{string(ds)}
		if err := connector.Validate(ext); errors.Is(err, connector.ErrAIDirectDBForbidden) {
			rt.Fatalf("non-ai connector with datastore egress %q wrongly tripped AI invariant", ds)
		}
	})
}

// Invariant 5 — a read_write connector with no authority is refused; read_only needs none.
func TestProp_RWRequiresAuthority(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := drawValid(rt)
		// Force a non-ai classification so invariant 4 never shadows this gate.
		if c.Classification == connector.ClassAI {
			c.Classification = connector.ClassExternal
		}
		c.EgressHosts = []string{"api.ok.com"}
		c.Scope = connector.ScopeReadWrite
		c.Authority = authority.AuthorityGraph{} // empty ⇒ not well-formed
		if err := connector.Validate(c); !errors.Is(err, connector.ErrRWRequiresAuthority) {
			rt.Fatalf("rw without authority must be ErrRWRequiresAuthority, got %v", err)
		}

		// A read_only connector needs no authority — the same empty graph passes.
		c.Scope = connector.ScopeReadOnly
		if err := connector.Validate(c); errors.Is(err, connector.ErrRWRequiresAuthority) {
			rt.Fatalf("read_only connector wrongly required an authority")
		}
	})
}

// Invariant 6 — Validate is total + deterministic over arbitrary (possibly invalid) inputs.
func TestProp_Validate_TotalDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		c := connector.ConnectorSource{
			Layer:          connector.Layer(rapid.SampledFrom([]string{"above", "below", "x"}).Draw(rt, "layer")),
			Kind:           connector.Kind(rapid.StringMatching(`[a-z_]{3,12}`).Draw(rt, "kind")),
			Name:           rapid.StringMatching(`[a-z]{0,8}`).Draw(rt, "name"),
			Classification: connector.Classification(rapid.StringMatching(`[a-z]{0,10}`).Draw(rt, "cls")),
			Scope:          connector.AccessScope(rapid.StringMatching(`[a-z_]{0,12}`).Draw(rt, "scope")),
			EgressHosts:    rapid.SliceOf(rapid.StringMatching(`[a-z.]{0,16}`)).Draw(rt, "egress"),
		}
		e1 := connector.Validate(c)
		e2 := connector.Validate(c)
		if (e1 == nil) != (e2 == nil) {
			rt.Fatalf("Validate non-deterministic: %v vs %v", e1, e2)
		}
		_ = connector.ContentID(c) // must never panic
	})
}
