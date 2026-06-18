// Package mirrorlibrarysrv is the AIDOS Mirror project-library MCP server (S70; ADR 0009: every
// backend op is an MCP tool), exposed as a LIBRARY (S59 dispatcher reuse).
//
// It is the capability door over S70 (back/kernel/mirror/library): the user's mirrors listed BY APP
// with liveness, plus the completeness/monster detection SCOPED TO ONE PROJECT (« la librairie de
// miroirs par projet + la détection de monstre scopée au projet »).
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it groups, scopes and computes the
// monster set as VALUES, and writes NOTHING. It reads a projection of project-tagged mirrors ⋈
// kernel; project isolation is the S55 RLS wall, made explicit here as a deterministic scope.
//
// Tools (one tool = one backend op):
//
//	library_list_by_app   — group the library's mirrors by app, each with its liveness tally
//	library_scoped_health — compute the project-scoped completeness law → monster set + verdict
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock, no rng,
// no I/O, never an LLM. The detector REUSES records.ComputeCompleteness verbatim. Every tool's I/O is
// a JSON OBJECT (no json.RawMessage), so the S59 gateway dispatches them synchronously over HTTP
// (the byte-array transport scar is avoided).
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME
// server in-process; the standalone stdio binary (back/mcp/mirror-library) and the dispatcher
// construct identical behaviour from one source — no duplicated logic, no twin (CLAUDE.md §0).
package mirrorlibrarysrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/mirror/library"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// ── library_list_by_app ──

type listByAppInput struct {
	Library library.Library `json:"library" jsonschema:"the multi-project mirror library (project-tagged layers + mirrors)"`
}

type appMirrorOut struct {
	Project string           `json:"project"`
	Mirrors []records.Mirror `json:"mirrors"`
	Alive   int              `json:"alive"`
	Dead    int              `json:"dead"`
}

type listByAppOutput struct {
	OK   bool           `json:"ok"`
	Apps []appMirrorOut `json:"apps"`
}

func listByApp(_ context.Context, _ *mcp.CallToolRequest, in listByAppInput) (*mcp.CallToolResult, listByAppOutput, error) {
	apps := library.ListByApp(in.Library)
	out := make([]appMirrorOut, 0, len(apps))
	for _, a := range apps {
		out = append(out, appMirrorOut{Project: string(a.Project), Mirrors: a.Mirrors, Alive: a.Alive, Dead: a.Dead})
	}
	return nil, listByAppOutput{OK: true, Apps: out}, nil
}

// ── library_scoped_health ──

type scopedHealthInput struct {
	Library library.Library `json:"library" jsonschema:"the multi-project mirror library"`
	Project string          `json:"project" jsonschema:"the project (app) to scope the completeness law to"`
}

type scopedHealthOutput struct {
	OK         bool              `json:"ok"`
	Project    string            `json:"project"`
	Verdict    string            `json:"verdict"` // COMPLETE | RED_MONSTER
	HasMonster bool              `json:"has_monster"`
	Monsters   []records.Monster `json:"monsters,omitempty"`
}

func scopedHealth(_ context.Context, _ *mcp.CallToolRequest, in scopedHealthInput) (*mcp.CallToolResult, scopedHealthOutput, error) {
	proj := library.ProjectID(in.Project)
	c := library.ScopedCompleteness(in.Library, proj)
	return nil, scopedHealthOutput{
		OK:         true,
		Project:    in.Project,
		Verdict:    string(c.Verdict),
		HasMonster: c.Verdict == records.VerdictRedMonster,
		Monsters:   c.Monsters,
	}, nil
}

// NewServer builds the mirror-library MCP server. The handlers are PURE; the gateway dispatcher and
// the standalone stdio binary share this one constructor (S59 — no twin).
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-mirror-library", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "library_list_by_app", Description: "S70: group the user's mirrors BY APP, each with its liveness tally (alive/dead). PURE, writes nothing (the wall)."}, listByApp)
	mcp.AddTool(srv, &mcp.Tool{Name: "library_scoped_health", Description: "S70: compute the completeness law SCOPED to one project → monster set + verdict (a truth without a living mirror; an orphan mirror within the project). PURE, writes nothing."}, scopedHealth)
	return srv
}
