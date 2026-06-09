// billing_property_test.go — the S114 invariant mirror (∀, rapid): the reproducibility +
// determinism band. Same ledger ⇒ same usage (metering is a COUNT, never an estimate); a build
// over-quota is ALWAYS refused QUOTA_EXCEEDED with a non-empty upgrade path (never silent); a
// webhook ingest is idempotent under replay; the metering is a monotone fold.
package billing

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"pgregory.net/rapid"
)

// genRuns draws a slice of metered runs for one account across a few projects.
func genRuns(t *rapid.T, account string) []MeteredRun {
	n := rapid.IntRange(0, 12).Draw(t, "n")
	runs := make([]MeteredRun, 0, n)
	for i := 0; i < n; i++ {
		runs = append(runs, MeteredRun{
			Account: account,
			Project: rapid.SampledFrom([]string{"p1", "p2", "p3"}).Draw(t, "proj"),
			RunID:   rapid.StringMatching(`r[0-9]{1,4}`).Draw(t, "rid"),
			Meter: agentimpl.RunMeter{
				Tokens:    rapid.IntRange(0, 5_000_000).Draw(t, "tok"),
				CIMinutes: rapid.IntRange(0, 5_000).Draw(t, "ci"),
			},
			SandboxSeconds: rapid.IntRange(0, 1_000_000).Draw(t, "sbx"),
			DeployedApps:   rapid.IntRange(0, 50).Draw(t, "dep"),
		})
	}
	return runs
}

// MeterUsage is REPRODUCIBLE: same (account, runs) ⇒ byte-identical Usage (determinism §6/§8).
func TestProp_MeterUsageReproducible(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		runs := genRuns(t, "acct")
		a := MeterUsage("acct", runs)
		b := MeterUsage("acct", runs)
		if a != b {
			t.Fatalf("metering must be reproducible: %+v != %+v", a, b)
		}
	})
}

// MeterUsage is a MONOTONE fold: every axis is the exact sum of the contributing runs — a COUNT,
// never an estimate.
func TestProp_MeterUsageIsExactCount(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		runs := genRuns(t, "acct")
		u := MeterUsage("acct", runs)
		var tok, ci, sbx, dep int
		for _, r := range runs {
			tok += r.Meter.Tokens
			ci += r.Meter.CIMinutes
			sbx += r.SandboxSeconds
			dep += r.DeployedApps
		}
		if u.LLMTokens != tok || u.BuildLoopMinutes != ci || u.DeployedApps != dep {
			t.Fatalf("metering must be an exact count: usage=%+v sums tok=%d ci=%d dep=%d", u, tok, ci, dep)
		}
		if u.SandboxHours != sbx/3600 {
			t.Fatalf("sandbox hours must floor-divide the summed seconds: %d != %d", u.SandboxHours, sbx/3600)
		}
		if u.RunCount != len(runs) {
			t.Fatalf("run count must equal contributing runs: %d != %d", u.RunCount, len(runs))
		}
	})
}

// Metering is EXACTLY attributable per project: the account usage equals the sum of its per-
// project usages (no run double-counted, none dropped).
func TestProp_MeteringAttributablePerProject(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		runs := genRuns(t, "acct")
		total := MeterUsage("acct", runs)
		var sum int
		for _, p := range []string{"p1", "p2", "p3"} {
			sum += MeterProject("acct", p, runs).LLMTokens
		}
		if sum != total.LLMTokens {
			t.Fatalf("per-project usages must sum to the account usage: %d != %d", sum, total.LLMTokens)
		}
	})
}

// A run of ANOTHER account is never counted (exact attribution boundary).
func TestProp_OtherAccountNeverCounted(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		mine := genRuns(t, "acct")
		theirs := genRuns(t, "other")
		mixed := append(append([]MeteredRun(nil), mine...), theirs...)
		if MeterUsage("acct", mixed) != MeterUsage("acct", mine) {
			t.Fatalf("another account's runs must not be counted")
		}
	})
}

