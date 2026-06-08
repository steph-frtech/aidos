// honoemit_fixture_test.go — the S87 ACCEPTANCE mirror (the journey fixtures), written
// RED before the emitter and now green. The done-criterion is a JOURNEY, not a structural
// match: "le serveur émis DÉMARRE, GET /healthz vert, une route d'operation répond
// end-to-end, un worker async traite un job". So this fixture EMITS the server + worker,
// writes the TS to a temp dir, and BOOTS it under node (real Hono, the app's own
// `app.request` test client) — proving the emitted code actually runs end-to-end, not just
// that it parses. The byte-stability + FN02-purity are pinned by honoemit_property_test.go.
package honoemit

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// checkoutSpec is the canonical S87 fixture: a project with TWO sync operations
// (createOrder, cancelOrder) and ONE async operation (sendReceipt, a notification). It
// exercises a sync HTTP handler AND an async worker dispatcher off the same Kernel cut.
func checkoutSpec() ServerSpec {
	return ServerSpec{
		Project: "shop",
		Ops: []Op{
			{Name: "createOrder"},
			{Name: "cancelOrder"},
			{Name: "sendReceipt", Async: true, Trigger: operation.AsyncTrigger{Kind: operation.TriggerNotification}},
		},
	}
}

// nodeBin returns the node executable, skipping the boot fixture when node is absent (the
// structural fixtures below still run). The CI/dev box has node (the Workbench front).
func nodeBin(t *testing.T) string {
	t.Helper()
	bin, err := exec.LookPath("node")
	if err != nil {
		t.Skip("node not on PATH — skipping the emitted-server boot fixture (structural fixtures still run)")
	}
	return bin
}

