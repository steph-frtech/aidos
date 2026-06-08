package envrollback_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/archive/envrollback"
	"github.com/steph-frtech/aidos/back/runtime/preview"
)

// Acceptance mirror runner (Godog, N0): drives tests/archive/envrollback.feature against the
// in-process environments + rollback-to-phase plane. reflects=archive.envrollback ·
// test_kind=gherkin · cert_language=godog · authority=above · liveness=live. The plane writes
// nothing (the wall): Promote/Rollback return a Promotion / RollbackDecision or a typed BlockReason.

type envState struct {
	project string
	phases  map[string]envrollback.PhaseInput // label → phase
	lineage map[string][]string               // served-label → ancestor phase hashes

	servedAppHash string // what prod currently serves (the re-emitted app hash)
	servedLabel   string

	prom      envrollback.Promotion
	dec       envrollback.RollbackDecision
	block     *struct{ code, expl string }
	staleHash string // the served hash BEFORE rollback (must NOT be served after)
}

func TestEnvRollbackBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "envrollback",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &envState{phases: map[string]envrollback.PhaseInput{}, lineage: map[string][]string{}}

			hashOf := func(label string) (string, error) {
				p, ok := st.phases[label]
				if !ok {
					return "", fmt.Errorf("unknown phase label %q", label)
				}
				return p.Phase.Version()
			}

			sc.Step(`^a project "([^"]*)"$`, func(p string) error { st.project = p; return nil })

			sc.Step(`^an earlier stable phase "([^"]*)" at version "([^"]*)"$`, func(label, v string) error {
				st.phases[label] = stablePhaseN("createOrder", v)
				return nil
			})
			sc.Step(`^a later stable phase "([^"]*)" at version "([^"]*)"$`, func(label, v string) error {
				st.phases[label] = stablePhaseN("createOrder", v)
				return nil
			})
			sc.Step(`^a non-stable phase "([^"]*)" at version "([^"]*)"$`, func(label, v string) error {
				st.phases[label] = redPhaseN("createOrder", v)
				return nil
			})
			sc.Step(`^the DAG lineage of "([^"]*)" includes "([^"]*)"$`, func(served, ancestor string) error {
				h, err := hashOf(ancestor)
				if err != nil {
					return err
				}
				st.lineage[served] = append(st.lineage[served], h)
				return nil
			})
			sc.Step(`^the DAG lineage of "([^"]*)" is empty$`, func(served string) error {
				st.lineage[served] = nil
				return nil
			})

			promote := func(label, env string) error {
				ph, ok := st.phases[label]
				if !ok {
					return fmt.Errorf("unknown phase %q", label)
				}
				prom, br := envrollback.Promote(envrollback.PromoteInput{
					Env: envrollback.Environment(env), Project: st.project, Phase: ph,
				})
				if br != nil {
					st.block = &struct{ code, expl string }{string(br.Code), br.Explanation}
					return nil
				}
				st.prom = prom
				st.servedAppHash = prom.EmittedAppHash
				st.servedLabel = label
				return nil
			}

			sc.Step(`^phase "([^"]*)" is promoted to "([^"]*)"$`, promote)

			sc.Step(`^an incident "([^"]*)" happens in prod$`, func(_ string) error {
				// The served phase incidented — capture its served hash as the STALE artifact that
				// must NOT be served after rollback.
				st.staleHash = st.servedAppHash
				return nil
			})

			sc.Step(`^prod is rolled back to phase "([^"]*)" by "([^"]*)" because "([^"]*)"$`,
				func(target, actor, reason string) error {
					tp, ok := st.phases[target]
					if !ok {
						return fmt.Errorf("unknown target phase %q", target)
					}
					served := st.phases[st.servedLabel]
					dec, br := envrollback.Rollback(envrollback.RollbackInput{
						Env: envrollback.EnvProd, Project: st.project,
						Current: served, Target: tp, Lineage: st.lineage[st.servedLabel],
						Actor: actor, Reason: reason,
					})
					if br != nil {
						st.block = &struct{ code, expl string }{string(br.Code), br.Explanation}
						return nil
					}
					st.dec = dec
					// Prod now serves the TARGET phase's re-emitted app (re-projection).
					st.servedAppHash = dec.ReProjectedAppHash
					st.servedLabel = target
					return nil
				})

			sc.Step(`^the promotion is permitted$`, func() error {
				if st.block != nil {
					return fmt.Errorf("promotion refused: %s", st.block.expl)
				}
				if st.prom.ID == "" {
					return fmt.Errorf("promotion emitted no record")
				}
				return nil
			})
			sc.Step(`^the rollback is permitted$`, func() error {
				if st.block != nil {
					return fmt.Errorf("rollback refused: %s", st.block.expl)
				}
				if st.dec.ID == "" {
					return fmt.Errorf("rollback emitted no decision")
				}
				return nil
			})
			sc.Step(`^prod serves the re-emitted app of phase "([^"]*)"$`, func(label string) error {
				ph := st.phases[label]
				h, err := ph.Phase.Version()
				if err != nil {
					return err
				}
				fresh, err := preview.EmittedAppHash(preview.PhaseRef{PhaseHash: h}, ph.Surface)
				if err != nil {
					return err
				}
				if st.servedAppHash != fresh {
					return fmt.Errorf("prod serves %q, not the re-emit of %q (%q)", st.servedAppHash, label, fresh)
				}
				return nil
			})
			sc.Step(`^prod does NOT serve the stale artifact of phase "([^"]*)"$`, func(label string) error {
				if st.staleHash == "" {
					return fmt.Errorf("no stale artifact captured")
				}
				if st.servedAppHash == st.staleHash {
					return fmt.Errorf("prod still serves the STALE artifact of %q", label)
				}
				// And RollbackProducesReProjection REJECTS the stale artifact (code judges).
				tp := st.phases[st.servedLabel]
				if ok, _ := envrollback.RollbackProducesReProjection(st.dec, tp, st.staleHash); ok {
					return fmt.Errorf("the stale artifact was accepted as the re-projection")
				}
				return nil
			})
			sc.Step(`^the promotion stack is a per-env "([^"]*)" stack$`, func(env string) error {
				if !strings.HasPrefix(st.prom.StackName, env+"-"+st.project+"-d-") {
					return fmt.Errorf("stack %q is not a per-env %q stack", st.prom.StackName, env)
				}
				return nil
			})
			sc.Step(`^the rollback decision is provenanced to "([^"]*)" because "([^"]*)"$`,
				func(actor, reason string) error {
					if st.dec.Provenance.Actor != actor {
						return fmt.Errorf("actor = %q, want %q", st.dec.Provenance.Actor, actor)
					}
					if st.dec.Provenance.Reason != reason {
						return fmt.Errorf("reason = %q, want %q", st.dec.Provenance.Reason, reason)
					}
					return nil
				})
			sc.Step(`^nothing is deleted and the decision is append-only$`, func() error {
				// The decision is a content-addressed record (an append-only fact), not an edit. Its
				// id is non-empty and stable, and it carries BOTH phases (nothing of N is destroyed).
				if st.dec.ID == "" {
					return fmt.Errorf("decision has no content address")
				}
				if st.dec.FromPhaseHash == "" || st.dec.ToPhaseHash == "" {
					return fmt.Errorf("decision does not preserve both phases (append-only)")
				}
				return nil
			})

			sc.Step(`^the promotion is refused with code "([^"]*)"$`, func(code string) error {
				if st.block == nil {
					return fmt.Errorf("promotion was not refused")
				}
				if st.block.code != code {
					return fmt.Errorf("refusal code = %q, want %q", st.block.code, code)
				}
				return nil
			})
			sc.Step(`^the rollback is refused with code "([^"]*)"$`, func(code string) error {
				if st.block == nil {
					return fmt.Errorf("rollback was not refused")
				}
				if st.block.code != code {
					return fmt.Errorf("refusal code = %q, want %q", st.block.code, code)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../tests/archive/envrollback.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("envrollback acceptance mirror failed")
	}
}
