package library

import (
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"pgregory.net/rapid"
)

// library_test.go is the BDD MIRROR of S70 — « la librairie de miroirs par projet + la détection de
// monstre scopée au projet ». Written FIRST and RED (red → green → refactor).
//
// THE DONE-CRITERION (ROADMAP-app-builder S70): fault-injection — the PROJECT-SCOPED monster
// detector fires. We inject the two monster kinds inside one project's cut and assert the scoped
// detector reports them, while a SIBLING project stays green (scope is not cosmetic — it changes the
// verdict).

// ── helpers ──────────────────────────────────────────────────────────────────

func layer(proj, id, kind string) ProjectLayer {
	return ProjectLayer{Project: ProjectID(proj), Layer: records.Layer{LayerID: id, Version: "v1", Kind: kind}}
}

// livingMirror — a living (alive ∧ executable) mirror of test_kind tk reflecting (id@v1) in proj.
func livingMirror(proj, mid, reflectsID string, tk records.TestKind, cl records.CertLanguage) ProjectMirror {
	return ProjectMirror{Project: ProjectID(proj), Mirror: records.Mirror{
		MirrorID:     mid,
		Reflects:     records.LayerRef{LayerID: reflectsID, Version: "v1"},
		TestKind:     tk,
		CertLanguage: cl,
		Authority:    records.AuthorityAbove,
		Liveness:     records.LivenessAlive,
	}}
}

// ── FIXTURE — the canonical S70 journey: a complete app, a monstered app, and scope isolation. ──

// TestProjectScopedMonster_FaultInjection is the done-criterion: the project-scoped monster detector
// FIRES inside the project where we inject a monster, and ONLY there.
func TestProjectScopedMonster_FaultInjection(t *testing.T) {
	// app-A: an entity layer WITH its living schema mirror → complete.
	// app-B: an entity layer WITHOUT any mirror → no_truth_without_mirror (a monster, scoped to B).
	lib := Library{
		Layers: []ProjectLayer{
			layer("app-A", "A.Order", "entity"),
			layer("app-B", "B.Cart", "entity"),
		},
		Mirrors: []ProjectMirror{
			livingMirror("app-A", "mA1", "A.Order", records.TestKindSchema, records.CertZod),
		},
	}

	// BASELINE — before injection, app-A is COMPLETE (its scoped detector does NOT fire).
	if got := ScopedCompleteness(lib, "app-A").Verdict; got != records.VerdictComplete {
		t.Fatalf("baseline: app-A must be COMPLETE, got %q", got)
	}
	if HasMonster(lib, "app-A") {
		t.Fatalf("baseline: app-A must have no monster")
	}

	// FAULT-INJECTION (no_truth_without_mirror) — app-B's entity has no living mirror.
	cB := ScopedCompleteness(lib, "app-B")
	if cB.Verdict != records.VerdictRedMonster {
		t.Fatalf("fault-injection: the project-scoped monster detector must FIRE for app-B, got %q", cB.Verdict)
	}
	if !HasMonster(lib, "app-B") {
		t.Fatalf("fault-injection: HasMonster(app-B) must be true")
	}
	if len(cB.Monsters) != 1 || cB.Monsters[0].Reason != records.ReasonNoTruthWithoutMirror {
		t.Fatalf("app-B monster must be no_truth_without_mirror, got %+v", cB.Monsters)
	}
	if cB.Monsters[0].LayerID != "B.Cart" {
		t.Fatalf("app-B monster must name B.Cart, got %q", cB.Monsters[0].LayerID)
	}

	// SCOPE ISOLATION — injecting a monster in B did NOT make A red (the detector is scoped).
	if HasMonster(lib, "app-A") {
		t.Fatalf("scope isolation: a monster in app-B must not redden app-A")
	}
}

// TestCrossProjectReflectIsOrphanWithinScope — a mirror in app-A reflecting a layer OWNED BY app-B
// is an ORPHAN within A's cut (B's layers are invisible inside A). Scope changes the verdict — a
// monster the global cut would have hidden. This is the second fault-injection.
func TestCrossProjectReflectIsOrphanWithinScope(t *testing.T) {
	lib := Library{
		Layers: []ProjectLayer{
			layer("app-A", "A.Order", "entity"),
			layer("app-B", "B.Cart", "entity"),
		},
		Mirrors: []ProjectMirror{
			livingMirror("app-A", "mA1", "A.Order", records.TestKindSchema, records.CertZod),
			// the cross-project monster: an app-A mirror reflecting app-B's B.Cart.
			livingMirror("app-A", "mCross", "B.Cart", records.TestKindSchema, records.CertZod),
		},
	}

	// GLOBAL cut would NOT flag mCross as an orphan (B.Cart exists somewhere).
	globalC := records.ComputeCompleteness(
		[]records.Mirror{lib.Mirrors[0].Mirror, lib.Mirrors[1].Mirror},
		[]records.Layer{lib.Layers[0].Layer, lib.Layers[1].Layer},
	)
	for _, m := range globalC.Monsters {
		if m.MirrorID == "mCross" {
			t.Fatalf("precondition: the GLOBAL cut must NOT see mCross as an orphan")
		}
	}

	// SCOPED to app-A: B.Cart is invisible, so mCross is an orphan → the detector FIRES.
	cA := ScopedCompleteness(lib, "app-A")
	var sawOrphan bool
	for _, m := range cA.Monsters {
		if m.Reason == records.ReasonNoOrphanMirror && m.MirrorID == "mCross" {
			sawOrphan = true
		}
	}
	if !sawOrphan {
		t.Fatalf("scoped detector must report mCross as a no_orphan_mirror within app-A, got %+v", cA.Monsters)
	}
}

