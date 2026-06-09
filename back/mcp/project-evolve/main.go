// Command project-evolve is the AIDOS S108 PER-PROJECT MEDIUM-LOOP MCP server
// (ROADMAP-app-builder §S108, EPIC 12, KRD §62/§64/§66).
//
// It is the capability door (ADR 0009: every backend op is an MCP tool) over the
// per-project `/evolve` + Quality-Diversity loop. Every tool DEFERS to the pure
// archive/projectevolve engine (Cull / Niches / Promote / RunMediumLoop) — it
// re-implements nothing. The loop runs from a FIXED user mirror in QUARANTINE: it may
// emit only candidate branches (/branches/evolution), reports (/reports) and ideas
// (/ideas/proposed), and it may NEVER write /kernel, /mirrors/above, /authority,
// /fitness. "L'évolution explore, elle ne gouverne pas." The mirror + property test KILL
// the variants that break the truth; the Pareto élites survive in project-scoped QD
// niches; promotion is gated on authority (∧ out-of-sample green).
//
// Tools (one per backend op):
//
//	project_evolve_run      — run the per-project medium loop from a fixed mirror over the
//	                          proposed variants; returns the surviving niche élites, the
//	                          killed variants, and the (confined) branch/report/idea writes.
//	project_evolve_cull     — run the fixed mirror over the variants and return survivors +
//	                          killed (the mirror-breakers are killed before QD).
//	project_evolve_niches   — return the project-scoped Pareto front (one élite per niche).
//	project_evolve_promote  — record a PROMOTION PROPOSAL of an élite, gated on
//	                          mirror_green ∧ out_of_sample_green ∧ authority_approval and
//	                          on the project frontier — never the freeze (door = human /goal).
//
// THE WALL (CLAUDE.md §2/§8): this server carries the aidos CLI write-grant on ideas/dag
// (below the line) — it writes branches/reports/ideas ONLY through that grant, never the
// agent role, and holds NO grant on kernel/mirrors/authority/fitness. A promotion is a
// PROPOSAL; the freeze is the separate human /goal. The Judge is the deterministic fixed
// mirror, never an LLM.
//
// Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/projectevolve"
)

// ── Tool I/O types (JSON-serialisable) ──

type variantIn struct {
	ProjectID   string  `json:"project_id" jsonschema:"the project this variant belongs to — must match the fixed mirror's"`
	ID          string  `json:"id" jsonschema:"the variant branch/node id (content address) — never invented"`
	Niche       string  `json:"niche" jsonschema:"the declared behavioral niche within the project (e.g. createOrder/fast)"`
	Mirror      string  `json:"mirror" jsonschema:"the fixed-mirror verdict — green keeps it, red kills it"`
	OutOfSample string  `json:"out_of_sample" jsonschema:"the out-of-sample / walk-forward verdict — green | red"`
	Fitness     float64 `json:"fitness" jsonschema:"the anchored fitness (rapide/cheap/simple) — orders within a niche, never overrides the mirror"`
}

type mirrorIn struct {
	ProjectID string `json:"project_id" jsonschema:"the project the fixed user mirror belongs to"`
	MirrorID  string `json:"mirror_id" jsonschema:"the frozen mirror's content address — never invented"`
	Behavior  string `json:"behavior" jsonschema:"the behaviour the mirror pins (e.g. createOrder)"`
}

type variantOut struct {
	ProjectID string  `json:"project_id"`
	ID        string  `json:"id"`
	Niche     string  `json:"niche"`
	Fitness   float64 `json:"fitness"`
}

type runInput struct {
	Mirror   mirrorIn    `json:"mirror"`
	Variants []variantIn `json:"variants"`
}

type emittedOut struct {
	Zone string `json:"zone"`
	Path string `json:"path"`
}

type runOutput struct {
	ProjectID  string                `json:"project_id"`
	MirrorID   string                `json:"mirror_id"`
	Niches     map[string]variantOut `json:"niches" jsonschema:"one Pareto élite per project-scoped niche — never breaks the mirror"`
	Killed     []string              `json:"killed" jsonschema:"the variants killed for breaking the fixed user mirror"`
	Emitted    []emittedOut          `json:"emitted" jsonschema:"every emitted write is confined to can_write — the loop never governs"`
	GateableBy map[string]string     `json:"gateable_by" jsonschema:"the remaining gate per niche — authority is always required to promote"`
}

type cullOutput struct {
	Survivors []variantOut `json:"survivors"`
	Killed    []string     `json:"killed"`
}

type nichesOutput struct {
	Niches map[string]variantOut `json:"niches"`
}

type promoteInput struct {
	Mirror            mirrorIn  `json:"mirror"`
	Variant           variantIn `json:"variant"`
	AuthorityApproved bool      `json:"authority_approved"`
}