// repoRoot walks up from the test's CWD to the directory holding node_modules/hono (where
// the emitted `import { Hono } from "hono"` resolves). Deterministic — no absolute path baked.
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	for i := 0; i < 8; i++ {
		if _, err := os.Stat(filepath.Join(dir, "node_modules", "hono")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	t.Skip("node_modules/hono not found upward — skipping the boot fixture")
	return ""
}

// TestFixture_EmittedServerBootsAndAnswers is the journey: GIVEN the checkout spec, WHEN we
// emit the server + worker and BOOT them under node, THEN GET /healthz is 200 {status:ok},
// the createOrder route answers end-to-end (201, the interpreter callback's result), and the
// async worker dispatches one job. This proves the emitted code RUNS, the S87 done-criterion.
func TestFixture_EmittedServerBootsAndAnswers(t *testing.T) {
	node := nodeBin(t)
	root := repoRoot(t)

	srv, br := EmitServer(checkoutSpec())
	if br != nil {
		t.Fatalf("EmitServer refused: %s", br.Explanation)
	}
	wrk, br := EmitWorker(checkoutSpec())
	if br != nil {
		t.Fatalf("EmitWorker refused: %s", br.Explanation)
	}

	// Boot harness: import the emitted modules, drive them through Hono's `app.request`
	// (the framework's own in-process test client — a real boot, no network), and a fake
	// outbox/dispatcher to drain one async job. It PROVES the emitted code runs end-to-end.
	// The dir lives UNDER the repo root so node resolves `import { Hono } from "hono"`
	// upward against node_modules/hono (ESM resolves relative to the importing file).
	dir, err := os.MkdirTemp(root, "honoemit-boot-")
	if err != nil {
		t.Fatalf("mkdir temp under root: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	write(t, filepath.Join(dir, "server.ts"), srv.Bytes)
	write(t, filepath.Join(dir, "worker.ts"), wrk.Bytes)

	const harness = `
import { createApp } from "./server.ts";
import { dispatchSendReceipt } from "./worker.ts";

const out: any = {};
const app = createApp({ interpret: async (operation, input) => ({ ok: true, operation, input }) });

// 1. the server BOOTS and GET /healthz is green.
const health = await app.request("/healthz");
out.healthStatus = health.status;
out.healthBody = await health.json();

// 2. a sync operation route answers end-to-end (delegating to the interpreter callback).
const created = await app.request("/createorder", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ total: 42 }),
});
out.opStatus = created.status;
out.opBody = await created.json();

// 3. the async worker drains ONE job from the outbox and dispatches it.
const rows = [{ effect_id: "e1", operation: "sendReceipt", kind: "notification", target: "t", payload: {}, dispatched: false }];
let dispatchedTarget = "";
const outbox = { pending: async () => rows, markDispatched: async (id: string) => { rows[0].dispatched = true; } };
const dispatcher = {
  cron: async () => {}, queue: async () => {},
  webhook_out: async () => {},
  notification: async (target: string) => { dispatchedTarget = target; },
};
out.dispatchedCount = await dispatchSendReceipt(outbox as any, dispatcher as any);
out.dispatchedTarget = dispatchedTarget;

process.stdout.write(JSON.stringify(out));
`
	write(t, filepath.Join(dir, "harness.ts"), []byte(harness))

	cmd := exec.Command(node, "--experimental-strip-types", "--no-warnings", filepath.Join(dir, "harness.ts"))
	cmd.Dir = root // resolve `import { Hono } from "hono"` against node_modules/hono
	stdout, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			t.Fatalf("emitted server failed to boot: %v\nstderr:\n%s", err, ee.Stderr)
		}
		t.Fatalf("node run failed: %v", err)
	}

	var res struct {
		HealthStatus     int            `json:"healthStatus"`
		HealthBody       map[string]any `json:"healthBody"`
		OpStatus         int            `json:"opStatus"`
		OpBody           map[string]any `json:"opBody"`
		DispatchedCount  int            `json:"dispatchedCount"`
		DispatchedTarget string         `json:"dispatchedTarget"`
	}
	if err := json.Unmarshal(stdout, &res); err != nil {
		t.Fatalf("harness output not JSON: %v\nraw: %s", err, stdout)
	}

	// THEN: GET /healthz is green.
	if res.HealthStatus != 200 || res.HealthBody["status"] != "ok" {
		t.Fatalf("healthz not green: status=%d body=%v", res.HealthStatus, res.HealthBody)
	}
	// THEN: the operation route answers end-to-end (201, the interpreter callback ran).
	if res.OpStatus != 201 || res.OpBody["operation"] != "createOrder" {
		t.Fatalf("operation route not end-to-end: status=%d body=%v", res.OpStatus, res.OpBody)
	}
	// THEN: the async worker dispatched exactly one job.
	if res.DispatchedCount != 1 || res.DispatchedTarget != "t" {
		t.Fatalf("async worker did not process the job: count=%d target=%q", res.DispatchedCount, res.DispatchedTarget)
	}
}

// TestFixture_ServerWiresEverySyncOp_NotAsync — the server router carries a handler for
// EVERY sync op ("câblé sur TOUTES les operations") and NONE for the async op (it is wired
// in the worker). A structural check that complements the boot fixture.
func TestFixture_ServerWiresEverySyncOp_NotAsync(t *testing.T) {
	srv, br := EmitServer(checkoutSpec())
	if br != nil {
		t.Fatalf("EmitServer refused: %s", br.Explanation)
	}
	s := string(srv.Bytes)
	for _, want := range []string{`app.post("/createorder"`, `app.post("/cancelorder"`, `app.get("/healthz"`} {
		if !strings.Contains(s, want) {
			t.Fatalf("server missing %q\n%s", want, s)
		}
	}
	if strings.Contains(s, "/sendreceipt") {
		t.Fatalf("async op must NOT be an HTTP route (it is a worker dispatcher)\n%s", s)
	}

	wrk, br := EmitWorker(checkoutSpec())
	if br != nil {
		t.Fatalf("EmitWorker refused: %s", br.Explanation)
	}
	if !strings.Contains(string(wrk.Bytes), "dispatchSendReceipt") {
		t.Fatalf("worker missing the async dispatcher\n%s", wrk.Bytes)
	}
}

// TestFixture_MalformedSpecRefused — the honesty rule: an empty spec / an unnamed op / a bad
// async trigger is a typed BlockReason, never a partial render.
func TestFixture_MalformedSpecRefused(t *testing.T) {
	cases := []ServerSpec{
		{Project: "", Ops: []Op{{Name: "x"}}},
		{Project: "p", Ops: nil},
		{Project: "p", Ops: []Op{{Name: ""}}},
		{Project: "p", Ops: []Op{{Name: "x", Async: true, Trigger: operation.AsyncTrigger{Kind: "made-up"}}}},
	}
	for i, sp := range cases {
		if _, br := EmitServer(sp); br == nil {
			t.Fatalf("case %d: malformed spec was NOT refused", i)
		}
	}
}

// TestFixture_PulumiProgramEmitted — the StackManifest projects a Pulumi/TS program with the
// shared network, a container per service, and Traefik labels on the server; an unknown role
// / no-server / dup-port manifest is refused.
func TestFixture_PulumiProgramEmitted(t *testing.T) {
	m := checkoutManifest()
	art, br := EmitPulumiProgram(m)
	if br != nil {
		t.Fatalf("EmitPulumiProgram refused: %s", br.Explanation)
	}
	s := string(art.Bytes)
	for _, want := range []string{
		`import * as docker from "@pulumi/docker"`,
		`export function program()`,
		`new docker.Network`,
		`new docker.Container("server"`,
		`new docker.Container("postgres"`,
		`"traefik.enable"`,
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("pulumi program missing %q\n%s", want, s)
		}
	}

	// Refusals: unknown role, no server, duplicate internal port.
	bad := []StackManifest{
		{App: "a", Services: []Service{{Name: "x", Role: "made-up", Image: "i"}}},
		{App: "a", Services: []Service{{Name: "db", Role: RoleDatastore, Image: "postgres", InternalPort: 5432}}},
		{App: "a", Services: []Service{
			{Name: "s1", Role: RoleServer, Image: "i", InternalPort: 3000},
			{Name: "s2", Role: RoleCache, Image: "valkey", InternalPort: 3000},
		}},
	}
	for i, m := range bad {
		if _, br := EmitPulumiProgram(m); br == nil {
			t.Fatalf("bad manifest case %d was NOT refused", i)
		}
	}
}

// checkoutManifest is the canonical StackManifest fixture: a server (Hono) + the Go
// interpreter sidecar + Postgres datastore + Valkey cache on the shared Traefik network.
func checkoutManifest() StackManifest {
	return StackManifest{
		App: "shop",
		Services: []Service{
			{Name: "server", Role: RoleServer, Image: "shop-server:latest", InternalPort: 3000},
			{Name: "interpreter", Role: RoleInterpreter, Image: "aidos-interpreter:latest", InternalPort: 8080},
			{Name: "postgres", Role: RoleDatastore, Image: "postgres:16", InternalPort: 5432},
			{Name: "valkey", Role: RoleCache, Image: "valkey/valkey:8", InternalPort: 6379},
		},
		Volumes: []Volume{{Name: "pgdata", Path: "/var/lib/postgresql/data"}},
		Network: Network{Name: "traefik_default", External: true},
	}
}

func write(t *testing.T, path string, b []byte) {
	t.Helper()
	if err := os.WriteFile(path, b, 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
