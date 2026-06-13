package appservicefragments_test

// Invariant mirror (rapid property test, ∀ N1) — WRITTEN FIRST (RED→GREEN).
// reflects=dp18-app-service-substrate-fragments+emitted-app-auth-binding ·
// test_kind=property · cert_language=rapid · liveness=live ·
// authority=above-the-line-source(stack_manifest) projected below + reuse of S80/S76.
//
// DP18 — the THREE optional app-service fragments (Forgejo + Plane + Better-Auth) of the
// EMITTED app, plus the AUTH-CABLING binding (Better-Auth × S80 app-auth × S76 Expand).
// The laws:
//
//   L1 byte-identique : ∀ (projectID, env) légaux, SubstrateAppServiceFragments rend des
//      fragments dont le body canonique (records.Canonicalize) est BYTE-IDENTIQUE à
//      chaque appel — même projectID + même env ⇒ mêmes octets (déterminisme-first).
//      Idem pour la liaison d'auth (BindingID stable).
//   L2 palette close : EXACTEMENT 3 fragments (forgejo, plane, better-auth), chacun
//      portant image + port interne + volume bind + healthcheck + profile + project_id —
//      jamais deviné, le jeu est clos. forgejo=role git/profile git ; plane=role
//      tickets/profile tickets ; better-auth=role auth/profile core, image VIDE (émis).
//   L3 pas de gate env : aucun app-service n'est interdit par environnement — seul un
//      environnement HORS-ENSEMBLE échoue (UNKNOWN_ENVIRONMENT).
//   L4 isolation : project A ≠ project B ⇒ chaque fragment porte un project_id distinct
//      ET un nom de volume isolé ; A ne réutilise jamais l'octet de B.
//   L5 token partagé : le token d'isolation est CELUI de DP15 (datafragments.
//      IsolationToken), pas un schéma forké — même seed ⇒ même token sur les couches.
//   L6 CÂBLAGE BYTE-IDENTIQUE via Expand (réutilise S80/S76, ne forke pas) : la liaison
//      porte l'ExpansionID EXACT de appauth.ExpandAppAuth (S80) ET un ExpansionID
//      d'owner-scoping issu de behavior.Expand (S76) — l'Expand UNIQUE, jamais dupliqué.
//   L7 séparation auth-app ≠ auth-AIDOS : le scope est TOUJOURS emitted-app-runtime,
//      JAMAIS aidos-approvers ; les rôles sont ceux du runtime de l'app (viewer/editor/
//      admin), jamais les approbateurs AIDOS. Une opération protégée refuse un rôle
//      insuffisant au RUNTIME DE L'APP (appauth.CheckAccess, code jamais LLM) — la
//      monotonie : un rôle de rang ≥ min est autorisé, un rang < min est refusé.
//   L8 LA PROPRIÉTÉ CAPITALE — l'app-service N'ÉCRIT AUCUNE VÉRITÉ AIDOS : aucun
//      fragment / aucune liaison ne porte une capacité d'écriture-vérité AIDOS
//      (kernel/mirrors/fitness). WritesTruth() est TOUJOURS false. Better-Auth écrit les
//      users/sessions de l'app ÉMISE (son store runtime), jamais le kernel AIDOS.
//   L9 le manifest émis est VALIDE (stackmanifest.Validate) une fois greffé sur un
//      server avec les fragments DP15 — ports internes uniques, rôles/profils connus,
//      ≥1 server.

import (
	"bytes"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/appauth"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/appservicefragments"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
	"pgregory.net/rapid"
)

func genProjectID(rt *rapid.T, label string) string {
	return rapid.StringMatching(`[a-z][a-z0-9-]{0,15}`).Draw(rt, label)
}

func genEnv(rt *rapid.T, label string) scope.Environment {
	envs := scope.Environments()
	return envs[rapid.IntRange(0, len(envs)-1).Draw(rt, label)]
}

func canonOf(t *rapid.T, f appservicefragments.ServiceFragment) []byte {
	b, err := appservicefragments.CanonicalFragment(f)
	if err != nil {
		t.Fatalf("CanonicalFragment: %v", err)
	}
	return b
}

