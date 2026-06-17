// Package appauthsrv is the AIDOS Kernel APP-AUTH behavior-macro MCP server, exposed as a LIBRARY
// (S59/ADR 0092 dispatcher reuse). It is the capability door over the S80 `app-auth` behavior-macro
// (back/kernel/appauth) — the auth & roles subsystem of the EMITTED app (the application the USER
// builds), distinct from AIDOS' own users (E3). Three tools:
//
//	app_auth_expand        — dry-run EXPAND the auth subsystem (User/Role/Session entities, login/logout
//	                         operations, the role-authz policy band) for a target app. Writes nothing.
//	app_auth_check_access  — the EMITTED app's RUNTIME authorization gate: may `role` invoke `operation`?
//	                         A deterministic pure lookup over the declared role→operation band (NEVER an
//	                         LLM). This maps the AuthorityGraph of the emitted app's runtime.
//	app_auth_attach        — PREVIEW the subsystem AND LAND it via an APPROVED ChangeSet (the wall:
//	                         propose → approve). Returns the changeset ref + status.
//
// STATELESS + DETERMINISTIC (CLAUDE.md §6/§8). Each tool is a PURE function of its input; the server
// holds no DB, no clock (timestamps are arguments), no RNG, and never touches kernel/mirrors/fitness
// (the wall). `attach` LANDS via changeset.Apply, which only COMPUTES the APPLIED envelope value — the
// actual kernel freeze is the `aidos` CLI's job downstream (WroteKernel is always false). Every I/O is
// a scalar OBJECT (no json.RawMessage body — the S59 byte-array transport scar is avoided by
// construction).
//
// WHY A LIBRARY (S59/ADR 0092). The gateway dispatcher reuses this SAME server in-process via NewServer
// and dispatches the routed below-the-line app_auth_* read calls to it. Extracting the handlers here
// lets BOTH the standalone stdio binary (back/mcp/app-auth) and the dispatcher construct identical
// behaviour — no twin (reuse, don't reinvent — CLAUDE.md §0).
package appauthsrv

import (
	"context"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/appauth"
)

// ── expand ──

type expandInput struct {
	Target string `json:"target" jsonschema:"the app/project the auth subsystem is attached to (non-empty)"`
}

type entityOut struct {
	Name       string              `json:"name"`
	Attributes []appauth.Attribute `json:"attributes"`
}

type expandOutput struct {
	OK          bool                `json:"ok"`
	Error       string              `json:"error,omitempty"`
	Macro       string              `json:"macro,omitempty"`
	Target      string              `json:"target,omitempty"`
	Entities    []entityOut         `json:"entities,omitempty"`
	Operations  []appauth.Operation `json:"operations,omitempty"`
	Policies    []appauth.Policy    `json:"policies,omitempty"`
	Pieces      []string            `json:"pieces,omitempty"`
	PieceCount  int                 `json:"piece_count,omitempty"`
	ExpansionID string              `json:"expansion_id,omitempty"`
	WroteKernel bool                `json:"wrote_kernel"`
}

func toExpandOutput(s appauth.Subsystem) expandOutput {
	ents := make([]entityOut, 0, len(s.Entities))
	for _, e := range s.Entities {
		ents = append(ents, entityOut{Name: e.Name, Attributes: e.Attributes})
	}
	return expandOutput{
		OK: true, Macro: s.Macro, Target: s.Target, Entities: ents,
		Operations: s.Operations, Policies: s.Policies,
		Pieces: appauth.SortedNames(s), PieceCount: appauth.PieceCount(s),
		ExpansionID: s.ExpansionID, WroteKernel: s.WroteKernel,
	}
}

