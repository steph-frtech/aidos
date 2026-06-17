// Package linksrv is the AIDOS Kernel LINKS MCP server (KRD §41; ADR 0009: every backend op
// is an MCP tool), exposed as a LIBRARY (S59 dispatcher reuse).
//
// It is the capability door over back/kernel/links — the SIX versioned link types of KRD §41
// (projects_to · derives_from · contracts_with · triggers · binds · mirrors). Every link PINS
// its target by a concrete version (id@version), never a bare identity; when the target's head
// moves the pinned link goes STALE (the seed of the red wave, §42). Four PURE, write-nothing
// tools call the EXISTING links engine (they never reimplement it):
//
//	links_kinds    — the six closed §41 link kinds, canonical order — the set the panel renders.
//	links_validate — the PURE shape guard (kind ∈ the closed six ∧ from,to are pinned id@version);
//	                 an unpinned target is itself a monster (§41). The read the /v3/liens lens
//	                 renders (ADR 0092: the Go engine is the SINGLE live source — the lib/v2/links
//	                 TS twin becomes the demo fallback only).
//	links_resolve  — the PURE staleness check of a pinned link against the current heads:
//	                 green (pinned to head) | stale (pinned to a non-head version) | absent
//	                 (no head at all). The §42 red-wave seed, deterministic and replayable.
//	links_graph    — validate + resolve a whole graph of links against heads: per-link status,
//	                 the all-pinned guarantee, the counts. The /v3/liens summary read.
//
// THE WALL (CLAUDE.md §2): this server WRITES NOTHING to kernel/mirrors/fitness. It READS a link
// (+ heads) and returns a verdict / a graph projection — a new kernel.link row flows through the
// aidos CLI role via an approved ChangeSet, never here (WroteKernel always false).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock, no
// rng, no I/O, never an LLM. Same (link, heads) → same status (the §41–§42 done-criteria). Every
// tool's I/O is a JSON OBJECT (no json.RawMessage), so the S59 gateway dispatches all four
// synchronously over the in-memory transport (the byte-array transport scar is avoided).
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME
// server in-process; the standalone stdio binary (back/mcp/links) and the dispatcher construct
// identical behaviour from one source — no duplicated logic, no twin (CLAUDE.md §0).
package linksrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/links"
)

// ── shared shapes ──

// refIn is a PINNED layer reference as a JSON object (id@version) — a scalar object so the HTTP
// args:{object} payload survives the round-trip (no json.RawMessage).
type refIn struct {
	ID      string `json:"id" jsonschema:"the layer id"`
	Version string `json:"version" jsonschema:"the pinned version (id@version)"`
}

func (r refIn) toRef() links.Ref { return links.Ref{ID: r.ID, Version: r.Version} }

type linkIn struct {
	Kind string `json:"kind" jsonschema:"one of the six §41 link kinds (projects_to|derives_from|contracts_with|triggers|binds|mirrors)"`
	From refIn  `json:"from" jsonschema:"the consuming layer ref, pinned id@version"`
	To   refIn  `json:"to" jsonschema:"the PINNED target ref, id@version — never a bare id"`
}

func (l linkIn) toLink() links.Link {
	return links.Link{Kind: links.Kind(l.Kind), From: l.From.toRef(), To: l.To.toRef()}
}

// ── links_kinds ──

type kindsInput struct{}

type kindsOutput struct {
	OK    bool     `json:"ok"`
	Kinds []string `json:"kinds"`
}

func kinds(_ context.Context, _ *mcp.CallToolRequest, _ kindsInput) (*mcp.CallToolResult, kindsOutput, error) {
	out := kindsOutput{OK: true, Kinds: []string{}}
	for _, k := range links.Kinds() {
		out.Kinds = append(out.Kinds, string(k))
	}
	return nil, out, nil
}

// ── links_validate ──