// TestListByApp — the mirrors of the user listed BY APP with their liveness tallies, sorted.
func TestListByApp(t *testing.T) {
	deadMirror := ProjectMirror{Project: "app-B", Mirror: records.Mirror{
		MirrorID:     "mB-dead",
		Reflects:     records.LayerRef{LayerID: "B.Cart", Version: "v1"},
		TestKind:     records.TestKindSchema,
		CertLanguage: records.CertProse, // non-executable → does not count → dead.
		Authority:    records.AuthorityAbove,
		Liveness:     records.LivenessAlive,
	}}
	lib := Library{
		Mirrors: []ProjectMirror{
			livingMirror("app-B", "mB-alive", "B.Cart", records.TestKindSchema, records.CertZod),
			livingMirror("app-A", "mA1", "A.Order", records.TestKindSchema, records.CertZod),
			deadMirror,
		},
	}
	got := ListByApp(lib)
	if len(got) != 2 {
		t.Fatalf("expected 2 apps, got %d", len(got))
	}
	// sorted: app-A first, app-B second.
	if got[0].Project != "app-A" || got[1].Project != "app-B" {
		t.Fatalf("apps must be sorted by project, got %q,%q", got[0].Project, got[1].Project)
	}
	if got[0].Alive != 1 || got[0].Dead != 0 {
		t.Fatalf("app-A: want 1 alive 0 dead, got %d/%d", got[0].Alive, got[0].Dead)
	}
	if got[1].Alive != 1 || got[1].Dead != 1 {
		t.Fatalf("app-B: want 1 alive 1 dead, got %d/%d", got[1].Alive, got[1].Dead)
	}
}

// ── PROPERTY (rapid) — reproducibility: same library → same scoped verdict (determinism-first). ──

func TestScopedCompletenessReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		lib := genLibrary(t)
		project := ProjectID(rapid.SampledFrom([]string{"app-A", "app-B", "app-C"}).Draw(t, "project"))

		a := ScopedCompleteness(lib, project)
		b := ScopedCompleteness(lib, project)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("ScopedCompleteness not reproducible:\n a=%+v\n b=%+v", a, b)
		}

		// The scoped cut is itself stable (same library → byte-identical cut).
		c1 := ScopeTo(lib, project)
		c2 := ScopeTo(lib, project)
		if !reflect.DeepEqual(c1, c2) {
			t.Fatalf("ScopeTo not reproducible")
		}
	})
}

// TestScopeNeverLeaksAnotherProject — the scoped cut contains ONLY the chosen project's rows (the
// S55 isolation property: scope never leaks a sibling project's layer or mirror).
func TestScopeNeverLeaksAnotherProject(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		lib := genLibrary(t)
		project := ProjectID(rapid.SampledFrom([]string{"app-A", "app-B", "app-C"}).Draw(t, "project"))
		cut := ScopeTo(lib, project)
		if cut.Project != project {
			t.Fatalf("cut.Project must equal the scope")
		}
		// every layer/mirror in the cut belongs to exactly the scoped project.
		ownLayer := map[string]bool{}
		ownMirror := map[string]ProjectID{}
		for _, pl := range lib.Layers {
			if pl.Project == project {
				ownLayer[layerSortKey(pl.Layer)] = true
			}
		}
		for _, pm := range lib.Mirrors {
			ownMirror[mirrorSortKey(pm.Mirror)] = pm.Project
		}
		for _, l := range cut.Layers {
			if !ownLayer[layerSortKey(l)] {
				t.Fatalf("scope leaked a layer not owned by %q: %+v", project, l)
			}
		}
		for _, m := range cut.Mirrors {
			if ownMirror[mirrorSortKey(m)] != project {
				t.Fatalf("scope leaked a mirror not owned by %q: %+v", project, m)
			}
		}
	})
}

// genLibrary draws a small multi-project library for the property mirrors.
func genLibrary(t *rapid.T) Library {
	projects := []string{"app-A", "app-B", "app-C"}
	kinds := []string{"entity", "policy", "operation", "view"}
	ids := []string{"X", "Y", "Z"}
	nL := rapid.IntRange(0, 5).Draw(t, "nLayers")
	var layers []ProjectLayer
	for i := 0; i < nL; i++ {
		layers = append(layers, ProjectLayer{
			Project: ProjectID(rapid.SampledFrom(projects).Draw(t, "lproj")),
			Layer: records.Layer{
				LayerID: rapid.SampledFrom(ids).Draw(t, "lid"),
				Version: "v1",
				Kind:    rapid.SampledFrom(kinds).Draw(t, "lkind"),
			},
		})
	}
	nM := rapid.IntRange(0, 5).Draw(t, "nMirrors")
	tks := []records.TestKind{records.TestKindSchema, records.TestKindProperty, records.TestKindFixture, records.TestKindE2E}
	cls := []records.CertLanguage{records.CertZod, records.CertRapid, records.CertFixture, records.CertProse}
	var mirrors []ProjectMirror
	for i := 0; i < nM; i++ {
		mirrors = append(mirrors, ProjectMirror{
			Project: ProjectID(rapid.SampledFrom(projects).Draw(t, "mproj")),
			Mirror: records.Mirror{
				MirrorID:     rapid.SampledFrom([]string{"m1", "m2", "m3"}).Draw(t, "mid"),
				Reflects:     records.LayerRef{LayerID: rapid.SampledFrom(ids).Draw(t, "mref"), Version: "v1"},
				TestKind:     rapid.SampledFrom(tks).Draw(t, "mtk"),
				CertLanguage: rapid.SampledFrom(cls).Draw(t, "mcl"),
				Authority:    records.AuthorityAbove,
				Liveness:     records.LivenessAlive,
			},
		})
	}
	return Library{Layers: layers, Mirrors: mirrors}
}
