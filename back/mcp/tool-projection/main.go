// Command tool-projection is the AIDOS Kernel Tooling-Projection MCP server (FK15;
// ADR 0009: every backend op is an MCP tool).
//
// It is the capability door over FK15 part (a) (back/kernel/toolproject): the tooling
// projections — CLAUDE.md / AGENTS.md / .cursorrules / memory-bank EMITTED from the
// kernel sources (policy / memory / style / architecture / agent-profile), never
// hand-edited (hash-protected, drift by source-hash). Five PURE, write-nothing tools:
//
//	emit         — a ToolingKernel (project + sources) + a target → the deterministic
//	               file bytes + the source-hash. Same kernel ⇒ byte-identical file.
//	emit_all     — a ToolingKernel → every closed tooling file, keyed by target.
//	detect_drift — a ToolingKernel + a target + the on-disk content → the drift verdict:
//	               HAND_EDITED (the FK15 fault-injection) / MISSING_MARKER / STALE_HASH,
//	               or clean. The judge is a byte comparison + a hash equality, never a prompt.
//	validate     — a ToolingKernel → its shape verdict OR the closed refusal:
//	               NO_PROJECT / UNKNOWN_KIND / EMPTY_ID.
//	serialize    — a (valid) kernel → its content-addressed kernel.link body + record
//	               id/version (the SAME storage fork FK14 decided: a tooling rides inside
//	               a kernel.link, NOT a new record kind; a changed source ⇒ a NEW version).
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING to kernel/mirrors/fitness. It READS a kernel
// and returns file bytes / drifts / a body — freezing/updating a ToolingKernel goes
// idea → mirror → /goal → human approval (the aidos CLI writer role, never the agent).
// DETERMINISM-FIRST (§8): all five tools are PURE — no clock, no rng, NO LLM (emission is
// a deterministic render; drift is a byte comparison, exactly the check that MUST be code,
// never an "LLM doc agent"). Transport: stdio.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/toolproject"
)

// ── shared shapes ──

type sourceIn struct {
	Kind  string `json:"kind" jsonschema:"one of the 5 source kinds: policy|memory|style|architecture|agent-profile"`
	ID    string `json:"id" jsonschema:"a stable slug naming the rule/fact (the lexicon name)"`
	Title string `json:"title" jsonschema:"the human heading rendered in the file"`
	Body  string `json:"body" jsonschema:"the rendered prose (français d'abord)"`
}

type kernelIn struct {
	Project string     `json:"project" jsonschema:"the project name rendered in the file headers, e.g. AIDOS"`
	Sources []sourceIn `json:"sources" jsonschema:"the kernel sources the tooling files are projected from"`
}

func (k kernelIn) toKernel() toolproject.ToolingKernel {
	srcs := make([]toolproject.Source, len(k.Sources))
	for i, s := range k.Sources {
		srcs[i] = toolproject.Source{Kind: toolproject.SourceKind(s.Kind), ID: s.ID, Title: s.Title, Body: s.Body}
	}
	return toolproject.ToolingKernel{Project: k.Project, Sources: srcs}
}

// ── emit ──

type emitIn struct {
	Kernel kernelIn `json:"kernel" jsonschema:"the ToolingKernel: project + sources"`
	Target string   `json:"target" jsonschema:"one of: CLAUDE.md|AGENTS.md|.cursorrules|memory-bank.md"`
}

type emitOut struct {
	OK         bool   `json:"ok"`
	File       string `json:"file,omitempty"`
	SourceHash string `json:"source_hash,omitempty"`
	Error      string `json:"error,omitempty"`
}

func emit(_ context.Context, _ *mcp.CallToolRequest, in emitIn) (*mcp.CallToolResult, emitOut, error) {
	k := in.Kernel.toKernel()
	file, err := toolproject.Emit(k, toolproject.Target(in.Target))
	if err != nil {
		return nil, emitOut{OK: true, Error: classify(err)}, nil
	}
	h, _ := toolproject.SourceHash(k)
	return nil, emitOut{OK: true, File: file, SourceHash: h}, nil
}

// ── emit_all ──

type fileOut struct {
	Target string `json:"target"`
	File   string `json:"file"`
}

type emitAllOut struct {
	OK         bool      `json:"ok"`
	Files      []fileOut `json:"files,omitempty"`
	SourceHash string    `json:"source_hash,omitempty"`
	Error      string    `json:"error,omitempty"`
}

