// Command dsl-editor is the AIDOS Kernel typed-DSL-editor MCP server (S77; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over S77 (back/kernel/dsleditor): the typed editors over the
// four behaviour DSLs — Operation (validate/authorize/read/mutate/return, incl. the
// async/scheduled verbs of S73), Policy (the recursive ALLOW/DENY tree), and the
// verticale Control+Action (visible_when/enabled_when/triggers → invoke operation) — each
// edited as a TYPED FORM (no free code) and PROPOSED as a DRAFT ChangeSet.
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it returns the editable kinds,
// a parse verdict (preview AST), and a DRAFT ChangeSet proposal as VALUES, and writes
// NOTHING. There is deliberately NO apply tool: applying the DRAFT is S20's commit-gate,
// freezing the edited source into the kernel stays the /goal flow. No DB, no kernel/
// mirrors/fitness.
//
// Tools (one tool = one backend op):
//
//	dsl_kinds   — the four editable DSL kinds in canonical order (read-only)
//	dsl_parse   — parse a typed editor doc → its AST preview (no free code) ; writes nothing
//	dsl_propose — parse + wrap into a DRAFT ChangeSet — never applied (the wall)
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no I/O. Parsing DSL = pure function; same doc → byte-identical changeset
// (main_test.go + the package property mirror pin it). Transport: stdio.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/dsleditor"
)

// ── Tool I/O types ──

type kindsInput struct{}

type kindsOutput struct {
	Kinds []string `json:"kinds"`
}

type docInput struct {
	Kind            string          `json:"kind" jsonschema:"the editable DSL kind (operation|policy|control|action)"`
	Name            string          `json:"name" jsonschema:"the edited source's name — required"`
	Body            json.RawMessage `json:"body" jsonschema:"the TYPED editor body (the DSL's structured wire shape — no free code)"`
	KnownActions    []string        `json:"known_actions,omitempty" jsonschema:"action refs a control's triggers may resolve to (control kind)"`
	KnownControls   []string        `json:"known_controls,omitempty" jsonschema:"control refs an action's on may resolve to (action kind)"`
	KnownOperations []string        `json:"known_operations,omitempty" jsonschema:"operation refs an action's invoke may resolve to (action kind)"`
	ParentPhase     string          `json:"parent_phase,omitempty" jsonschema:"the stable phase the DRAFT ChangeSet moves from (propose only)"`
}

func (d docInput) toDoc() dsleditor.DslDoc {
	return dsleditor.DslDoc{
		Kind:            dsleditor.Kind(d.Kind),
		Name:            d.Name,
		Body:            d.Body,
		KnownActions:    d.KnownActions,
		KnownControls:   d.KnownControls,
		KnownOperations: d.KnownOperations,
	}
}

type parseOutput struct {
	OK        bool            `json:"ok"`
	Error     string          `json:"error,omitempty"`
	Kind      string          `json:"kind,omitempty"`
	Name      string          `json:"name,omitempty"`
	Canonical json.RawMessage `json:"canonical,omitempty"`
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
	p, err := dsleditor.ParseDoc(in.toDoc())
	if err != nil {
		return nil, parseOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, parseOutput{OK: true, Kind: string(p.Kind), Name: p.Name, Canonical: p.Canonical}, nil
}

// proposeTool parses + wraps into a DRAFT ChangeSet — never applied (the wall). PURE.
func proposeTool(_ context.Context, _ *mcp.CallToolRequest, in docInput) (*mcp.CallToolResult, proposeOutput, error) {
	prop, err := dsleditor.ProposeEdit(in.toDoc(), in.ParentPhase)
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

// newMCPServer builds the MCP server and registers the three S77 tools. NO apply tool:
// applying the DRAFT is S20's commit-gate, freezing is the /goal flow (the wall).
func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-dsl-editor", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "dsl_kinds", Description: "S77: the four editable DSL kinds (operation|policy|control|action) in canonical order. Read-only."}, kindsTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "dsl_parse", Description: "S77: parse a TYPED editor doc (no free code) into its DSL AST preview. Deterministic; writes nothing (the wall)."}, parseTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "dsl_propose", Description: "S77: parse a typed DSL edit and wrap it into a DRAFT ChangeSet — never applied (the wall). Approval rides /goal."}, proposeTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("dsl-editor: run: %w", err))
	}
}
