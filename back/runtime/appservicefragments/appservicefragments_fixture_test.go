package appservicefragments_test

// appservicefragments_fixture_test.go — the ACCEPTANCE (Godog-class,
// state→command→events) mirror for DP18 (ROADMAP-provisioning-deploy EPIC D, palette
// DP14). It proves the headline done-criteria as deterministic Given/When/Then fixtures
// (the CLAUDE.md §6 bootstrap exception: the mirrors Postgres schema persists this
// later; the test IS the red→green proof now). DETERMINISTIC: no clock, no RNG.
//
//	Given un projet émis « shop »
//	When  on émet les fragments des services applicatifs optionnels
//	Then  trois services (Forgejo profile git + Plane profile tickets + Better-Auth
//	      profile core/auth) sont émis ; Better-Auth se câble sur le behavior-macro
//	      app-auth (S80) BYTE-IDENTIQUE via l'Expand UNIQUE (S76) ; une opération
//	      protégée de l'app émise REFUSE un rôle insuffisant AU RUNTIME (l'AuthorityGraph
//	      DU RUNTIME DE L'APP, jamais les approbateurs AIDOS) ; ET — propriété capitale —
//	      la séparation auth-app ≠ auth-AIDOS tient (le scope est emitted-app-runtime,
//	      jamais aidos-approvers) ; aucun fragment / aucune liaison n'écrit la moindre
//	      vérité AIDOS (le wall §2).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/appauth"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/appservicefragments"
)

// Given a project / When emitting / Then the three app-service fragments exist with the
// measured contracts: Forgejo profile git, Plane profile tickets, Better-Auth profile
// core + role auth.
func TestFixture_AppEmitsOptionalAppServiceSubstrate(t *testing.T) {
	const app = "shop"
	frags, err := appservicefragments.SubstrateAppServiceFragments(app, scope.EnvProd)
	if err != nil {
		t.Fatalf("prod app-service fragments: %v", err)
	}
	if len(frags) != 3 {
		t.Fatalf("want 3 app-service fragments, got %d", len(frags))
	}
	byKey := map[string]appservicefragments.ServiceFragment{}
	for _, f := range frags {
		byKey[f.Key] = f
	}

	// Forgejo — the self-hosted git of the emitted app, role git, profile git.
	forgejo := byKey["forgejo"]
	if forgejo.Service.Image != "codeberg.org/forgejo/forgejo:9" {
		t.Fatalf("forgejo image: got %q", forgejo.Service.Image)
	}
	if forgejo.Service.Role != stackmanifest.RoleGit {
		t.Fatalf("forgejo role: want git, got %q", forgejo.Service.Role)
	}
	if forgejo.Service.Profile != stackmanifest.ProfileGit {
		t.Fatalf("forgejo profile: want git, got %q", forgejo.Service.Profile)
	}
	if len(forgejo.Volumes) == 0 {
		t.Fatalf("forgejo must carry a per-project bind volume (repos)")
	}

	// Plane — the tickets of the emitted app, role tickets, profile tickets.
	plane := byKey["plane"]
	if plane.Service.Image != "makeplane/plane-frontend:latest" {
		t.Fatalf("plane image: got %q", plane.Service.Image)
	}
	if plane.Service.Role != stackmanifest.RoleTickets {
		t.Fatalf("plane role: want tickets, got %q", plane.Service.Role)
	}
	if plane.Service.Profile != stackmanifest.ProfileTickets {
		t.Fatalf("plane profile: want tickets, got %q", plane.Service.Profile)
	}

	// Better-Auth — the RUNTIME auth of the BUILT app's users, role auth, profile core.
	// Image is EMPTY (an emitted service, built from the boilerplate).
	ba := byKey["better-auth"]
	if ba.Service.Image != "" {
		t.Fatalf("better-auth must be EMITTED (empty image, built from boilerplate), got %q", ba.Service.Image)
	}
	if ba.Service.Role != stackmanifest.RoleAuth {
		t.Fatalf("better-auth role: want auth, got %q", ba.Service.Role)
	}
	if ba.Service.Profile != stackmanifest.ProfileCore {
		t.Fatalf("better-auth profile: want core, got %q", ba.Service.Profile)
	}

	// No two app-service fragments collide on internal port (the grafted-manifest law).
	if forgejo.Service.InternalPort == plane.Service.InternalPort ||
		forgejo.Service.InternalPort == ba.Service.InternalPort ||
		plane.Service.InternalPort == ba.Service.InternalPort {
		t.Fatalf("app-service internal ports must be distinct: forgejo=%d plane=%d better-auth=%d",
			forgejo.Service.InternalPort, plane.Service.InternalPort, ba.Service.InternalPort)
	}
}

