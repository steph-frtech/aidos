package stackmanifest_test

// Invariant mirror (rapid property test, ∀ N1): reflects=kernel.stack_manifest,
// test_kind=property, cert_language=rapid, liveness=live, authority=above
//
// DP02 — the StackManifest engraved as a first-class Kernel SOURCE. The laws:
//
//   L1 round-trip content-addressed : ∀ manifest valide, NewRecord(manifest)
//      donne id == version == records.Hash(records.Canonicalize(body)) — le même
//      body (même sous permutation de clés JSON) donne TOUJOURS le même hash.
//   L2 reproductibilité : Validate + CanonicalBody + Hash sont des fonctions
//      pures — même entrée → même sortie, ×100 (le miroir de reproductibilité).
//   L3 rôle hors ensemble clos ⇒ refus UNKNOWN_SERVICE_ROLE (jamais deviné).
//   L4 deux ports internes identiques ⇒ refus DUPLICATE_INTERNAL_PORT.
//   L5 aucun service role=server ⇒ refus STACK_HAS_NO_SERVER.
//   L6 nom d'app manquant ⇒ refus STACK_NAME_REQUIRED.
//   L7 profile hors ensemble clos ⇒ refus UNKNOWN_PROFILE.
//   L8 sensibilité : changer un octet logique du manifest change le hash
//      (append-only : la tête bouge par NOUVELLE version, jamais en place).

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"pgregory.net/rapid"
)

// genValidManifest draws a valid StackManifest: a required app name, at least one
// role=server service, unique internal ports, roles and profiles inside the two
// closed sets.
func genValidManifest(rt *rapid.T) stackmanifest.StackManifest {
	roles := stackmanifest.Roles()
	profiles := stackmanifest.Profiles()

	n := rapid.IntRange(1, 6).Draw(rt, "n_services")
	services := make([]stackmanifest.Service, 0, n)
	usedPorts := map[int]bool{}
	usedNames := map[string]bool{}
	for i := 0; i < n; i++ {
		port := rapid.IntRange(1024, 65535).
			Filter(func(p int) bool { return !usedPorts[p] }).
			Draw(rt, "port")
		usedPorts[port] = true
		name := rapid.StringMatching(`[a-z][a-z0-9-]{0,11}`).
			Filter(func(s string) bool { return !usedNames[s] && s != "dup" }).
			Draw(rt, "svc_name")
		usedNames[name] = true
		role := roles[rapid.IntRange(0, len(roles)-1).Draw(rt, "role")]
		if i == 0 {
			role = stackmanifest.RoleServer // L5: at least one server
		}
		services = append(services, stackmanifest.Service{
			Name:         name,
			Role:         role,
			Image:        rapid.StringMatching(`[a-z]{2,8}:[a-z0-9.]{1,8}`).Draw(rt, "image"),
			InternalPort: port,
			Profile:      profiles[rapid.IntRange(0, len(profiles)-1).Draw(rt, "profile")],
			Healthcheck:  rapid.StringMatching(`[a-z /:-]{0,16}`).Draw(rt, "health"),
		})
	}
	nv := rapid.IntRange(0, 2).Draw(rt, "n_volumes")
	volumes := make([]stackmanifest.Volume, 0, nv)
	for i := 0; i < nv; i++ {
		volumes = append(volumes, stackmanifest.Volume{
			Name:      rapid.StringMatching(`[a-z][a-z0-9_]{0,9}`).Draw(rt, "vol_name"),
			DeviceVar: "APP_DATA_PATH",
		})
	}
	return stackmanifest.StackManifest{
		AppName:  rapid.StringMatching(`[a-z][a-z0-9-]{0,15}`).Draw(rt, "app"),
		Services: services,
		Volumes:  volumes,
		Network:  stackmanifest.Network{Name: "traefik_default", External: true},
		ConnectorScopes: rapid.SliceOfN(
			rapid.StringMatching(`[a-z]{2,8}:[a-z-]{2,12}`), 0, 3,
		).Draw(rt, "scopes"),
	}
}

// L1 + L2 — round-trip content-addressed + reproducibility mirror.
func TestStackManifest_RoundTripContentAddressed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		m := genValidManifest(rt)

		if err := stackmanifest.Validate(m); err != nil {
			t.Fatalf("valid manifest refused: %v", err)
		}

		rec, err := stackmanifest.NewRecord(m)
		if err != nil {
			t.Fatalf("NewRecord: %v", err)
		}
		// content-address invariant: id == version == Hash(Canonicalize(body)).
		canon, err := records.Canonicalize(rec.Body)
		if err != nil {
			t.Fatalf("Canonicalize: %v", err)
		}
		want := records.Hash(canon)
		if rec.ID != want || rec.Version != want {
			t.Fatalf("content address broken: id=%q version=%q want=%q", rec.ID, rec.Version, want)
		}
		// the body carries the kind discriminator stack_manifest.
		var probe struct {
			Kind string `json:"kind"`
		}
		if err := json.Unmarshal(rec.Body, &probe); err != nil || probe.Kind != "stack_manifest" {
			t.Fatalf("body kind = %q err=%v, want stack_manifest", probe.Kind, err)
		}

		// L2: same manifest → same record, ×100 (pure, no clock, no RNG).
		for i := 0; i < 100; i++ {
			again, err := stackmanifest.NewRecord(m)
			if err != nil {
				t.Fatalf("re-NewRecord: %v", err)
			}
			if again.ID != rec.ID || string(again.Body) != string(rec.Body) {
				t.Fatalf("re-emission %d not byte-identical: %q != %q", i, again.ID, rec.ID)
			}
		}

		// L8: a logical byte change ⇒ a different hash (a NEW version).
		mutated := m
		mutated.AppName = m.AppName + "x"
		rec2, err := stackmanifest.NewRecord(mutated)
		if err != nil {
			t.Fatalf("NewRecord(mutated): %v", err)
		}
		if rec2.ID == rec.ID {
			t.Fatalf("hash blind to a content change: %q", rec.ID)
		}
	})
}

