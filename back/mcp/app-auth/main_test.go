package main

import (
	"context"
	"testing"
)

// The app-auth MCP server is PURE computation (the wall): these tests prove each S80 tool returns
// deterministically without any I/O — expand the emitted app's auth subsystem, the runtime authz gate
// (refusing an insufficient role), and the attach that previews + lands via an APPROVED ChangeSet.

func TestExpandSubsystem(t *testing.T) {
	_, out, err := expandTool(context.Background(), nil, expandInput{Target: "shop-app"})
	if err != nil || !out.OK {
		t.Fatalf("expand: %v %+v", err, out)
	}
	if len(out.Entities) != 3 || len(out.Operations) != 2 || len(out.Policies) != 3 {
		t.Fatalf("expand shape wrong: %d entities, %d ops, %d policies", len(out.Entities), len(out.Operations), len(out.Policies))
	}
	if out.WroteKernel {
		t.Fatalf("expand must not write the kernel (the wall)")
	}
	if out.ExpansionID == "" {
		t.Fatalf("expand must content-address the subsystem")
	}
	// determinism: same target ⇒ same id.
	_, out2, _ := expandTool(context.Background(), nil, expandInput{Target: "shop-app"})
	if out.ExpansionID != out2.ExpansionID {
		t.Fatalf("expand not deterministic: %s vs %s", out.ExpansionID, out2.ExpansionID)
	}
	// honesty: an empty target is an error, never a guessed subsystem.
	_, bad, _ := expandTool(context.Background(), nil, expandInput{Target: ""})
	if bad.OK {
		t.Fatalf("empty target must error")
	}
}

func TestCheckAccessRuntimeGate(t *testing.T) {
	// the done-criterion: a protected operation refuses an insufficient role at runtime.
	_, viewer, err := checkAccessTool(context.Background(), nil, checkInput{Role: "viewer", Operation: "logout"})
	if err != nil || !viewer.OK {
		t.Fatalf("check viewer: %v %+v", err, viewer)
	}
	if viewer.Allowed {
		t.Fatalf("a viewer must be DENIED the protected logout operation")
	}
	if viewer.Required != "editor" {
		t.Fatalf("denial must report required role editor, got %q", viewer.Required)
	}
	_, editor, _ := checkAccessTool(context.Background(), nil, checkInput{Role: "editor", Operation: "logout"})
	if !editor.Allowed {
		t.Fatalf("an editor must be ALLOWED the protected logout operation")
	}
	// an editor is denied the admin-only operation (band enforced).
	_, editAdmin, _ := checkAccessTool(context.Background(), nil, checkInput{Role: "editor", Operation: "manageRoles"})
	if editAdmin.Allowed {
		t.Fatalf("an editor must be DENIED the admin-only manageRoles operation")
	}
	// unknown role/operation are typed errors, never guessed allows.
	_, badRole, _ := checkAccessTool(context.Background(), nil, checkInput{Role: "root", Operation: "logout"})
	if badRole.OK {
		t.Fatalf("unknown role must error")
	}
	_, badOp, _ := checkAccessTool(context.Background(), nil, checkInput{Role: "viewer", Operation: "nuke"})
	if badOp.OK {
		t.Fatalf("unknown operation must error")
	}
}

func TestAttachPreviewAndLand(t *testing.T) {
	// preview: writes nothing, DRAFT changeset.
	_, prev, err := attachTool(context.Background(), nil, attachInput{Target: "shop-app", ParentPhase: "phase-0"})
	if err != nil || !prev.OK {
		t.Fatalf("attach preview: %v %+v", err, prev)
	}
	if prev.Landed || prev.WroteKernel {
		t.Fatalf("preview must not land/write")
	}
	if prev.ChangeSetStatus != "DRAFT" {
		t.Fatalf("preview changeset must be DRAFT, got %s", prev.ChangeSetStatus)
	}
	// land: APPLIED via approved changeset.
	_, landed, _ := attachTool(context.Background(), nil, attachInput{
		Target: "shop-app", ParentPhase: "phase-0", Land: true, ApprovedAt: "2026-06-08T12:00:00Z",
	})
	if !landed.OK || !landed.Landed {
		t.Fatalf("land must succeed: %+v", landed)
	}
	if landed.ChangeSetStatus != "APPLIED" {
		t.Fatalf("landed changeset must be APPLIED, got %s", landed.ChangeSetStatus)
	}
}
