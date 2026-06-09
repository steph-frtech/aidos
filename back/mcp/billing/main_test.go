// main_test.go — pins the S114 done-criteria at the MCP door (the capability boundary): the
// six tools are registered; metering COUNTS from the runs (exact, per-project); a build over-
// quota is refused QUOTA_EXCEEDED with an upgrade path; a replayed webhook is idempotent; the
// Pact provider verifies.
package main

import (
	"context"
	"testing"
)

func TestServerRegistersSixTools(t *testing.T) {
	// newMCPServer must construct without panicking and register the six billing tools.
	if newMCPServer() == nil {
		t.Fatal("the billing MCP server must construct")
	}
}

func TestTool_PlansLadder(t *testing.T) {
	_, out, err := plans(context.Background(), nil, plansInput{})
	if err != nil {
		t.Fatal(err)
	}
	if len(out.Plans) != 4 {
		t.Fatalf("expected 4 plans, got %d", len(out.Plans))
	}
	if out.Plans[0].Plan != "free" || out.Plans[0].Next != "pro" {
		t.Fatalf("free must upgrade to pro: %+v", out.Plans[0])
	}
	if out.Plans[3].Next != "" {
		t.Fatalf("enterprise must be the top (no next): %+v", out.Plans[3])
	}
}

func TestTool_MeterCountsAndAttributes(t *testing.T) {
	runs := []runInput{
		{Account: "a", Project: "p1", RunID: "r1", Tokens: 30_000, BuildMinutes: 2},
		{Account: "a", Project: "p2", RunID: "r2", Tokens: 70_000, BuildMinutes: 4},
	}
	_, all, _ := meter(context.Background(), nil, meterInput{Account: "a", Runs: runs})
	if all.Usage.LLMTokens != 100_000 {
		t.Fatalf("account usage must COUNT 100000, got %d", all.Usage.LLMTokens)
	}
	_, p1, _ := meterProject(context.Background(), nil, meterProjectInput{Account: "a", Project: "p1", Runs: runs})
	if p1.Usage.LLMTokens != 30_000 {
		t.Fatalf("p1 usage must be exactly attributable (30000), got %d", p1.Usage.LLMTokens)
	}
}

func TestTool_CheckQuotaOverIsRefusedWithUpgradePath(t *testing.T) {
	_, all, _ := meter(context.Background(), nil, meterInput{
		Account: "a",
		Runs:    []runInput{{Account: "a", Project: "p", RunID: "r", Tokens: 200_000, BuildMinutes: 1}},
	})
	_, dec, _ := checkQuota(context.Background(), nil, checkQuotaInput{Plan: "free", Usage: all.Usage})
	if dec.Verdict != "deny" {
		t.Fatalf("over-quota must DENY, got %s", dec.Verdict)
	}
	if dec.Code != "QUOTA_EXCEEDED" {
		t.Fatalf("must be QUOTA_EXCEEDED, got %s", dec.Code)
	}
	if dec.UpgradeTo != "pro" || len(dec.HowToFix) == 0 {
		t.Fatalf("must carry an upgrade path + how_to_fix: %+v", dec)
	}
}

func TestTool_IngestWebhookIdempotent(t *testing.T) {
	in := ingestInput{Kind: "checkout.completed", ProviderID: "evt_1", Account: "a", Plan: "pro", Current: "free"}
	_, first, _ := ingestWebhook(context.Background(), nil, in)
	if !first.Accepted || first.Duplicate {
		t.Fatalf("first ingest must be accepted, not duplicate: %+v", first)
	}
	if first.AppliedTo != "pro" || first.NextPlan != "pro" {
		t.Fatalf("checkout must apply + transition to pro: %+v", first)
	}
	in.Prior = first.Log
	_, second, _ := ingestWebhook(context.Background(), nil, in)
	if !second.Duplicate || len(second.Log) != 1 {
		t.Fatalf("replay must be suppressed (idempotent): %+v", second)
	}
}

func TestTool_IngestWebhookMalformedRefused(t *testing.T) {
	_, out, _ := ingestWebhook(context.Background(), nil, ingestInput{Kind: "not.a.kind", ProviderID: "e", Account: "a"})
	if out.Accepted || out.Code != "INVALID_WEBHOOK" {
		t.Fatalf("a malformed webhook must be refused INVALID_WEBHOOK, got %+v", out)
	}
}

func TestTool_PactProviderVerifies(t *testing.T) {
	_, out, _ := pactVerify(context.Background(), nil, pactVerifyInput{})
	if !out.Pass {
		t.Fatalf("the billing webhook provider must verify: %s", out.Reason)
	}
	if out.Provider != "stripe" {
		t.Fatalf("the named provider must be stripe (ADR 0049), got %s", out.Provider)
	}
}
