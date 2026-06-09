// Package billing is S114 — the customer-facing economic layer: account-level PLANS,
// deterministic metered USAGE counted from the recorded AgentRun ledger, QUOTA / rate-limit
// enforcement, and the billing-provider integration (an inbound provider webhook modeled as
// an S73 async operation + a Pact contract with the named provider, ADR 0049).
//
// IT IS DISTINCT FROM THE KERNEL HarnessCostBudget (S51/S111). The HarnessCostBudget governs
// the BUILD-TIME economics of a cell (an ADVISORY flag, "is this truth worth its cost?"). The
// billing layer here governs the COMMERCIAL economics of an ACCOUNT (a BLOCKING quota, "may
// this build run under the customer's plan?"). One advises the architect; the other gates the
// customer. They share the metering substrate (the real AgentRun ledger) and nothing else.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every gesture in this package is a PURE TOTAL function:
//
//   - MeterUsage is a COUNT — a monotone fold over the recorded AgentRun ledger, attributed
//     to (account, project). It is never an estimate and never an LLM judgment; same ledger ⇒
//     same usage (the reproducibility property mirror). The four metered axes — LLM tokens,
//     build-loop minutes, sandbox hours, deployed apps — are summed from the runs' RunMeter
//     (S111 substrate), the sandbox/deploy axes carried as explicit run facts.
//   - CheckQuota compares the counted usage against the account's PLAN limits and returns
//     either a clear verdict or a QUOTA_EXCEEDED BlockReason WITH an upgrade path — never a
//     silent failure (the §44.5 prison ban). Equal-to-limit is within quota (inclusive ceil).
//   - IngestWebhook records an inbound provider event idempotently: the event id is
//     content-addressed (records.Hash over the canonical body), so a replayed webhook collides
//     with its prior ingest and is suppressed (the S73 transactional-outbox idempotency, run
//     INBOUND). No LLM, no clock, no I/O — the dispatcher seam is injected.
//
// THE WALL (CLAUDE.md §2). This package writes NO truth. Plans/usage/webhook-events are
// runtime/commercial rows (a seam below the waterline), never a kernel/mirrors/fitness schema.
// A plan/limit is DECLARED data (above the line, never learned, §8) — the package only reads
// it and counts against it.
package billing

import (
	"encoding/json"
	"errors"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
)

// ── Plans (the closed account-level tiers) ───────────────────────────────────────────────

// Plan is the closed set of account plans, in ascending capacity order. The tier ladder is
// DECLARED (§8 — never learned); the order is the upgrade path (free→pro→scale→enterprise).
type Plan string

const (
	// PlanFree — the trial tier (the funnel default, S115). Smallest quotas.
	PlanFree Plan = "free"
	// PlanPro — the individual paid tier.
	PlanPro Plan = "pro"
	// PlanScale — the team tier.
	PlanScale Plan = "scale"
	// PlanEnterprise — the largest tier (highest declared quotas).
	PlanEnterprise Plan = "enterprise"
)

// planLadder is the closed plan set in ascending order — the upgrade path.
var planLadder = []Plan{PlanFree, PlanPro, PlanScale, PlanEnterprise}

// IsPlan reports whether p is one of the four plans. Exposed so the Workbench panel and any
// decoder never invent a plan.
func IsPlan(p string) bool {
	for _, pl := range planLadder {
		if string(pl) == p {
			return true
		}
	}
	return false
}

// Plans returns the four plans in ascending (upgrade-path) order.
func Plans() []Plan { return append([]Plan(nil), planLadder...) }

// NextPlan returns the next tier up the ladder, or "" when p is already the top (enterprise)
// or not a plan. This IS the upgrade path a QUOTA_EXCEEDED BlockReason points at.
func NextPlan(p Plan) Plan {
	for i, pl := range planLadder {
		if pl == p && i+1 < len(planLadder) {
			return planLadder[i+1]
		}
	}
	return ""
}

// Quota is the DECLARED limit set of a plan across the four metered axes. A zero on an axis is
// NOT "unlimited" — it is a hard zero (no usage allowed); the top tier uses a large sentinel
// rather than zero. The values are DATA (§8), never computed here.
type Quota struct {
	MaxLLMTokens        int `json:"max_llm_tokens"`         // total LLM tokens across the account's runs
	MaxBuildLoopMinutes int `json:"max_build_loop_minutes"` // total build-loop CI minutes
	MaxSandboxHours     int `json:"max_sandbox_hours"`      // total per-app sandbox hours
	MaxDeployedApps     int `json:"max_deployed_apps"`      // concurrent deployed apps
}