// CheckQuota NEVER fails silently: an over-quota usage ALWAYS denies QUOTA_EXCEEDED with a non-
// empty how_to_fix (an upgrade path), and an under/equal usage ALWAYS allows.
func TestProp_QuotaNeverSilent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		plan := rapid.SampledFrom(Plans()).Draw(t, "plan")
		q, _ := QuotaOf(plan)
		u := Usage{
			LLMTokens:        rapid.IntRange(0, q.MaxLLMTokens*2+10).Draw(t, "tok"),
			BuildLoopMinutes: rapid.IntRange(0, q.MaxBuildLoopMinutes*2+10).Draw(t, "ci"),
			SandboxHours:     rapid.IntRange(0, q.MaxSandboxHours*2+10).Draw(t, "sbx"),
			DeployedApps:     rapid.IntRange(0, q.MaxDeployedApps*2+10).Draw(t, "dep"),
		}
		dec := CheckQuota(plan, u)
		over := u.LLMTokens > q.MaxLLMTokens || u.BuildLoopMinutes > q.MaxBuildLoopMinutes ||
			u.SandboxHours > q.MaxSandboxHours || u.DeployedApps > q.MaxDeployedApps
		if over {
			if dec.Verdict != VerdictDeny {
				t.Fatalf("over-quota must DENY, got %s (usage=%+v)", dec.Verdict, u)
			}
			if dec.BlockReason == nil || dec.BlockReason.Code != CodeQuotaExceeded {
				t.Fatalf("over-quota must be QUOTA_EXCEEDED, got %+v", dec.BlockReason)
			}
			if len(dec.BlockReason.HowToFix) == 0 {
				t.Fatalf("QUOTA_EXCEEDED with empty how_to_fix is a prison (forbidden)")
			}
		} else if dec.Verdict != VerdictAllow {
			t.Fatalf("within-quota must ALLOW, got %s (usage=%+v)", dec.Verdict, u)
		}
	})
}

// An unknown plan ALWAYS denies UNKNOWN_PLAN (never an allow by default).
func TestProp_UnknownPlanDenies(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		bad := rapid.StringMatching(`(starter|gold|x)[0-9]?`).Draw(t, "bad")
		if IsPlan(bad) {
			return
		}
		dec := CheckQuota(Plan(bad), Usage{})
		if dec.Verdict != VerdictDeny || dec.BlockReason == nil || dec.BlockReason.Code != CodeUnknownPlan {
			t.Fatalf("an unknown plan must deny UNKNOWN_PLAN, got %+v", dec)
		}
	})
}

// IngestWebhook is IDEMPOTENT: ingesting the same event any number of times yields exactly one
// log entry (the S73 exactly-once-relative guarantee, run inbound).
func TestProp_WebhookIdempotent(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		kind := rapid.SampledFrom(WebhookKinds()).Draw(t, "kind")
		e := WebhookEvent{Kind: kind, ProviderID: "evt_x", Account: "a"}
		if kind == WebhookCheckoutCompleted || kind == WebhookSubscriptionUpdated {
			e.Plan = rapid.SampledFrom(Plans()).Draw(t, "plan")
		}
		reps := rapid.IntRange(1, 6).Draw(t, "reps")
		var log []IngestEvent
		for i := 0; i < reps; i++ {
			var err error
			log, _, err = IngestWebhook(log, e)
			if err != nil {
				t.Fatalf("a valid event must ingest: %v", err)
			}
		}
		if len(log) != 1 {
			t.Fatalf("a replayed webhook must be suppressed: %d entries after %d ingests", len(log), reps)
		}
	})
}

// The Pact provider ALWAYS verifies (the contract is honoured by the in-process endpoint).
func TestProp_PactProviderAlwaysVerifies(t *testing.T) {
	c, err := EmitContract()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 16; i++ {
		if res := VerifyContract(c); !res.Pass {
			t.Fatalf("provider verification must be stable: %s", res.Reason)
		}
	}
}

// The contract is byte-stable (content-addressed, reproducible emission).
func TestProp_ContractByteStable(t *testing.T) {
	a, err := EmitContract()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := EmitContract()
	if a.SourceHash != b.SourceHash {
		t.Fatalf("the contract must be byte-stable: %s != %s", a.SourceHash, b.SourceHash)
	}
}
