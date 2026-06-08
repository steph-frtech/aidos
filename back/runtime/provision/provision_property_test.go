package provision_test

// S89 — per-app datastore provisioner REPRODUCIBILITY + GATING mirror (property,
// rapid). reflects=s89-provision-datastore-per-app · test_kind=property · liveness=live.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Plan is a PURE function — same Spec →
// byte-identical Plan (same content-addressed id). These properties pin:
//   - reproducibility: re-planning the same spec yields the identical id + DDL;
//   - default by construction: the default target is ALWAYS plain-postgres unless a
//     LEGAL doltgres opt-in (a Go Decision) is chosen;
//   - the opt-in GATE: doltgres under a no-go/absent Decision is REFUSED (BlockReason),
//     never silently downgraded;
//   - per-project ISOLATION: two distinct projects never share a database/namespace;
//     the same project is stable.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/runtime/doltgresspike"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/steph-frtech/aidos/back/runtime/provision"
	"pgregory.net/rapid"
)

func goDecision() doltgresspike.Decision {
	return doltgresspike.Decide(doltgresspike.Measurement{
		Driver:       doltgresspike.DriverPgx,
		Conns:        64,
		FailedConns:  0,
		PerfRatio:    0.3,
		Reproducible: true,
	}, doltgresspike.DefaultThresholds)
}

func noGoDecision() doltgresspike.Decision {
	return doltgresspike.Decide(doltgresspike.Measurement{
		Driver:       doltgresspike.DriverPgx,
		Conns:        64,
		FailedConns:  9,
		PerfRatio:    0.3,
		Reproducible: true,
	}, doltgresspike.DefaultThresholds)
}

func sampleEntity(t *rapid.T) generators.EntitySource {
	name := rapid.SampledFrom([]string{"Order", "User", "Invoice", "Cart"}).Draw(t, "ent")
	return generators.EntitySource{
		ID:   "e_" + name,
		Kind: generators.KindEntity,
		Name: name,
		Fields: []generators.Field{
			{Name: "id", Type: "text"},
			{Name: "total", Type: "numeric"},
		},
	}
}

// Property 1: reproducibility — same spec → byte-identical plan (id + DDL).
func TestProvisionReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		pid := rapid.SampledFrom([]string{"proj-a", "proj-b", "proj-c"}).Draw(t, "pid")
		needsVector := rapid.Bool().Draw(t, "vec")
		spec := provision.Spec{
			ProjectID:   pid,
			Target:      provision.PlainPostgres,
			Decision:    goDecision(),
			Entities:    []generators.EntitySource{sampleEntity(t)},
			NeedsVector: needsVector,
		}
		p1, br1 := provision.BuildPlan(spec)
		p2, br2 := provision.BuildPlan(spec)
		if br1 != nil || br2 != nil {
			t.Fatalf("plain-postgres plan should not block: %v %v", br1, br2)
		}
		if p1.ID != p2.ID {
			t.Fatalf("plan id not reproducible: %s vs %s", p1.ID, p2.ID)
		}
		if p1.DDL != p2.DDL {
			t.Fatal("plan DDL not reproducible")
		}
	})
}

// Property 2: default by construction — plain-postgres is the default; an empty
// target resolves to plain-postgres; pgvector sidecar iff NeedsVector.
func TestProvisionDefaultIsPlainPostgres(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		empty := rapid.Bool().Draw(t, "empty")
		needsVector := rapid.Bool().Draw(t, "vec")
		target := provision.PlainPostgres
		if empty {
			target = ""
		}
		p, br := provision.BuildPlan(provision.Spec{
			ProjectID:   "proj-x",
			Target:      target,
			Decision:    goDecision(),
			Entities:    []generators.EntitySource{sampleEntity(t)},
			NeedsVector: needsVector,
		})
		if br != nil {
			t.Fatalf("plain-postgres must never block: %v", br)
		}
		if p.Target != provision.PlainPostgres {
			t.Fatalf("default target must be plain-postgres, got %q", p.Target)
		}
		if p.SupportsAsOf {
			t.Fatal("plain-postgres must not claim `as of` support")
		}
		if needsVector != (len(p.Sidecars) == 1) {
			t.Fatalf("pgvector sidecar iff NeedsVector: needs=%v sidecars=%d", needsVector, len(p.Sidecars))
		}
	})
}

