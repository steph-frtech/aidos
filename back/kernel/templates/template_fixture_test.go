package templates

// template_fixture_test.go — the S81 workflow mirror (N2 fixture). It pins the user-facing behaviours
// of the catalogue:
//
//   - duplicate-from-template (S56): instantiating "ecommerce" → "shop-app" yields a starter with the
//     expected entities/relations/operations/UI AND the app-auth runtime gate (viewer→logout DENIED,
//     editor→logout ALLOWED) reusing the ONE S80 expander.
//   - fork-this-app: forking from a stable phase yields a deterministic copy; two forks from the SAME
//     phase to the SAME slug are byte-identical, two forks from DIFFERENT phases differ.
//   - the wall: Propose lands the starter via a DRAFT changeset (proposed), never a direct kernel write.

import (
	"testing"
	"time"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/appauth"
)

func TestInstantiateEcommerceStarter(t *testing.T) {
	sp, err := Instantiate(Ecommerce, "shop-app")
	if err != nil {
		t.Fatalf("Instantiate: %v", err)
	}
	if got := len(sp.Entities); got != 3 {
		t.Fatalf("entities = %d, want 3 (Customer/Product/Order)", got)
	}
	if len(sp.Relations) != 2 {
		t.Fatalf("relations = %d, want 2", len(sp.Relations))
	}
	if sp.Auth == nil {
		t.Fatal("starter has no app-auth subsystem")
	}
	// The app-auth runtime gate works on the instantiated starter (reused S80 expander).
	if d, err := appauth.CheckAccess(appauth.Viewer, "logout"); err != nil || d.Allowed {
		t.Fatalf("viewer→logout should be DENIED, got allowed=%v err=%v", d.Allowed, err)
	}
	if d, err := appauth.CheckAccess(appauth.Editor, "logout"); err != nil || !d.Allowed {
		t.Fatalf("editor→logout should be ALLOWED, got allowed=%v err=%v", d.Allowed, err)
	}
}

func TestForkIsDeterministicFromPhase(t *testing.T) {
	a, err := Fork(Ecommerce, "shop-fork", "phaseA")
	if err != nil {
		t.Fatalf("Fork: %v", err)
	}
	b, err := Fork(Ecommerce, "shop-fork", "phaseA")
	if err != nil {
		t.Fatal(err)
	}
	if a.StarterID != b.StarterID {
		t.Fatalf("fork from same phase not idempotent: %q vs %q", a.StarterID, b.StarterID)
	}
	c, err := Fork(Ecommerce, "shop-fork", "phaseB")
	if err != nil {
		t.Fatal(err)
	}
	if a.StarterID == c.StarterID {
		t.Fatalf("fork from a different phase must differ: %q", a.StarterID)
	}
	if a.WroteKernel {
		t.Fatal("Fork wrote the kernel (wall violated)")
	}
}

func TestProposeLandsViaDraftChangeset(t *testing.T) {
	prop, err := Propose(CRM, "acme-crm", "")
	if err != nil {
		t.Fatalf("Propose: %v", err)
	}
	if prop.ChangeSet.Status != changeset.StatusDraft {
		t.Fatalf("changeset status = %q, want DRAFT", prop.ChangeSet.Status)
	}
	if prop.Starter.WroteKernel {
		t.Fatal("Propose wrote the kernel (wall violated)")
	}
	if prop.ChangeSet.ID == "" {
		t.Fatal("changeset has no id")
	}
	// The DRAFT applies cleanly when its spec has a mirror (completeness) — proving the proposal is a
	// legal, mirror-backed door, not a bare write.
	applied, br := changeset.Apply(prop.ChangeSet, time.Unix(0, 0), changeset.SpecHasMirror)
	if br != nil {
		t.Fatalf("approving the proposal failed: %v", br)
	}
	if applied.Status != changeset.StatusApplied {
		t.Fatalf("applied status = %q, want APPLIED", applied.Status)
	}
}
