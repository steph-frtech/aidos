package datafragments_test

// Invariant mirror (rapid property test, ∀ N1) — WRITTEN FIRST (RED→GREEN).
// reflects=dp15-substrate-data-fragments · test_kind=property · cert_language=rapid ·
// liveness=live · authority=above-the-line-source(stack_manifest) projected below.
//
// DP15 — the FOUR data-substrate service fragments emitted as deterministic
// StackManifest data (the DP14 measured palette → engraved fragments). The laws:
//
//   L1 byte-identique : ∀ (projectID, env) légaux, SubstrateDataFragments rend des
//      fragments dont le body canonique (records.Canonicalize) est BYTE-IDENTIQUE à
//      chaque appel — même projectID + même env ⇒ mêmes octets (déterminisme-first).
//   L2 palette close : EXACTEMENT 4 fragments (postgres, doltgres, valkey, pgbouncer),
//      chacun portant image + port interne + volume bind + healthcheck + depends_on +
//      profile(s) + project_id — jamais deviné, le jeu est clos.
//   L3 Doltgres en PROD refusé : env=prod ⇒ le fragment doltgres est REFUSÉ par la
//      règle DP06 EXISTANTE (envbindings.ValidateDatastore) avec le code
//      DOLTGRES_NOT_ALLOWED_IN_PROD — délégué, jamais forké.
//   L4 Doltgres en NON-PROD accepté : env ∈ {staging,dev,local,future_cloud} ⇒ le
//      fragment doltgres est présent, profile non-prod.
//   L5 isolation : project A ≠ project B ⇒ chaque fragment porte un project_id
//      distinct ET un nom de volume isolé ; A ne réutilise jamais l'octet de B
//      (forall A≠B, octets(A) ≠ octets(B)).
//   L6 profils : postgres/valkey/pgbouncer = core (toujours actifs) ; doltgres =
//      non-prod (opt-in). Les rôles/profils restent dans les ensembles clos DP02.
//   L7 le manifest émis est VALIDE (stackmanifest.Validate) une fois greffé sur un
//      server — DP15 ne fabrique aucune topologie illégale.

import (
	"bytes"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
	"pgregory.net/rapid"
)

// genProjectID draws a non-empty project id (the isolation seed).
func genProjectID(rt *rapid.T, label string) string {
	return rapid.StringMatching(`[a-z][a-z0-9-]{0,15}`).Draw(rt, label)
}

// genEnv draws one of the five closed environments.
func genEnv(rt *rapid.T, label string) scope.Environment {
	envs := scope.Environments()
	return envs[rapid.IntRange(0, len(envs)-1).Draw(rt, label)]
}

// canonOf canonicalises a fragment's body — the byte-identity oracle.
func canonOf(t *testing.T, f datafragments.ServiceFragment) []byte {
	t.Helper()
	b, err := datafragments.CanonicalFragment(f)
	if err != nil {
		t.Fatalf("CanonicalFragment: %v", err)
	}
	return b
}

// TestL1ByteIdentique — same (projectID, env) ⇒ byte-identical fragments, ×100.
// The full palette door is gated in prod (L3): there the property is that the
// refusal is DETERMINISTIC (same error code each call), not byte-identity of an
// absent result — honesty, the door fails the same way every time.
func TestL1ByteIdentique(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")

		a, errA := datafragments.SubstrateDataFragments(pid, env)
		b, errB := datafragments.SubstrateDataFragments(pid, env)

		// prod gates doltgres (DP06): the refusal must be DETERMINISTIC.
		if env == scope.EnvProd {
			if errA == nil || errB == nil {
				t.Fatal("prod must deterministically refuse the full palette (doltgres gate)")
			}
			var ra, rb *envbindings.Refusal
			if !envbindings.AsRefusal(errA, &ra) || !envbindings.AsRefusal(errB, &rb) || ra.Code != rb.Code {
				t.Fatalf("prod refusal must be deterministic: %v vs %v", errA, errB)
			}
			return
		}

		if errA != nil || errB != nil {
			t.Fatalf("legal non-prod (%q,%q) must not error: %v / %v", pid, env, errA, errB)
		}
		if len(a) != len(b) {
			t.Fatalf("non-deterministic fragment count: %d vs %d", len(a), len(b))
		}
		for i := range a {
			if !bytes.Equal(canonOf(t, a[i]), canonOf(t, b[i])) {
				t.Fatalf("fragment %d not byte-identical across calls", i)
			}
		}
	})
}