type validateOutput struct {
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// validate runs the EXISTING links.Validate (it never re-derives the guard): a link is valid
// iff its kind ∈ the closed six AND both from/to are pinned id@version (an unpinned target is a
// monster, §41). PURE; writes nothing (the wall).
func validate(_ context.Context, _ *mcp.CallToolRequest, in linkIn) (*mcp.CallToolResult, validateOutput, error) {
	if err := links.Validate(in.toLink()); err != nil {
		return nil, validateOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, validateOutput{OK: true}, nil
}

// ── links_resolve ──

type resolveInput struct {
	Link  linkIn            `json:"link" jsonschema:"the link to resolve (its pinned target decides the status)"`
	Heads map[string]string `json:"heads" jsonschema:"targetId → current head version; read, never fetched (pure)"`
}

type resolveOutput struct {
	OK     bool   `json:"ok"`
	Status string `json:"status,omitempty"`
	Error  string `json:"error,omitempty"`
}

// resolve runs the EXISTING links.Resolve (the §41–§42 staleness check): green (pinned to head)
// | stale (pinned to a non-head version, the red-wave seed) | absent (no head at all). The link
// is Validated first so a malformed link is refused, not silently resolved. PURE; writes nothing.
func resolve(_ context.Context, _ *mcp.CallToolRequest, in resolveInput) (*mcp.CallToolResult, resolveOutput, error) {
	l := in.Link.toLink()
	if err := links.Validate(l); err != nil {
		return nil, resolveOutput{OK: false, Error: err.Error()}, nil
	}
	status := links.Resolve(l, links.Heads(in.Heads))
	return nil, resolveOutput{OK: true, Status: string(status)}, nil
}

// ── links_graph ──

type graphInput struct {
	Links []linkIn          `json:"links" jsonschema:"the graph's links (each pinned id@version)"`
	Heads map[string]string `json:"heads" jsonschema:"targetId → current head version; read, never fetched (pure)"`
}

type linkStatusRow struct {
	Kind   string `json:"kind"`
	From   string `json:"from"`
	To     string `json:"to"`
	Valid  bool   `json:"valid"`
	Status string `json:"status,omitempty"`
	Error  string `json:"error,omitempty"`
}

type graphOutput struct {
	OK          bool            `json:"ok"`
	Links       []linkStatusRow `json:"links"`
	AllPinned   bool            `json:"all_pinned"`
	GreenCount  int             `json:"green"`
	StaleCount  int             `json:"stale"`
	AbsentCount int             `json:"absent"`
}

// graph validates + resolves a whole graph of links against the heads (the /v3/liens summary
// read): per-link verdict + the all-pinned guarantee (§41 — every link points a version) + the
// green/stale/absent counts. Each verdict is the EXISTING links.Validate / links.Resolve; this
// tool only folds them. PURE; writes nothing (the wall).
func graph(_ context.Context, _ *mcp.CallToolRequest, in graphInput) (*mcp.CallToolResult, graphOutput, error) {
	heads := links.Heads(in.Heads)
	out := graphOutput{OK: true, Links: make([]linkStatusRow, 0, len(in.Links)), AllPinned: true}
	for _, li := range in.Links {
		l := li.toLink()
		row := linkStatusRow{Kind: string(l.Kind), From: l.From.String(), To: l.To.String()}
		if err := links.Validate(l); err != nil {
			row.Valid = false
			row.Error = err.Error()
			out.AllPinned = false
			out.Links = append(out.Links, row)
			continue
		}
		row.Valid = true
		status := links.Resolve(l, heads)
		row.Status = string(status)
		switch status {
		case links.StatusGreen:
			out.GreenCount++
		case links.StatusStale:
			out.StaleCount++
		case links.StatusAbsent:
			out.AbsentCount++
		}
		out.Links = append(out.Links, row)
	}
	return nil, out, nil
}

// NewServer builds the configured LINKS *mcp.Server and registers the four pure tools —
// identical behaviour whether driven by the standalone stdio binary or the S59 gateway
// dispatcher over an in-memory transport. It takes no deps: every tool is a pure verdict over
// the EXISTING back/kernel/links engine.
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-links", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "links_kinds", Description: "KRD §41: the six closed versioned link kinds (projects_to · derives_from · contracts_with · triggers · binds · mirrors) in canonical order — the set the /v3/liens panel filters on, never invented. PURE; writes nothing."}, kinds)
	mcp.AddTool(srv, &mcp.Tool{Name: "links_validate", Description: "KRD §41: the PURE shape guard of a link — kind ∈ the closed six AND both from/to are pinned id@version (an unpinned target is itself a monster). PURE; writes nothing (the wall)."}, validate)
	mcp.AddTool(srv, &mcp.Tool{Name: "links_resolve", Description: "KRD §41–§42: the PURE staleness check of a pinned link against the current heads — green (pinned to head) | stale (pinned to a non-head version, the red-wave seed) | absent (no head at all). Deterministic, replayable. PURE; writes nothing."}, resolve)
	mcp.AddTool(srv, &mcp.Tool{Name: "links_graph", Description: "KRD §41: validate + resolve a whole graph of links against the heads — per-link verdict, the all-pinned guarantee (every link points a version), the green/stale/absent counts. The /v3/liens summary read. PURE; writes nothing (the wall)."}, graph)
	return srv
}