// THE CAPITAL CABLING FIXTURE — Better-Auth cables onto the S80 app-auth macro
// BYTE-IDENTICAL via the S76 UNIQUE Expand (never forked, never duplicated).
//
//	Given the emitted app « shop »
//	When  on câble Better-Auth sur le behavior-macro app-auth (S80) via l'Expand (S76)
//	Then  la liaison porte l'ExpansionID EXACT du subsystem app-auth (byte-identique) ET
//	      l'ExpansionID de l'Expand UNIQUE ownable@User (réutilise S76, ne forke pas).
func TestFixture_BetterAuthCablesOnAppAuthByteIdenticalViaExpand(t *testing.T) {
	const app = "shop"
	binding, err := appservicefragments.EmittedAppAuthBinding(app)
	if err != nil {
		t.Fatalf("emitted app-auth binding: %v", err)
	}

	// The binding cables onto the macro `app-auth` (S80), on the better-auth service.
	if binding.Macro != appauth.MacroName {
		t.Fatalf("binding must cable onto app-auth (S80), got macro %q", binding.Macro)
	}
	if binding.ServiceKey != "better-auth" {
		t.Fatalf("binding must configure the better-auth service, got %q", binding.ServiceKey)
	}

	// BYTE-IDENTICAL via Expand: the binding's SubsystemExpansionID must equal the S80
	// appauth.ExpandAppAuth(app) ExpansionID — the EXACT subsystem, never re-coined.
	want, err := appauth.ExpandAppAuth(app)
	if err != nil {
		t.Fatalf("appauth.ExpandAppAuth: %v", err)
	}
	if binding.SubsystemExpansionID != want.ExpansionID {
		t.Fatalf("binding must cable onto the BYTE-IDENTICAL app-auth subsystem (S80): want %q, got %q",
			want.ExpansionID, binding.SubsystemExpansionID)
	}

	// The owner-scoping band is grafted via the S76 UNIQUE Expand — the binding carries a
	// non-empty OwnerScopingExpansionID (proves Expand ran, never a forked duplicate).
	if binding.OwnerScopingExpansionID == "" {
		t.Fatalf("binding must graft owner-scoping via the S76 UNIQUE Expand (empty ExpansionID)")
	}
	if binding.OwnerScopingExpansionID == binding.SubsystemExpansionID {
		t.Fatalf("the S76 owner-scoping expansion must be distinct from the S80 subsystem expansion")
	}
}

// THE CAPITAL RUNTIME-AUTHZ FIXTURE — a protected operation of the EMITTED app REFUSES
// an insufficient role AT RUNTIME (the AuthorityGraph OF THE EMITTED APP'S RUNTIME).
//
//	Given the emitted app's runtime authz (viewer < editor < admin)
//	When  un rôle viewer tente l'opération protégée « manageRoles » (min-role admin)
//	Then  l'app émise REFUSE (insufficient role) — décidé par le code (CheckAppAccess),
//	      jamais par un LLM, et par les rôles DU RUNTIME DE L'APP, jamais AIDOS.
func TestFixture_EmittedAppRefusesInsufficientRoleAtRuntime(t *testing.T) {
	// A viewer attempting the admin-only manageRoles is DENIED at the emitted app's runtime.
	dec, err := appservicefragments.CheckAppAccess(appauth.Viewer, "manageRoles")
	if err != nil {
		t.Fatalf("CheckAppAccess(viewer, manageRoles): %v", err)
	}
	if dec.Allowed {
		t.Fatalf("a viewer must be DENIED the admin-only manageRoles at the emitted app's runtime")
	}
	if dec.Required != appauth.Admin {
		t.Fatalf("the required role for manageRoles must be admin, got %q", dec.Required)
	}

	// An admin attempting the SAME operation is ALLOWED (the gate is not vacuously closed).
	adm, err := appservicefragments.CheckAppAccess(appauth.Admin, "manageRoles")
	if err != nil {
		t.Fatalf("CheckAppAccess(admin, manageRoles): %v", err)
	}
	if !adm.Allowed {
		t.Fatalf("an admin must be ALLOWED manageRoles at the emitted app's runtime")
	}

	// An editor attempting logout (min-role editor) is ALLOWED; a viewer is DENIED — the
	// rank ladder is the EMITTED app's, decided by code.
	ed, err := appservicefragments.CheckAppAccess(appauth.Editor, "logout")
	if err != nil {
		t.Fatalf("CheckAppAccess(editor, logout): %v", err)
	}
	if !ed.Allowed {
		t.Fatalf("an editor must be ALLOWED logout at the emitted app's runtime")
	}
	vw, err := appservicefragments.CheckAppAccess(appauth.Viewer, "logout")
	if err != nil {
		t.Fatalf("CheckAppAccess(viewer, logout): %v", err)
	}
	if vw.Allowed {
		t.Fatalf("a viewer must be DENIED logout (min-role editor) at the emitted app's runtime")
	}
}

