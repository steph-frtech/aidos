// Command projectscope is the AIDOS Archive `project-scope` MCP server (S54; ADR 0009).
//
// It is the capability door (ADR 0009: every backend op is an MCP tool) over the
// S54 project-scope layer — the `project_id` FK threaded through every truth +
// derived table (kernel·mirrors·ideas·changesets·dag·brain·context) and the
// __system__ seed that adopts the pre-S54 singleton graph (the Order demo).
//
// Every tool is a PURE, DETERMINISTIC projection over back/archive/projectscope —
// no DB, no clock, no LLM (determinism-first, CLAUDE.md §6/§8). The server exposes
// the scope decisions so the Workbench (and any caller) can render them and so a
// scoped read is built the SAME way everywhere (a query scoped to project A can
// never return a project B row):
//
//	scope_tables        — the CLOSED, ordered set of project-scoped tables
//	scope_select_sql    — the deterministic, parameterised scoped read SQL ($1=pid)
//	                      for one scoped table (refuses an off-set table)
//	scope_seed          — the content-addressed __system__ seed project (id+body)
//	scope_migration_sql — the reproducibly-emitted project-scope migration DDL
//
// THE WALL (CLAUDE.md §2): project_id is a scope column, not a write door; this
// server writes NOTHING and offers no truth-write. Transport: stdio (no DSN).
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/projectscope"
)

// ── Tool I/O types ──

type emptyInput struct{}

type tableOutput struct {
	Schema    string `json:"schema"`
	Table     string `json:"table"`
	Qualified string `json:"qualified"`
	FKName    string `json:"fk_name"`
	IndexName string `json:"index_name"`
}

type tablesOutput struct {
	Tables []tableOutput `json:"tables"`
}

type selectInput struct {
	Schema string `json:"schema" jsonschema:"the scoped table's schema, e.g. kernel"`
	Table  string `json:"table" jsonschema:"the scoped table's name, e.g. truth"`
}

type selectOutput struct {
	// SQL always carries WHERE project_id = $1; bind $1 = the active project id.
	SQL string `json:"sql"`
}

type seedOutput struct {
	ID          string `json:"id"`
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	OwnerRef    string `json:"owner_ref"`
	CreatedAt   string `json:"created_at"`
	Lifecycle   string `json:"lifecycle"`
	Body        string `json:"body"`
	GenesisNode string `json:"genesis_node"`
}

type migrationOutput struct {
	SQL string `json:"sql"`
}

func toTableOutput(s projectscope.ScopedTable) tableOutput {
	return tableOutput{
		Schema:    s.Schema,
		Table:     s.Table,
		Qualified: s.Qualified(),
		FKName:    s.FKName(),
		IndexName: s.IndexName(),
	}
}

func tablesTool(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, tablesOutput, error) {
	sts := projectscope.ScopedTables()
	out := tablesOutput{Tables: make([]tableOutput, 0, len(sts))}
	for _, s := range sts {
		out.Tables = append(out.Tables, toTableOutput(s))
	}
	return nil, out, nil
}

func selectTool(_ context.Context, _ *mcp.CallToolRequest, in selectInput) (*mcp.CallToolResult, selectOutput, error) {
	sql, err := projectscope.ScopedSelect(in.Schema, in.Table)
	if err != nil {
		return nil, selectOutput{}, err
	}
	return nil, selectOutput{SQL: sql}, nil
}

func seedTool(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, seedOutput, error) {
	p := projectscope.SystemSeed()
	return nil, seedOutput{
		ID:          p.ID,
		Slug:        p.Slug,
		Name:        p.Name,
		OwnerRef:    p.OwnerRef,
		CreatedAt:   p.CreatedAt,
		Lifecycle:   string(p.Lifecycle),
		Body:        projectscope.MustMarshalSeedBody(),
		GenesisNode: projectscope.SystemGenesisNode,
	}, nil
}

func migrationTool(_ context.Context, _ *mcp.CallToolRequest, _ emptyInput) (*mcp.CallToolResult, migrationOutput, error) {
	return nil, migrationOutput{SQL: projectscope.EmitMigration()}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-project-scope", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "scope_tables", Description: "The closed, ordered set of project-scoped tables (kernel·mirrors·ideas·changesets·dag·brain·context) with their FK + index names. Pure, deterministic."}, tablesTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "scope_select_sql", Description: "The deterministic, parameterised scoped read SQL for one scoped table (always WHERE project_id = $1). Refuses an off-set table. Pure."}, selectTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "scope_seed", Description: "The content-addressed __system__ seed project (id, canonical body, genesis node) that adopts the pre-S54 singleton graph."}, seedTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "scope_migration_sql", Description: "The reproducibly-emitted project-scope migration DDL (expand→backfill→contract+FK+index per table). Same inputs → byte-identical."}, migrationTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("project-scope: run: %v", err)
	}
}
