package appauth

// appauth_fixture_test.go — the S80 RUNTIME-AUTHZ fixture mirror (KRD §24.6, app-builder EPIC 7,
// ROADMAP S80). It pins the done-criterion verbatim:
//
//   « fixture — une operation protégée de l'app ÉMISE refuse un rôle insuffisant au runtime. »
//
// It is a state → command → events fixture (the N2 workflow form, CLAUDE.md §1): the auth subsystem
// attached to an app (state), a runtime CheckAccess on a protected operation (command), then the
// asserted verdict — an INSUFFICIENT role is DENIED, the sufficient role is ALLOWED. The authz it
// enforces is the EMITTED app's runtime AuthorityGraph, never the AIDOS approvers.
//
// A second fixture pins the wall: attaching `app-auth` previews the subsystem (WroteKernel=false) and
// LANDS it via an APPROVED (APPLIED) changeset — never a direct kernel write.

import (
	"testing"
	"time"

	"github.com/steph-frtech/aidos/back/archive/changeset"
)

// TestAppAuth_ProtectedOperation_RefusesInsufficientRole is the DONE-CRITERION fixture: a protected
// operation of the emitted app refuses a role that is too weak, and allows one that is sufficient.
func TestAppAuth_ProtectedOperation_RefusesInsufficientRole(t *testing.T) {
	// state: the auth subsystem attached to the user's app (its runtime authz band declared).
	sub, err := ExpandAppAuth("shop-app")
	if err != nil {
		t.Fatalf("ExpandAppAuth: %v", err)
	}
	// the subsystem declares the protected operation `logout` requires at least editor.
	var logoutPol *Policy
	for i := range sub.Policies {
		if sub.Policies[i].Operation == "logout" {
			logoutPol = &sub.Policies[i]
		}
	}
	if logoutPol == nil {
		t.Fatalf("subsystem must declare an authz policy for the protected operation logout")
	}
	if logoutPol.MinRole != Editor || logoutPol.Effect != "DENY" {
		t.Fatalf("logout policy must be DENY below editor, got %+v", *logoutPol)
	}

	// command 1: a VIEWER (insufficient) attempts the protected `logout` operation at runtime.
	// event: DENIED — the emitted app's runtime gate refuses the insufficient role.
	dViewer, err := CheckAccess(Viewer, "logout")
	if err != nil {
		t.Fatalf("CheckAccess(viewer, logout): %v", err)
	}
	if dViewer.Allowed {
		t.Fatalf("a viewer (insufficient role) must be DENIED the protected logout operation")
	}
	if dViewer.Required != Editor {
		t.Fatalf("the denial must report the required role editor, got %q", dViewer.Required)
	}

	// command 2: an EDITOR (sufficient) attempts the same operation.
	// event: ALLOWED — the runtime gate admits the sufficient role.
	dEditor, err := CheckAccess(Editor, "logout")
	if err != nil {
		t.Fatalf("CheckAccess(editor, logout): %v", err)
	}
	if !dEditor.Allowed {
		t.Fatalf("an editor (sufficient role) must be ALLOWED the protected logout operation")
	}

	// command 3: an ADMIN (strictly stronger) is also allowed (rank ≥ min).
	dAdmin, err := CheckAccess(Admin, "manageRoles")
	if err != nil {
		t.Fatalf("CheckAccess(admin, manageRoles): %v", err)
	}
	if !dAdmin.Allowed {
		t.Fatalf("an admin must be ALLOWED the admin-only manageRoles operation")
	}
	// and an editor is DENIED the admin-only operation (the band is enforced, not flat).
	dEditorAdminOp, err := CheckAccess(Editor, "manageRoles")
	if err != nil {
		t.Fatalf("CheckAccess(editor, manageRoles): %v", err)
	}
	if dEditorAdminOp.Allowed {
		t.Fatalf("an editor must be DENIED the admin-only manageRoles operation")
	}

	// honesty: an unknown role/operation is a typed error, never a guessed allow.
	if _, err := CheckAccess(Role("superuser"), "logout"); err == nil {
		t.Fatalf("an unknown role must be a typed error, never a guessed grant")
	}
	if _, err := CheckAccess(Viewer, "selfDestruct"); err == nil {
		t.Fatalf("an unknown operation must be a typed error, never a guessed grant")
	}
}

// TestAppAuth_Attach_PreviewsSubsystemAndLandsViaApprovedChangeSet pins the wall: attaching app-auth
// previews the subsystem (writes nothing) and lands via an APPROVED (APPLIED) changeset.
func TestAppAuth_Attach_PreviewsSubsystemAndLandsViaApprovedChangeSet(t *testing.T) {
	prop, err := Propose("shop-app", "phase-0")
	if err != nil {
		t.Fatalf("Propose: %v", err)
	}
	// event 1: the PREVIEW shows the auth subsystem — User/Role/Session entities, login/logout ops.
	names := SortedNames(prop.Subsystem)
	wantEnt := map[string]bool{"ent:User": true, "ent:Role": true, "ent:Session": true}
	wantOp := map[string]bool{"op:login": true, "op:logout": true}
	for n := range wantEnt {
		if !contains(names, n) {
			t.Fatalf("preview must expand entity %q, got %v", n, names)
		}
	}
	for n := range wantOp {
		if !contains(names, n) {
			t.Fatalf("preview must expand operation %q, got %v", n, names)
		}
	}
	// event 2: the DRAFT preview wrote NOTHING (the wall).
	if prop.Subsystem.WroteKernel {
		t.Fatalf("preview must not write the kernel (the wall)")
	}
	// event 3: it LANDS via an APPROVED changeset — APPLIED, scoped to app-auth@shop-app, with mirror.
	approvedAt := time.Date(2026, 6, 8, 12, 0, 0, 0, time.UTC)
	applied, br := changeset.Apply(prop.ChangeSet, approvedAt, changeset.SpecHasMirror)
	if br != nil {
		t.Fatalf("Apply refused: %s", br.Error())
	}
	if applied.Status != changeset.StatusApplied {
		t.Fatalf("expected APPLIED landing, got %s", applied.Status)
	}
	if applied.SpecDelta == nil || applied.SpecDelta.Target != "app-auth@shop-app" {
		t.Fatalf("expected spec_delta target app-auth@shop-app, got %+v", applied.SpecDelta)
	}
	if applied.MirrorDelta == nil {
		t.Fatalf("approved landing must carry its mirror_delta (completeness)")
	}
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