// L3 — a role outside the closed set is refused, never guessed.
func TestStackManifest_UnknownServiceRoleRefused(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		m := genValidManifest(rt)
		bad := rapid.StringMatching(`[a-z]{3,10}`).
			Filter(func(s string) bool { return !stackmanifest.IsKnownRole(stackmanifest.Role(s)) }).
			Draw(rt, "bad_role")
		i := rapid.IntRange(0, len(m.Services)-1).Draw(rt, "i")
		m.Services[i].Role = stackmanifest.Role(bad)

		err := stackmanifest.Validate(m)
		assertCode(t, err, "UNKNOWN_SERVICE_ROLE")
		if _, rerr := stackmanifest.NewRecord(m); rerr == nil {
			t.Fatal("NewRecord accepted an invalid manifest (unknown role)")
		}
	})
}

// L4 — two identical internal ports are refused.
func TestStackManifest_DuplicateInternalPortRefused(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		m := genValidManifest(rt)
		dup := stackmanifest.Service{
			Name:         "dup",
			Role:         stackmanifest.RoleCache,
			Image:        "valkey:8",
			InternalPort: m.Services[0].InternalPort, // collide
			Profile:      stackmanifest.ProfileCore,
		}
		m.Services = append(m.Services, dup)

		assertCode(t, stackmanifest.Validate(m), "DUPLICATE_INTERNAL_PORT")
	})
}

// L5 — a stack without a role=server service is refused.
func TestStackManifest_NoServerRefused(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		m := genValidManifest(rt)
		for i := range m.Services {
			if m.Services[i].Role == stackmanifest.RoleServer {
				m.Services[i].Role = stackmanifest.RoleDatastore
			}
		}
		assertCode(t, stackmanifest.Validate(m), "STACK_HAS_NO_SERVER")
	})
}

// L6 — the app name is required.
func TestStackManifest_NameRequired(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		m := genValidManifest(rt)
		m.AppName = ""
		assertCode(t, stackmanifest.Validate(m), "STACK_NAME_REQUIRED")
	})
}

// L7 — a profile outside the closed set is refused.
func TestStackManifest_UnknownProfileRefused(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		m := genValidManifest(rt)
		bad := rapid.StringMatching(`[a-z]{3,10}`).
			Filter(func(s string) bool {
				return !stackmanifest.IsKnownProfile(stackmanifest.Profile(s))
			}).
			Draw(rt, "bad_profile")
		i := rapid.IntRange(0, len(m.Services)-1).Draw(rt, "i")
		m.Services[i].Profile = stackmanifest.Profile(bad)

		assertCode(t, stackmanifest.Validate(m), "UNKNOWN_PROFILE")
	})
}

// The two closed sets are exactly the engraved ones (DP02 / SPEC-stack-2026).
func TestStackManifest_ClosedSets(t *testing.T) {
	wantRoles := []stackmanifest.Role{
		"server", "datastore", "cache", "pooler", "workflow", "bus",
		"observability", "errortracking", "git", "tickets", "auth", "docs",
		"connector", "interpreter",
	}
	gotRoles := stackmanifest.Roles()
	if len(gotRoles) != len(wantRoles) {
		t.Fatalf("roles: got %d want %d", len(gotRoles), len(wantRoles))
	}
	for i, r := range wantRoles {
		if gotRoles[i] != r {
			t.Fatalf("roles[%d] = %q want %q", i, gotRoles[i], r)
		}
	}
	wantProfiles := []stackmanifest.Profile{
		"core", "docs", "observability", "qa", "git", "tickets",
		"connectors", "non-prod", "full",
	}
	gotProfiles := stackmanifest.Profiles()
	if len(gotProfiles) != len(wantProfiles) {
		t.Fatalf("profiles: got %d want %d", len(gotProfiles), len(wantProfiles))
	}
	for i, p := range wantProfiles {
		if gotProfiles[i] != p {
			t.Fatalf("profiles[%d] = %q want %q", i, gotProfiles[i], p)
		}
	}
}

// assertCode asserts err is a *stackmanifest.ValidationError carrying code.
func assertCode(t *testing.T, err error, code string) {
	t.Helper()
	if err == nil {
		t.Fatalf("want refusal %s, got nil", code)
	}
	ve, ok := err.(*stackmanifest.ValidationError)
	if !ok {
		t.Fatalf("want *ValidationError(%s), got %T: %v", code, err, err)
	}
	if ve.Code != code {
		t.Fatalf("want code %s, got %s (%v)", code, ve.Code, err)
	}
}
