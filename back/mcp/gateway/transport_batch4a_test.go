// transport_batch4a_test.go — the DISPATCH MIRROR for the ADR 0092 batch-4A servers
// (besoin-intake · self-cert · app-auth · workspace). For AT LEAST one CHEAP/pure read tool of EACH of
// the four servers, it drives gateway_call with an args:OBJECT payload over the REAL HTTP transport
// (StreamableHTTPHandler) and asserts the routed call REACHES its in-process backend and returns a
// structured "route" result — NOT route_undispatched (the un-wired fallback) and NOT an isError (an
// input/output-schema rejection).
//
// THE SCAR THIS PINS (S59, the recurring one). A tool whose I/O carries a json.RawMessage reflects to
// the go-sdk as a BYTE-ARRAY schema, so a real HTTP args:{object} payload is REFUSED at input
// validation BEFORE the handler — and the front silently falls back to demo (the twin stays alive).
// None of these four carry a json.RawMessage in their dispatched I/O: besoin-intake's capture bodies
// are map[string]any (an OBJECT schema, not a byte-array), self-cert/app-auth/workspace are scalar
// structs. besoin_capture_product sends a body:{object} over HTTP and reads back an idea:{object} —
// proving the object survives the round-trip; a future regression that re-introduces a RawMessage body
// goes red here.
//
// THE RLS POINT OF THIS BATCH (TestTransport_BesoinRLSTwoProjectsOverHTTP). besoin-intake is the ONLY
// DSN-backed server here: its `besoin` Store is RLS-scoped to `project` via a SET LOCAL `aidos.project`
// GUC (S55). Acting as the FENCED aidos_agent role (subject to the GRANT + RLS), project A captures a
// product rung THROUGH THE GATEWAY, then project B's besoin_graph_state — a SEPARATE gateway call with
// a B-scope — sees ZERO of A's rows (no leak). The GUC is LOCAL to the transaction, never the session,
// so it cannot leak to the next pool checkout. This is the same 2-project no-leak proof the standalone
// besoinintakesrv test pins, here EXECUTED through the live HTTP dispatch path.
//
// THE LOAD-BEARING PROOF (TestTransport_Batch4A_NeutralizedBuilderUndispatched). A builder NEUTRALIZED
// in the dispatcher (returns ErrServerNotDispatched) makes the SAME object payload route to
// route_undispatched (the demo fallback), not route — proving the green "route" outcomes above are
// caused by the WIRING, not by the registry alone (the cliquet's blind spot is that a readVia frontier
// passes even when the tool does not resolve; this mirror closes it server-side).
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; every dispatched tool's output is a VALUE
// (WroteKernel false — besoin capture/emit append a DRAFT idea, app_auth_attach lands via a ChangeSet,
// workspace provisioning is a dry-run descriptor). The dispatch path runs the pure router FIRST — a
// truth-write never reaches a backend (the existing TestTransport_GatewayCallWallOverHTTP pins that).
package main

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	appauthsrv "github.com/steph-frtech/aidos/back/mcp/app-auth/appauthsrv"
	besoinintakesrv "github.com/steph-frtech/aidos/back/mcp/besoin-intake/besoinintakesrv"
	selfcertsrv "github.com/steph-frtech/aidos/back/mcp/self-cert/selfcertsrv"
	workspacesrv "github.com/steph-frtech/aidos/back/mcp/workspace/workspacesrv"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/gatewaydispatch"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// batch4ADepFreeBuilder builds the three DEP-FREE batch-4A servers in-process (the SAME NewServer the
