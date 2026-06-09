// Command conscience is the AIDOS Runtime conscience MCP server (FK09; ADR 0009: every backend
// op is an MCP tool).
//
// It is the capability door over FK09 (back/runtime/conscience): the pure DETERMINISTIC
// AGGREGATOR that composes the verdicts of the EXISTING judges (the mirror runner, the
// completeness/monster law, SemanticDiff, the RealityMirror, the sensors, the ledger) into ONE
// ConsciousnessReport per kernel + the §FKE-31 decision cards. AUCUN NOUVEAU JUGE (FKE-6.3): the
// conscience adds no judgment — it READS sourced verdicts and ROUTES them. Two pure, write-nothing
// tools:
//
//	reconcile       — a kernel's facet skeleton (FK08) + its extra sourced verdicts (runner,
//	                  completeness, SemanticDiff, RealityMirror, sensors, ledger) → a
//	                  ConsciousnessReport (reconciled pairs + decision cards + overall verdict,
//	                  content-addressed). Aligned iff every HARD pair is green; the soft facet X
//	                  never flips it (§13.6).
//	decision_cards  — the same input → ONLY the §FKE-31 decision cards (one per divergence), the
//	                  actionable surface the cockpit renders.
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING to kernel/mirrors/fitness. It READS sourced verdicts and
// returns a projection — a divergence card is a SIGNAL; acting on it goes idea → mirror → /goal →
// human decision (the card's options route there). DETERMINISM-FIRST (§8): both tools are PURE —
// no clock, no rng, no LLM (the conscience composes existing verdicts; it is an aggregator, never a
// second agent that validates). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/facetwire"
	"github.com/steph-frtech/aidos/back/runtime/conscience"
)

// ── inputs ──

type rungIn struct {
	Rung     string `json:"rung" jsonschema:"the skeleton rung (1-spec|2-behaviour|3-scenarios|4-model|5-contract|6-evidence)"`
	Declared bool   `json:"declared"`
	Proven   bool   `json:"proven"`
}

type columnIn struct {
	Facet string   `json:"facet" jsonschema:"the non-functional facet letter (S|R|V|M|X)"`
	Rungs []rungIn `json:"rungs,omitempty"`
}

type sourcedVerdictIn struct {
	Source  string `json:"source" jsonschema:"the existing judge (runner|completeness|facet|semantic_diff|reality_mirror|sensor|ledger)"`
	Facet   string `json:"facet" jsonschema:"the facet letter (F|I|S|B|R|V|M|X)"`
	Pair    string `json:"pair" jsonschema:"the pair identifier (e.g. s2↔s9, 6-evidence, a behaviour ID)"`
	Verdict string `json:"verdict" jsonschema:"green|red|advisory, COPIED from the source judge"`
	Drift   string `json:"drift,omitempty" jsonschema:"the FKE-30 drift class when red/advisory"`
	Detail  string `json:"detail,omitempty" jsonschema:"the observed gap verbatim from the source"`
	Blast   string `json:"blast,omitempty" jsonschema:"the FKE-29 blast radius (low|medium|high|critical)"`
}

type reconcileIn struct {
	KernelID string             `json:"kernel_id"`
	Columns  []columnIn         `json:"columns,omitempty" jsonschema:"the FK08 non-functional facet columns the kernel instantiates"`
	Verdicts []sourcedVerdictIn `json:"verdicts,omitempty" jsonschema:"the extra sourced verdicts from the existing judges"`
}

// ── outputs ──

type pairOut struct {
	Source  string `json:"source"`
	Facet   string `json:"facet"`
	Pair    string `json:"pair"`
	Verdict string `json:"verdict"`
	Drift   string `json:"drift,omitempty"`
	Detail  string `json:"detail,omitempty"`
	Blast   string `json:"blast,omitempty"`
	Soft    bool   `json:"soft"`
}

type cardOut struct {
	ID             string   `json:"id"`
	KernelID       string   `json:"kernel_id"`
	Source         string   `json:"source"`
	Facet          string   `json:"facet"`
	Pair           string   `json:"pair"`
	Drift          string   `json:"drift,omitempty"`
	Detail         string   `json:"detail,omitempty"`
	Blast          string   `json:"blast"`
	Options        []string `json:"options"`
	Recommendation string   `json:"recommendation"`
	Advisory       bool     `json:"advisory"`
}

type reportOut struct {
	OK       bool      `json:"ok"`
	KernelID string    `json:"kernel_id"`
	Verdict  string    `json:"verdict"`
	Aligned  bool      `json:"aligned"`
	Pairs    []pairOut `json:"pairs"`
	Cards    []cardOut `json:"cards"`
	Green    int       `json:"green"`
	Red      int       `json:"red"`
	Advisory int       `json:"advisory"`
	Hash     string    `json:"hash"`
}