func emitAll(_ context.Context, _ *mcp.CallToolRequest, in kernelIn) (*mcp.CallToolResult, emitAllOut, error) {
	k := in.toKernel()
	files, err := toolproject.EmitAll(k)
	if err != nil {
		return nil, emitAllOut{OK: true, Error: classify(err)}, nil
	}
	out := make([]fileOut, 0, len(files))
	for _, tg := range toolproject.Targets() {
		out = append(out, fileOut{Target: string(tg), File: files[tg]})
	}
	h, _ := toolproject.SourceHash(k)
	return nil, emitAllOut{OK: true, Files: out, SourceHash: h}, nil
}

// ── detect_drift ──

type detectIn struct {
	Kernel kernelIn `json:"kernel" jsonschema:"the ToolingKernel the file should be a projection of"`
	Target string   `json:"target" jsonschema:"the tooling target to check"`
	OnDisk string   `json:"on_disk" jsonschema:"the actual on-disk content of the file"`
}

type detectOut struct {
	OK        bool   `json:"ok"`
	Clean     bool   `json:"clean"`
	DriftKind string `json:"drift_kind,omitempty"`
	Expected  string `json:"expected,omitempty"`
	Error     string `json:"error,omitempty"`
}

func detectDrift(_ context.Context, _ *mcp.CallToolRequest, in detectIn) (*mcp.CallToolResult, detectOut, error) {
	d, err := toolproject.DetectDrift(in.Kernel.toKernel(), toolproject.Target(in.Target), in.OnDisk)
	if err != nil {
		return nil, detectOut{OK: true, Error: classify(err)}, nil
	}
	if d == nil {
		return nil, detectOut{OK: true, Clean: true}, nil
	}
	return nil, detectOut{OK: true, Clean: false, DriftKind: string(d.Kind), Expected: d.Expected}, nil
}

// ── validate ──

type validateOut struct {
	OK    bool   `json:"ok"`
	Valid bool   `json:"valid"`
	Error string `json:"error,omitempty"`
}

func validate(_ context.Context, _ *mcp.CallToolRequest, in kernelIn) (*mcp.CallToolResult, validateOut, error) {
	if err := toolproject.Validate(in.toKernel()); err != nil {
		return nil, validateOut{OK: true, Valid: false, Error: classify(err)}, nil
	}
	return nil, validateOut{OK: true, Valid: true}, nil
}

// ── serialize ──

type serializeOut struct {
	OK      bool   `json:"ok"`
	Body    string `json:"body,omitempty"`
	ID      string `json:"id,omitempty"`
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}

func serialize(_ context.Context, _ *mcp.CallToolRequest, in kernelIn) (*mcp.CallToolResult, serializeOut, error) {
	rec, err := toolproject.Record(in.toKernel())
	if err != nil {
		return nil, serializeOut{OK: true, Error: classify(err)}, nil
	}
	return nil, serializeOut{OK: true, Body: string(rec.Body), ID: rec.ID, Version: rec.Version}, nil
}

// classify maps a toolproject error to its closed BlockReason code (the codes the Workbench renders).
func classify(err error) string {
	switch {
	case errors.Is(err, toolproject.ErrNoProject):
		return "NO_PROJECT"
	case errors.Is(err, toolproject.ErrUnknownKind):
		return "UNKNOWN_KIND"
	case errors.Is(err, toolproject.ErrEmptyID):
		return "EMPTY_ID"
	case errors.Is(err, toolproject.ErrUnknownTarget):
		return "UNKNOWN_TARGET"
	default:
		return err.Error()
	}
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-tool-projection", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "emit",
		Description: "FK15: a ToolingKernel + a target (CLAUDE.md/AGENTS.md/.cursorrules/memory-bank.md) → the deterministic file bytes + the source-hash. Same kernel ⇒ byte-identical file. PURE; writes nothing (the wall).",
	}, emit)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "emit_all",
		Description: "FK15: a ToolingKernel → every closed tooling file, keyed by target, deterministically. PURE; writes nothing.",
	}, emitAll)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "detect_drift",
		Description: "FK15 (the hash-protection): a ToolingKernel + a target + the on-disk content → the drift verdict (HAND_EDITED — the FK15 fault-injection / MISSING_MARKER / STALE_HASH) or clean. The judge is a byte comparison + a hash equality, never a prompt. PURE; writes nothing.",
	}, detectDrift)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "validate",
		Description: "FK15: a ToolingKernel → its shape verdict OR the closed refusal: NO_PROJECT / UNKNOWN_KIND / EMPTY_ID. PURE; writes nothing.",
	}, validate)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "serialize",
		Description: "FK15 (the storage fork): a (valid) ToolingKernel → its content-addressed kernel.link body + record id/version. A changed source yields a NEW version (never a mutation — KRD §12). PURE; writes nothing — freezing goes idea → mirror → /goal.",
	}, serialize)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("tool-projection: run: %w", err))
	}
}