// planQuotas is the DECLARED quota of each plan. The numbers are a frozen policy table (above
// the line) — the ladder is strictly ascending on every axis (the property mirror pins this).
var planQuotas = map[Plan]Quota{
	PlanFree:       {MaxLLMTokens: 100_000, MaxBuildLoopMinutes: 60, MaxSandboxHours: 5, MaxDeployedApps: 1},
	PlanPro:        {MaxLLMTokens: 2_000_000, MaxBuildLoopMinutes: 1_200, MaxSandboxHours: 100, MaxDeployedApps: 10},
	PlanScale:      {MaxLLMTokens: 20_000_000, MaxBuildLoopMinutes: 12_000, MaxSandboxHours: 1_000, MaxDeployedApps: 100},
	PlanEnterprise: {MaxLLMTokens: 1_000_000_000, MaxBuildLoopMinutes: 1_000_000, MaxSandboxHours: 100_000, MaxDeployedApps: 10_000},
}

// QuotaOf returns the declared quota of a plan, and false when p is not a plan.
func QuotaOf(p Plan) (Quota, bool) {
	q, ok := planQuotas[p]
	return q, ok
}

// ── Metering (deterministic count from the recorded AgentRun ledger) ─────────────────────

// MeteredRun pairs ONE recorded AgentRun (the WHAT-happened, S52) with the cost facts the
// billing layer attributes to the account+project. RunMeter (S111 substrate) carries the
// token/CI tally the loop tallied; SandboxSeconds and DeployedApps are run facts the metering
// reads but does not estimate (a build-loop run consuming sandbox time; a deploy run shipping
// an app). The (Account, Project) attribution is EXACT — a run belongs to exactly one project.
type MeteredRun struct {
	Account        string             `json:"account"`         // accounts.users.id (S61)
	Project        string             `json:"project"`         // projects.project.id (S53)
	RunID          string             `json:"run_id"`          // the AgentRun id (content-hash, S52)
	Meter          agentimpl.RunMeter `json:"meter"`           // the run's token/CI tally (S111)
	SandboxSeconds int                `json:"sandbox_seconds"` // sandbox wall-time the run consumed (S82)
	DeployedApps   int                `json:"deployed_apps"`   // apps this run deployed (S96), +1 per deploy
}

// Usage is the deterministic AGGREGATE of an account's metered runs across the four billed
// axes. It is a COUNT (a monotone fold), never an estimate (the S111 determinism mandate).
// RunCount records how many runs contributed (for the panel/audit).
type Usage struct {
	Account          string `json:"account"`
	RunCount         int    `json:"run_count"`
	LLMTokens        int    `json:"llm_tokens"`
	BuildLoopMinutes int    `json:"build_loop_minutes"`
	SandboxHours     int    `json:"sandbox_hours"`
	DeployedApps     int    `json:"deployed_apps"`
}

// nonNeg clamps a stray negative to zero so every counted axis is unconditionally monotone (a
// negative is a producer bug; the meter refuses to decrease — the same discipline as RunMeter).
func nonNeg(x int) int {
	if x < 0 {
		return 0
	}
	return x
}

// MeterUsage COUNTS an account's usage from its recorded runs. It is the keystone determinism
// gesture: a pure monotone fold, no clock, no RNG, no LLM. Only runs whose Account matches are
// counted (exact attribution); runs of other accounts are skipped. Build-loop minutes come
// from the RunMeter's CIMinutes; sandbox hours floor-divide the summed sandbox seconds by 3600.
// Same (account, runs) ⇒ same Usage (the reproducibility property mirror).
func MeterUsage(account string, runs []MeteredRun) Usage {
	u := Usage{Account: account}
	var sandboxSecs int
	for _, r := range runs {
		if r.Account != account {
			continue
		}
		u.RunCount++
		u.LLMTokens += nonNeg(r.Meter.Tokens)
		u.BuildLoopMinutes += nonNeg(r.Meter.CIMinutes)
		sandboxSecs += nonNeg(r.SandboxSeconds)
		u.DeployedApps += nonNeg(r.DeployedApps)
	}
	u.SandboxHours = sandboxSecs / 3600
	return u
}

