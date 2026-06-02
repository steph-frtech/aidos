package records

// Unit mirror (N4, go test): the typed Mirror record + the two completeness
// predicates, case by case. These pin the load-bearing edges the property test
// covers in aggregate, and document the recorded-profile contract (KRD §90).

import "testing"

func ctrl(id, v string) Layer { return Layer{LayerID: id, Version: v, Kind: "control"} }

func livingFixtureMirror(id string, reflects LayerRef) Mirror {
	return Mirror{
		MirrorID:     id,
		Reflects:     reflects,
		TestKind:     TestKindFixture,
		CertLanguage: CertFixture,
		Authority:    AuthorityAbove,
		Liveness:     LivenessAlive,
	}
}

func TestRequiredTestKinds_RecordedProfile(t *testing.T) {
	// Read verbatim from KRD §90 — never invented.
	cases := map[string]TestKind{
		"entity":    TestKindSchema,
		"policy":    TestKindProperty,
		"operation": TestKindFixture,
		"view":      TestKindE2E,
		"control":   TestKindFixture,
		"action":    TestKindFixture,
		"api":       TestKindContract,
		"db":        TestKindSnapshot,
		"types":     TestKindSchema,
		"ui-web":    TestKindUnit,
		"ui-mobile": TestKindUnit,
	}
	for kind, want := range cases {
		got := RequiredTestKinds(kind)
		if len(got) != 1 || got[0] != want {
			t.Errorf("kind %q: want [%s], got %v", kind, want, got)
		}
	}
	// An unprofiled kind requires no specific test_kind.
	if got := RequiredTestKinds("product"); len(got) != 0 {
		t.Errorf("unprofiled kind must require no test_kind, got %v", got)
	}
	// RequiredTestKinds returns a copy — mutating it cannot corrupt the profile.
	got := RequiredTestKinds("control")
	got[0] = TestKindMeter
	if RequiredTestKinds("control")[0] != TestKindFixture {
		t.Fatal("profile was mutated through the returned slice")
	}
}

func TestNoTruthWithoutMirror_MissingMirrorIsMonster(t *testing.T) {
	layer := ctrl("checkout-button", "v1")
	got := NoTruthWithoutMirror(nil, []Layer{layer})
	if len(got) != 1 || got[0].Reason != ReasonNoTruthWithoutMirror || got[0].MissingTestKind != TestKindFixture {
		t.Fatalf("control with no mirror must be a no_truth_without_mirror monster (missing fixture), got %+v", got)
	}
}

func TestNoTruthWithoutMirror_LivingMirrorSatisfies(t *testing.T) {
	layer := ctrl("checkout-button", "v1")
	mirrors := []Mirror{livingFixtureMirror("m1", layer.Ref())}
	if got := NoTruthWithoutMirror(mirrors, []Layer{layer}); len(got) != 0 {
		t.Fatalf("a living fixture mirror must satisfy a control, got %+v", got)
	}
}

func TestNoTruthWithoutMirror_DeadMirrorDoesNotCount(t *testing.T) {
	layer := ctrl("checkout-button", "v1")
	m := livingFixtureMirror("m1", layer.Ref())
	m.Liveness = LivenessDead
	if got := NoTruthWithoutMirror([]Mirror{m}, []Layer{layer}); len(got) != 1 {
		t.Fatalf("a dead mirror must not count, layer stays a monster, got %+v", got)
	}
}

func TestNoTruthWithoutMirror_NonExecutableDoesNotCount(t *testing.T) {
	layer := ctrl("checkout-button", "v1")
	m := livingFixtureMirror("m1", layer.Ref())
	m.CertLanguage = CertProse // not executable (KRD §805)
	if got := NoTruthWithoutMirror([]Mirror{m}, []Layer{layer}); len(got) != 1 {
		t.Fatalf("a non-executable mirror must not count, layer stays a monster, got %+v", got)
	}
}

