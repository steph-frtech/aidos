// pulumi_stack_target_test.go — DP33 PORTABILITÉ FUTURE-CLOUD mirror (property ∀ N1 + fixture).
//
// L'intention (DP33, clôture EPIC G + la piste DP) : prouver que le MÊME StackManifest se projette
// vers future_cloud SANS réécrire la déclaration. Le self-hosted et le cloud = deux PROJECTIONS de
// la même source ; aucune divergence de déclaration. « Une source → N projections ».
//
// LE MUR (CLAUDE.md §2). Le StackManifest reste l'UNIQUE source above-the-line ; les cibles
// (self-hosted, future_cloud) sont des PROJECTIONS below-the-line. La projection cloud est une
// FONCTION PURE du même manifest — déterministe, jamais un LLM. On RÉUTILISE EmitPulumiStack
// (self-hosted) + connresolve (DP07 managed_url) + scope (DP06 EnvFutureCloud) ; on ne duplique pas.
//
// LES TROIS PROPRIÉTÉS (écrites D'ABORD, RED → VERT) :
//
//	(1) REPRODUCTIBILITÉ PAR CIBLE — le même StackManifest émet vers self-hosted ET future_cloud,
//	    chaque cible re-émise byte-identique (∀, sous permutation d'ordre de service) ;
//	(2) MANAGED_URL — un service MANAGÉ (datastore, bus, cache) en future_cloud se résout en
//	    managed_url (DP07) au lieu d'un docker.Container (fixture) ;
//	(3) SOURCE INVARIANTE — la DÉCLARATION (le StackManifest) est INVARIANTE entre les cibles :
//	    zéro divergence, la même source produit les DEUX projections, la source n'est JAMAIS mutée.
package honoemit

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"pgregory.net/rapid"
)

// genStackForTarget draws an arbitrary projectable StackManifest carrying at least one MANAGED
// service (a datastore) so the future_cloud projection has something to resolve to managed_url.
func genStackForTarget(t *rapid.T) StackManifest {
	app := rapid.StringMatching(`[a-z][a-z0-9]{0,6}`).Draw(t, "app")
	svcs := []Service{
		{Name: "app", Role: RoleServer, Image: "img:latest", InternalPort: 3000},
		{Name: "db", Role: RoleDatastore, Image: "postgres:16-alpine", InternalPort: 5432},
	}
	port := 4000
	extra := rapid.IntRange(0, 2).Draw(t, "extra")
	managedRoles := []ServiceRole{RoleBus, RoleCache}
	for i := 0; i < extra; i++ {
		role := managedRoles[rapid.IntRange(0, len(managedRoles)-1).Draw(t, "mrole")]
		svcs = append(svcs, Service{Name: string(role) + string(rune('a'+i)), Role: role, Image: "i:latest", InternalPort: port})
		port++
	}
	return StackManifest{
		App:      app,
		Services: svcs,
		Volumes:  []Volume{{Name: "pgdata", Path: "/var/lib/postgresql/data"}},
		Network:  Network{Name: "traefik_default", External: true},
	}
}

// TestTarget_Closed — the target matrix is CLOSED: exactly self-hosted + future_cloud, in canonical
// order, every member recognised, an unknown target refused.
func TestTarget_Closed(t *testing.T) {
	want := []Target{TargetSelfHosted, TargetFutureCloud}
	got := Targets2()
	if len(got) != len(want) {
		t.Fatalf("target set size %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("target[%d] = %q, want %q", i, got[i], want[i])
		}
		if !IsTarget(got[i]) {
			t.Fatalf("IsTarget(%q) = false", got[i])
		}
	}
	if IsTarget("made-up-target") {
		t.Fatalf("an unknown target must NOT be a member of the closed set")
	}
}

// TestTarget_SelfHostedIsByteStableWithEmitPulumiStack — EmitPulumiStackTarget(…, TargetSelfHosted)
// is BYTE-IDENTICAL to the existing EmitPulumiStack (anti-overwrite §9: the self-hosted path is the
// SAME emitter, untouched — the cloud variant is purely ADDITIVE).
func TestTarget_SelfHostedIsByteStableWithEmitPulumiStack(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genStackForTarget(t)
		project := rapid.StringMatching(`[a-z][a-z0-9]{0,6}`).Draw(t, "project")
		env := rapid.SampledFrom([]string{"dev", "staging", "prod"}).Draw(t, "env")

		base, br := EmitPulumiStack(project, env, m)
		if br != nil {
			t.Fatalf("EmitPulumiStack refused a projectable manifest: %s", br.Explanation)
		}
		via, br := EmitPulumiStackTarget(project, env, m, TargetSelfHosted)
		if br != nil {
			t.Fatalf("EmitPulumiStackTarget(self-hosted) refused: %s", br.Explanation)
		}
		if len(base) != len(via) {
			t.Fatalf("self-hosted artifact COUNT diverged: %d vs %d", len(base), len(via))
		}
		for i := range base {
			if base[i].Path != via[i].Path {
				t.Fatalf("self-hosted artifact %d path diverged: %q vs %q", i, base[i].Path, via[i].Path)
			}
			if string(base[i].Bytes) != string(via[i].Bytes) {
				t.Fatalf("self-hosted artifact %q NOT byte-identical to EmitPulumiStack — the cloud variant must be ADDITIVE", base[i].Path)
			}
		}
	})
}