// MeterProject COUNTS the usage attributable to ONE project of an account — the same fold,
// filtered by (account, project). It proves the metering is "exactly attributable par projet"
// (the done-criterion). Pure; same input ⇒ same output.
func MeterProject(account, project string, runs []MeteredRun) Usage {
	scoped := make([]MeteredRun, 0, len(runs))
	for _, r := range runs {
		if r.Account == account && r.Project == project {
			scoped = append(scoped, r)
		}
	}
	return MeterUsage(account, scoped)
}

// ── Quota enforcement (QUOTA_EXCEEDED + an upgrade path, never silent) ────────────────────

// BlockCode is the closed set of billing refusal codes.
type BlockCode string

const (
	// CodeQuotaExceeded — the counted usage exceeds the account's plan quota on at least one
	// axis. A build/op attempted past the quota is REFUSED with this code + an upgrade path.
	CodeQuotaExceeded BlockCode = "QUOTA_EXCEEDED"
	// CodeUnknownPlan — a quota check ran against a plan that is not one of the four.
	CodeUnknownPlan BlockCode = "UNKNOWN_PLAN"
)

// BlockReason is the actionable refusal (CLAUDE.md §2/§44.5): code, severity, explanation, and
// a non-empty how_to_fix resolution path. A QUOTA_EXCEEDED with an empty how_to_fix would be a
// prison (forbidden) — the upgrade path always populates it.
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

// Verdict is the allow/deny outcome of a quota check.
type Verdict string

const (
	VerdictAllow Verdict = "allow"
	VerdictDeny  Verdict = "deny"
)

// QuotaDecision is the typed result of CheckQuota: the verdict, the over-quota axes that
// triggered a deny (named in the ubiquitous language, in stable order, for the panel), the
// upgrade target plan, and the actionable BlockReason when denied (nil when allowed). It never
// carries confidence — the judge is deterministic (§8).
type QuotaDecision struct {
	Verdict     Verdict      `json:"verdict"`
	OverAxes    []string     `json:"over_axes,omitempty"`
	UpgradeTo   Plan         `json:"upgrade_to,omitempty"`
	BlockReason *BlockReason `json:"block_reason,omitempty"`
}

// overQuotaAxes returns the names of every axis on which usage EXCEEDS the plan quota (per-axis
// OR: over on ANY axis is over quota). Names are the declared field names, in a stable order,
// so the report is deterministic. Equal-to-limit is within quota (inclusive ceiling).
func overQuotaAxes(q Quota, u Usage) []string {
	var axes []string
	if u.LLMTokens > q.MaxLLMTokens {
		axes = append(axes, "llm_tokens")
	}
	if u.BuildLoopMinutes > q.MaxBuildLoopMinutes {
		axes = append(axes, "build_loop_minutes")
	}
	if u.SandboxHours > q.MaxSandboxHours {
		axes = append(axes, "sandbox_hours")
	}
	if u.DeployedApps > q.MaxDeployedApps {
		axes = append(axes, "deployed_apps")
	}
	sort.Strings(axes)
	return axes
}

// CheckQuota compares an account's counted usage against its plan quota and returns the
// verdict. When over quota on ANY axis it DENIES with a QUOTA_EXCEEDED BlockReason whose
// how_to_fix names the over-axes AND the upgrade path (NextPlan) — never a silent failure (the
// property mirror). An unknown plan denies UNKNOWN_PLAN. Pure: no clock/RNG/LLM; same
// (plan, usage) ⇒ same decision.
func CheckQuota(plan Plan, u Usage) QuotaDecision {
	q, ok := planQuotas[plan]
	if !ok {
		return QuotaDecision{Verdict: VerdictDeny, BlockReason: unknownPlanReason(plan)}
	}
	axes := overQuotaAxes(q, u)
	if len(axes) == 0 {
		return QuotaDecision{Verdict: VerdictAllow}
	}
	up := NextPlan(plan)
	return QuotaDecision{
		Verdict:     VerdictDeny,
		OverAxes:    axes,
		UpgradeTo:   up,
		BlockReason: quotaExceededReason(plan, axes, up),
	}
}