// Property 3: the opt-in GATE — doltgres under a no-go/absent Decision is REFUSED;
// under a Go Decision it is allowed and supports `as of`.
func TestProvisionDoltgresGate(t *testing.T) {
	ent := []generators.EntitySource{{
		ID: "e_Order", Kind: generators.KindEntity, Name: "Order",
		Fields: []generators.Field{{Name: "id", Type: "text"}},
	}}

	// No-go: doltgres opt-in must be refused.
	if _, br := provision.BuildPlan(provision.Spec{
		ProjectID: "p", Target: provision.Doltgres, Decision: noGoDecision(), Entities: ent,
	}); br == nil {
		t.Fatal("doltgres opt-in under a no-go Decision must be refused")
	}

	// Absent (zero-value) Decision: doltgres opt-in must be refused.
	if _, br := provision.BuildPlan(provision.Spec{
		ProjectID: "p", Target: provision.Doltgres, Entities: ent,
	}); br == nil {
		t.Fatal("doltgres opt-in under an absent Decision must be refused")
	}

	// Go: doltgres opt-in allowed, `as of` supported, default STILL plain-postgres in escape.
	p, br := provision.BuildPlan(provision.Spec{
		ProjectID: "p", Target: provision.Doltgres, Decision: goDecision(), Entities: ent,
	})
	if br != nil {
		t.Fatalf("doltgres opt-in under a Go Decision must be allowed: %v", br)
	}
	if p.Target != provision.Doltgres || !p.SupportsAsOf {
		t.Fatalf("go doltgres plan must target doltgres + support `as of`: %+v", p.Target)
	}
}

// Property 4: per-project ISOLATION — distinct projects never share a
// database/namespace; the same project is stable.
func TestProvisionIsolation(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		a := rapid.StringMatching(`[a-z]{3,8}`).Draw(t, "a")
		b := rapid.StringMatching(`[a-z]{3,8}`).Draw(t, "b")
		ent := []generators.EntitySource{{
			ID: "e_Order", Kind: generators.KindEntity, Name: "Order",
			Fields: []generators.Field{{Name: "id", Type: "text"}},
		}}
		pa, _ := provision.BuildPlan(provision.Spec{ProjectID: a, Decision: goDecision(), Entities: ent})
		pb, _ := provision.BuildPlan(provision.Spec{ProjectID: b, Decision: goDecision(), Entities: ent})
		if a == b {
			if pa.Database != pb.Database || pa.Namespace != pb.Namespace {
				t.Fatal("same project must map to the same isolated datastore")
			}
		} else {
			if pa.Database == pb.Database || pa.Namespace == pb.Namespace {
				t.Fatalf("distinct projects must not collide: %q/%q db %q/%q", a, b, pa.Database, pb.Database)
			}
		}
	})
}

// Property 5: human-gate — a historical-impact migration without a declared
// DataTruthScope is REFUSED (db.RequireMigration surfaced verbatim).
func TestProvisionMigrationHumanGate(t *testing.T) {
	ent := []generators.EntitySource{{
		ID: "e_Order", Kind: generators.KindEntity, Name: "Order",
		Fields: []generators.Field{{Name: "id", Type: "text"}},
	}}
	// Historical impact, no declared scope ⇒ refused.
	if _, br := provision.BuildPlan(provision.Spec{
		ProjectID: "p", Decision: goDecision(), Entities: ent,
		Change: &db.Change{Entity: "Order", AppliesTo: []db.AppliesTo{db.AppliesExistingRecords}},
	}); br == nil {
		t.Fatal("historical-impact migration without a declared DataTruthScope must be refused")
	}
}
