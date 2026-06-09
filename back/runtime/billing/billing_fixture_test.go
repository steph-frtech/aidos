// billing_fixture_test.go — the S114 workflow mirror (N2, state→command→events): pins the
// quota-enforcement and webhook-async workflows as fixtures. A build over-quota produces a
// QUOTA_EXCEEDED block with an upgrade path; the plan ladder is strictly ascending; an inbound
// webhook applies the right plan transition.
package billing

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
)

func TestFixture_OverQuotaProducesUpgradePath(t *testing.T) {
	// state: a free account whose runs blew past the token quota.
	runs := []MeteredRun{
		{Account: "a", Project: "p", RunID: "r1", Meter: agentimpl.RunMeter{Tokens: 80_000, CIMinutes: 20}},
		{Account: "a", Project: "p", RunID: "r2", Meter: agentimpl.RunMeter{Tokens: 80_000, CIMinutes: 20}},
	}
	// command: meter then check quota under free.
	u := MeterUsage("a", runs)
	if u.LLMTokens != 160_000 {
		t.Fatalf("metering must COUNT (160000), got %d", u.LLMTokens)
	}
	dec := CheckQuota(PlanFree, u)
	// events: deny with QUOTA_EXCEEDED + upgrade path "pro", never silent.
	if dec.Verdict != VerdictDeny {
		t.Fatalf("over-quota must DENY, got %s", dec.Verdict)
	}
	if dec.BlockReason == nil || dec.BlockReason.Code != CodeQuotaExceeded {
		t.Fatalf("must be QUOTA_EXCEEDED, got %+v", dec.BlockReason)
	}
	if len(dec.BlockReason.HowToFix) == 0 {
		t.Fatalf("QUOTA_EXCEEDED with empty how_to_fix is a prison (forbidden)")
	}
	if dec.UpgradeTo != PlanPro {
		t.Fatalf("upgrade path must be pro, got %s", dec.UpgradeTo)
	}
	// over-axes names the offending axis (token).
	if len(dec.OverAxes) != 1 || dec.OverAxes[0] != "llm_tokens" {
		t.Fatalf("over_axes must name llm_tokens, got %v", dec.OverAxes)
	}
}

func TestFixture_EqualToLimitIsWithinQuota(t *testing.T) {
	q, _ := QuotaOf(PlanFree)
	u := Usage{Account: "a", LLMTokens: q.MaxLLMTokens, BuildLoopMinutes: q.MaxBuildLoopMinutes,
		SandboxHours: q.MaxSandboxHours, DeployedApps: q.MaxDeployedApps}
	if dec := CheckQuota(PlanFree, u); dec.Verdict != VerdictAllow {
		t.Fatalf("usage EQUAL to the limit is within quota (inclusive ceiling), got %s", dec.Verdict)
	}
}

func TestFixture_PlanLadderIsStrictlyAscending(t *testing.T) {
	plans := Plans()
	for i := 1; i < len(plans); i++ {
		lo, _ := QuotaOf(plans[i-1])
		hi, _ := QuotaOf(plans[i])
		if !(hi.MaxLLMTokens > lo.MaxLLMTokens && hi.MaxBuildLoopMinutes > lo.MaxBuildLoopMinutes &&
			hi.MaxSandboxHours > lo.MaxSandboxHours && hi.MaxDeployedApps > lo.MaxDeployedApps) {
			t.Fatalf("plan ladder must be strictly ascending: %s !< %s", plans[i-1], plans[i])
		}
	}
	if NextPlan(PlanEnterprise) != "" {
		t.Fatalf("enterprise is the top — no next plan")
	}
}

func TestFixture_WebhookAppliesPlanTransition(t *testing.T) {
	cases := []struct {
		kind WebhookKind
		plan Plan
		want Plan
		from Plan
	}{
		{WebhookCheckoutCompleted, PlanScale, PlanScale, PlanFree},
		{WebhookSubscriptionUpdated, PlanPro, PlanPro, PlanScale},
		{WebhookSubscriptionCanceled, "", PlanFree, PlanScale},
		{WebhookPaymentSucceeded, "", PlanPro, PlanPro}, // unchanged
	}
	for _, c := range cases {
		e := WebhookEvent{Kind: c.kind, ProviderID: "evt", Account: "a", Plan: c.plan}
		if got := ApplyEvent(c.from, e); got != c.want {
			t.Fatalf("%s from %s: want %s, got %s", c.kind, c.from, c.want, got)
		}
	}
}

func TestFixture_WebhookIngestIsIdempotent(t *testing.T) {
	e := WebhookEvent{Kind: WebhookCheckoutCompleted, ProviderID: "evt_9", Account: "a", Plan: PlanPro}
	var log []IngestEvent
	log, rec1, err := IngestWebhook(log, e)
	if err != nil {
		t.Fatal(err)
	}
	log, rec2, err := IngestWebhook(log, e) // replay
	if err != nil {
		t.Fatal(err)
	}
	if len(log) != 1 {
		t.Fatalf("a replayed webhook must be suppressed (exactly-once relative), got %d entries", len(log))
	}
	if rec1.ID != rec2.ID {
		t.Fatalf("the replay must collide with the prior ingest id")
	}
	if rec1.AppliedTo != PlanPro {
		t.Fatalf("checkout must apply the bought plan, got %s", rec1.AppliedTo)
	}
}

func TestFixture_MalformedWebhookRefused(t *testing.T) {
	var log []IngestEvent
	bad := []WebhookEvent{
		{Kind: "not.a.kind", ProviderID: "e", Account: "a"},
		{Kind: WebhookCheckoutCompleted, ProviderID: "", Account: "a", Plan: PlanPro},
		{Kind: WebhookCheckoutCompleted, ProviderID: "e", Account: "", Plan: PlanPro},
		{Kind: WebhookCheckoutCompleted, ProviderID: "e", Account: "a", Plan: "nope"},
	}
	for _, e := range bad {
		if _, _, err := IngestWebhook(log, e); err == nil {
			t.Fatalf("a malformed event must be refused (never silently dropped): %+v", e)
		}
	}
}

func TestFixture_PactProviderVerifies(t *testing.T) {
	c, err := EmitContract()
	if err != nil {
		t.Fatal(err)
	}
	res := VerifyContract(c)
	if !res.Pass {
		t.Fatalf("the billing webhook provider must verify against the Pact contract: %s", res.Reason)
	}
	// one ACK per kind + one DENY.
	if len(res.Interactions) != len(WebhookKinds())+1 {
		t.Fatalf("expected %d verified interactions, got %d", len(WebhookKinds())+1, len(res.Interactions))
	}
}
