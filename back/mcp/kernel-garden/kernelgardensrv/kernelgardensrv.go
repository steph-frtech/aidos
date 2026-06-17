// Package kernelgardensrv (extracted, ADR 0092 batch-2) is the reusable is the AIDOS Runtime KERNEL-GARDEN MCP server (S112; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over the S112 per-project KernelDebt GARDENING + /trim
// (back/runtime/debt/garden, KRD §82.4). It surfaces the FIVE rots of a project's slice
// of the truth-store — orphan_mirror, stale_fixture, surviving_mutant (CONSUMED from
// S41) plus DEAD LIVENESS and LOW-VALUE CONSTRAINT (the two §82.4 adds, the latter
// CONSUMED from S51 economics.Evaluate) — and PROPOSES reductions over them. /trim
// SUGGESTS; accepting a proposal OPENS an idea → mirror → /goal → human approval.
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION over a read-only projection
// (a project's kernel ⋈ mirrors ⋈ mutation ⋈ declared budgets). It WRITES NOTHING — no
// kernel, no mirrors, no fitness. /trim deletes NOTHING; the only door is
// idea → mirror → /goal → human approval (garden_accept_proposal returns the OpenIdea
// projection, never a removal).
//
// Tools (one tool = one backend op):
//
//	garden_tend_project    — garden ONE project's snapshot → the ranked, project-scoped debt
//	garden_suggest_trim    — propose an open_idea_* trim over each debt item (suggest-only)
//	garden_accept_proposal — project a suggestion onto the OpenIdea accepting it yields
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — the
// detection/ranking is code, the §66.3 verdict is CONSUMED from economics.Evaluate, the
// trim mapping is a closed table, never an LLM. Same input → same output. The
// reproducibility mirrors (garden_property_test.go + lib/kernel-garden.test.ts) pin it.
// Transport: stdio.
package kernelgardensrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	mrec "github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/steph-frtech/aidos/back/runtime/debt"
	"github.com/steph-frtech/aidos/back/runtime/debt/garden"
	"github.com/steph-frtech/aidos/back/runtime/economics"
)

// fixedNow keeps the tools pure (the garden's classification never reads the clock; the
// clock is only the recorder's scanned_at — fixed here, CLAUDE.md §6).
const fixedNow int64 = 1_700_000_000

// ── input shapes ──

type truthIn struct {
	ID      string `json:"id" jsonschema:"the truth id"`
	Version string `json:"version" jsonschema:"the live head version"`
	Live    bool   `json:"live" jsonschema:"whether this truth is live"`
}

type mirrorIn struct {
	ID              string `json:"id" jsonschema:"the mirror id"`
	ReflectsLayerID string `json:"reflects_layer_id" jsonschema:"the truth id this mirror reflects"`
	ReflectsVersion string `json:"reflects_version" jsonschema:"the truth @version this mirror is pinned to"`
	TestKind        string `json:"test_kind" jsonschema:"fixture|property|acceptance|... (only fixture can go stale)"`
	Liveness        string `json:"liveness" jsonschema:"alive|dead (a dead mirror on a live truth is dead_liveness)"`
}

type mutationIn struct {
	Target string `json:"target" jsonschema:"the truth the mutation targeted"`
	Status string `json:"status" jsonschema:"survived|killed"`
}

type budgetIn struct {
	CellRef               string `json:"cell_ref" jsonschema:"the cell the budget is declared for (KRD §66.3)"`
	MaxCIMinutes          int    `json:"max_ci_minutes" jsonschema:"declared cap on CI minutes (non-negative)"`
	MaxLLMTokensPerGoal   int    `json:"max_llm_tokens_per_goal" jsonschema:"declared cap on LLM tokens per goal (non-negative)"`
	MaxMutationRuntimeSec int    `json:"max_mutation_runtime_seconds" jsonschema:"declared cap on mutation runtime seconds (non-negative)"`
	MaxHumanReviewMinutes int    `json:"max_human_review_minutes" jsonschema:"declared cap on human-review minutes (non-negative)"`
	ExpectedRiskReduction string `json:"expected_risk_reduction" jsonschema:"low|medium|high|critical"`
}

type costIn struct {
	CIMinutes          int `json:"ci_minutes" jsonschema:"metered CI minutes (COUNTED, never estimated)"`
	LLMTokens          int `json:"llm_tokens" jsonschema:"metered LLM tokens"`
	MutationRuntimeSec int `json:"mutation_runtime_seconds" jsonschema:"metered mutation runtime seconds"`
	HumanReviewMinutes int `json:"human_review_minutes" jsonschema:"metered human-review minutes"`
}