// standalone binaries use — no twin). besoin-intake is DSN-backed and built separately (it needs a real
// Postgres). When neutralize is non-empty, that one server returns ErrServerNotDispatched instead (the
// load-bearing proof: the same call then falls to route_undispatched).
func batch4ADepFreeBuilder(neutralize string) func(context.Context, string) (*mcp.Server, error) {
	return func(_ context.Context, srv string) (*mcp.Server, error) {
		if srv == neutralize {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		switch srv {
		case "self-cert":
			return selfcertsrv.NewServer(), nil
		case "app-auth":
			return appauthsrv.NewServer(), nil
		case "workspace":
			return workspacesrv.NewServer(), nil
		default:
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
	}
}

// batch4ADepFreeDispatcher wires the dep-free batch-4A builder (no server neutralized). besoin-intake is
// left un-built here (route_undispatched) — its live dispatch is exercised by the Docker-gated RLS test.
func batch4ADepFreeDispatcher() *gatewaydispatch.Dispatcher {
	return gatewaydispatch.New(gateway.DefaultRegistry(), batch4ADepFreeBuilder(""))
}

// TestTransport_SelfCertCertifyOverHTTP — self-cert.selfcert_certify with an object payload reaches the
// backend and folds the full green battery to green (the real S84 battery executed — the wall: the judge
// is the deterministic mirror, never the LLM).
func TestTransport_SelfCertCertifyOverHTTP(t *testing.T) {
	d := batch4ADepFreeDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "selfcert_certify", map[string]any{
		"verdicts": []map[string]any{
			{"kind": "types", "green": true}, {"kind": "lint", "green": true},
			{"kind": "unit", "green": true}, {"kind": "fixture", "green": true},
			{"kind": "property", "green": true}, {"kind": "pact", "green": true},
			{"kind": "archfit", "green": true},
		},
	})
	assertRouted(t, out, "selfcert_certify")
	if out.Result["green"] != true {
		t.Fatalf("selfcert_certify green = %v, want true (a full battery certifies green — the real backend executed)", out.Result["green"])
	}
}

// TestTransport_AppAuthCheckAccessOverHTTP — app-auth.app_auth_check_access with an object payload reaches
// the backend and REFUSES a viewer invoking the admin-only manageRoles (the emitted app's runtime authz
// gate — a pure role→operation lookup, NEVER an LLM).
func TestTransport_AppAuthCheckAccessOverHTTP(t *testing.T) {
	d := batch4ADepFreeDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "app_auth_check_access", map[string]any{
		"role": "viewer", "operation": "manageRoles",
	})
	assertRouted(t, out, "app_auth_check_access")
	if out.Result["ok"] != true {
		t.Fatalf("app_auth_check_access ok = %v, want true (the real backend executed)", out.Result["ok"])
	}
	if out.Result["allowed"] != false {
		t.Fatalf("app_auth_check_access allowed = %v, want false (a viewer may NOT manageRoles)", out.Result["allowed"])
	}
}

// TestTransport_WorkspaceCanAccessOverHTTP — workspace.workspace_can_access with an object payload reaches
// the backend and REFUSES a path under the truth-store with SANDBOX_ESCAPE (the cross-project isolation
// verdict — the truth-store is OUTSIDE every workspace root, the wall).
func TestTransport_WorkspaceCanAccessOverHTTP(t *testing.T) {
	d := batch4ADepFreeDispatcher()
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	// The go-sdk infers the non-pointer int caps as REQUIRED input properties (the caller shapes them,
	// 0 = no cap). Supply them so the object satisfies the schema over HTTP (the same pattern federation
	// fan_out uses for its non-omitempty slices).
	out := callBatch(t, cs, "workspace_can_access", map[string]any{
		"project_id": "proj-a", "vcs": "git",
		"max_memory_mb": 512, "max_cpu_millis": 2000, "max_wall_seconds": 60, "max_disk_mb": 1024,
		"target": "/var/lib/aidos/truth-store/kernel.truth",
	})
	assertRouted(t, out, "workspace_can_access")
	if out.Result["allowed"] != false {
		t.Fatalf("workspace_can_access allowed = %v, want false (the truth-store is outside every workspace root)", out.Result["allowed"])
	}
	if out.Result["block_code"] != "SANDBOX_ESCAPE" {
		t.Fatalf("workspace_can_access block_code = %v, want SANDBOX_ESCAPE", out.Result["block_code"])
	}
}

// TestTransport_Batch4A_NeutralizedBuilderUndispatched — the LOAD-BEARING proof. With the self-cert
// builder NEUTRALIZED (ErrServerNotDispatched), the SAME object payload that routed above now falls to
// route_undispatched (the demo fallback), not route — proving the green "route" outcomes are caused by
// the WIRING, not by the registry alone. route_undispatched carries a nil result + nil block_reason (the
// front then reads its *-data.ts demo). This closes the cliquet's blind spot server-side.
func TestTransport_Batch4A_NeutralizedBuilderUndispatched(t *testing.T) {
	d := gatewaydispatch.New(gateway.DefaultRegistry(), batch4ADepFreeBuilder("self-cert"))
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "selfcert_certify", map[string]any{
		"verdicts": []map[string]any{{"kind": "types", "green": true}},
	})
	if out.Outcome != "route_undispatched" {
		t.Fatalf("neutralized self-cert outcome = %q, want route_undispatched (the wiring — not the registry — caused the green routes)", out.Outcome)
	}
	if out.Result != nil || out.BlockReason != nil {
		t.Fatalf("route_undispatched must carry nil result + nil block_reason, got %+v", out)
	}
}

// ── besoin-intake: the DSN-backed, RLS-scoped server (Docker-gated) ──

