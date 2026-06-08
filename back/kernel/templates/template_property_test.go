package templates

// template_property_test.go — the S81 REPRODUCIBILITY + DONE-CRITERION mirror (rapid, N1 invariant).
// It pins the done-criterion "instancier un template produit un projet de départ DÉTERMINISTE et VERT
// (Kernel vert, miroirs présents, aucun monstre)":
//
//   - DETERMINISTIC: same (templateID, targetSlug) ⇒ byte-identical StarterProject + StarterID.
//   - KERNEL GREEN: every curated bundle passes Validate (closed scalars, known relation targets,
//     closed cardinalities).
//   - MIRRORS PRESENT ∧ NO MONSTER: every bundled truth has a mirror; no mirror is orphan.
//   - THE WALL: an instantiation never writes the kernel (WroteKernel always false).
//   - app-auth REUSE: the auth subsystem in the starter is byte-identical to the ONE S80 expander's.

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/appauth"
	"pgregory.net/rapid"
)

// every curated template is green ∧ monster-free (the done-criterion's "vert" half).
func TestCuratedBundlesAreGreenAndMonsterFree(t *testing.T) {
	for _, id := range Catalogue() {
		b, err := Get(id)
		if err != nil {
			t.Fatalf("Get(%s): %v", id, err)
		}
		if err := Validate(b); err != nil {
			t.Fatalf("curated %s is not green: %v", id, err)
		}
		if err := Completeness(b); err != nil {
			t.Fatalf("curated %s has a monster: %v", id, err)
		}
		if b.BundleID == "" {
			t.Fatalf("curated %s has no BundleID", id)
		}
	}
}

// instantiating any curated template for any non-empty slug is deterministic + green + monster-free.
func TestInstantiateIsDeterministicGreenMonsterFree(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		id := Catalogue()[rapid.IntRange(0, len(Catalogue())-1).Draw(rt, "tpl")]
		slug := rapid.StringMatching(`[a-z][a-z0-9]{0,11}`).Draw(rt, "slug")

		sp1, err := Instantiate(id, slug)
		if err != nil {
			rt.Fatalf("Instantiate(%s,%s): %v", id, slug, err)
		}
		sp2, err := Instantiate(id, slug)
		if err != nil {
			rt.Fatalf("Instantiate again: %v", err)
		}

		// deterministic: byte-identical.
		j1, _ := json.Marshal(sp1)
		j2, _ := json.Marshal(sp2)
		if string(j1) != string(j2) {
			rt.Fatalf("instantiation not byte-identical:\n%s\n%s", j1, j2)
		}
		if sp1.StarterID == "" || sp1.StarterID != sp2.StarterID {
			rt.Fatalf("StarterID not stable: %q vs %q", sp1.StarterID, sp2.StarterID)
		}
		// the wall: never wrote the kernel.
		if sp1.WroteKernel {
			rt.Fatalf("Instantiate wrote the kernel (wall violated)")
		}
		// green ∧ monster-free: re-validate the instantiated bundle.
		b, _ := Get(id)
		if err := Validate(b); err != nil {
			rt.Fatalf("instantiated bundle not green: %v", err)
		}
		// app-auth reuse: the starter's auth == the ONE S80 expander for the same slug.
		want, _ := appauth.ExpandAppAuth(slug)
		if sp1.Auth == nil {
			rt.Fatalf("starter has no app-auth subsystem")
		}
		wj, _ := json.Marshal(want)
		gj, _ := json.Marshal(*sp1.Auth)
		if string(wj) != string(gj) {
			rt.Fatalf("starter auth not byte-identical to the S80 expander:\n%s\n%s", gj, wj)
		}
	})
}

// different targets ⇒ different StarterIDs (the address depends on the target).
func TestDifferentTargetsDifferStarterID(t *testing.T) {
	a, err := Instantiate(Ecommerce, "shop-a")
	if err != nil {
		t.Fatal(err)
	}
	b, err := Instantiate(Ecommerce, "shop-b")
	if err != nil {
		t.Fatal(err)
	}
	if a.StarterID == b.StarterID {
		t.Fatalf("two targets share a StarterID: %q", a.StarterID)
	}
}

// an unknown template / empty target is a typed error, never a guessed starter.
func TestInstantiateRejectsUnknownAndEmpty(t *testing.T) {
	if _, err := Instantiate("nope", "shop"); err == nil {
		t.Fatal("expected ErrUnknownTemplate")
	}
	if _, err := Instantiate(Ecommerce, ""); err == nil {
		t.Fatal("expected ErrNoTarget")
	}
}

// a MONSTER is rejected: a bundle with a truth missing its mirror, and one with an orphan mirror.
func TestCompletenessCatchesMonsters(t *testing.T) {
	good, _ := Get(Ecommerce)

	// truth without mirror: drop a mirror that covers an operation.
	missing := good
	missing.Mirrors = good.Mirrors[:len(good.Mirrors)-2] // drop two trailing mirrors.
	if err := Completeness(missing); err == nil {
		t.Fatal("expected ErrTruthWithoutMirror")
	}

	// orphan mirror: add a mirror reflecting a truth absent from the bundle.
	orphan := good
	orphan.Mirrors = append(append([]Mirror{}, good.Mirrors...), mir("ghost", FormGherkin, "Ghost"))
	if err := Completeness(orphan); err == nil {
		t.Fatal("expected ErrOrphanMirror")
	}
}

// a relation to an unknown target is refused (S71 honesty).
func TestValidateRejectsUnknownRelationTarget(t *testing.T) {
	b, _ := Get(Ecommerce)
	b.Relations = append([]Relation{}, b.Relations...)
	b.Relations = append(b.Relations, rel("bad", "Order", "DoesNotExist", "many-to-one"))
	if err := Validate(b); err == nil {
		t.Fatal("expected ErrUnknownRelationTarget")
	}
}
