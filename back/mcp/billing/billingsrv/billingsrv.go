// Package billingsrv (extracted, ADR 0092 batch-3) is the reusable AIDOS Runtime/Workbench
// BILLING MCP server (S114; ADR 0009: every backend op is an MCP tool). It is the capability
// door over the S114 billing layer (back/runtime/billing): the customer-facing economic plane of
// an ACCOUNT — plans, deterministic metered usage COUNTED from the recorded AgentRun ledger
// (never an estimate, never an LLM), quota/rate-limit enforcement, and the billing-provider
// integration (an inbound webhook modeled as an S73 async operation + a Pact contract, ADR 0049).
//
// Six tools (one tool = one backend op):
//
//	billing_plans          — the closed plan ladder + each plan's declared quota             (READ)
//	billing_meter          — COUNT an account's usage from its recorded AgentRuns            (READ)
//	billing_meter_project  — COUNT the usage attributable to ONE project (exact attribution) (READ)
//	billing_check_quota    — enforce the plan quota; over-quota → QUOTA_EXCEEDED + upgrade    (READ)
//	billing_ingest_webhook — ingest an inbound provider webhook idempotently (S73 run inbound)
//	billing_pact_verify    — provider-verify the billing webhook against the Pact contract   (READ)
//
// THE WALL (CLAUDE.md §2): every tool is BELOW the line — plans/usage/quotas/webhook-events are
// runtime/commercial rows; the server writes NO kernel/mirrors/fitness. A plan/limit is DECLARED
// data (§8 — never learned). The metering is a COUNT over the real ledger (the deterministic
// judge, never the LLM).
//
// STATELESS + DETERMINISTIC (CLAUDE.md §6/§8): every tool is a PURE function of its input — no DB,
// no clock, no RNG. Same input → same output. The reproducibility mirrors (the package property
// test + lib/billing.test.ts) pin it. Every I/O is a scalar object (billing.Quota/Usage/IngestEvent
// are plain structs — NO json.RawMessage body, so the S59 byte-array transport scar is avoided by
// construction and the read tools dispatch through the gateway over HTTP). Transport: stdio.
//
// Extracted at ADR 0092 batch-3 so the gateway dispatcher reuses the SAME server in-process — reuse,
// don't reinvent (CLAUDE.md §0); the Go engine is the SINGLE live source and the TS twin
// (lib/billing.ts) becomes the demo fallback only.
package billingsrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/billing"
)

// ── billing_plans ──

type plansInput struct{}
type planView struct {
	Plan  string        `json:"plan"`
	Quota billing.Quota `json:"quota"`
	Next  string        `json:"next,omitempty"`
}
type plansOutput struct {
	Plans []planView `json:"plans"`
}

func plans(_ context.Context, _ *mcp.CallToolRequest, _ plansInput) (*mcp.CallToolResult, plansOutput, error) {
	out := plansOutput{}
	for _, p := range billing.Plans() {
		q, _ := billing.QuotaOf(p)
		out.Plans = append(out.Plans, planView{Plan: string(p), Quota: q, Next: string(billing.NextPlan(p))})
	}
	return nil, out, nil
}

// ── shared run envelope ──

type runInput struct {
	Account        string `json:"account" jsonschema:"the account (S61) the run is attributed to"`
	Project        string `json:"project" jsonschema:"the project (S53) the run belongs to"`
	RunID          string `json:"run_id" jsonschema:"the recorded AgentRun id (content-hash, S52)"`
	Tokens         int    `json:"tokens" jsonschema:"LLM tokens the run consumed (from the run's RunMeter, S111)"`
	BuildMinutes   int    `json:"build_minutes" jsonschema:"build-loop CI minutes the run consumed"`
	SandboxSeconds int    `json:"sandbox_seconds,omitempty" jsonschema:"sandbox wall-time the run consumed (S82)"`
	DeployedApps   int    `json:"deployed_apps,omitempty" jsonschema:"apps the run deployed (S96)"`
}

func (r runInput) metered() billing.MeteredRun {
	return billing.MeteredRun{
		Account: r.Account, Project: r.Project, RunID: r.RunID,
		Meter:          agentimpl.RunMeter{Tokens: r.Tokens, CIMinutes: r.BuildMinutes},
		SandboxSeconds: r.SandboxSeconds, DeployedApps: r.DeployedApps,
	}
}