// L1 + L2 — byte-identity across calls + the closed palette with the measured contracts.
func TestProp_ByteIdenticalAndClosedPalette(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")

		a, err := appservicefragments.SubstrateAppServiceFragments(pid, env)
		if err != nil {
			rt.Fatalf("first call: %v", err)
		}
		b, err := appservicefragments.SubstrateAppServiceFragments(pid, env)
		if err != nil {
			rt.Fatalf("second call: %v", err)
		}
		if len(a) != 3 || len(b) != 3 {
			rt.Fatalf("palette must be exactly 3 fragments, got %d/%d", len(a), len(b))
		}
		for i := range a {
			if !bytes.Equal(canonOf(rt, a[i]), canonOf(rt, b[i])) {
				rt.Fatalf("fragment %q not byte-identical across calls", a[i].Key)
			}
		}

		want := map[string]struct {
			role    stackmanifest.Role
			profile stackmanifest.Profile
			image   string // "" means EMITTED (built)
		}{
			"forgejo":     {stackmanifest.RoleGit, stackmanifest.ProfileGit, "codeberg.org/forgejo/forgejo:9"},
			"plane":       {stackmanifest.RoleTickets, stackmanifest.ProfileTickets, "makeplane/plane-frontend:latest"},
			"better-auth": {stackmanifest.RoleAuth, stackmanifest.ProfileCore, ""},
		}
		seen := map[string]bool{}
		ports := map[int]string{}
		for _, f := range a {
			w, ok := want[f.Key]
			if !ok {
				rt.Fatalf("unexpected fragment key %q (palette must be closed)", f.Key)
			}
			seen[f.Key] = true
			if f.Service.Role != w.role {
				rt.Fatalf("%q role: want %q, got %q", f.Key, w.role, f.Service.Role)
			}
			if f.Service.Profile != w.profile {
				rt.Fatalf("%q profile: want %q, got %q", f.Key, w.profile, f.Service.Profile)
			}
			if f.Service.Image != w.image {
				rt.Fatalf("%q image: want %q, got %q", f.Key, w.image, f.Service.Image)
			}
			if f.Service.Healthcheck == "" {
				rt.Fatalf("%q must carry a healthcheck", f.Key)
			}
			if len(f.Volumes) == 0 {
				rt.Fatalf("%q must carry a per-project bind volume", f.Key)
			}
			if prior, dup := ports[f.Service.InternalPort]; dup {
				rt.Fatalf("%q and %q collide on internal port %d", prior, f.Key, f.Service.InternalPort)
			}
			ports[f.Service.InternalPort] = f.Key
			if f.ProjectID != pid {
				rt.Fatalf("%q must carry project_id %q, got %q", f.Key, pid, f.ProjectID)
			}
		}
		if len(seen) != 3 {
			rt.Fatalf("palette must cover exactly forgejo+plane+better-auth, got %v", seen)
		}
	})
}

// L3 — no app-service is env-gated; only an UNKNOWN environment fails-closed.
func TestProp_NoEnvGateOnlyUnknownFails(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")
		frags, err := appservicefragments.SubstrateAppServiceFragments(pid, env)
		if err != nil {
			rt.Fatalf("a known environment must never gate an app-service: %v", err)
		}
		if len(frags) != 3 {
			rt.Fatalf("a known env must yield all 3 fragments, got %d", len(frags))
		}
	})

	// An unknown environment fails-closed with the DP06 UNKNOWN_ENVIRONMENT refusal.
	_, err := appservicefragments.SubstrateAppServiceFragments("shop", scope.Environment("mars"))
	if err == nil {
		t.Fatalf("an unknown environment must fail-closed (UNKNOWN_ENVIRONMENT)")
	}
	var ref *envbindings.Refusal
	if !errorsAs(err, &ref) || ref.Code != envbindings.CodeUnknownEnvironment {
		t.Fatalf("want UNKNOWN_ENVIRONMENT refusal, got %v", err)
	}
}