type cardsOut struct {
	OK       bool      `json:"ok"`
	KernelID string    `json:"kernel_id"`
	Verdict  string    `json:"verdict"`
	Cards    []cardOut `json:"cards"`
}

// ── mapping ──

func toInput(in reconcileIn) conscience.Input {
	out := conscience.Input{KernelID: in.KernelID}
	if len(in.Columns) > 0 {
		sk := facetwire.Skeleton{KernelID: in.KernelID}
		for _, c := range in.Columns {
			col := facetwire.Column{KernelID: in.KernelID, Facet: facets.Facet(c.Facet)}
			for _, r := range c.Rungs {
				col.Rungs = append(col.Rungs, facetwire.RungState{
					Rung: facetwire.Rung(r.Rung), Declared: r.Declared, Proven: r.Proven,
				})
			}
			sk.Columns = append(sk.Columns, col)
		}
		rep := facetwire.WireSkeleton(sk)
		out.Skeleton = &rep
	}
	for _, sv := range in.Verdicts {
		out.Verdicts = append(out.Verdicts, conscience.SourcedVerdict{
			Source:  conscience.Source(sv.Source),
			Facet:   facets.Facet(sv.Facet),
			Pair:    sv.Pair,
			Verdict: conscience.Verdict(sv.Verdict),
			Drift:   conscience.DriftKind(sv.Drift),
			Detail:  sv.Detail,
			Blast:   conscience.BlastRadius(sv.Blast),
		})
	}
	return out
}

func renderCard(c conscience.DecisionCard) cardOut {
	opts := make([]string, 0, len(c.Options))
	for _, o := range c.Options {
		opts = append(opts, string(o))
	}
	return cardOut{
		ID: c.ID, KernelID: c.KernelID, Source: string(c.Source), Facet: string(c.Facet),
		Pair: c.Pair, Drift: string(c.Drift), Detail: c.Detail, Blast: string(c.Blast),
		Options: opts, Recommendation: string(c.Recommendation), Advisory: c.Advisory,
	}
}

func renderCards(cs []conscience.DecisionCard) []cardOut {
	out := make([]cardOut, 0, len(cs))
	for _, c := range cs {
		out = append(out, renderCard(c))
	}
	return out
}

// ── reconcile ──

func reconcile(_ context.Context, _ *mcp.CallToolRequest, in reconcileIn) (*mcp.CallToolResult, reportOut, error) {
	rep := conscience.Reconcile(toInput(in))
	pairs := make([]pairOut, 0, len(rep.Pairs))
	for _, p := range rep.Pairs {
		pairs = append(pairs, pairOut{
			Source: string(p.Source), Facet: string(p.Facet), Pair: p.Pair, Verdict: string(p.Verdict),
			Drift: string(p.Drift), Detail: p.Detail, Blast: string(p.Blast), Soft: p.Soft,
		})
	}
	return nil, reportOut{
		OK: true, KernelID: rep.KernelID, Verdict: rep.Verdict, Aligned: rep.Aligned(),
		Pairs: pairs, Cards: renderCards(rep.Cards),
		Green: rep.Green, Red: rep.Red, Advisory: rep.Advisory, Hash: rep.Hash,
	}, nil
}

// ── decision_cards ──

func decisionCards(_ context.Context, _ *mcp.CallToolRequest, in reconcileIn) (*mcp.CallToolResult, cardsOut, error) {
	rep := conscience.Reconcile(toInput(in))
	return nil, cardsOut{
		OK: true, KernelID: rep.KernelID, Verdict: rep.Verdict, Cards: renderCards(rep.Cards),
	}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-conscience", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "reconcile",
		Description: "FK09 (la conscience): compose the verdicts of the EXISTING judges (runner, completeness, facet skeleton, SemanticDiff, RealityMirror, sensors, ledger) into a ConsciousnessReport per kernel — reconciled pairs + §FKE-31 decision cards + overall verdict (aligned/drift), content-addressed. Aligned iff every HARD pair is green; the soft facet X never flips it (§13.6). AUCUN NOUVEAU JUGE — it READS sourced verdicts and routes them. PURE; writes nothing (the wall).",
	}, reconcile)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "decision_cards",
		Description: "FK09 (les decision cards): the same input → ONLY the §FKE-31 decision cards (one per divergence) — the actionable surface the cockpit renders. Each card carries the gap, its source judge, the drift class, the blast radius, the routing options + a recommendation. A SOFT (X) divergence yields an advisory card (informs, never blocks). PURE; writes nothing.",
	}, decisionCards)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("conscience: run: %w", err))
	}
}
