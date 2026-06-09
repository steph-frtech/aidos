// billing_bdd_test.go — the S114 acceptance mirror (Godog, N0): drives
// back/tests/runtime/billing.feature. It pins the done-criteria DIRECTLY against the pure
// billing layer (the deterministic judge — no DB): a build over-quota is refused QUOTA_EXCEEDED
// WITH an upgrade path (never a silent failure); the metering is COUNTED from the recorded
// AgentRuns, exactly attributable per project; an inbound provider webhook is idempotent.
package billing

import (
	"fmt"
	"testing"

	"github.com/cucumber/godog"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
)

type billingState struct {
	account  string
	plan     Plan
	runs     []MeteredRun
	usage    Usage
	decision QuotaDecision
	log      []IngestEvent
	ingested IngestEvent
	count    int
}

func TestBillingBDD(t *testing.T) {
	suite := godog.TestSuite{
		Name: "billing",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &billingState{}

			sc.Step(`^un compte "([^"]*)" sur le plan "([^"]*)"$`, func(acct, plan string) error {
				if !IsPlan(plan) {
					return fmt.Errorf("plan invalide %q", plan)
				}
				st.account, st.plan = acct, Plan(plan)
				return nil
			})
			sc.Step(`^un run "([^"]*)" du projet "([^"]*)" consommant (\d+) tokens et (\d+) minutes de build-loop$`,
				func(runID, project string, tokens, minutes int) error {
					st.runs = append(st.runs, MeteredRun{
						Account: st.account, Project: project, RunID: runID,
						Meter: agentimpl.RunMeter{Tokens: tokens, CIMinutes: minutes},
					})
					return nil
				})
			sc.Step(`^je métre la consommation du compte$`, func() error {
				st.usage = MeterUsage(st.account, st.runs)
				return nil
			})
			sc.Step(`^je métre le projet "([^"]*)"$`, func(project string) error {
				st.usage = MeterProject(st.account, project, st.runs)
				return nil
			})
			sc.Step(`^je vérifie le quota$`, func() error {
				st.decision = CheckQuota(st.plan, st.usage)
				return nil
			})
			sc.Step(`^le verdict est "([^"]*)"$`, func(v string) error {
				if string(st.decision.Verdict) != v {
					return fmt.Errorf("attendu verdict %q, obtenu %q (%+v)", v, st.decision.Verdict, st.decision.BlockReason)
				}
				return nil
			})
			sc.Step(`^le refus porte le code "([^"]*)"$`, func(code string) error {
				if st.decision.BlockReason == nil || string(st.decision.BlockReason.Code) != code {
					return fmt.Errorf("attendu code %q, obtenu %+v", code, st.decision.BlockReason)
				}
				return nil
			})
			sc.Step(`^le refus est actionnable avec un chemin d'upgrade vers "([^"]*)"$`, func(up string) error {
				br := st.decision.BlockReason
				if br == nil || br.Severity == "" || len(br.HowToFix) == 0 {
					return fmt.Errorf("le refus doit être actionnable (severity + how_to_fix): %+v", br)
				}
				if string(st.decision.UpgradeTo) != up {
					return fmt.Errorf("attendu upgrade vers %q, obtenu %q", up, st.decision.UpgradeTo)
				}
				return nil
			})
			sc.Step(`^la consommation tokens vaut (\d+)$`, func(tokens int) error {
				if st.usage.LLMTokens != tokens {
					return fmt.Errorf("attendu %d tokens, obtenu %d", tokens, st.usage.LLMTokens)
				}
				return nil
			})
			sc.Step(`^un webhook "([^"]*)" du provider "([^"]*)" pour "([^"]*)" vers le plan "([^"]*)"$`,
				func(kind, providerID, account, plan string) error {
					e := WebhookEvent{Kind: WebhookKind(kind), ProviderID: providerID, Account: account, Plan: Plan(plan)}
					st.runs = nil
					var err error
					st.log, st.ingested, err = IngestWebhook(st.log, e)
					if err != nil {
						return err
					}
					st.count = 1
					// stash the event for the replay step
					st.account = account
					st.plan = Plan(plan)
					st.ingested.Event = e
					return nil
				})
			sc.Step(`^j'ingère le webhook deux fois$`, func() error {
				e := st.ingested.Event
				var err error
				st.log, _, err = IngestWebhook(st.log, e)
				if err != nil {
					return err
				}
				st.count = len(st.log)
				return nil
			})
			sc.Step(`^un seul événement est enregistré$`, func() error {
				if len(st.log) != 1 {
					return fmt.Errorf("attendu 1 événement enregistré (idempotent), obtenu %d", len(st.log))
				}
				return nil
			})
			sc.Step(`^le plan appliqué est "([^"]*)"$`, func(plan string) error {
				if string(st.log[0].AppliedTo) != plan {
					return fmt.Errorf("attendu plan appliqué %q, obtenu %q", plan, st.log[0].AppliedTo)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format: "pretty",
			Paths:  []string{"../../tests/runtime/billing.feature"},
		},
	}
	if suite.Run() != 0 {
		t.Fatal("the billing feature is RED")
	}
}