// CanRunBuild is the named gate the build-loop (S83) consults before starting a run: the
// account may run a build iff CheckQuota allows under its plan. An over-quota account is
// refused — never a silent skip. Pure.
func CanRunBuild(plan Plan, u Usage) bool {
	return CheckQuota(plan, u).Verdict == VerdictAllow
}

func quotaExceededReason(plan Plan, axes []string, up Plan) *BlockReason {
	fix := []string{
		"réduisez la consommation sur : " + strings.Join(axes, ", ") + " (attendez le prochain cycle ou trimmez les runs)",
	}
	if up != "" {
		fix = append(fix, "passez au plan supérieur « "+string(up)+" » pour relever le quota (chemin d'upgrade)")
	} else {
		fix = append(fix, "contactez le support : le plan « "+string(plan)+" » est déjà le plus élevé (quota sur-mesure)")
	}
	return &BlockReason{
		Code:        CodeQuotaExceeded,
		Severity:    "blocking",
		Explanation: "le quota du plan « " + string(plan) + " » est dépassé sur " + strings.Join(axes, ", ") + " — un build au-delà du quota est refusé, JAMAIS un échec silencieux (le métrage est compté depuis les AgentRun enregistrés).",
		HowToFix:    fix,
	}
}

func unknownPlanReason(plan Plan) *BlockReason {
	return &BlockReason{
		Code:        CodeUnknownPlan,
		Severity:    "blocking",
		Explanation: "le plan « " + string(plan) + " » n'est pas l'un des quatre plans déclarés (free, pro, scale, enterprise).",
		HowToFix: []string{
			"choisissez un plan valide parmi : " + plansJoined(),
		},
	}
}

func plansJoined() string {
	names := make([]string, 0, len(planLadder))
	for _, p := range planLadder {
		names = append(names, string(p))
	}
	return strings.Join(names, ", ")
}

// ── Inbound provider webhooks (modeled as an S73 async operation, run INBOUND) ────────────

// WebhookKind is the closed set of inbound billing-provider events this layer ingests. The set
// is invented by neither agent nor LLM (the same closed-grammar honesty as the S73 triggers).
type WebhookKind string

const (
	// WebhookCheckoutCompleted — the provider confirms a successful checkout (a plan was bought).
	WebhookCheckoutCompleted WebhookKind = "checkout.completed"
	// WebhookPaymentSucceeded — a recurring payment succeeded (the subscription stays active).
	WebhookPaymentSucceeded WebhookKind = "payment.succeeded"
	// WebhookPaymentFailed — a payment failed (the account may be downgraded after retries).
	WebhookPaymentFailed WebhookKind = "payment.failed"
	// WebhookSubscriptionUpdated — the provider reports a plan change (upgrade/downgrade).
	WebhookSubscriptionUpdated WebhookKind = "subscription.updated"
	// WebhookSubscriptionCanceled — the subscription was canceled (back to free at period end).
	WebhookSubscriptionCanceled WebhookKind = "subscription.canceled"
)

var webhookKinds = []WebhookKind{
	WebhookCheckoutCompleted, WebhookPaymentSucceeded, WebhookPaymentFailed,
	WebhookSubscriptionUpdated, WebhookSubscriptionCanceled,
}

// IsWebhookKind reports whether k is one of the closed inbound event kinds.
func IsWebhookKind(k string) bool {
	for _, wk := range webhookKinds {
		if string(wk) == k {
			return true
		}
	}
	return false
}

// WebhookKinds returns the closed inbound event kinds in canonical order.
func WebhookKinds() []WebhookKind { return append([]WebhookKind(nil), webhookKinds...) }

// WebhookEvent is one inbound provider event. ProviderID is the provider's own event id (e.g.
// Stripe `evt_…`), carried for cross-reference; Account is the AIDOS account the event targets;
// Plan is the plan the event sets (for checkout/subscription events). The async-operation
// realisation (S73): an inbound webhook is an out-of-band trigger whose EFFECT is "apply the
// plan change"; the effect is recorded to the outbox idempotently before being dispatched.
type WebhookEvent struct {
	Kind       WebhookKind `json:"kind"`
	ProviderID string      `json:"provider_id"` // the provider's event id (evt_…)
	Account    string      `json:"account"`     // the AIDOS account targeted
	Plan       Plan        `json:"plan"`        // the plan the event sets (checkout/subscription)
}