type promoteOutput struct {
	Verdict      string `json:"verdict"`
	Niche        string `json:"niche,omitempty"`
	Proposal     bool   `json:"proposal"`
	WritesTruth  bool   `json:"writes_truth"`
	RequiresGoal string `json:"requires_goal,omitempty"`
	Reason       string `json:"reason,omitempty"`
	BlockCode    string `json:"block_code,omitempty"`
}

// ── pure conversions ──

func toMirror(m mirrorIn) projectevolve.FixedMirror {
	return projectevolve.FixedMirror{ProjectID: m.ProjectID, MirrorID: m.MirrorID, Behavior: m.Behavior}
}

func toVariant(v variantIn) projectevolve.Variant {
	return projectevolve.Variant{
		ProjectID:   v.ProjectID,
		ID:          v.ID,
		Niche:       v.Niche,
		Mirror:      projectevolve.MirrorStatus(v.Mirror),
		OutOfSample: projectevolve.OutOfSampleStatus(v.OutOfSample),
		Fitness:     v.Fitness,
	}
}

func toVariants(in []variantIn) []projectevolve.Variant {
	out := make([]projectevolve.Variant, 0, len(in))
	for _, v := range in {
		out = append(out, toVariant(v))
	}
	return out
}

func fromVariant(v projectevolve.Variant) variantOut {
	return variantOut{ProjectID: v.ProjectID, ID: v.ID, Niche: v.Niche, Fitness: v.Fitness}
}

func nicheMap(m map[string]projectevolve.Variant) map[string]variantOut {
	out := make(map[string]variantOut, len(m))
	for k, v := range m {
		out[k] = fromVariant(v)
	}
	return out
}

// ── handlers (each defers to the pure engine) ──

type server struct{}

func (server) run(_ context.Context, _ *mcp.CallToolRequest, in runInput) (*mcp.CallToolResult, runOutput, error) {
	m := toMirror(in.Mirror)
	r := projectevolve.RunMediumLoop(m, toVariants(in.Variants))
	out := runOutput{
		ProjectID:  m.ProjectID,
		MirrorID:   m.MirrorID,
		Niches:     nicheMap(r.Niches),
		Killed:     r.Killed,
		GateableBy: r.GateableBy,
	}
	for _, w := range r.Emitted {
		out.Emitted = append(out.Emitted, emittedOut{Zone: w.Zone, Path: w.Path})
	}
	return nil, out, nil
}

func (server) cull(_ context.Context, _ *mcp.CallToolRequest, in runInput) (*mcp.CallToolResult, cullOutput, error) {
	c := projectevolve.Cull(toMirror(in.Mirror), toVariants(in.Variants))
	out := cullOutput{Killed: c.Killed}
	for _, v := range c.Survivors {
		out.Survivors = append(out.Survivors, fromVariant(v))
	}
	return nil, out, nil
}

func (server) niches(_ context.Context, _ *mcp.CallToolRequest, in runInput) (*mcp.CallToolResult, nichesOutput, error) {
	n := projectevolve.Niches(toMirror(in.Mirror), toVariants(in.Variants))
	return nil, nichesOutput{Niches: nicheMap(n)}, nil
}

func (server) promote(_ context.Context, _ *mcp.CallToolRequest, in promoteInput) (*mcp.CallToolResult, promoteOutput, error) {
	res := projectevolve.Promote(toMirror(in.Mirror), toVariant(in.Variant), in.AuthorityApproved)
	out := promoteOutput{Verdict: string(res.Verdict), Reason: res.Reason}
	if res.Proposal != nil {
		out.Niche = res.Proposal.Niche
		out.Proposal = res.Proposal.Proposal
		out.WritesTruth = res.Proposal.WritesTruth
		out.RequiresGoal = res.Proposal.RequiresGoal
	}
	if res.BlockReason != nil {
		out.BlockCode = string(res.BlockReason.Code)
	}
	return nil, out, nil
}

func newMCPServer(s server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-project-evolve", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_evolve_run", Description: "Run the per-project medium loop from a fixed user mirror over the proposed variants; returns the surviving niche élites, the killed mirror-breakers, and the (confined) branch/report/idea writes — the loop never governs."}, s.run)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_evolve_cull", Description: "Run the fixed mirror over the variants; returns survivors + killed (the mirror-breakers are killed before QD, whatever their fitness)."}, s.cull)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_evolve_niches", Description: "Return the project-scoped Pareto front — one green élite per niche, max anchored fitness wins."}, s.niches)
	mcp.AddTool(srv, &mcp.Tool{Name: "project_evolve_promote", Description: "Record a PROMOTION PROPOSAL of an élite, gated on mirror_green ∧ out_of_sample_green ∧ authority_approval and the project frontier — never the freeze (door = human /goal)."}, s.promote)
	return srv
}

func main() {
	if err := newMCPServer(server{}).Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("project-evolve: run: %v", err)
	}
}