func meteredRuns(runs []runInput) []billing.MeteredRun {
	out := make([]billing.MeteredRun, 0, len(runs))
	for _, r := range runs {
		out = append(out, r.metered())
	}
	return out
}

// ── billing_meter ──

type meterInput struct {
	Account string     `json:"account" jsonschema:"the account to meter"`
	Runs    []runInput `json:"runs" jsonschema:"the recorded AgentRuns to count usage from"`
}
type meterOutput struct {
	Usage billing.Usage `json:"usage"`
}

func meter(_ context.Context, _ *mcp.CallToolRequest, in meterInput) (*mcp.CallToolResult, meterOutput, error) {
	return nil, meterOutput{Usage: billing.MeterUsage(in.Account, meteredRuns(in.Runs))}, nil
}

// ── billing_meter_project ──

type meterProjectInput struct {
	Account string     `json:"account" jsonschema:"the account"`
	Project string     `json:"project" jsonschema:"the project to attribute usage to"`
	Runs    []runInput `json:"runs" jsonschema:"the recorded AgentRuns to count usage from"`
}

func meterProject(_ context.Context, _ *mcp.CallToolRequest, in meterProjectInput) (*mcp.CallToolResult, meterOutput, error) {
	return nil, meterOutput{Usage: billing.MeterProject(in.Account, in.Project, meteredRuns(in.Runs))}, nil
}

// ── billing_check_quota ──

type checkQuotaInput struct {
	Plan  string        `json:"plan" jsonschema:"the account's plan: free|pro|scale|enterprise"`
	Usage billing.Usage `json:"usage" jsonschema:"the counted usage to check against the plan quota"`
}
type checkQuotaOutput struct {
	Verdict     string   `json:"verdict"`
	OverAxes    []string `json:"over_axes,omitempty"`
	UpgradeTo   string   `json:"upgrade_to,omitempty"`
	Code        string   `json:"code,omitempty"`
	Explanation string   `json:"explanation,omitempty"`
	HowToFix    []string `json:"how_to_fix,omitempty"`
}

func checkQuota(_ context.Context, _ *mcp.CallToolRequest, in checkQuotaInput) (*mcp.CallToolResult, checkQuotaOutput, error) {
	d := billing.CheckQuota(billing.Plan(in.Plan), in.Usage)
	out := checkQuotaOutput{Verdict: string(d.Verdict), OverAxes: d.OverAxes, UpgradeTo: string(d.UpgradeTo)}
	if d.BlockReason != nil {
		out.Code = string(d.BlockReason.Code)
		out.Explanation = d.BlockReason.Explanation
		out.HowToFix = d.BlockReason.HowToFix
	}
	return nil, out, nil
}

// ── billing_ingest_webhook ──

type ingestInput struct {
	Kind       string                `json:"kind" jsonschema:"the inbound event kind: checkout.completed|payment.succeeded|payment.failed|subscription.updated|subscription.canceled"`
	ProviderID string                `json:"provider_id" jsonschema:"the provider's event id (evt_…) — the cross-reference"`
	Account    string                `json:"account" jsonschema:"the AIDOS account the event targets"`
	Plan       string                `json:"plan,omitempty" jsonschema:"the plan the event sets (checkout/subscription)"`
	Prior      []billing.IngestEvent `json:"prior,omitempty" jsonschema:"the prior ingest log (for idempotent replay)"`
	Current    string                `json:"current,omitempty" jsonschema:"the account's current plan (to derive the transition)"`
}
type ingestOutput struct {
	Accepted    bool                  `json:"accepted"`
	Duplicate   bool                  `json:"duplicate"`
	EventID     string                `json:"event_id,omitempty"`
	AppliedTo   string                `json:"applied_to,omitempty"`
	NextPlan    string                `json:"next_plan,omitempty"` // the account's plan AFTER the event.
	Log         []billing.IngestEvent `json:"log"`
	Code        string                `json:"code,omitempty"`
	Explanation string                `json:"explanation,omitempty"`
}