// startBesoinPostgres spins a throwaway Postgres, applies the kernel-records + ideas + besoin migrations,
// and returns the AGENT-role DSN — the LOGIN role subject to the GRANT + RLS (the role the MCP runs as in
// production). The owner pool applies the migrations + makes the agent role a LOGIN role.
func startBesoinPostgres(t *testing.T) string {
	t.Helper()
	ctx := context.Background()
	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos"),
		postgres.WithPassword("aidos"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("testcontainers: start postgres: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })

	ownerDSN, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}
	owner, err := pgxpool.New(ctx, ownerDSN)
	if err != nil {
		t.Fatalf("pgxpool: %v", err)
	}
	t.Cleanup(owner.Close)

	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/ideas_lifecycle_baseline.sql",
		"../../migrations/besoin_graph_baseline.sql",
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := owner.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}
	// Make the agent role a LOGIN role so the gateway dispatcher connects AS the agent — the role the
	// GRANT + RLS actually gate (the migration created it NOLOGIN). Test-only.
	if _, err := owner.Exec(ctx, "ALTER ROLE aidos_agent WITH LOGIN PASSWORD 'agentpw'"); err != nil {
		t.Fatalf("alter agent role: %v", err)
	}
	if _, err := owner.Exec(ctx, "GRANT CONNECT ON DATABASE aidos TO aidos_agent"); err != nil {
		t.Fatalf("grant connect: %v", err)
	}
	cfg, err := pgxpool.ParseConfig(ownerDSN)
	if err != nil {
		t.Fatalf("parse owner dsn: %v", err)
	}
	return fmt.Sprintf("postgres://aidos_agent:agentpw@%s:%d/%s?sslmode=disable",
		cfg.ConnConfig.Host, cfg.ConnConfig.Port, cfg.ConnConfig.Database)
}

// besoinDispatcher wires a dispatcher whose besoin-intake builder opens the REAL agent-role Postgres pool
// (the dual store: the besoin need-graph + the ideas reuse door, both over the one agent DSN). Every other
// server is un-wired (route_undispatched), keeping the cutover additive.
func besoinDispatcher(t *testing.T, agentDSN string) *gatewaydispatch.Dispatcher {
	t.Helper()
	return gatewaydispatch.New(gateway.DefaultRegistry(), func(ctx context.Context, srv string) (*mcp.Server, error) {
		if srv != "besoin-intake" {
			return nil, gatewaydispatch.ErrServerNotDispatched
		}
		store, err := besoinintakesrv.NewStore(ctx, agentDSN)
		if err != nil {
			return nil, err
		}
		ideaStore, err := besoinintakesrv.NewIdeaStore(ctx, agentDSN)
		if err != nil {
			return nil, err
		}
		return besoinintakesrv.NewServer(store, ideaStore), nil
	})
}

// callBatchScoped drives gateway_call over the REAL HTTP transport with an explicit (identity, project)
// scope — the besoin RLS test pins the project the call's rows belong to (the dispatcher routes with
// Target.ProjectID = scope.ActiveProject, so the scope IS the project boundary the wall enforces).
func callBatchScoped(t *testing.T, cs *mcp.ClientSession, scope projectwall.Scope, tool string, args map[string]any) callOutput {
	t.Helper()
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "gateway_call",
		Arguments: callInput{
			Scope: scopeIn{Identity: scope.Identity, ActiveProject: scope.ActiveProject},
			Tool:  tool,
			Args:  args,
		},
	})
	if err != nil {
		t.Fatalf("CallTool gateway_call %q over HTTP: %v", tool, err)
	}
	if res.IsError {
		t.Fatalf("gateway_call %q rejected by schema validation over HTTP (the S59 byte-array scar?): %+v", tool, res.Content)
	}
	return decode[callOutput](t, res, "gateway_call")
}

// TestTransport_BesoinCaptureOverHTTP — besoin-intake.besoin_capture_product with a body:{object} payload
// reaches the REAL agent-role backend and appends a node, emitting an Idea (EL05). It proves the object
// body survives the HTTP round-trip (no json.RawMessage byte-array scar) AND the dual store executed
// (a DRAFT idea is emitted — WroteKernel false, the wall).
func TestTransport_BesoinCaptureOverHTTP(t *testing.T) {
	if !dockerAvailable() {
		t.Skip("docker unavailable — by-design forward-dependency on a real Postgres runner")
	}
	agentDSN := startBesoinPostgres(t)
	d := besoinDispatcher(t, agentDSN)
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	scope := projectwall.Scope{Identity: "alice", ActiveProject: "tenant-a"}
	out := callBatchScoped(t, cs, scope, "besoin_capture_product", map[string]any{
		"project":   "tenant-a",
		"utterance": "app de A",
		"body":      map[string]any{"intent": "app A", "scenarios": []any{"s1"}, "selects": []any{"journey-a"}},
		"meta":      map[string]any{"truth_kind": "behavioral", "verifiability": "deterministic", "global_scope": true},
	})
	assertRouted(t, out, "besoin_capture_product")
	if out.Result["routing"] != "record" {
		t.Fatalf("besoin_capture_product routing = %v, want record (the real dual store executed over HTTP)", out.Result["routing"])
	}
	if out.Result["emitted"] != true {
		t.Fatalf("besoin_capture_product emitted = %v, want true (the product rung emits an Idea, EL05)", out.Result["emitted"])
	}
	idea, ok := out.Result["idea"].(map[string]any)
	if !ok || idea["proposes"] != "product" {
		t.Fatalf("besoin_capture_product idea = %v, want a product idea (the object body survived the HTTP round-trip)", out.Result["idea"])
	}
}