func expandTool(_ context.Context, _ *mcp.CallToolRequest, in expandInput) (*mcp.CallToolResult, expandOutput, error) {
	sub, err := appauth.ExpandAppAuth(in.Target)
	if err != nil {
		return nil, expandOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, toExpandOutput(sub), nil
}

// ── check_access (the emitted app's runtime authz gate) ──

type checkInput struct {
	Role      string `json:"role" jsonschema:"the runtime role of the emitted app's caller (viewer|editor|admin)"`
	Operation string `json:"operation" jsonschema:"the protected operation the caller attempts (login|logout|manageRoles)"`
}

type checkOutput struct {
	OK        bool   `json:"ok"`
	Error     string `json:"error,omitempty"`
	Allowed   bool   `json:"allowed"`
	Role      string `json:"role,omitempty"`
	Operation string `json:"operation,omitempty"`
	Required  string `json:"required,omitempty"`
}

func checkAccessTool(_ context.Context, _ *mcp.CallToolRequest, in checkInput) (*mcp.CallToolResult, checkOutput, error) {
	d, err := appauth.CheckAccess(appauth.Role(in.Role), in.Operation)
	if err != nil {
		return nil, checkOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, checkOutput{
		OK: true, Allowed: d.Allowed, Role: string(d.Role),
		Operation: in.Operation, Required: string(d.Required),
	}, nil
}

// ── attach (preview OR approved-land via the wall) ──

type attachInput struct {
	Target      string `json:"target" jsonschema:"the app the auth subsystem is attached to (non-empty)"`
	ParentPhase string `json:"parent_phase,omitempty" jsonschema:"the stable phase the proposal moves from"`
	Land        bool   `json:"land,omitempty" jsonschema:"if true, LAND via an APPROVED ChangeSet; else preview the DRAFT only"`
	ApprovedAt  string `json:"approved_at,omitempty" jsonschema:"RFC3339 approval timestamp (required when land=true)"`
}

type attachOutput struct {
	OK              bool             `json:"ok"`
	Error           string           `json:"error,omitempty"`
	BlockCode       string           `json:"block_code,omitempty"`
	Macro           string           `json:"macro,omitempty"`
	Target          string           `json:"target,omitempty"`
	Pieces          []string         `json:"pieces,omitempty"`
	Policies        []appauth.Policy `json:"policies,omitempty"`
	ExpansionID     string           `json:"expansion_id,omitempty"`
	WroteKernel     bool             `json:"wrote_kernel"`
	ChangeSetRef    string           `json:"changeset_ref,omitempty"`
	ChangeSetStatus string           `json:"changeset_status,omitempty"`
	Landed          bool             `json:"landed"`
}

func attachTool(_ context.Context, _ *mcp.CallToolRequest, in attachInput) (*mcp.CallToolResult, attachOutput, error) {
	prop, err := appauth.Propose(in.Target, in.ParentPhase)
	if err != nil {
		return nil, attachOutput{OK: false, Error: err.Error()}, nil
	}
	s := prop.Subsystem
	base := attachOutput{
		OK: true, Macro: s.Macro, Target: s.Target, Pieces: appauth.SortedNames(s),
		Policies: s.Policies, ExpansionID: s.ExpansionID, WroteKernel: s.WroteKernel,
	}
	if !in.Land {
		base.ChangeSetRef = prop.ChangeSet.ID
		base.ChangeSetStatus = string(prop.ChangeSet.Status)
		base.Landed = false
		return nil, base, nil
	}
	approvedAt := time.Time{}
	if in.ApprovedAt != "" {
		if parsed, perr := time.Parse(time.RFC3339, in.ApprovedAt); perr == nil {
			approvedAt = parsed
		}
	}
	applied, br := changeset.Apply(prop.ChangeSet, approvedAt, changeset.SpecHasMirror)
	if br != nil {
		base.OK = false
		base.Error = br.Error()
		base.BlockCode = string(br.Code)
		return nil, base, nil
	}
	base.ChangeSetRef = applied.ID
	base.ChangeSetStatus = string(applied.Status)
	base.Landed = true
	return nil, base, nil
}

// NewServer registers the three S80 app-auth tools. Every tool is PURE; `attach` lands via
// changeset.Apply (a value computation), never a direct kernel write (the wall). Reused identically by
// the standalone stdio binary AND the gateway dispatcher (S59) — no twin.
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-app-auth", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "app_auth_expand", Description: "S80: dry-run EXPAND the emitted app's auth subsystem (User/Role/Session, login/logout, role-authz band). Deterministic; writes nothing."}, expandTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "app_auth_check_access", Description: "S80: the EMITTED app's RUNTIME authz gate — may a role invoke a protected operation? Deterministic pure lookup over the declared role→operation band (NEVER an LLM)."}, checkAccessTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "app_auth_attach", Description: "S80: PREVIEW the auth subsystem and LAND it via an APPROVED ChangeSet (the wall: propose → approve). No direct kernel write."}, attachTool)
	return srv
}
