// Package ailabsrv is the AIDOS Workbench AI Lab cockpit MCP server (FK11; ADR 0009: every backend
// op is an MCP tool), exposed as a LIBRARY (S59 dispatcher reuse).
//
// It is the capability door over FK11 (back/runtime/ailab): the PURE deterministic core of the
// AI Lab COCKPIT — the trialogue screen /ai-lab — that COMPOSES the FK09 conscience report into
// one zoomable screen (GAUCHE the chat, CENTRE the navigable layer + the wall, DROITE the cards +
// red-wave + blast + promotion gate). Four pure, write-nothing tools:
//
//	build_cockpit  — a kernel's FK08 facet skeleton + its extra sourced verdicts → the whole
//	                 cockpit state: the CENTRE pair cells (voyant + wall tier + read-only), the
//	                 DROITE cards + red wave + blast radii + the promotion gate.
//	propose_slot   — the GAUCHE chat: a node + a message → an amber PROPOSED slot, OR a wall
//	                 refusal if the message demands a direct truth write (the wall §2).
//	scope_pair     — the CENTRE click: a pair key → the deterministic left+right scope (the chat
//	                 facet+pair + the cards addressing it).
//	validate_card  — the DROITE card: validating with fix_below_wall flips the addressed pair
//	                 🔴→🟢 (re-reconciled); an above-the-wall option opens a /goal (no truth write).
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING to kernel/mirrors/fitness. The chat PROPOSES (never a
// truth); a direct truth-write is refused; an above-the-wall card option opens a /goal. The
// cockpit is a projection. DETERMINISM-FIRST (§8): every tool is PURE — no clock, no rng, no LLM
// (the gaps are SemanticDiff/blast from FK09, never an "LLM diff agent"). Every tool's I/O is a
// JSON OBJECT (no json.RawMessage), so the S59 gateway dispatches them synchronously over HTTP
// (the byte-array transport scar is avoided).
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME
// server in-process; the standalone stdio binary (back/mcp/ai-lab) and the dispatcher construct
// identical behaviour from one source — no duplicated logic, no twin (CLAUDE.md §0).
package ailabsrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/facetwire"
	"github.com/steph-frtech/aidos/back/runtime/ailab"
	"github.com/steph-frtech/aidos/back/runtime/conscience"
)

// ── inputs (shared report-rebuilding shape, mirrors the conscience MCP) ──

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

type reportIn struct {
	KernelID string             `json:"kernel_id"`
	Columns  []columnIn         `json:"columns,omitempty" jsonschema:"the FK08 non-functional facet columns the kernel instantiates"`
	Verdicts []sourcedVerdictIn `json:"verdicts,omitempty" jsonschema:"the extra sourced verdicts from the existing judges"`
}

type buildCockpitIn struct {
	reportIn
	Mode  string `json:"mode,omitempty" jsonschema:"the cockpit mode (conversational|navigational) — same screen, different zoom"`
	Level int    `json:"autonomy_level,omitempty" jsonschema:"the FK10 declared autonomy level shown in the promotion gate (0..8)"`
}

type proposeSlotIn struct {
	NodeID  string `json:"node_id"`
	Facet   string `json:"facet" jsonschema:"the facet the node carries (F|I|S|B|R|V|M|X)"`
	Message string `json:"message" jsonschema:"the chat message — a candidate intention, NOT a truth write"`
}

type scopePairIn struct {
	reportIn
	PairKey string `json:"pair_key" jsonschema:"the clicked pair key (facet:pair:source)"`
}

type validateCardIn struct {
	reportIn
	CardID string `json:"card_id"`
	Option string `json:"option" jsonschema:"the routing option (fix_below_wall acts below the wall; anything else opens a /goal)"`
}

// ── report rebuild (mirrors the conscience MCP toInput) ──

func toInput(in reportIn) conscience.Input {
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

func gateFor(level int) *ailab.PromotionGate {
	if level < 0 || level > 8 {
		return nil
	}
	next := level + 1
	if next > 8 {
		next = 8
	}
	// the promotion gate stays blocked here (proof of N green runs is FK10's pure function).
	return &ailab.PromotionGate{Level: level, CanPromote: false, NextLevel: next}
}

// ── tools ──

func buildCockpit(_ context.Context, _ *mcp.CallToolRequest, in buildCockpitIn) (*mcp.CallToolResult, ailab.CockpitState, error) {
	rep := conscience.Reconcile(toInput(in.reportIn))
	return nil, ailab.BuildCockpit(rep, in.Mode, gateFor(in.Level)), nil
}

func proposeSlot(_ context.Context, _ *mcp.CallToolRequest, in proposeSlotIn) (*mcp.CallToolResult, ailab.SlotResult, error) {
	node := ailab.CockpitNode{ID: in.NodeID, Kind: "operation", Facet: in.Facet}
	return nil, ailab.ProposeSlot(node, in.Message), nil
}

type scopeOut struct {
	OK    bool            `json:"ok"`
	Scope ailab.PairScope `json:"scope"`
}

func scopePair(_ context.Context, _ *mcp.CallToolRequest, in scopePairIn) (*mcp.CallToolResult, scopeOut, error) {
	rep := conscience.Reconcile(toInput(in.reportIn))
	scope, ok := ailab.ScopeForPair(rep, in.PairKey)
	return nil, scopeOut{OK: ok, Scope: scope}, nil
}

func validateCard(_ context.Context, _ *mcp.CallToolRequest, in validateCardIn) (*mcp.CallToolResult, ailab.CardValidation, error) {
	rep := conscience.Reconcile(toInput(in.reportIn))
	return nil, ailab.ApplyCardValidation(rep, in.CardID, in.Option), nil
}

// NewServer builds the ai-lab cockpit MCP server. The handlers are PURE; the gateway dispatcher
// and the standalone stdio binary share this one constructor (S59 — no twin).
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-ai-lab", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "build_cockpit",
		Description: "FK11 (the AI Lab cockpit): compose the FK09 conscience report (facet skeleton + sourced verdicts) into the whole zoomable cockpit state — the CENTRE pair cells (a 🟢/🔴/🟡 voyant per pair + the wall tier + read-only flag), the DROITE decision cards + red wave + blast radii + the promotion gate. PURE; writes nothing (the wall).",
	}, buildCockpit)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "propose_slot",
		Description: "FK11 (the GAUCHE chat): a node + a message → an amber PROPOSED slot (a candidate, never a truth), OR a wall refusal (AI_LAB_DIRECT_TRUTH_WRITE) if the message demands a direct truth write. The only door to a truth is idea → mirror → /goal (the wall §2). PURE + content-addressed.",
	}, proposeSlot)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "scope_pair",
		Description: "FK11 (the CENTRE click): a pair key → the deterministic left+right scope — the chat facet+pair (GAUCHE) and the decision cards addressing the pair (DROITE). PURE; writes nothing.",
	}, scopePair)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "validate_card",
		Description: "FK11 (the DROITE card): validate a decision card. With fix_below_wall the addressed pair flips 🔴→🟢 (the report is re-reconciled by the FK09 aggregator); any above-the-wall option does NOT flip a pair — it opens a /goal (no truth written from the cockpit, the wall §2). PURE.",
	}, validateCard)
	return srv
}