// L4 + L5 — per-project isolation + the SHARED DP15 token (never a forked scheme).
func TestProp_IsolationAndSharedToken(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		a := genProjectID(rt, "a")
		b := genProjectID(rt, "b")
		if a == b {
			return // distinct projects only
		}
		env := genEnv(rt, "env")

		fa, err := appservicefragments.SubstrateAppServiceFragments(a, env)
		if err != nil {
			rt.Fatalf("project a: %v", err)
		}
		fb, err := appservicefragments.SubstrateAppServiceFragments(b, env)
		if err != nil {
			rt.Fatalf("project b: %v", err)
		}

		ta := datafragments.IsolationToken(a)
		tb := datafragments.IsolationToken(b)
		if ta == tb {
			rt.Fatalf("distinct projects must derive distinct isolation tokens")
		}
		byKeyA := map[string]appservicefragments.ServiceFragment{}
		for _, f := range fa {
			byKeyA[f.Key] = f
		}
		for _, f := range fb {
			pa := byKeyA[f.Key]
			// Distinct project_id and distinct canonical bytes (A never reuses B's octet).
			if pa.ProjectID == f.ProjectID {
				rt.Fatalf("%q must carry distinct project_id across projects", f.Key)
			}
			if bytes.Equal(canonOf(rt, pa), canonOf(rt, f)) {
				rt.Fatalf("%q must be byte-distinct across isolated projects", f.Key)
			}
			// The volume name carries the SHARED DP15 token (not a forked scheme).
			if len(pa.Volumes) == 0 || len(f.Volumes) == 0 {
				rt.Fatalf("%q must carry a volume on both projects", f.Key)
			}
			if pa.Volumes[0].Name != f.Key+"-"+ta {
				rt.Fatalf("%q volume must carry the DP15 token of project a (%s), got %q", f.Key, ta, pa.Volumes[0].Name)
			}
			if f.Volumes[0].Name != f.Key+"-"+tb {
				rt.Fatalf("%q volume must carry the DP15 token of project b (%s), got %q", f.Key, tb, f.Volumes[0].Name)
			}
		}
	})
}

// L6 — Better-Auth cables onto the BYTE-IDENTICAL S80 app-auth subsystem via the S76
// UNIQUE Expand. The binding is byte-identical per project (BindingID stable), and its
// SubsystemExpansionID equals appauth.ExpandAppAuth's, its OwnerScopingExpansionID is the
// S76 behavior.Expand of ownable@User (distinct from the subsystem id).
func TestProp_AuthCablingByteIdenticalViaExpand(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")

		one, err := appservicefragments.EmittedAppAuthBinding(pid)
		if err != nil {
			rt.Fatalf("binding 1: %v", err)
		}
		two, err := appservicefragments.EmittedAppAuthBinding(pid)
		if err != nil {
			rt.Fatalf("binding 2: %v", err)
		}
		if one.BindingID != two.BindingID || one.BindingID == "" {
			rt.Fatalf("binding must be byte-identical per project (BindingID %q vs %q)", one.BindingID, two.BindingID)
		}

		// BYTE-IDENTICAL via Expand: the S80 subsystem ExpansionID matches.
		sub, err := appauth.ExpandAppAuth(pid)
		if err != nil {
			rt.Fatalf("ExpandAppAuth: %v", err)
		}
		if one.SubsystemExpansionID != sub.ExpansionID {
			rt.Fatalf("binding must cable onto the byte-identical S80 subsystem: want %q got %q",
				sub.ExpansionID, one.SubsystemExpansionID)
		}
		// The S76 owner-scoping expansion ran and is distinct from the subsystem id.
		if one.OwnerScopingExpansionID == "" {
			rt.Fatalf("binding must graft owner-scoping via the S76 UNIQUE Expand")
		}
		if one.OwnerScopingExpansionID == one.SubsystemExpansionID {
			rt.Fatalf("the S76 owner-scoping expansion id must differ from the S80 subsystem id")
		}
		if one.Macro != appauth.MacroName || one.ServiceKey != "better-auth" {
			rt.Fatalf("binding must cable app-auth onto better-auth, got macro=%q service=%q", one.Macro, one.ServiceKey)
		}
	})
}