type valueCaseIn struct {
	Truth        string `json:"truth" jsonschema:"the costly truth the value case justifies"`
	RiskIfBroken string `json:"risk_if_broken" jsonschema:"low|medium|high|critical"`
	Decision     string `json:"decision" jsonschema:"justified|too_expensive|revisit — only justified clears the flag"`
}

type cellBudgetIn struct {
	Budget    budgetIn     `json:"budget"`
	Cost      costIn       `json:"cost" jsonschema:"the cell's METERED harness cost (CONSUMED from S111 costmeter)"`
	ValueCase *valueCaseIn `json:"value_case,omitempty" jsonschema:"an OPTIONAL value case; justified clears the over-budget flag"`
}

type projectIn struct {
	ProjectRef string         `json:"project_ref" jsonschema:"the project this garden tends (§82.4 — scans are project-scoped)"`
	KernelHead string         `json:"kernel_head" jsonschema:"the kernel head the scan is taken against"`
	Truths     []truthIn      `json:"truths"`
	Mirrors    []mirrorIn     `json:"mirrors"`
	Mutation   []mutationIn   `json:"mutation,omitempty"`
	Budgets    []cellBudgetIn `json:"budgets,omitempty"`
}

// ── output shapes ──

type itemOut struct {
	ID         string `json:"id"`
	ProjectRef string `json:"project_ref"`
	Kind       string `json:"kind"`
	TargetRef  string `json:"target_ref"`
	Reason     string `json:"reason"`
	Severity   string `json:"severity"`
}

type gardenOut struct {
	ProjectRef string    `json:"project_ref"`
	KernelHead string    `json:"kernel_head"`
	Items      []itemOut `json:"items"`
	Count      int       `json:"count"`
}

type suggestionOut struct {
	DebtItemRef    string `json:"debt_item_ref"`
	ProjectRef     string `json:"project_ref"`
	ProposedAction string `json:"proposed_action"`
	Rationale      string `json:"rationale"`
	Requires       string `json:"requires"`
}

type planOut struct {
	ProjectRef      string          `json:"project_ref"`
	Suggestions     []suggestionOut `json:"suggestions"`
	DeletesAnything bool            `json:"deletes_anything"` // ALWAYS false — /trim suggests only
}

type openIdeaOut struct {
	OpensIdea    bool   `json:"opens_idea"` // ALWAYS true
	Deletes      bool   `json:"deletes"`    // ALWAYS false
	Door         string `json:"door"`       // idea → mirror → /goal → human approval
	FromAction   string `json:"from_action"`
	OnDebtItem   string `json:"on_debt_item"`
	ProjectRef   string `json:"project_ref"`
	IntentPrefix string `json:"intent_prefix"`
}

// ── adapters ──

func toProjectSnapshot(in projectIn) garden.ProjectSnapshot {
	truths := make([]debt.TruthRow, 0, len(in.Truths))
	for _, t := range in.Truths {
		truths = append(truths, debt.TruthRow{ID: t.ID, Version: t.Version, Live: t.Live})
	}
	mirrors := make([]debt.MirrorRow, 0, len(in.Mirrors))
	for _, m := range in.Mirrors {
		mirrors = append(mirrors, debt.MirrorRow{
			ID:       m.ID,
			Reflects: mrec.LayerRef{LayerID: m.ReflectsLayerID, Version: m.ReflectsVersion},
			TestKind: mrec.TestKind(m.TestKind),
			Liveness: mrec.Liveness(m.Liveness),
		})
	}
	mutation := make([]debt.MutationRow, 0, len(in.Mutation))
	for _, mu := range in.Mutation {
		mutation = append(mutation, debt.MutationRow{Target: mu.Target, Status: debt.MutationStatus(mu.Status)})
	}
	budgets := make([]garden.CellBudget, 0, len(in.Budgets))
	for _, cb := range in.Budgets {
		var vc *economics.ValueCase
		if cb.ValueCase != nil {
			vc = &economics.ValueCase{
				Truth:        cb.ValueCase.Truth,
				RiskIfBroken: economics.Risk(cb.ValueCase.RiskIfBroken),
				Decision:     economics.Decision(cb.ValueCase.Decision),
			}
		}
		budgets = append(budgets, garden.CellBudget{
			Budget: economics.HarnessCostBudget{
				CellRef:                  cb.Budget.CellRef,
				MaxCIMinutes:             cb.Budget.MaxCIMinutes,
				MaxLLMTokensPerGoal:      cb.Budget.MaxLLMTokensPerGoal,
				MaxMutationRuntimeSecond: cb.Budget.MaxMutationRuntimeSec,
				MaxHumanReviewMinutes:    cb.Budget.MaxHumanReviewMinutes,
				ExpectedRiskReduction:    economics.Risk(cb.Budget.ExpectedRiskReduction),
			},
			Cost: economics.MeasuredCost{
				CIMinutes:             cb.Cost.CIMinutes,
				LLMTokens:             cb.Cost.LLMTokens,
				MutationRuntimeSecond: cb.Cost.MutationRuntimeSec,
				HumanReviewMinutes:    cb.Cost.HumanReviewMinutes,
			},
			ValueCase: vc,
		})
	}
	return garden.ProjectSnapshot{
		ProjectRef: in.ProjectRef,
		Snapshot:   debt.Snapshot{KernelHead: in.KernelHead, Truths: truths, Mirrors: mirrors, Mutation: mutation},
		Budgets:    budgets,
	}
}