func TestNoTruthWithoutMirror_WrongTestKindDoesNotCount(t *testing.T) {
	layer := ctrl("checkout-button", "v1") // requires fixture
	m := livingFixtureMirror("m1", layer.Ref())
	m.TestKind = TestKindE2E // wrong required kind for a control
	got := NoTruthWithoutMirror([]Mirror{m}, []Layer{layer})
	if len(got) != 1 || got[0].MissingTestKind != TestKindFixture {
		t.Fatalf("a mirror of the wrong test_kind must not satisfy the required one, got %+v", got)
	}
}

func TestNoOrphanMirror_OrphanIsMonster(t *testing.T) {
	layer := ctrl("checkout-button", "v1")
	orphan := livingFixtureMirror("orphan", LayerRef{LayerID: "checkout-button", Version: "v0"}) // v0 gone
	got := NoOrphanMirror([]Mirror{orphan}, []Layer{layer})
	if len(got) != 1 || got[0].Reason != ReasonNoOrphanMirror || got[0].MirrorID != "orphan" {
		t.Fatalf("a mirror reflecting a gone @version must be an orphan monster, got %+v", got)
	}
}

func TestNoOrphanMirror_LiveReflectIsNotOrphan(t *testing.T) {
	layer := ctrl("checkout-button", "v1")
	m := livingFixtureMirror("m1", layer.Ref())
	if got := NoOrphanMirror([]Mirror{m}, []Layer{layer}); len(got) != 0 {
		t.Fatalf("a mirror reflecting a live layer @version is not an orphan, got %+v", got)
	}
}

func TestComputeCompleteness_GreenWhenLivingAndReflecting(t *testing.T) {
	layer := ctrl("checkout-button", "v1")
	mirrors := []Mirror{livingFixtureMirror("m1", layer.Ref())}
	r := ComputeCompleteness(mirrors, []Layer{layer})
	if r.Verdict != VerdictComplete || len(r.Monsters) != 0 {
		t.Fatalf("a living, reflecting, executable mirror must yield COMPLETE, got %+v", r)
	}
}

func TestComputeCompleteness_RedWithBothMonsters(t *testing.T) {
	missing := ctrl("missing", "v1") // no mirror → no_truth_without_mirror
	covered := ctrl("covered", "v1") // has a living mirror
	orphan := livingFixtureMirror("orphan", LayerRef{LayerID: "ghost", Version: "v9"})
	mirrors := []Mirror{livingFixtureMirror("m-covered", covered.Ref()), orphan}
	r := ComputeCompleteness(mirrors, []Layer{missing, covered})
	if r.Verdict != VerdictRedMonster {
		t.Fatalf("expected RED_MONSTER, got %s", r.Verdict)
	}
	var sawTruth, sawOrphan bool
	for _, m := range r.Monsters {
		if m.Reason == ReasonNoTruthWithoutMirror && m.LayerID == "missing" {
			sawTruth = true
		}
		if m.Reason == ReasonNoOrphanMirror && m.MirrorID == "orphan" {
			sawOrphan = true
		}
	}
	if !sawTruth || !sawOrphan {
		t.Fatalf("expected both monster kinds; sawTruth=%v sawOrphan=%v monsters=%+v", sawTruth, sawOrphan, r.Monsters)
	}
}

func TestIsExecutable(t *testing.T) {
	for _, c := range []CertLanguage{CertGherkin, CertRapid, CertFixture, CertZod, CertPact, CertUnit} {
		if !c.IsExecutable() {
			t.Errorf("%s must be executable", c)
		}
	}
	if CertProse.IsExecutable() {
		t.Error("prose must NOT be executable (KRD §805)")
	}
}

func TestIsLiving(t *testing.T) {
	base := livingFixtureMirror("m", LayerRef{LayerID: "x", Version: "v1"})
	if !base.IsLiving() {
		t.Error("an alive, executable mirror must be living")
	}
	dead := base
	dead.Liveness = LivenessDead
	if dead.IsLiving() {
		t.Error("a dead mirror is not living")
	}
	prose := base
	prose.CertLanguage = CertProse
	if prose.IsLiving() {
		t.Error("a non-executable mirror is not living even when alive")
	}
}
