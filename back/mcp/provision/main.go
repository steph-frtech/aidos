// Command provision is the AIDOS provisioning MCP server — the capability door
// (ADR 0009: every backend op is an MCP tool) over the provisioning emitters,
// ACTIVATED at DP13 and fronted by the S58 gateway. Two families of tools live here:
//
//   - The S89 per-app datastore PROVISIONER (plan · images): the DETERMINISTIC planner
//     over runtime/provision (app-builder EPIC 9, ADR 0006/0047, ADR 0043 DP15).
//
//   - The DP13 STACK / BOOTSTRAP / PROFILE tools (ROADMAP-provisioning-deploy EPIC C):
//     every provisioning op exposed as an MCP tool, no exception —
//
//     stack.emit            — re-emit the COMPLETE stack of a phase (DP05 stackemit.EmitStack)
//     stack.select_profile  — filter the manifest by a DECLARED profile (DP11 composeemit.FilterByProfile)
//     stack.bootstrap       — emit the one-shot bootstrap sequence of a bundle (DP12 bootstrap.EmitBootstrapSequence)
//     stack.resolve_ports   — resolve the host port deterministically (DP12 bootstrap.ResolvePort)
//     stack.print_urls      — the access URLs the bootstrap prints (DP12, the urls-printed rung)
//
// PURE ROUTING, ZERO LLM (CLAUDE.md §6/§8 — the DP13 done-criterion): each tool frames
// an EXISTING deterministic emitter; no clock, no rng, no model enters the server; same
// request ⇒ same response (the reproducibility mirror pins it).
//
// THE WALL IS APPLIED SERVER-SIDE (CLAUDE.md §2), reusing the SAME predicates the S58
// gateway + the Postgres RLS enforce (never a forked rule, never a GRANT bypass): a
// cross-project / forged call is refused (AGENT_CROSS_PROJECT_WRITE); below-the-line
// projections act direct; a DIRECT truth-write (stack.engrave_manifest) is refused with
// GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET — truth moves ONLY via idea → mirror → /goal →
// ChangeSet. The S89 plan/images tools write NOTHING above the line (pure planning).
//
// Transport: stdio by default; the gateway fronts these tools over HTTP via the SDK's
// StreamableHTTPHandler (httpHandler, the seam the Workbench /bootstrap route calls).
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/provision"
)

type planInput struct {
	Spec provision.Spec `json:"spec" jsonschema:"the per-app provisioning spec: projectId, target (empty=plain-postgres default), the S88 decision, the entity ASTs, needsVector, an optional §44.3 change"`
}

type planOutput struct {
	OK    bool                     `json:"ok"`
	Plan  *provision.Plan          `json:"plan,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func planTool(_ context.Context, _ *mcp.CallToolRequest, in planInput) (*mcp.CallToolResult, planOutput, error) {
	p, br := provision.BuildPlan(in.Spec)
	if br != nil {
		return nil, planOutput{OK: false, Block: br}, nil
	}
	return nil, planOutput{OK: true, Plan: &p}, nil
}

type imagesOutput struct {
	OK     bool              `json:"ok"`
	Images map[string]string `json:"images"`
}

func images(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, imagesOutput, error) {
	return nil, imagesOutput{OK: true, Images: provision.DeclaredImages()}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-provision", Version: "v0.2.0"}, nil)

	// S89 per-app datastore planner (the original scaffold).
	mcp.AddTool(srv, &mcp.Tool{Name: "plan", Description: "S89: plan a per-app datastore — plain-postgres default (+pgvector sidecar iff needed), doltgres opt-in iff S88 Go, SAME Atlas DDL emitter, per-project isolation, migration human-gated via DataTruthScope, emitted as a Pulumi resource (DP15). PURE, deterministic, content-addressed, writes nothing (the wall)."}, planTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "images", Description: "S89: the DECLARED container images per target (plain-postgres, pgvector, doltgres) — above-the-line, never learned."}, images)

	// DP13 stack / bootstrap / profile tools — every provisioning op = an MCP tool
	// (ADR 0009), project-scoped, the wall applied server-side, pure routing.
	mcp.AddTool(srv, &mcp.Tool{Name: "stack.emit", Description: "DP13: re-emit the COMPLETE stack of a stable phase (DP05 stackemit.EmitStack — docker-compose.yml · .env.example · start scripts · traefik.dynamic.yml). Project-scoped, below-the-line PROJECTION (writes no truth); same phase ⇒ byte-identical bundle. PURE, zero LLM."}, stackEmit)
	mcp.AddTool(srv, &mcp.Tool{Name: "stack.select_profile", Description: "DP13: filter a StackManifest by a DECLARED compose profile (DP11 composeemit.FilterByProfile — core/docs/observability/qa/git/tickets/connectors/non-prod/full). An out-of-set profile ⇒ UNKNOWN_PROFILE; non-prod×prod ⇒ DOLTGRES_NOT_ALLOWED_IN_PROD (the DP06 gate, never forked). Project-scoped, below-the-line. PURE, zero LLM."}, stackSelectProfile)
	mcp.AddTool(srv, &mcp.Tool{Name: "stack.bootstrap", Description: "DP13: emit the one-shot bootstrap sequence of a bundle (DP12 bootstrap.EmitBootstrapSequence — network→…→urls-printed), a deterministic plan-as-data (no real docker). A missing required secret ⇒ MISSING_SECRET_AT_BOOT. Project-scoped, below-the-line; same (bundle, host, secrets) ⇒ byte-identical sequence. PURE, zero LLM."}, stackBootstrap)
	mcp.AddTool(srv, &mcp.Tool{Name: "stack.resolve_ports", Description: "DP13: resolve the host port DETERMINISTICALLY from the observed host state (DP12 bootstrap.ResolvePort — ss ∪ docker ps → first-free-≥-base). Below-the-line, pure: same host state ⇒ same port. PURE, zero LLM."}, stackResolvePorts)
	mcp.AddTool(srv, &mcp.Tool{Name: "stack.print_urls", Description: "DP13: the access URLs the bootstrap one-shot prints (DP12, the urls-printed rung) for a bundle — ${VAR} references resolved at deploy time, never a hardcoded host. Project-scoped, below-the-line. PURE, zero LLM."}, stackPrintURLs)

	// THE FENCED TRUTH-ZONE WRITE namespace (§2). Not a real emitter — the door a
	// caller might craft to move a manifest (above-the-line truth) directly. It is
	// REFUSED with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET; it never bypasses the GRANTs.
	mcp.AddTool(srv, &mcp.Tool{Name: "stack.engrave_manifest", Description: "DP13 (fenced): an attempt to WRITE a StackManifest (above-the-line truth) directly. REFUSED with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET — truth moves ONLY via idea → mirror → /goal → ChangeSet, never a direct provisioning write. The server holds no GRANT to write the kernel."}, stackEngraveManifest)

	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("provision: run: %v", err)
	}
}