// TestTarget_ByteIdenticalPerTarget — PROPERTY (1): the same StackManifest emits to self-hosted AND
// future_cloud DETERMINISTICALLY ; each target re-emitted is byte-identical (∀, under service-order
// permutation). The reproducibility mirror across BOTH targets.
func TestTarget_ByteIdenticalPerTarget(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genStackForTarget(t)
		project := rapid.StringMatching(`[a-z][a-z0-9]{0,6}`).Draw(t, "project")

		// permute service order — the emitter is invariant (canonical name order owns bytes).
		permuted := m
		if len(m.Services) >= 2 {
			sv := append([]Service(nil), m.Services...)
			sv[0], sv[len(sv)-1] = sv[len(sv)-1], sv[0]
			permuted = StackManifest{App: m.App, Services: sv, Volumes: m.Volumes, Network: m.Network}
		}

		for _, tgt := range Targets2() {
			env := envForTarget(tgt)
			a1, br := EmitPulumiStackTarget(project, env, m, tgt)
			if br != nil {
				t.Fatalf("EmitPulumiStackTarget(%s) refused: %s", tgt, br.Explanation)
			}
			a2, br := EmitPulumiStackTarget(project, env, permuted, tgt)
			if br != nil {
				t.Fatalf("EmitPulumiStackTarget(%s) refused permuted: %s", tgt, br.Explanation)
			}
			if len(a1) != len(a2) {
				t.Fatalf("target %s artifact COUNT diverged: %d vs %d", tgt, len(a1), len(a2))
			}
			for i := range a1 {
				if a1[i].Path != a2[i].Path {
					t.Fatalf("target %s artifact %d path diverged: %q vs %q", tgt, i, a1[i].Path, a2[i].Path)
				}
				if string(a1[i].Bytes) != string(a2[i].Bytes) {
					t.Fatalf("target %s artifact %q NOT byte-identical under service-order permutation", tgt, a1[i].Path)
				}
				if a1[i].OutputHash != a2[i].OutputHash || a1[i].SourceHash != a2[i].SourceHash {
					t.Fatalf("target %s artifact %q hashes diverged", tgt, a1[i].Path)
				}
			}
		}
	})
}

// TestTarget_FutureCloudManagedURL — PROPERTY (2): a MANAGED service (datastore, bus, cache) in
// future_cloud resolves to managed_url (DP07), NOT to a docker.Container. Fixture over the gold
// topology + a bus.
func TestTarget_FutureCloudManagedURL(t *testing.T) {
	m := StackManifest{
		App: "shop",
		Services: []Service{
			{Name: "app", Role: RoleServer, Image: "traefik/whoami:latest", InternalPort: 80},
			{Name: "db", Role: RoleDatastore, Image: "postgres:16-alpine", InternalPort: 5432},
			{Name: "events", Role: RoleBus, Image: "nats:latest", InternalPort: 4222},
		},
		Volumes: []Volume{{Name: "pgdata", Path: "/var/lib/postgresql/data"}},
		Network: Network{Name: "traefik_default", External: true},
	}
	arts, br := EmitPulumiStackTarget("shop", string(scope.EnvFutureCloud), m, TargetFutureCloud)
	if br != nil {
		t.Fatalf("EmitPulumiStackTarget(future_cloud) refused the gold manifest: %s", br.Explanation)
	}
	prog := artByPath(t, arts, "gen/shop/infra/index.ts")
	s := string(prog.Bytes)

	// The managed services resolve to managed_url (DP07): the datastore + the bus are NOT
	// docker.Container resources in the cloud projection — they are managed-URL references.
	mustContain(t, s, "managed_url", "future_cloud managed services carry the managed_url mode")
	mustContain(t, s, "DB_MANAGED_URL", "the datastore resolves to its managed_url env reference (DP07)")
	mustContain(t, s, "EVENTS_MANAGED_URL", "the bus resolves to its managed_url env reference (DP07)")

	// A managed service is NOT containerised in the cloud projection (no docker.Container for db).
	if strings.Contains(s, `name: "shop-future_cloud-db"`) {
		t.Fatalf("a MANAGED datastore must NOT be a docker.Container in future_cloud:\n%s", s)
	}

	// The server (an APP service) IS still projected as a representative cloud resource.
	mustContain(t, s, "app", "the server is projected as a cloud resource")
}

