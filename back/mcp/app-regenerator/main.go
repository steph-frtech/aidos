// Command app-regenerator is the AIDOS Runtime project-scoped regeneration MCP server (S78,
// « Régénérer mon app »; ADR 0009: every backend op is an MCP tool).
//
// It is the capability door over S78 (back/runtime/regen): the Runtime action, bound to a
// user's Kernel cut, that runs the deterministic emitters for ALL of a project's sources —
// entities, relations, operations (sync AND async), controls, blobs — toward the project's
// emission target in ONE deterministic pass, classifies what changes (stale by source-hash /
// fresh / unchanged), and REFUSES if any emitted file was hand-edited:
//
//	regenerate     — run the regeneration over a project schema + emission ledger + on-disk
//	                 bytes → a Plan (artifacts + stale/fresh/unchanged), or a BlockReason if a
//	                 gen/ file drifted (was hand-edited). The action « Régénérer mon app ».
//	check_drift    — the hand-edit gate alone: does any tracked on-disk file diverge from its
//	                 recorded output_hash? Returns the refusing BlockReason or ok.
//	plan_only      — classify staleness (stale/fresh/unchanged) without surfacing the bytes —
//	                 the « what will Régénérer rewrite » preview the Workbench shows.
//
// THE WALL (CLAUDE.md §2): gen/ is a PROJECTION, regenerable — regenerating it writes NO
// truth. This server reads a schema (a Kernel cut), the ledger (read-only), the on-disk bytes,
// and returns values. It NEVER writes the kernel/mirrors/fitness schemas. The only door to
// change what it emits is to change the SOURCE (idea → mirror → /goal).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no LLM. Same schema → byte-identical artifacts (byte-stable); the drift verdict is a
// pure hash inequality, never a judgment. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/entities/relemit"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/regen"
)

// ── shared I/O ──

type regenInput struct {
	Schema relemit.Schema      `json:"schema" jsonschema:"the project's full source cut: project + entities-with-relations + async ops"`
	Ledger []regen.LedgerEntry `json:"ledger" jsonschema:"the emission ledger: prior (path, source_hash, output_hash) per emitted file — empty means never emitted"`
	Disk   []regen.DiskFile    `json:"disk" jsonschema:"the current on-disk bytes of the emitted tree, used to detect a hand-edit"`
}

type regenOutput struct {
	OK    bool                     `json:"ok"`
	Plan  *regen.Plan              `json:"plan,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

// regenerate is the action « Régénérer mon app »: re-project the whole project, refusing a
// hand-edit, classifying staleness by source-hash.
func regenerate(_ context.Context, _ *mcp.CallToolRequest, in regenInput) (*mcp.CallToolResult, regenOutput, error) {
	plan, br := regen.Regenerate(in.Schema, in.Ledger, in.Disk)
	if br != nil {
		return nil, regenOutput{OK: false, Block: br}, nil
	}
	return nil, regenOutput{OK: true, Plan: &plan}, nil
}

type driftInput struct {
	Ledger []regen.LedgerEntry `json:"ledger" jsonschema:"the emission ledger (path, output_hash) of the tracked emitted files"`
	Disk   []regen.DiskFile    `json:"disk" jsonschema:"the current on-disk bytes to check against the ledger"`
}

type driftOutput struct {
	OK    bool                     `json:"ok"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

// checkDrift runs the hand-edit gate ALONE: it returns the refusing BlockReason of the first
// drifted tracked file, or ok. It REUSES regen's own gate by running Regenerate over an empty
// schema-less path is not possible, so it walks the ledger/disk directly with regen.Drifted —
// the same pure hash inequality.
func checkDrift(_ context.Context, _ *mcp.CallToolRequest, in driftInput) (*mcp.CallToolResult, driftOutput, error) {
	byPath := make(map[string]regen.LedgerEntry, len(in.Ledger))
	for _, e := range in.Ledger {
		byPath[e.Path] = e
	}
	for _, f := range in.Disk {
		entry, tracked := byPath[f.Path]
		if !tracked {
			continue
		}
		if regen.Drifted(entry.OutputHash, f.Bytes) {
			br := blockreason.For(blockreason.CodeGenFileHandEdited)
			return nil, driftOutput{OK: false, Block: &br}, nil
		}
	}
	return nil, driftOutput{OK: true}, nil
}

type planOutput struct {
	OK    bool                     `json:"ok"`
	Stale []string                 `json:"stale,omitempty"`
	Fresh []string                 `json:"fresh,omitempty"`
	Same  []string                 `json:"unchanged,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

// planOnly returns the staleness classification (stale/fresh/unchanged) WITHOUT the bytes —
// the « what will Régénérer rewrite » preview. It still refuses on a hand-edit (the same gate
// runs inside Regenerate).
func planOnly(_ context.Context, _ *mcp.CallToolRequest, in regenInput) (*mcp.CallToolResult, planOutput, error) {
	plan, br := regen.Regenerate(in.Schema, in.Ledger, in.Disk)
	if br != nil {
		return nil, planOutput{OK: false, Block: br}, nil
	}
	return nil, planOutput{OK: true, Stale: plan.Stale, Fresh: plan.Fresh, Same: plan.Unchanged}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-app-regenerator", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "regenerate", Description: "S78 « Régénérer mon app » : re-project ALL of a project's sources (entities/relations/operations sync+async/controls/blobs) deterministically; classify stale-by-source-hash; REFUSE if a gen/ file was hand-edited (GEN_FILE_HAND_EDITED). PURE, byte-stable, writes nothing (the wall)."}, regenerate)
	mcp.AddTool(srv, &mcp.Tool{Name: "check_drift", Description: "S78: the hand-edit gate alone — does any tracked on-disk file diverge from its recorded output_hash? Returns the refusing BlockReason or ok. PURE hash inequality."}, checkDrift)
	mcp.AddTool(srv, &mcp.Tool{Name: "plan_only", Description: "S78: classify staleness (stale/fresh/unchanged) without the bytes — the preview of what « Régénérer mon app » will rewrite. Still refuses a hand-edit. PURE."}, planOnly)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("app-regenerator: run: %w", err))
	}
}
