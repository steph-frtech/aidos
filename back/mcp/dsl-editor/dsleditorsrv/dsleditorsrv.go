// Package dsleditorsrv (extracted, ADR 0092 batch-3) is the reusable AIDOS Kernel typed-DSL-editor
// MCP server (S77; ADR 0009: every backend op is an MCP tool). It is the capability door over S77
// (back/kernel/dsleditor): the typed editors over the four behaviour DSLs — Operation (validate/
// authorize/read/mutate/return, incl. the async/scheduled verbs of S73), Policy (the recursive
// ALLOW/DENY tree), and the verticale Control+Action (visible_when/enabled_when/triggers → invoke
// operation) — each edited as a TYPED FORM (no free code) and PROPOSED as a DRAFT ChangeSet.
//
// Three tools (one tool = one backend op):
//
//	dsl_kinds   — the four editable DSL kinds in canonical order (read-only)
//	dsl_parse   — parse a typed editor doc → its AST preview (no free code) ; writes nothing
//	dsl_propose — parse + wrap into a DRAFT ChangeSet — never applied (the wall)
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it returns the editable kinds, a parse
// verdict (preview AST), and a DRAFT ChangeSet proposal as VALUES, and writes NOTHING. There is
// deliberately NO apply tool: applying the DRAFT is S20's commit-gate, freezing the edited source
// into the kernel stays the /goal flow. No DB, no kernel/mirrors/fitness — WroteKernel always false.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock, no rng,
// no I/O. Parsing DSL = pure function; same doc → byte-identical changeset (the package property
// mirror pins it).
//
// THE S59 SCAR (json.RawMessage → byte-array schema). dsleditor.DslDoc.Body and dsleditor.Parsed.
// Canonical are json.RawMessage (the DSL's typed wire shape / canonical AST): a RawMessage field
// reflects to the go-sdk as a BYTE-ARRAY schema, so a real HTTP `body:{object}` payload is REFUSED at
// input validation BEFORE the handler — or the {object} canonical is REFUSED at output validation —
// and the front silently falls back to demo (the twin stays alive). This server therefore wraps the
// wire body in a DISPATCH-SAFE docInput.Body that is a map[string]any (an OBJECT schema), re-marshals
// it to the json.RawMessage the engine parses, and projects Parsed.Canonical back to a map[string]any
// (an OBJECT output schema) — so dsl_parse/dsl_propose dispatch through the gateway over HTTP.
// Extracted at ADR 0092 batch-3 so the gateway dispatcher reuses the SAME server in-process — reuse,
// don't reinvent (CLAUDE.md §0); the engine is the SINGLE live source and the TS twin
// (lib/dsl-editor.ts) becomes the demo fallback only. Transport: stdio.
package dsleditorsrv

import (
	"context"
	"encoding/json"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/dsleditor"
)

// ── Tool I/O types ──

type kindsInput struct{}

type kindsOutput struct {
	Kinds []string `json:"kinds"`
}

// docInput is the DISPATCH-SAFE mirror of dsleditor.DslDoc: Body is a map[string]any (an OBJECT
// input schema the HTTP transport accepts) instead of DslDoc's json.RawMessage (which the go-sdk
// infers as a byte-array, breaking the real HTTP `body:{object}` payload — the S59 scar). toDoc
// re-marshals the object to the json.RawMessage the engine parses.
type docInput struct {
	Kind            string         `json:"kind" jsonschema:"the editable DSL kind (operation|policy|control|action)"`
	Name            string         `json:"name" jsonschema:"the edited source's name — required"`
	Body            map[string]any `json:"body" jsonschema:"the TYPED editor body (the DSL's structured wire shape as an object — no free code)"`
	KnownActions    []string       `json:"known_actions,omitempty" jsonschema:"action refs a control's triggers may resolve to (control kind)"`
	KnownControls   []string       `json:"known_controls,omitempty" jsonschema:"control refs an action's on may resolve to (action kind)"`
	KnownOperations []string       `json:"known_operations,omitempty" jsonschema:"operation refs an action's invoke may resolve to (action kind)"`
	ParentPhase     string         `json:"parent_phase,omitempty" jsonschema:"the stable phase the DRAFT ChangeSet moves from (propose only)"`
}

