// filterbyprofile_property_test.go — the DP11 BDD mirror (property ∀ N1,
// rapid), WRITTEN FIRST and red (FilterByProfile does not exist yet), then
// green. DP11 composes DETERMINISTIC PROFILES over the DP02/DP03 substrate:
// each service carries one+ profile in the CLOSED SPEC-stack-2026 set
// {core, docs, observability, qa, git, tickets, connectors, non-prod, full};
// the emission includes/excludes services by the SELECTED profile, BYTE-IDENTICAL
// per selection; an out-of-set profile ⇒ UNKNOWN_PROFILE; the cross
// non-prod × prod ⇒ Doltgres refused (the DP06 rule reused); full = the
// deterministic UNION (count == all). The emitter stays PURE; the profile is a
// DECLARED parameter, never inferred — include/exclude is a pure filter over the
// closed set. The laws it pins (ROADMAP-provisioning-deploy §DP11):
//
//  1. REPRODUCIBILITY PER SELECTION — FilterByProfile(m, p, env) then Emit is a
//     PURE function of (Canonicalize(manifest), p): the SAME manifest + SAME
//     selection yields a byte-identical docker-compose.yml twice (∀×2) and ×100
//     on the pinned Example.
//  2. UNKNOWN PROFILE — a selection OUTSIDE the closed set is refused with the
//     BlockReason UNKNOWN_PROFILE, never coerced or silently treated as full.
//  3. NON-PROD × PROD — selecting `non-prod` against env `prod` is refused with
//     DOLTGRES_NOT_ALLOWED_IN_PROD (the DP06 gate reused verbatim).
//  4. FULL IS THE UNION — FilterByProfile(m, full, env) keeps EVERY service
//     (count == len(m.Services)); the union loses nothing.
//  5. INCLUDE/EXCLUDE IS A PURE FILTER — the kept set is EXACTLY the services
//     whose closed profile set contains the selection (or core, which always
//     runs); a service is kept iff stackmanifest.ServiceInProfile(svc, p).
//  6. NARROWING — a non-full selection keeps a SUBSET of full (∀ services kept
//     by p are also kept by full), and core services are kept by EVERY profile.
package composeemit

import (
	"bytes"
	"fmt"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"pgregory.net/rapid"
)

// genValidManifestDP11 draws a VALID StackManifest for the profile mirror: an
// app name, 1..6 uniquely-named services with unique internal ports, a forced
// role=server service[0] (profile core, so a server always survives any
// selection), roles/profiles inside their closed sets, the external network.
func genValidManifestDP11(t *rapid.T) stackmanifest.StackManifest {
	app := rapid.StringMatching(`[a-z][a-z0-9-]{0,14}`).Draw(t, "app")
	n := rapid.IntRange(1, 6).Draw(t, "n_services")
	names := map[string]bool{}
	ports := map[int]bool{}
	roles := stackmanifest.Roles()
	profiles := stackmanifest.Profiles()
	services := make([]stackmanifest.Service, 0, n)
	for i := 0; i < n; i++ {
		name := rapid.StringMatching(`[a-z][a-z0-9]{0,9}`).
			Filter(func(s string) bool { return !names[s] }).
			Draw(t, fmt.Sprintf("svc_name_%d", i))
		names[name] = true
		port := rapid.IntRange(1024, 65535).
			Filter(func(p int) bool { return !ports[p] }).
			Draw(t, fmt.Sprintf("svc_port_%d", i))
		ports[port] = true
		role := roles[rapid.IntRange(0, len(roles)-1).Draw(t, fmt.Sprintf("svc_role_%d", i))]
		profile := profiles[rapid.IntRange(0, len(profiles)-1).Draw(t, fmt.Sprintf("svc_profile_%d", i))]
		// `full` is the UNION selection, never a per-service declared profile —
		// keep the per-service profiles inside the per-service subset.
		if profile == stackmanifest.ProfileFull {
			profile = stackmanifest.ProfileCore
		}
		if i == 0 {
			role = stackmanifest.RoleServer
			profile = stackmanifest.ProfileCore // a server always runs (core)
		}
		services = append(services, stackmanifest.Service{
			Name:         name,
			Role:         role,
			Image:        rapid.SampledFrom([]string{"", "node:22-alpine", "postgres:17-alpine", "valkey:8-alpine"}).Draw(t, fmt.Sprintf("svc_image_%d", i)),
			InternalPort: port,
			Profile:      profile,
			Healthcheck:  rapid.SampledFrom([]string{"", "wget -q --spider http://localhost/health"}).Draw(t, fmt.Sprintf("svc_hc_%d", i)),
		})
	}
	return stackmanifest.StackManifest{
		AppName:  app,
		Services: services,
		Network:  stackmanifest.Network{Name: "traefik_default", External: true},
	}
}