// TestL2PaletteClose — exactly the closed data palette, fully populated.
func TestL2PaletteClose(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		// A non-prod env so doltgres is present (the full closed palette).
		env := scope.EnvDev

		frags, err := datafragments.SubstrateDataFragments(pid, env)
		if err != nil {
			t.Fatalf("dev must not error: %v", err)
		}
		want := map[string]bool{"postgres": false, "doltgres": false, "valkey": false, "pgbouncer": false}
		for _, f := range frags {
			if _, ok := want[f.Key]; !ok {
				t.Fatalf("unknown fragment key %q (palette must be closed)", f.Key)
			}
			want[f.Key] = true
			if f.Service.Image == "" {
				t.Fatalf("%q: image required (DP14 measured)", f.Key)
			}
			if f.Service.InternalPort == 0 {
				t.Fatalf("%q: internal port required", f.Key)
			}
			if f.Service.Healthcheck == "" {
				t.Fatalf("%q: healthcheck required", f.Key)
			}
			if f.ProjectID != pid {
				t.Fatalf("%q: fragment must carry project_id %q, got %q", f.Key, pid, f.ProjectID)
			}
			if len(f.Volumes) == 0 {
				t.Fatalf("%q: a data service must carry a bind volume", f.Key)
			}
			if !stackmanifest.IsKnownRole(f.Service.Role) {
				t.Fatalf("%q: role %q outside the closed DP02 set", f.Key, f.Service.Role)
			}
			if !stackmanifest.IsKnownProfile(f.Service.Profile) {
				t.Fatalf("%q: profile %q outside the closed DP02 set", f.Key, f.Service.Profile)
			}
		}
		for k, seen := range want {
			if !seen {
				t.Fatalf("missing data fragment %q (the palette is fixed at four)", k)
			}
		}
	})
}

// TestL3DoltgresProdRefused — prod refuses doltgres via the EXISTING DP06 gate.
func TestL3DoltgresProdRefused(t *testing.T) {
	_, err := datafragments.SubstrateDataFragments("anyproj", scope.EnvProd)
	if err == nil {
		t.Fatal("prod must refuse the doltgres fragment (DOLTGRES_NOT_ALLOWED_IN_PROD)")
	}
	var ref *envbindings.Refusal
	if !envbindings.AsRefusal(err, &ref) {
		t.Fatalf("the refusal must be the DP06 *Refusal, got %T: %v", err, err)
	}
	if ref.Code != envbindings.CodeDoltgresNotAllowedInProd {
		t.Fatalf("expected %s, got %s", envbindings.CodeDoltgresNotAllowedInProd, ref.Code)
	}
}

// TestL3OnlyDoltgresGatedInProd — the OTHER three core fragments are NOT gated:
// SubstrateCoreFragments(prod) succeeds; only doltgres is the prod refusal.
func TestL3OnlyDoltgresGatedInProd(t *testing.T) {
	core, err := datafragments.SubstrateCoreFragments("anyproj", scope.EnvProd)
	if err != nil {
		t.Fatalf("the core (non-doltgres) data fragments must be legal in prod: %v", err)
	}
	for _, f := range core {
		if f.Key == "doltgres" {
			t.Fatal("doltgres must NOT appear among the prod core fragments")
		}
	}
	if len(core) != 3 {
		t.Fatalf("prod core = postgres + valkey + pgbouncer = 3, got %d", len(core))
	}
}

// TestL4DoltgresNonProdAccepted — every non-prod env accepts doltgres (profile non-prod).
func TestL4DoltgresNonProdAccepted(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		nonProd := []scope.Environment{scope.EnvStaging, scope.EnvDev, scope.EnvLocal, scope.EnvFutureCloud}
		env := nonProd[rapid.IntRange(0, len(nonProd)-1).Draw(rt, "nonprod")]
		pid := genProjectID(rt, "pid")

		frags, err := datafragments.SubstrateDataFragments(pid, env)
		if err != nil {
			t.Fatalf("non-prod (%q) must accept doltgres: %v", env, err)
		}
		var dolt *datafragments.ServiceFragment
		for i := range frags {
			if frags[i].Key == "doltgres" {
				dolt = &frags[i]
			}
		}
		if dolt == nil {
			t.Fatalf("non-prod (%q) must INCLUDE the doltgres fragment", env)
		}
		if dolt.Service.Profile != stackmanifest.ProfileNonProd {
			t.Fatalf("doltgres must carry profile non-prod, got %q", dolt.Service.Profile)
		}
	})
}