// TestTarget_SourceInvariantAcrossTargets — PROPERTY (3) THE CAPITAL ONE: the DECLARATION (the
// source StackManifest) is INVARIANT between targets. The SAME source value produces BOTH
// projections, and the source is NEVER mutated by the projection (zero divergence at the source).
func TestTarget_SourceInvariantAcrossTargets(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genStackForTarget(t)
		project := rapid.StringMatching(`[a-z][a-z0-9]{0,6}`).Draw(t, "project")

		// Snapshot the source's content address BEFORE any projection.
		before, err := ManifestHash(m)
		if err != nil {
			t.Fatalf("ManifestHash refused a projectable manifest: %v", err)
		}

		// Project the SAME source value m to BOTH targets (no copy, no re-declaration).
		if _, br := EmitPulumiStackTarget(project, "prod", m, TargetSelfHosted); br != nil {
			t.Fatalf("self-hosted projection refused: %s", br.Explanation)
		}
		if _, br := EmitPulumiStackTarget(project, string(scope.EnvFutureCloud), m, TargetFutureCloud); br != nil {
			t.Fatalf("future_cloud projection refused: %s", br.Explanation)
		}

		// The source's content address is UNCHANGED after both projections — the declaration is
		// invariant ; a projection that mutated its source would shift this hash.
		after, err := ManifestHash(m)
		if err != nil {
			t.Fatalf("ManifestHash after projection: %v", err)
		}
		if before != after {
			t.Fatalf("the SOURCE StackManifest was MUTATED by projection: hash %q → %q (portability must be by PROJECTION, never by rewrite)", before, after)
		}

		// Project BOTH targets from the SAME source value at the SAME (project, env): the program
		// artifacts MUST carry the SAME SourceHash (one content-addressed declaration), and DIFFER
		// only in their OUTPUT bytes (the projection diverges, never the source). This is the
		// "une source → N projections, source invariante" property made concrete.
		selfArts, br := EmitPulumiStackTarget(project, "prod", m, TargetSelfHosted)
		if br != nil {
			t.Fatalf("self-hosted re-projection refused: %s", br.Explanation)
		}
		cloudArts, br := EmitPulumiStackTarget(project, "prod", m, TargetFutureCloud)
		if br != nil {
			t.Fatalf("future_cloud re-projection refused: %s", br.Explanation)
		}
		idxPath := "gen/" + project + "/infra/index.ts"
		selfProg := artByPathRapid(t, selfArts, idxPath)
		cloudProg := artByPathRapid(t, cloudArts, idxPath)
		if selfProg.SourceHash != cloudProg.SourceHash {
			t.Fatalf("the two projections do NOT share one source hash (%q vs %q): the declaration must be ONE invariant source",
				selfProg.SourceHash, cloudProg.SourceHash)
		}
		if string(selfProg.Bytes) == string(cloudProg.Bytes) {
			t.Fatalf("self-hosted and future_cloud emitted IDENTICAL bytes: the projection must DIFFER per target (managed_url cloud vs docker self-hosted)")
		}
	})
}

// artByPathRapid is the *rapid.T-flavoured artifact lookup (artByPath takes *testing.T).
func artByPathRapid(t *rapid.T, arts []Artifact, path string) Artifact {
	for _, a := range arts {
		if a.Path == path {
			return a
		}
	}
	t.Fatalf("artifact %q not emitted", path)
	return Artifact{}
}

// envForTarget returns the canonical environment a target is projected for: future_cloud for the
// cloud target, prod for self-hosted (any traefik_default env works; prod is the representative).
func envForTarget(tgt Target) string {
	if tgt == TargetFutureCloud {
		return string(scope.EnvFutureCloud)
	}
	return "prod"
}

// TestTarget_FutureCloudMalformedRefused — the honesty rule holds for the cloud target too: a
// malformed manifest or an unknown target is a typed BlockReason, never a partial render.
func TestTarget_FutureCloudMalformedRefused(t *testing.T) {
	good := goldManifest()
	if _, br := EmitPulumiStackTarget("p", string(scope.EnvFutureCloud), good, "made-up-target"); br == nil {
		t.Fatalf("an unknown target was NOT refused")
	}
	bad := StackManifest{App: "p", Services: []Service{{Name: "db", Role: RoleDatastore, Image: "postgres"}}} // no server
	if _, br := EmitPulumiStackTarget("p", string(scope.EnvFutureCloud), bad, TargetFutureCloud); br == nil {
		t.Fatalf("a malformed manifest was NOT refused by the cloud target")
	}
}