// selectableProfiles is the closed set MINUS none — every profile is a legal
// selection (the per-service `full`-folding above keeps the manifest valid).
func selectableProfiles() []stackmanifest.Profile { return stackmanifest.Profiles() }

// nonProdEnv draws an env OTHER than prod (the DP06 rule only bites on prod).
func nonProdEnv(t *rapid.T) scope.Environment {
	envs := []scope.Environment{}
	for _, e := range scope.Environments() {
		if e != scope.EnvProd {
			envs = append(envs, e)
		}
	}
	return envs[rapid.IntRange(0, len(envs)-1).Draw(t, "non_prod_env")]
}

// Law 1 — ∀ valid manifest + ∀ selection (off the non-prod×prod cross): the
// profile-filtered emission is byte-identical twice (purity per selection).
func TestProperty_FilterByProfile_ByteIdenticalPerSelection(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifestDP11(t)
		sel := selectableProfiles()[rapid.IntRange(0, len(selectableProfiles())-1).Draw(t, "sel")]
		env := nonProdEnv(t) // avoid the DP06 refusal, isolate purity here

		f1, br1 := FilterByProfile(m, sel, env)
		f2, br2 := FilterByProfile(m, sel, env)
		if br1 != nil || br2 != nil {
			t.Fatalf("valid selection refused: %v %v", br1, br2)
		}
		a1, e1 := Emit(f1)
		a2, e2 := Emit(f2)
		if e1 != nil || e2 != nil {
			t.Fatalf("filtered manifest refused by Emit: %v %v", e1, e2)
		}
		if !bytes.Equal(a1.Bytes, a2.Bytes) || a1.OutputHash != a2.OutputHash {
			t.Fatalf("profile-filtered emission is not byte-identical for selection %q", sel)
		}
	})
}

// Law 1b — the pinned Example filtered to core emits byte-identically ×100.
func TestExample_FilterByProfile_Core100Times(t *testing.T) {
	f, br := FilterByProfile(stackmanifest.Example(), stackmanifest.ProfileCore, scope.EnvDev)
	if br != nil {
		t.Fatalf("Example core selection refused: %+v", br)
	}
	ref, e := Emit(f)
	if e != nil {
		t.Fatalf("Example core emission refused: %+v", e)
	}
	for i := 0; i < 100; i++ {
		again, br := FilterByProfile(stackmanifest.Example(), stackmanifest.ProfileCore, scope.EnvDev)
		if br != nil {
			t.Fatalf("run %d refused: %+v", i, br)
		}
		a, e := Emit(again)
		if e != nil {
			t.Fatalf("run %d emission refused: %+v", i, e)
		}
		if !bytes.Equal(a.Bytes, ref.Bytes) || a.OutputHash != ref.OutputHash {
			t.Fatalf("run %d diverged from the reference core emission", i)
		}
	}
}

// Law 2 — ∀ selection OUTSIDE the closed set ⇒ UNKNOWN_PROFILE, never a guess.
func TestProperty_FilterByProfile_UnknownProfileRefused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifestDP11(t)
		bad := rapid.StringMatching(`[a-z]{3,12}`).
			Filter(func(s string) bool { return !stackmanifest.IsKnownProfile(stackmanifest.Profile(s)) }).
			Draw(t, "bad_profile")
		env := scope.Environments()[rapid.IntRange(0, len(scope.Environments())-1).Draw(t, "env")]

		f, br := FilterByProfile(m, stackmanifest.Profile(bad), env)
		if br == nil {
			t.Fatalf("an out-of-set profile %q was accepted", bad)
		}
		if br.Code != "UNKNOWN_PROFILE" {
			t.Fatalf("want UNKNOWN_PROFILE, got %q", br.Code)
		}
		if len(f.Services) != 0 {
			t.Fatalf("a refused selection must keep no services")
		}
		if br.Explanation == "" || len(br.HowToFix) == 0 {
			t.Fatalf("BlockReason must be actionable (explanation + how_to_fix)")
		}
	})
}