// TestTransport_BesoinRLSTwoProjectsOverHTTP — THE RLS POINT OF THIS BATCH. Project A captures a product
// rung THROUGH THE GATEWAY; then project B's besoin_graph_state — a SEPARATE gateway call scoped to B —
// sees ZERO of A's rows (no leak), while A still sees its own row. The RLS GUC (`aidos.project`) is LOCAL
// to each transaction inside the store (released after fn), so it can never leak to the next pool checkout.
// The agent role carries NO kernel grant (the wall): a kernel write is refused by GRANT independently.
func TestTransport_BesoinRLSTwoProjectsOverHTTP(t *testing.T) {
	if !dockerAvailable() {
		t.Skip("docker unavailable — by-design forward-dependency on a real Postgres runner")
	}
	agentDSN := startBesoinPostgres(t)
	d := besoinDispatcher(t, agentDSN)
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	const projA, projB = "tenant-a", "tenant-b"
	scopeA := projectwall.Scope{Identity: "alice", ActiveProject: projA}
	scopeB := projectwall.Scope{Identity: "bob", ActiveProject: projB}

	// A writes (scope + args both = tenant-a, so the wall admits a same-project call and the store sets the
	// RLS GUC to tenant-a).
	capA := callBatchScoped(t, cs, scopeA, "besoin_capture_product", map[string]any{
		"project":   projA,
		"utterance": "app de A",
		"body":      map[string]any{"intent": "app A", "scenarios": []any{"s1"}, "selects": []any{"journey-a"}},
		"meta":      map[string]any{"truth_kind": "behavioral", "verifiability": "deterministic", "global_scope": true},
	})
	assertRouted(t, capA, "besoin_capture_product")
	if capA.Result["routing"] != "record" {
		t.Fatalf("capture A routing = %v, want record", capA.Result["routing"])
	}

	// B sees NOTHING of A (RLS): B's graph is empty, product still enterable.
	stB := callBatchScoped(t, cs, scopeB, "besoin_graph_state", map[string]any{"project": projB})
	assertRouted(t, stB, "besoin_graph_state")
	if stB.Result["node_row_count"] != float64(0) {
		t.Fatalf("RLS BREACH: project B sees %v of project A's rows (the GUC leaked across projects)", stB.Result["node_row_count"])
	}
	if stB.Result["enterable_level"] != "product" {
		t.Fatalf("project B enterable_level = %v, want product (B is empty)", stB.Result["enterable_level"])
	}

	// A still sees its own row (the GUC did not leak the other way either).
	stA := callBatchScoped(t, cs, scopeA, "besoin_graph_state", map[string]any{"project": projA})
	assertRouted(t, stA, "besoin_graph_state")
	if stA.Result["node_row_count"] != float64(1) {
		t.Fatalf("project A lost its own row under RLS (count=%v)", stA.Result["node_row_count"])
	}
}

// TestTransport_BesoinNeutralizedUndispatched — the load-bearing proof for the DSN-backed server. With the
// besoin-intake builder NEUTRALIZED (ErrServerNotDispatched), the SAME besoin_graph_state object payload
// falls to route_undispatched (demo fallback) instead of route — proving the besoin routes are caused by
// the WIRING, not the registry alone. No Docker needed (the call never reaches a backend).
func TestTransport_BesoinNeutralizedUndispatched(t *testing.T) {
	d := gatewaydispatch.New(gateway.DefaultRegistry(), func(context.Context, string) (*mcp.Server, error) {
		return nil, gatewaydispatch.ErrServerNotDispatched // besoin-intake (and all) un-wired.
	})
	t.Cleanup(d.Close)
	cs := connectHTTPWithDispatch(t, d)

	out := callBatch(t, cs, "besoin_graph_state", map[string]any{"project": "proj-a"})
	if out.Outcome != "route_undispatched" {
		t.Fatalf("neutralized besoin-intake outcome = %q, want route_undispatched (the wiring — not the registry — caused the green routes)", out.Outcome)
	}
	if out.Result != nil || out.BlockReason != nil {
		t.Fatalf("route_undispatched must carry nil result + nil block_reason, got %+v", out)
	}
}