// TestL5Isolation — project A ≠ project B ⇒ distinct project_id + distinct volume
// names ⇒ byte-distinct fragments (the anti-collision frontier).
func TestL5Isolation(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		a := genProjectID(rt, "a")
		b := genProjectID(rt, "b")
		if a == b {
			return // distinct projects only
		}
		env := scope.EnvDev

		fa, _ := datafragments.SubstrateDataFragments(a, env)
		fb, _ := datafragments.SubstrateDataFragments(b, env)
		if len(fa) != len(fb) {
			t.Fatalf("same palette size expected: %d vs %d", len(fa), len(fb))
		}
		for i := range fa {
			if fa[i].ProjectID == fb[i].ProjectID {
				t.Fatalf("fragment %q: project_id must differ between A=%q and B=%q", fa[i].Key, a, b)
			}
			// Volume names must be isolated per project (no shared bind device key).
			for _, va := range fa[i].Volumes {
				for _, vb := range fb[i].Volumes {
					if va.Name == vb.Name {
						t.Fatalf("fragment %q: volume %q shared across projects (isolation breach)", fa[i].Key, va.Name)
					}
				}
			}
			if bytes.Equal(canonOf(t, fa[i]), canonOf(t, fb[i])) {
				t.Fatalf("fragment %q: A and B canonical bytes must differ (isolation)", fa[i].Key)
			}
		}
	})
}

// TestL6Profiles — core data services are core; doltgres is non-prod.
func TestL6Profiles(t *testing.T) {
	frags, err := datafragments.SubstrateDataFragments("proj", scope.EnvDev)
	if err != nil {
		t.Fatalf("dev: %v", err)
	}
	wantProfile := map[string]stackmanifest.Profile{
		"postgres":  stackmanifest.ProfileCore,
		"valkey":    stackmanifest.ProfileCore,
		"pgbouncer": stackmanifest.ProfileCore,
		"doltgres":  stackmanifest.ProfileNonProd,
	}
	for _, f := range frags {
		if wantProfile[f.Key] != f.Service.Profile {
			t.Fatalf("%q: profile %q, want %q", f.Key, f.Service.Profile, wantProfile[f.Key])
		}
	}
}

// TestL7GraftedManifestValid — the fragments grafted onto a minimal server form a
// VALID StackManifest (DP15 fabricates no illegal topology; unique ports, known
// roles/profiles, ≥1 server).
func TestL7GraftedManifestValid(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := scope.EnvDev
		frags, err := datafragments.SubstrateDataFragments(pid, env)
		if err != nil {
			t.Fatalf("dev: %v", err)
		}
		m := stackmanifest.StackManifest{
			AppName: "graft-" + pid + "x", // ensure non-empty
			Services: []stackmanifest.Service{
				{Name: "app", Role: stackmanifest.RoleServer, Image: "node:22-alpine", InternalPort: 3000, Profile: stackmanifest.ProfileCore},
			},
			Network: stackmanifest.Network{Name: "traefik_default", External: true},
		}
		for _, f := range frags {
			m.Services = append(m.Services, f.Service)
			m.Volumes = append(m.Volumes, f.Volumes...)
		}
		if err := stackmanifest.Validate(m); err != nil {
			t.Fatalf("grafted manifest must be valid: %v", err)
		}
	})
}

// TestCanonicalIsRecordsCanonical — CanonicalFragment delegates to records.Canonicalize
// (S02 reused, never forked): a key permutation yields the same bytes.
func TestCanonicalIsRecordsCanonical(t *testing.T) {
	frags, err := datafragments.SubstrateDataFragments("proj", scope.EnvDev)
	if err != nil {
		t.Fatalf("dev: %v", err)
	}
	for _, f := range frags {
		b := canonOf(t, f)
		again, err := records.Canonicalize(b)
		if err != nil {
			t.Fatalf("re-canonicalise: %v", err)
		}
		if !bytes.Equal(b, again) {
			t.Fatalf("%q: canonical form is not a records.Canonicalize fixpoint", f.Key)
		}
	}
}