// L7 — separation auth-app ≠ auth-AIDOS + the runtime authz monotonicity. The binding
// maps the EMITTED APP'S runtime roles (never AIDOS); a role of rank ≥ min is allowed, a
// role of rank < min is refused, decided by code (appauth.CheckAccess).
func TestProp_SeparationAndRuntimeAuthzMonotone(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		binding, err := appservicefragments.EmittedAppAuthBinding(pid)
		if err != nil {
			rt.Fatalf("binding: %v", err)
		}
		// The scope is ALWAYS the emitted app's runtime, NEVER the AIDOS approvers.
		if binding.AuthorityGraphScope != appservicefragments.AuthorityGraphScopeEmittedApp {
			rt.Fatalf("binding must map the emitted-app-runtime AuthorityGraph, got %q", binding.AuthorityGraphScope)
		}
		// The runtime roles are the BUILT app's, a closed set (viewer/editor/admin).
		appRoles := map[appauth.Role]bool{appauth.Viewer: true, appauth.Editor: true, appauth.Admin: true}
		for _, r := range binding.Roles {
			if !appRoles[r] {
				rt.Fatalf("binding role %q is not an emitted-app runtime role", r)
			}
		}

		// Runtime authz monotonicity over every grant: a role whose rank ≥ the grant's
		// min-role rank is ALLOWED; a strictly weaker role is DENIED. Decided by code.
		roles := appauth.Roles()
		rank := map[appauth.Role]int{}
		for i, r := range roles {
			rank[r] = i
		}
		for _, g := range binding.Grants {
			for _, r := range roles {
				dec, err := appservicefragments.CheckAppAccess(r, g.Operation)
				if err != nil {
					rt.Fatalf("CheckAppAccess(%q, %q): %v", r, g.Operation, err)
				}
				wantAllowed := rank[r] >= rank[g.MinRole]
				if dec.Allowed != wantAllowed {
					rt.Fatalf("runtime authz wrong: role %q op %q (min %q) → allowed=%v want %v",
						r, g.Operation, g.MinRole, dec.Allowed, wantAllowed)
				}
			}
		}
	})
}

// L8 — the wall: no fragment / no binding writes AIDOS truth.
func TestProp_WritesNoAIDOSTruth(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")
		frags, err := appservicefragments.SubstrateAppServiceFragments(pid, env)
		if err != nil {
			rt.Fatalf("fragments: %v", err)
		}
		for _, f := range frags {
			if f.WritesTruth() {
				rt.Fatalf("fragment %q must write no AIDOS truth", f.Key)
			}
			for _, cap := range f.Capabilities() {
				if appservicefragments.IsTruthWriteCapability(cap) {
					rt.Fatalf("fragment %q carries AIDOS truth-write capability %q", f.Key, cap)
				}
			}
		}
		binding, err := appservicefragments.EmittedAppAuthBinding(pid)
		if err != nil {
			rt.Fatalf("binding: %v", err)
		}
		if binding.WritesTruth() || binding.WroteKernel {
			rt.Fatalf("the auth binding must write no AIDOS truth (WritesTruth=%v WroteKernel=%v)",
				binding.WritesTruth(), binding.WroteKernel)
		}
	})
}

// L9 — the emitted fragments graft onto a valid StackManifest alongside DP15 data
// fragments: a server + postgres + the three app-services → unique ports, known roles/
// profiles, ≥1 server. The manifest validates.
func TestProp_GraftedManifestValidates(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")

		appSvc, err := appservicefragments.SubstrateAppServiceFragments(pid, env)
		if err != nil {
			rt.Fatalf("app-service fragments: %v", err)
		}
		// The DP15 CORE data slice (postgres/valkey/pgbouncer — doltgres omitted in prod).
		data, err := datafragments.SubstrateCoreFragments(pid, env)
		if err != nil {
			rt.Fatalf("data core fragments: %v", err)
		}

		m := stackmanifest.StackManifest{
			AppName: "shop-" + pid,
			Services: []stackmanifest.Service{
				{Name: "app", Role: stackmanifest.RoleServer, Image: "node:22-alpine", InternalPort: 3000, Profile: stackmanifest.ProfileCore, Healthcheck: "wget -q --spider http://localhost:3000/health"},
			},
			Network: stackmanifest.Network{Name: "traefik_default", External: true},
		}
		for _, f := range data {
			m.Services = append(m.Services, f.Service)
			m.Volumes = append(m.Volumes, f.Volumes...)
		}
		for _, f := range appSvc {
			m.Services = append(m.Services, f.Service)
			m.Volumes = append(m.Volumes, f.Volumes...)
		}
		if err := stackmanifest.Validate(m); err != nil {
			rt.Fatalf("grafted manifest must validate (DP15+DP18 over a server): %v", err)
		}
	})
}

// errorsAs is a tiny local errors.As shim (kept here to avoid importing errors in the
// property file's hot path — the refusal type is concrete).
func errorsAs(err error, target **envbindings.Refusal) bool {
	for err != nil {
		if r, ok := err.(*envbindings.Refusal); ok {
			*target = r
			return true
		}
		type unwrapper interface{ Unwrap() error }
		u, ok := err.(unwrapper)
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}
