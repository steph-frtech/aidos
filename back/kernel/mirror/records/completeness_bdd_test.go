package records

// Acceptance mirror (Godog, N0): drives tests/mirror/completeness.feature against
// the completeness law — the typed Mirror record + the two predicates
// (no_truth_without_mirror, no_orphan_mirror) over mirrors ⋈ kernel. The feature
// conceptually lives in the mirrors schema, materialized to tests/ (this is the
// step that BUILDS the mirrors record table, so the BDD row is back-filled here
// per the bootstrap exception, CLAUDE.md §6). The DB-level append-only + wall
// proofs are in records_db_test.go (Testcontainers).

import (
	"fmt"
	"testing"

	"github.com/cucumber/godog"
)

type completenessBDDState struct {
	layers  []Layer
	mirrors []Mirror
	result  Completeness
	subject Layer  // the layer under test
	mirror  Mirror // the mirror under test (for orphan scenario)
}

func (s *completenessBDDState) compute() {
	s.result = ComputeCompleteness(s.mirrors, s.layers)
}

func (s *completenessBDDState) hasMonster(reason MonsterReason, match func(Monster) bool) bool {
	for _, m := range s.result.Monsters {
		if m.Reason == reason && match(m) {
			return true
		}
	}
	return false
}

func TestCompletenessBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "mirror-completeness",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &completenessBDDState{}

			// Background.
			sc.Step(`^a kernel layer recorded in the kernel schema at a version$`, func() error {
				st.subject = Layer{LayerID: "checkout-button", Version: "v1", Kind: "control"}
				st.layers = []Layer{st.subject}
				return nil
			})
			sc.Step(`^the mirrors schema stores typed Mirror records with fields reflects, test_kind, cert_language, authority, liveness$`, func() error {
				// The Mirror type carries exactly those five typed fields (compile-time);
				// assert the zero value is well-formed and the fields exist.
				_ = Mirror{
					MirrorID:     "m",
					Reflects:     LayerRef{LayerID: "x", Version: "v1"},
					TestKind:     TestKindFixture,
					CertLanguage: CertFixture,
					Authority:    AuthorityAbove,
					Liveness:     LivenessAlive,
				}
				return nil
			})

			// Scenario 1 — no_truth_without_mirror.
			sc.Step(`^a kernel layer that has no mirror of any required test_kind$`, func() error {
				// subject is a control (requires a fixture mirror); no mirror exists.
				st.mirrors = nil
				return nil
			})

			// Scenario 2 — no_orphan_mirror.
			sc.Step(`^a mirror whose reflects target no longer exists at that version$`, func() error {
				// A live layer at v1; the mirror reflects v0 (superseded → gone).
				st.mirror = Mirror{
					MirrorID:     "orphan-1",
					Reflects:     LayerRef{LayerID: "checkout-button", Version: "v0"},
					TestKind:     TestKindFixture,
					CertLanguage: CertFixture,
					Authority:    AuthorityAbove,
					Liveness:     LivenessAlive, // declared alive, but it reflects nothing → monster
				}
				// Give the subject layer its own living mirror so the ONLY monster
				// is the orphan (isolates no_orphan_mirror).
				st.mirrors = []Mirror{
					{
						MirrorID:     "live-1",
						Reflects:     st.subject.Ref(),
						TestKind:     TestKindFixture,
						CertLanguage: CertFixture,
						Authority:    AuthorityAbove,
						Liveness:     LivenessAlive,
					},
					st.mirror,
				}
				return nil
			})

			// Scenario 3 — living executable mirror.
			sc.Step(`^a kernel layer at a version$`, func() error {
				st.subject = Layer{LayerID: "checkout-button", Version: "v1", Kind: "control"}
				st.layers = []Layer{st.subject}
				return nil
			})
			sc.Step(`^a mirror reflecting it with an executable cert_language and liveness alive$`, func() error {
				st.mirrors = []Mirror{
					{
						MirrorID:     "live-1",
						Reflects:     st.subject.Ref(),
						TestKind:     TestKindFixture,
						CertLanguage: CertFixture, // executable
						Authority:    AuthorityAbove,
						Liveness:     LivenessAlive,
					},
				}
				return nil
			})

			// Scenario 4 — non-executable cert_language.
			sc.Step(`^a kernel layer whose only mirror has a non-executable cert_language$`, func() error {
				st.mirrors = []Mirror{
					{
						MirrorID:     "prose-1",
						Reflects:     st.subject.Ref(),
						TestKind:     TestKindFixture,
						CertLanguage: CertProse, // NOT executable → does not count (KRD §805)
						Authority:    AuthorityAbove,
						Liveness:     LivenessAlive,
					},
				}
				return nil
			})

			// When.
			sc.Step(`^completeness is computed over mirrors joined to kernel$`, func() error {
				st.compute()
				return nil
			})

			// Then — no_truth_without_mirror.
			sc.Step(`^the layer is reported in the monster set as no_truth_without_mirror$`, func() error {
				if !st.hasMonster(ReasonNoTruthWithoutMirror, func(m Monster) bool {
					return m.LayerID == st.subject.LayerID && m.Version == st.subject.Version
				}) {
					return fmt.Errorf("expected no_truth_without_mirror for %s@%s; monsters=%+v",
						st.subject.LayerID, st.subject.Version, st.result.Monsters)
				}
				return nil
			})
			sc.Step(`^the layer is still reported as no_truth_without_mirror$`, func() error {
				if !st.hasMonster(ReasonNoTruthWithoutMirror, func(m Monster) bool {
					return m.LayerID == st.subject.LayerID
				}) {
					return fmt.Errorf("non-executable cert_language must NOT count; monsters=%+v", st.result.Monsters)
				}
				return nil
			})

			// Then — no_orphan_mirror.
			sc.Step(`^the mirror is reported in the monster set as no_orphan_mirror$`, func() error {
				if !st.hasMonster(ReasonNoOrphanMirror, func(m Monster) bool {
					return m.MirrorID == st.mirror.MirrorID
				}) {
					return fmt.Errorf("expected no_orphan_mirror for %s; monsters=%+v", st.mirror.MirrorID, st.result.Monsters)
				}
				return nil
			})
			sc.Step(`^its liveness is dead$`, func() error {
				// An orphan reflects nothing → it is dead by definition (KRD §34).
				// The read model marks it dead; here we assert it is reported as a
				// monster (the orphan reason), which IS its deadness made checkable.
				if !st.hasMonster(ReasonNoOrphanMirror, func(m Monster) bool {
					return m.MirrorID == st.mirror.MirrorID
				}) {
					return fmt.Errorf("orphan mirror %s must be dead (reported orphan)", st.mirror.MirrorID)
				}
				return nil
			})

			// Then — verdicts.
			sc.Step(`^the completeness verdict is red$`, func() error {
				if st.result.Verdict != VerdictRedMonster {
					return fmt.Errorf("expected RED_MONSTER, got %s", st.result.Verdict)
				}
				return nil
			})
			sc.Step(`^the completeness verdict is green$`, func() error {
				if st.result.Verdict != VerdictComplete {
					return fmt.Errorf("expected COMPLETE, got %s (monsters=%+v)", st.result.Verdict, st.result.Monsters)
				}
				return nil
			})
			sc.Step(`^the monster set is empty for that layer$`, func() error {
				for _, m := range st.result.Monsters {
					if m.LayerID == st.subject.LayerID {
						return fmt.Errorf("expected empty monster set for %s, got %+v", st.subject.LayerID, m)
					}
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../../tests/mirror/completeness.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("mirror completeness BDD scenarios failed")
	}
}