// webhookBody is the canonical content-address body of a webhook event. The id is
// records.Hash over this → idempotent: a replayed webhook (same provider event) collides with
// its prior ingest and is suppressed (the S73 exactly-once-relative guarantee, run inbound).
type webhookBody struct {
	Kind       string `json:"kind"`
	ProviderID string `json:"provider_id"`
	Account    string `json:"account"`
	Plan       string `json:"plan"`
}

// ErrInvalidWebhook is returned when a webhook event is half-formed (unknown kind, blank
// provider id, blank account) — refused, never silently dropped.
var ErrInvalidWebhook = errors.New("billing: invalid webhook event")

// IngestEvent is the recorded ingest of one inbound webhook: the content-addressed id, the
// event, and (for a plan-changing event) the plan it applied. It is the row written to the
// outbox seam (below the line) — never a kernel truth.
type IngestEvent struct {
	ID        string       `json:"id"` // records.Hash(canonical body) — the idempotency key
	Event     WebhookEvent `json:"event"`
	AppliedTo Plan         `json:"applied_to,omitempty"` // the plan the event set (if any)
}

// eventID content-addresses a webhook event (the idempotency key). Same event ⇒ same id.
func eventID(e WebhookEvent) (string, error) {
	b := webhookBody{
		Kind: string(e.Kind), ProviderID: strings.TrimSpace(e.ProviderID),
		Account: strings.TrimSpace(e.Account), Plan: string(e.Plan),
	}
	raw, err := json.Marshal(b)
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// validateWebhook refuses a half-formed event (the §44.5 honesty: never silently drop).
func validateWebhook(e WebhookEvent) error {
	if !IsWebhookKind(string(e.Kind)) {
		return ErrInvalidWebhook
	}
	if strings.TrimSpace(e.ProviderID) == "" || strings.TrimSpace(e.Account) == "" {
		return ErrInvalidWebhook
	}
	// A plan-bearing event must carry a valid plan; a payment event may carry none.
	if (e.Kind == WebhookCheckoutCompleted || e.Kind == WebhookSubscriptionUpdated) && !IsPlan(string(e.Plan)) {
		return ErrInvalidWebhook
	}
	return nil
}

// IngestWebhook records an inbound webhook event idempotently into the prior ingest log and
// returns the updated log + the recorded IngestEvent. A REPLAYED event (same content-addressed
// id) is SUPPRESSED — the log is returned unchanged and the prior ingest is re-surfaced (the
// S73 exactly-once-relative guarantee, run inbound). A half-formed event is refused
// (ErrInvalidWebhook), never silently dropped. PURE: no clock, no I/O, no LLM — the outbox /
// plan-store are injected seams the caller (the MCP) owns.
func IngestWebhook(log []IngestEvent, e WebhookEvent) ([]IngestEvent, IngestEvent, error) {
	if err := validateWebhook(e); err != nil {
		return log, IngestEvent{}, err
	}
	id, err := eventID(e)
	if err != nil {
		return log, IngestEvent{}, err
	}
	for _, prior := range log {
		if prior.ID == id {
			// Idempotent replay: collide with the prior ingest, suppress the duplicate.
			return log, prior, nil
		}
	}
	rec := IngestEvent{ID: id, Event: e}
	// A plan-changing event applies its plan; a payment-only event applies none.
	if e.Kind == WebhookCheckoutCompleted || e.Kind == WebhookSubscriptionUpdated {
		rec.AppliedTo = e.Plan
	}
	return append(append([]IngestEvent(nil), log...), rec), rec, nil
}

// ApplyEvent derives the plan an account should hold AFTER an event, given its current plan. A
// checkout/subscription-update sets the event's plan; a cancel returns to free; a payment
// event leaves the plan unchanged (the dunning/retry policy is the provider's). PURE — the
// authoritative plan transition, never an LLM.
func ApplyEvent(current Plan, e WebhookEvent) Plan {
	switch e.Kind {
	case WebhookCheckoutCompleted, WebhookSubscriptionUpdated:
		if IsPlan(string(e.Plan)) {
			return e.Plan
		}
		return current
	case WebhookSubscriptionCanceled:
		return PlanFree
	default:
		return current
	}
}