// Law 3 — selecting `non-prod` against `prod` ⇒ DOLTGRES_NOT_ALLOWED_IN_PROD
// (the DP06 gate reused); off the cross (any other env, or any other profile in
// prod) it passes.
func TestProperty_FilterByProfile_NonProdInProdRefused(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifestDP11(t)

		// the cross: non-prod × prod ⇒ refused.
		_, br := FilterByProfile(m, stackmanifest.ProfileNonProd, scope.EnvProd)
		if br == nil {
			t.Fatalf("non-prod selection against prod was accepted (DP06 broken)")
		}
		if br.Code != "DOLTGRES_NOT_ALLOWED_IN_PROD" {
			t.Fatalf("want DOLTGRES_NOT_ALLOWED_IN_PROD, got %q", br.Code)
		}

		// off the cross: non-prod against a non-prod env passes.
		if _, br := FilterByProfile(m, stackmanifest.ProfileNonProd, nonProdEnv(t)); br != nil {
			t.Fatalf("non-prod off prod must pass, got %q", br.Code)
		}

		// off the cross: another profile against prod passes (only non-prod bites).
		other := stackmanifest.ProfileCore
		if _, br := FilterByProfile(m, other, scope.EnvProd); br != nil {
			t.Fatalf("core against prod must pass, got %q", br.Code)
		}
	})
}

// Law 4 — full = the deterministic UNION: every service survives (count ==
// len(m.Services)), and the filtered manifest is byte-identical to the unfiltered
// emission (full changes nothing).
func TestProperty_FilterByProfile_FullIsTheUnion(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifestDP11(t)
		env := scope.Environments()[rapid.IntRange(0, len(scope.Environments())-1).Draw(t, "env")]

		f, br := FilterByProfile(m, stackmanifest.ProfileFull, env)
		if br != nil {
			t.Fatalf("full selection refused: %+v", br)
		}
		if len(f.Services) != len(m.Services) {
			t.Fatalf("full is the union: kept %d, want all %d", len(f.Services), len(m.Services))
		}
		// full emits exactly the unfiltered emission (no service dropped/added).
		full, e1 := Emit(f)
		raw, e2 := Emit(m)
		if e1 != nil || e2 != nil {
			t.Fatalf("emit refused: %v %v", e1, e2)
		}
		if !bytes.Equal(full.Bytes, raw.Bytes) {
			t.Fatalf("full ≠ unfiltered emission: the union must lose nothing")
		}
	})
}

// Law 5 — include/exclude is a PURE filter over the closed set: the kept set is
// EXACTLY {svc | ServiceInProfile(svc, selection)}.
func TestProperty_FilterByProfile_KeptSetIsTheClosedFilter(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifestDP11(t)
		sel := selectableProfiles()[rapid.IntRange(0, len(selectableProfiles())-1).Draw(t, "sel")]
		env := nonProdEnv(t)

		f, br := FilterByProfile(m, sel, env)
		if br != nil {
			t.Fatalf("valid selection refused: %+v", br)
		}
		want := map[string]bool{}
		for _, svc := range m.Services {
			if stackmanifest.ServiceInProfile(svc, sel) {
				want[svc.Name] = true
			}
		}
		if len(f.Services) != len(want) {
			t.Fatalf("kept %d services, the closed filter wants %d (selection %q)", len(f.Services), len(want), sel)
		}
		for _, svc := range f.Services {
			if !want[svc.Name] {
				t.Fatalf("service %q kept but not in the closed filter for %q", svc.Name, sel)
			}
		}
	})
}

// Law 6 — narrowing: a non-full selection keeps a SUBSET of full, and core
// services are kept by EVERY profile (a core service always runs).
func TestProperty_FilterByProfile_NarrowsAndKeepsCore(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genValidManifestDP11(t)
		sel := selectableProfiles()[rapid.IntRange(0, len(selectableProfiles())-1).Draw(t, "sel")]
		env := nonProdEnv(t)

		f, br := FilterByProfile(m, sel, env)
		if br != nil {
			t.Fatalf("valid selection refused: %+v", br)
		}
		kept := map[string]bool{}
		for _, svc := range f.Services {
			kept[svc.Name] = true
		}
		// subset of full (full keeps everything, so any kept name exists in m).
		for _, svc := range m.Services {
			isCore := svc.Profile == stackmanifest.ProfileCore
			if isCore && !kept[svc.Name] {
				t.Fatalf("core service %q dropped by selection %q (core always runs)", svc.Name, sel)
			}
		}
	})
}

// The two new BlockReason codes are enumerable members of the closed enum
// (DP11 additive extension) — the wall /why-blocked panel can list them.
func TestFilterByProfile_BlockCodesAreEnumerated(t *testing.T) {
	want := map[blockreason.Code]bool{
		blockreason.CodeUnknownProfile:           false,
		blockreason.CodeDoltgresNotAllowedInProd: false,
	}
	for _, c := range blockreason.Codes() {
		if _, ok := want[c]; ok {
			want[c] = true
		}
	}
	for code, seen := range want {
		if !seen {
			t.Fatalf("DP11 BlockReason code %q is not enumerated in the closed enum", code)
		}
	}
}