func toGardenOut(g garden.Garden) gardenOut {
	items := make([]itemOut, 0, len(g.Items))
	for _, it := range g.Items {
		items = append(items, itemOut{
			ID: it.ID, ProjectRef: it.ProjectRef, Kind: string(it.Kind),
			TargetRef: it.TargetRef, Reason: it.Reason, Severity: string(it.Severity),
		})
	}
	return gardenOut{ProjectRef: g.ProjectRef, KernelHead: g.KernelHead, Items: items, Count: len(items)}
}

func toPlanOut(p garden.GardenTrimPlan) planOut {
	sugs := make([]suggestionOut, 0, len(p.Suggestions))
	for _, s := range p.Suggestions {
		sugs = append(sugs, suggestionOut{
			DebtItemRef: s.DebtItemRef, ProjectRef: s.ProjectRef,
			ProposedAction: string(s.ProposedAction), Rationale: s.Rationale, Requires: s.Requires,
		})
	}
	return planOut{ProjectRef: p.ProjectRef, Suggestions: sugs, DeletesAnything: false}
}

// ── tools ──

func tendTool(_ context.Context, _ *mcp.CallToolRequest, in projectIn) (*mcp.CallToolResult, gardenOut, error) {
	g := garden.Tend(toProjectSnapshot(in), fixedNow)
	return nil, toGardenOut(g), nil
}

func suggestTool(_ context.Context, _ *mcp.CallToolRequest, in projectIn) (*mcp.CallToolResult, planOut, error) {
	g := garden.Tend(toProjectSnapshot(in), fixedNow)
	return nil, toPlanOut(garden.SuggestGardenTrim(g)), nil
}

type acceptInput struct {
	DebtItemRef    string `json:"debt_item_ref" jsonschema:"the debt item the accepted suggestion targets"`
	ProjectRef     string `json:"project_ref"`
	ProposedAction string `json:"proposed_action" jsonschema:"the open_idea_* action being accepted"`
}

func acceptTool(_ context.Context, _ *mcp.CallToolRequest, in acceptInput) (*mcp.CallToolResult, openIdeaOut, error) {
	oi := garden.AcceptProposal(garden.GardenSuggestion{
		DebtItemRef:    in.DebtItemRef,
		ProjectRef:     in.ProjectRef,
		ProposedAction: garden.GardenAction(in.ProposedAction),
		Requires:       garden.TheDoor,
	})
	return nil, openIdeaOut{
		OpensIdea: oi.OpensIdea, Deletes: oi.Deletes, Door: oi.Door,
		FromAction: string(oi.FromAction), OnDebtItem: oi.OnDebtItem,
		ProjectRef: oi.ProjectRef, IntentPrefix: oi.IntentPrefix,
	}, nil
}

// NewServer builds the deterministic, dependency-free MCP server. Gateway dispatcher +
// stdio binary share it (one server, no twin). Pure: no DSN, no clock.
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-kernel-garden", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "garden_tend_project", Description: "S112 (§82.4): garden ONE project's slice of the truth-store and return its ranked, project-scoped KernelDebt. Surfaces the FIVE rots: orphan_mirror, stale_fixture, surviving_mutant (CONSUMED from S41), DEAD LIVENESS (a mirror declared `dead` still pinning a live truth — a dead proof), and LOW-VALUE CONSTRAINT (a cell over its HarnessCostBudget without a justified ValueCase — CONSUMED from S51 economics.Evaluate). The scan is project-scoped: project A never surfaces project B's debt. Writes nothing (the wall)."}, tendTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "garden_suggest_trim", Description: "S112: propose an open_idea_* trim over each debt item of a project's garden. /trim SUGGESTS — it deletes nothing, opens no ChangeSet. Every suggestion REQUIRES the door `idea → mirror → /goal → human approval`. deletes_anything is ALWAYS false."}, suggestTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "garden_accept_proposal", Description: "S112: project a trim suggestion onto the OpenIdea that ACCEPTING it yields. It ALWAYS opens an idea and NEVER deletes — acting on a trim proposal goes through idea → mirror → /goal → human approval (the only door, CLAUDE.md §2)."}, acceptTool)
	return srv
}