// THE CAPITAL SEPARATION FIXTURE — auth-app ≠ auth-AIDOS. The binding maps the EMITTED
// APP'S RUNTIME authority graph, NEVER the AIDOS approvers.
func TestFixture_AuthAppIsSeparateFromAuthAIDOS(t *testing.T) {
	const app = "shop"
	binding, err := appservicefragments.EmittedAppAuthBinding(app)
	if err != nil {
		t.Fatalf("emitted app-auth binding: %v", err)
	}

	// The approvers of a protected operation are the EMITTED app's runtime roles, NEVER
	// AIDOS. The scope token makes the separation explicit and testable.
	if binding.AuthorityGraphScope != appservicefragments.AuthorityGraphScopeEmittedApp {
		t.Fatalf("the binding must map the EMITTED APP'S runtime AuthorityGraph, got scope %q", binding.AuthorityGraphScope)
	}
	if binding.AuthorityGraphScope == "aidos-approvers" {
		t.Fatalf("the binding must NEVER map the AIDOS approvers (auth-app ≠ auth-AIDOS)")
	}

	// The binding's roles are the BUILT app's runtime roles (viewer/editor/admin), not the
	// AIDOS changeset approvers — a closed set of the EMITTED app's own users.
	wantRoles := map[appauth.Role]bool{appauth.Viewer: true, appauth.Editor: true, appauth.Admin: true}
	if len(binding.Roles) != len(wantRoles) {
		t.Fatalf("binding roles must be the emitted app's runtime roles, got %v", binding.Roles)
	}
	for _, r := range binding.Roles {
		if !wantRoles[r] {
			t.Fatalf("binding role %q is not an emitted-app runtime role (auth-app ≠ auth-AIDOS)", r)
		}
	}
}

// THE CAPITAL WALL FIXTURE — end-to-end, NO AIDOS truth is written by the app-service
// fragments NOR by the auth binding. Better-Auth writes the EMITTED app's user/session
// rows (its OWN runtime store), never the AIDOS kernel.
func TestFixture_AppServicesWriteNoAIDOSTruth(t *testing.T) {
	const app = "shop"
	frags, err := appservicefragments.SubstrateAppServiceFragments(app, scope.EnvProd)
	if err != nil {
		t.Fatalf("fragments: %v", err)
	}
	for _, f := range frags {
		if f.WritesTruth() {
			t.Fatalf("fragment %q must write NO AIDOS truth (the wall §2)", f.Key)
		}
		for _, cap := range f.Capabilities() {
			if appservicefragments.IsTruthWriteCapability(cap) {
				t.Fatalf("fragment %q carries an AIDOS truth-write capability %q (forbidden)", f.Key, cap)
			}
		}
	}

	binding, err := appservicefragments.EmittedAppAuthBinding(app)
	if err != nil {
		t.Fatalf("binding: %v", err)
	}
	if binding.WritesTruth() {
		t.Fatalf("the auth binding must write NO AIDOS truth (the wall §2)")
	}
	if binding.WroteKernel {
		t.Fatalf("the auth binding is a below-the-line projection — WroteKernel must be false")
	}

	// Fault-injection of the oracle itself: a truth-write capability IS detected when
	// present (the predicate is not vacuously false), and a service capability is NOT.
	if !appservicefragments.IsTruthWriteCapability("write:kernel") {
		t.Fatalf("IsTruthWriteCapability must catch write:kernel (else the wall guard is dead)")
	}
	if appservicefragments.IsTruthWriteCapability("auth:app-runtime-login") {
		t.Fatalf("IsTruthWriteCapability must NOT flag a below-the-line app-service capability")
	}
}