func ingestWebhook(_ context.Context, _ *mcp.CallToolRequest, in ingestInput) (*mcp.CallToolResult, ingestOutput, error) {
	e := billing.WebhookEvent{
		Kind: billing.WebhookKind(in.Kind), ProviderID: in.ProviderID,
		Account: in.Account, Plan: billing.Plan(in.Plan),
	}
	priorLen := len(in.Prior)
	log, rec, err := billing.IngestWebhook(in.Prior, e)
	if err != nil {
		return nil, ingestOutput{
			Accepted: false, Log: in.Prior, Code: "INVALID_WEBHOOK",
			Explanation: "l'événement entrant est mal formé (kind/provider_id/account/plan) — refusé, jamais silencieusement ignoré.",
		}, nil
	}
	dup := len(log) == priorLen
	current := billing.Plan(in.Current)
	if !billing.IsPlan(in.Current) {
		current = billing.PlanFree
	}
	return nil, ingestOutput{
		Accepted: true, Duplicate: dup, EventID: rec.ID, AppliedTo: string(rec.AppliedTo),
		NextPlan: string(billing.ApplyEvent(current, e)), Log: log,
	}, nil
}

// ── billing_pact_verify ──

type pactVerifyInput struct{}
type pactVerifyOutput struct {
	Pass         bool     `json:"pass"`
	Provider     string   `json:"provider"`
	Reason       string   `json:"reason"`
	Interactions []string `json:"interactions,omitempty"`
	SourceHash   string   `json:"source_hash,omitempty"`
}

func pactVerify(_ context.Context, _ *mcp.CallToolRequest, _ pactVerifyInput) (*mcp.CallToolResult, pactVerifyOutput, error) {
	c, err := billing.EmitContract()
	if err != nil {
		return nil, pactVerifyOutput{Pass: false, Provider: billing.ProviderName, Reason: err.Error()}, nil
	}
	res := billing.VerifyContract(c)
	return nil, pactVerifyOutput{
		Pass: res.Pass, Provider: billing.ProviderName, Reason: res.Reason,
		Interactions: res.Interactions, SourceHash: c.SourceHash,
	}, nil
}

// NewServer builds the deterministic billing MCP server and registers the six S114 tools. It is
// dep-free (no DSN, no store, no clock): every tool is a pure function of its input. The gateway
// dispatcher reuses this SAME constructor in-process for the READ tools (the live path).
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-billing", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "billing_plans", Description: "S114: the closed account plan ladder (free→pro→scale→enterprise) and each plan's DECLARED quota (LLM tokens / build-loop minutes / sandbox hours / deployed apps) + its upgrade target. Pure — the ladder is data (§8), never learned."}, plans)
	mcp.AddTool(srv, &mcp.Tool{Name: "billing_meter", Description: "S114: COUNT an account's metered usage from its recorded AgentRuns (all projects). A deterministic monotone fold — never an estimate, never an LLM. Same ledger ⇒ same usage."}, meter)
	mcp.AddTool(srv, &mcp.Tool{Name: "billing_meter_project", Description: "S114: COUNT the usage attributable to ONE project of an account (exact attribution — a run belongs to exactly one project). Pure; per-project usages sum to the account usage."}, meterProject)
	mcp.AddTool(srv, &mcp.Tool{Name: "billing_check_quota", Description: "S114: enforce the plan quota against the counted usage. Over quota on ANY axis ⇒ DENY with a QUOTA_EXCEEDED BlockReason carrying the over-axes AND the upgrade path — NEVER a silent failure. Equal-to-limit is within quota. Pure."}, checkQuota)
	mcp.AddTool(srv, &mcp.Tool{Name: "billing_ingest_webhook", Description: "S114: ingest an inbound billing-provider webhook idempotently (modeled as an S73 async operation, run inbound). The event id is content-addressed; a replayed webhook is SUPPRESSED (exactly-once relative). A malformed event is refused, never silently dropped. Returns the plan transition the event applies. Pure."}, ingestWebhook)
	mcp.AddTool(srv, &mcp.Tool{Name: "billing_pact_verify", Description: "S114: provider-verify the AIDOS billing webhook against the Pact contract with the named provider (Stripe, ADR 0049). Stands the endpoint up in-process and replays every interaction (ACK per kind + a DENY). Deterministic — no network, no LLM."}, pactVerify)
	return srv
}