// toDoc converts the dispatch-safe docInput to the engine's dsleditor.DslDoc, marshalling the Body
// object to the canonical JSON wire body the engine parses. A nil/empty object marshals to "{}"
// (an empty body the parsers reject with an actionable ErrBadBody — never silently).
func (d docInput) toDoc() (dsleditor.DslDoc, error) {
	body := d.Body
	if body == nil {
		body = map[string]any{}
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return dsleditor.DslDoc{}, err
	}
	return dsleditor.DslDoc{
		Kind:            dsleditor.Kind(d.Kind),
		Name:            d.Name,
		Body:            raw,
		KnownActions:    d.KnownActions,
		KnownControls:   d.KnownControls,
		KnownOperations: d.KnownOperations,
	}, nil
}

// parseOutput projects Parsed.Canonical (a json.RawMessage) back to a map[string]any (an OBJECT
// output schema the HTTP transport returns) instead of a byte-array — the symmetric S59-scar guard.
type parseOutput struct {
	OK        bool           `json:"ok"`
	Error     string         `json:"error,omitempty"`
	Kind      string         `json:"kind,omitempty"`
	Name      string         `json:"name,omitempty"`
	Canonical map[string]any `json:"canonical,omitempty"`
}

type proposeOutput struct {
	OK              bool   `json:"ok"`
	Error           string `json:"error,omitempty"`
	Kind            string `json:"kind,omitempty"`
	Name            string `json:"name,omitempty"`
	WroteKernel     bool   `json:"wrote_kernel"` // ALWAYS false (the wall)
	ChangeSetRef    string `json:"changeset_ref,omitempty"`
	ChangeSetStatus string `json:"changeset_status,omitempty"` // always DRAFT on success
}

// canonicalToObject unmarshals the engine's canonical RawMessage to a map for the OBJECT output
// schema. The canonical AST is always a JSON object (a typed wire shape); a marshalling slip falls
// back to nil (the OK flag + the non-empty check on the caller side surface it).
func canonicalToObject(raw json.RawMessage) map[string]any {
	if len(raw) == 0 {
		return nil
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil
	}
	return m
}

// kindsTool returns the four editable DSL kinds in canonical order — a screen's legend. PURE.
func kindsTool(_ context.Context, _ *mcp.CallToolRequest, _ kindsInput) (*mcp.CallToolResult, kindsOutput, error) {
	ks := dsleditor.Kinds()
	out := make([]string, 0, len(ks))
	for _, k := range ks {
		out = append(out, string(k))
	}
	return nil, kindsOutput{Kinds: out}, nil
}

// parseTool parses a typed editor doc into its DSL AST preview. Writes NOTHING. PURE.
func parseTool(_ context.Context, _ *mcp.CallToolRequest, in docInput) (*mcp.CallToolResult, parseOutput, error) {
	doc, err := in.toDoc()
	if err != nil {
		return nil, parseOutput{OK: false, Error: err.Error()}, nil
	}
	p, err := dsleditor.ParseDoc(doc)
	if err != nil {
		return nil, parseOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, parseOutput{OK: true, Kind: string(p.Kind), Name: p.Name, Canonical: canonicalToObject(p.Canonical)}, nil
}

// proposeTool parses + wraps into a DRAFT ChangeSet — never applied (the wall). PURE.
func proposeTool(_ context.Context, _ *mcp.CallToolRequest, in docInput) (*mcp.CallToolResult, proposeOutput, error) {
	doc, err := in.toDoc()
	if err != nil {
		return nil, proposeOutput{OK: false, Error: err.Error()}, nil
	}
	prop, err := dsleditor.ProposeEdit(doc, in.ParentPhase)
	if err != nil {
		return nil, proposeOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, proposeOutput{
		OK:              true,
		Kind:            string(prop.Parsed.Kind),
		Name:            prop.Parsed.Name,
		WroteKernel:     false,
		ChangeSetRef:    prop.ChangeSet.ID,
		ChangeSetStatus: string(prop.ChangeSet.Status),
	}, nil
}

// NewServer builds the MCP server and registers the three S77 tools. NO apply tool: applying the
// DRAFT is S20's commit-gate, freezing is the /goal flow (the wall). The gateway dispatcher reuses
// this SAME constructor in-process for the read tools (the live path).
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-dsl-editor", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "dsl_kinds", Description: "S77: the four editable DSL kinds (operation|policy|control|action) in canonical order. Read-only."}, kindsTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "dsl_parse", Description: "S77: parse a TYPED editor doc (no free code) into its DSL AST preview. Deterministic; writes nothing (the wall)."}, parseTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "dsl_propose", Description: "S77: parse a typed DSL edit and wrap it into a DRAFT ChangeSet — never applied (the wall). Approval rides /goal."}, proposeTool)
	return srv
}
