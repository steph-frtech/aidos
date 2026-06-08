package main

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/mirror/library"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// The mirror-library MCP server is PURE computation (the wall): these tests prove each tool returns
// deterministically without any I/O — they mirror the S70 done-criterion at the MCP boundary: the
// project-scoped monster detector FIRES inside the project where a monster is injected, and the
// listing groups mirrors by app with their liveness.

func sampleLibrary() library.Library {
	return library.Library{
		Layers: []library.ProjectLayer{
			{Project: "app-A", Layer: records.Layer{LayerID: "A.Order", Version: "v1", Kind: "entity"}},
			{Project: "app-B", Layer: records.Layer{LayerID: "B.Cart", Version: "v1", Kind: "entity"}},
		},
		Mirrors: []library.ProjectMirror{
			{Project: "app-A", Mirror: records.Mirror{
				MirrorID: "mA1", Reflects: records.LayerRef{LayerID: "A.Order", Version: "v1"},
				TestKind: records.TestKindSchema, CertLanguage: records.CertZod,
				Authority: records.AuthorityAbove, Liveness: records.LivenessAlive,
			}},
			// app-B's entity has NO mirror → no_truth_without_mirror (a scoped monster).
		},
	}
}

func TestLibraryScopedHealth_FaultInjectionFires(t *testing.T) {
	lib := sampleLibrary()

	// app-A is complete (the detector does NOT fire).
	_, a, _ := scopedHealth(context.Background(), nil, scopedHealthInput{Library: lib, Project: "app-A"})
	if !a.OK || a.Verdict != "COMPLETE" || a.HasMonster {
		t.Fatalf("app-A must be COMPLETE with no monster: %+v", a)
	}

	// app-B fires (the project-scoped monster detector FIRES).
	_, b, _ := scopedHealth(context.Background(), nil, scopedHealthInput{Library: lib, Project: "app-B"})
	if !b.OK || b.Verdict != "RED_MONSTER" || !b.HasMonster {
		t.Fatalf("the scoped detector must FIRE for app-B: %+v", b)
	}
	if len(b.Monsters) != 1 || b.Monsters[0].Reason != records.ReasonNoTruthWithoutMirror {
		t.Fatalf("app-B monster must be no_truth_without_mirror: %+v", b.Monsters)
	}
}

func TestLibraryListByApp(t *testing.T) {
	lib := sampleLibrary()
	_, out, _ := listByApp(context.Background(), nil, listByAppInput{Library: lib})
	if !out.OK || len(out.Apps) != 1 {
		// only app-A owns a mirror in the sample library.
		t.Fatalf("expected 1 app with a mirror, got %+v", out)
	}
	if out.Apps[0].Project != "app-A" || out.Apps[0].Alive != 1 || out.Apps[0].Dead != 0 {
		t.Fatalf("app-A: want 1 alive 0 dead, got %+v", out.Apps[0])
	}
}

func TestNewMCPServer(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("server must build")
	}
}
