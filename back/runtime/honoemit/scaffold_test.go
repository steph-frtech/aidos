// scaffold_test.go — le MIROIR du SERVEUR HONO ÉMIS RUNNABLE (la clé de voûte côté serveur).
//
// EmitServerScaffold(spec) rend, EN PLUS de server.ts, le boot index.ts (qui câble deps.interpret
// sur le sidecar via fetch + sert via @hono/node-server), le package.json et le Dockerfile. Le miroir
// prouve : (a) la JOURNÉE — le scaffold BOOTE sous node et route une operation vers un sidecar fake
// (fetch → 201) ; (b) le câblage — index.ts lit INTERPRETER_URL et POST /interpret {operation,input} ;
// (c) la reproductibilité (byte-stable, FN02-pur) ; (d) l'honnêteté (spec malformé → BlockReason).
package honoemit

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"pgregory.net/rapid"
)

// scaffoldByPath returns the artifact whose Path ends with the given basename (the scaffold lands files
// under gen/<project>/server/). Fails the test if absent.
func scaffoldByPath(t *testing.T, arts []Artifact, base string) Artifact {
	t.Helper()
	for _, a := range arts {
		if strings.HasSuffix(a.Path, "/"+base) {
			return a
		}
	}
	t.Fatalf("scaffold missing %q (have %v)", base, artPaths(arts))
	return Artifact{}
}

func artPaths(arts []Artifact) []string {
	out := make([]string, 0, len(arts))
	for _, a := range arts {
		out = append(out, a.Path)
	}
	return out
}

// TestScaffold_EmitsBootableSet — the scaffold lands the FOUR bootable files: server.ts (the pure
// server), index.ts (the boot), package.json (the deps), Dockerfile (the node image). All four under
// gen/<project>/server/, all carrying the SAME source hash (one source → one content address).
func TestScaffold_EmitsBootableSet(t *testing.T) {
	arts, br := EmitServerScaffold(checkoutSpec())
	if br != nil {
		t.Fatalf("EmitServerScaffold refused: %s", br.Explanation)
	}
	for _, base := range []string{"server.ts", "index.ts", "package.json", "Dockerfile"} {
		a := scaffoldByPath(t, arts, base)
		if !strings.HasPrefix(a.Path, "gen/shop/server/") {
			t.Fatalf("%s not under gen/shop/server/: %q", base, a.Path)
		}
	}
	// One source → one content address across the whole scaffold.
	src := arts[0].SourceHash
	for _, a := range arts {
		if a.SourceHash != src {
			t.Fatalf("scaffold artifacts carry diverging source hashes: %q vs %q", a.SourceHash, src)
		}
	}
}

// TestScaffold_BootWiresInterpreterURL — the boot index.ts reads INTERPRETER_URL and POSTs each
// operation to ${INTERPRETER_URL}/interpret with {operation, input, auth}, serving via @hono/node-server.
// It is the EXACT wire contract the Go sidecar (interpretsvc POST /interpret) answers.
func TestScaffold_BootWiresInterpreterURL(t *testing.T) {
	arts, br := EmitServerScaffold(checkoutSpec())
	if br != nil {
		t.Fatalf("EmitServerScaffold refused: %s", br.Explanation)
	}
	idx := string(scaffoldByPath(t, arts, "index.ts").Bytes)
	for _, want := range []string{
		`import { serve } from "@hono/node-server";`,
		`import type { Context } from "hono";`,
		`import { createApp, type OperationInterpreter } from "./server.ts";`,
		`process.env["INTERPRETER_URL"]`,
		"`${baseUrl}/interpret`",
		`method: "POST"`,
		`JSON.stringify({ operation, input, auth: auth ?? {} })`,
		// The boot derives $.auth from the trusted X-Aidos-User header, defaulting to the deterministic
		// dev identity — and injects the deriver into createApp (so it runs before every route).
		`function authFromRequest(c: Context): { user: { id: string } } {`,
		`const id = c.req.header("x-aidos-user") ?? "dev";`,
		`return { user: { id } };`,
		`createApp({ interpret: createInterpreter(interpreterUrl), auth: authFromRequest })`,
		`serve({ fetch: app.fetch, port });`,
	} {
		if !strings.Contains(idx, want) {
			t.Fatalf("boot index.ts missing %q\n%s", want, idx)
		}
	}
	// package.json pins the two runtime deps.
	pkg := string(scaffoldByPath(t, arts, "package.json").Bytes)
	for _, want := range []string{`"hono":`, `"@hono/node-server":`, `"type": "module"`} {
		if !strings.Contains(pkg, want) {
			t.Fatalf("package.json missing %q\n%s", want, pkg)
		}
	}
}

// TestScaffold_ByteStable_AndFN02Pure — same spec → byte-identical scaffold under input-order
// permutation, and no emitted TS module carries a module-scope mutable binding (FN02). The
// reproducibility + purity mirror for the boot scaffold.
func TestScaffold_ByteStable_AndFN02Pure(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genServerSpec(t)
		a1, br := EmitServerScaffold(spec)
		if br != nil {
			t.Fatalf("EmitServerScaffold refused a projectable spec: %s", br.Explanation)
		}
		a2, _ := EmitServerScaffold(shuffledSpec(spec))
		if len(a1) != len(a2) {
			t.Fatalf("scaffold artifact count diverged: %d vs %d", len(a1), len(a2))
		}
		for i := range a1 {
			if a1[i].Path != a2[i].Path || string(a1[i].Bytes) != string(a2[i].Bytes) {
				t.Fatalf("scaffold %q not byte-identical under input-order permutation", a1[i].Path)
			}
			if a1[i].OutputHash != a2[i].OutputHash {
				t.Fatalf("scaffold %q output hash diverged", a1[i].Path)
			}
		}
		// FN02 purity: no module-scope let/var in any emitted .ts.
		for _, art := range a1 {
			if !strings.HasSuffix(art.Path, ".ts") {
				continue
			}
			for _, line := range strings.Split(string(art.Bytes), "\n") {
				if strings.HasPrefix(line, "let ") || strings.HasPrefix(line, "var ") {
					t.Fatalf("module-scope mutable binding in %s: %q", art.Path, line)
				}
			}
		}
	})
}

// webServerSpec is the checkout spec carrying the web view: the entity names the list views read
// (GET /entities/<entity>) AND the relative web build dir (./web/dist) the server serves the SPA from.
// It is what MaterialiseHono builds — the server that serves BOTH the API and the React view.
func webServerSpec() ServerSpec {
	s := checkoutSpec()
	s.Entities = []string{"order"}
	s.WebDir = "./web/dist"
	return s
}

// TestScaffold_ServesReactView — the view is SERVED by the app: when the spec pins a WebDir, server.ts
// mounts the static React build (serveStatic) so GET / returns the SPA index, the boot imports it, and
// the Dockerfile builds the web app (vite build) + copies dist/ into the server image. The API routes
// (healthz, POST /<op>, GET /entities/<e>) still win — the static fallback is mounted LAST.
func TestScaffold_ServesReactView(t *testing.T) {
	arts, br := EmitServerScaffold(webServerSpec())
	if br != nil {
		t.Fatalf("EmitServerScaffold refused: %s", br.Explanation)
	}
	server := string(scaffoldByPath(t, arts, "server.ts").Bytes)
	// The server serves the built React dist/ as static + an SPA fallback to index.html.
	for _, want := range []string{
		`import { serveStatic } from "@hono/node-server/serve-static";`,
		`serveStatic({ root: "./web/dist" })`,
		`serveStatic({ path: "./web/dist/index.html" })`,
	} {
		if !strings.Contains(server, want) {
			t.Fatalf("server.ts (web) missing %q\n%s", want, server)
		}
	}
	// The API routes are registered BEFORE the static catch-all so they win (order = bytes order).
	apiIdx := strings.Index(server, `app.post("/createorder"`)
	staticIdx := strings.Index(server, `serveStatic({ path: "./web/dist/index.html" })`)
	if apiIdx < 0 || staticIdx < 0 || apiIdx > staticIdx {
		t.Fatalf("the static SPA fallback must be mounted AFTER the API routes (api@%d, static@%d)", apiIdx, staticIdx)
	}
	// The read route the list views fetch: GET /entities/<entity>, one per pinned entity name. It must
	// DELEGATE to the injected lister (deps.list) — no longer the old hard-coded c.json([], 200) stub.
	if !strings.Contains(server, `app.get("/entities/order"`) {
		t.Fatalf("server.ts (web) missing the read route GET /entities/order\n%s", server)
	}
	if !strings.Contains(server, `deps.list ? await deps.list("order")`) {
		t.Fatalf("server.ts (web) GET /entities/order must delegate to deps.list, not return a stub\n%s", server)
	}
	// The boot imports serveStatic (so the bundled middleware resolves) when WebDir is set, AND wires the
	// EntityLister onto the sidecar's read verb (createLister → list:) so the route's delegation resolves.
	idx := string(scaffoldByPath(t, arts, "index.ts").Bytes)
	if !strings.Contains(idx, `serve-static`) {
		t.Fatalf("boot index.ts must reference serve-static when the spec serves the view\n%s", idx)
	}
	for _, want := range []string{"function createLister(", "/list?entity=", "list: createLister(interpreterUrl)"} {
		if !strings.Contains(idx, want) {
			t.Fatalf("boot index.ts must wire the entity lister (%q)\n%s", want, idx)
		}
	}
	// package.json keeps @hono/node-server (serveStatic ships with it — no new dep).
	pkg := string(scaffoldByPath(t, arts, "package.json").Bytes)
	if !strings.Contains(pkg, `"@hono/node-server":`) {
		t.Fatalf("package.json must keep @hono/node-server (serveStatic ships with it)\n%s", pkg)
	}
	// The Dockerfile builds the web app (vite build) and copies dist/ into the server image.
	df := string(scaffoldByPath(t, arts, "Dockerfile").Bytes)
	for _, want := range []string{"web/", "run build", "web/dist"} {
		if !strings.Contains(df, want) {
			t.Fatalf("server Dockerfile (web) missing %q\n%s", want, df)
		}
	}
}

// TestScaffold_NoWebDir_NoStatic — the no-fork proof: a spec WITHOUT a WebDir emits the SAME pure
// server it always did (no serveStatic, no static import). The web-serving is purely additive.
func TestScaffold_NoWebDir_NoStatic(t *testing.T) {
	arts, br := EmitServerScaffold(checkoutSpec())
	if br != nil {
		t.Fatalf("EmitServerScaffold refused: %s", br.Explanation)
	}
	server := string(scaffoldByPath(t, arts, "server.ts").Bytes)
	if strings.Contains(server, "serveStatic") {
		t.Fatalf("a spec with no WebDir must NOT emit serveStatic:\n%s", server)
	}
	idx := string(scaffoldByPath(t, arts, "index.ts").Bytes)
	if strings.Contains(idx, "serve-static") {
		t.Fatalf("a spec with no WebDir must NOT import serve-static in the boot:\n%s", idx)
	}
}

// TestScaffold_MalformedRefused — the honesty rule: a malformed spec (empty project / unnamed op / bad
// async trigger) is a typed BlockReason, never a partial scaffold (the server.ts validation owns it).
func TestScaffold_MalformedRefused(t *testing.T) {
	for i, sp := range []ServerSpec{
		{Project: "", Ops: []Op{{Name: "x"}}},
		{Project: "p", Ops: nil},
		{Project: "p", Ops: []Op{{Name: ""}}},
	} {
		if _, br := EmitServerScaffold(sp); br == nil {
			t.Fatalf("case %d: malformed spec was NOT refused", i)
		}
	}
}

// TestScaffold_BootsAndRoutesToSidecar is the JOURNEY (the done-criterion): GIVEN the checkout spec,
// WHEN we emit the scaffold and BOOT index.ts under node against a FAKE sidecar (an httptest server
// answering POST /interpret), THEN createApp + the fetch interpreter route a real operation call all
// the way to the sidecar and back — proving the emitted SERVER↔SIDECAR wire actually runs. This is the
// clé-de-voûte proof: the emitted Hono server delegates to the sidecar over HTTP.
func TestScaffold_BootsAndRoutesToSidecar(t *testing.T) {
	node := nodeBin(t)
	root := repoRoot(t)

	// A FAKE sidecar: it answers POST /interpret with a deterministic outcome (the wire shape the real
	// interpretsvc returns). The boot's fetch interpreter must reach it and surface its result. It records
	// the auth of EACH call (the header-carrying one + the anonymous one) so the journey proves both the
	// forwarded identity and the deterministic dev default reach $.auth.user.id.
	var gotOp string
	var gotAuthIDs []string
	sidecar := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/interpret" || r.Method != http.MethodPost {
			http.Error(w, "nope", http.StatusNotFound)
			return
		}
		var body struct {
			Operation string         `json:"operation"`
			Input     map[string]any `json:"input"`
			Auth      struct {
				User struct {
					ID string `json:"id"`
				} `json:"user"`
			} `json:"auth"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		gotOp = body.Operation
		gotAuthIDs = append(gotAuthIDs, body.Auth.User.ID)
		w.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"operation": body.Operation,
			"result":    map[string]any{"id": "order-1"},
			"events":    []string{"OrderCreated"},
		})
	}))
	t.Cleanup(sidecar.Close)

	arts, br := EmitServerScaffold(checkoutSpec())
	if br != nil {
		t.Fatalf("EmitServerScaffold refused: %s", br.Explanation)
	}

	dir, err := os.MkdirTemp(root, "honoemit-scaffold-")
	if err != nil {
		t.Fatalf("mkdir temp under root: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	for _, base := range []string{"server.ts", "index.ts"} {
		write(t, filepath.Join(dir, base), scaffoldByPath(t, arts, base).Bytes)
	}

	// Boot harness: import the boot's interpreter wiring INDIRECTLY by importing createApp + building
	// the same fetch interpreter AND the same header auth deriver the boot builds, then drive it through
	// Hono's app.request. This proves the EMITTED server.ts + the fetch-to-sidecar contract run, AND that
	// the X-Aidos-User header flows all the way to $.auth.user.id (with a deterministic dev default).
	harness := `
import { createApp } from "./server.ts";

// The exact interpreter the boot index.ts builds: a fetch POST to ${INTERPRETER_URL}/interpret,
// now forwarding the caller AUTH alongside the input (the boot's 3-arg OperationInterpreter).
const baseUrl = process.env["INTERPRETER_URL"];
const interpret = async (operation, input, auth) => {
  const res = await fetch(` + "`${baseUrl}/interpret`" + `, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation, input, auth: auth ?? {} }),
  });
  if (!res.ok) throw new Error("interpreter " + res.status);
  return res.json();
};

// The exact auth deriver the boot index.ts injects into createApp: the X-Aidos-User header → {user:{id}},
// defaulting to the deterministic dev identity. Injected so it runs in server.ts's first middleware.
const authFromRequest = (c) => ({ user: { id: c.req.header("x-aidos-user") ?? "dev" } });

const app = createApp({ interpret, auth: authFromRequest });
const out = {};
const health = await app.request("/healthz");
out.healthStatus = health.status;

// (1) A request CARRYING the identity header: $.auth.user.id must reach the sidecar as that id.
const created = await app.request("/createorder", {
  method: "POST",
  headers: { "content-type": "application/json", "x-aidos-user": "alice" },
  body: JSON.stringify({ total: 42 }),
});
out.opStatus = created.status;
out.opBody = await created.json();

// (2) A request WITHOUT the header: the deterministic dev identity must reach the sidecar.
const anon = await app.request("/createorder", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ total: 7 }),
});
out.anonStatus = anon.status;

process.stdout.write(JSON.stringify(out));
`
	write(t, filepath.Join(dir, "harness.ts"), []byte(harness))

	cmd := exec.Command(node, "--experimental-strip-types", "--no-warnings", filepath.Join(dir, "harness.ts"))
	cmd.Dir = root
	cmd.Env = append(os.Environ(), "INTERPRETER_URL="+sidecar.URL)
	stdout, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			t.Fatalf("emitted scaffold failed to boot: %v\nstderr:\n%s", err, ee.Stderr)
		}
		t.Fatalf("node run failed: %v", err)
	}

	var res struct {
		HealthStatus int            `json:"healthStatus"`
		OpStatus     int            `json:"opStatus"`
		OpBody       map[string]any `json:"opBody"`
		AnonStatus   int            `json:"anonStatus"`
	}
	if err := json.Unmarshal(stdout, &res); err != nil {
		t.Fatalf("harness output not JSON: %v\nraw: %s", err, stdout)
	}
	if res.HealthStatus != 200 {
		t.Fatalf("healthz not green: %d", res.HealthStatus)
	}
	// THEN: both operation routes reached the sidecar and surfaced its result.
	if res.OpStatus != 201 {
		t.Fatalf("operation route not 201: %d body=%v", res.OpStatus, res.OpBody)
	}
	if res.AnonStatus != 201 {
		t.Fatalf("anonymous operation route not 201: %d", res.AnonStatus)
	}
	if gotOp != "createOrder" {
		t.Fatalf("sidecar did not receive the createOrder command (got %q)", gotOp)
	}
	if res.OpBody["operation"] != "createOrder" {
		t.Fatalf("server did not surface the sidecar result: %v", res.OpBody)
	}
	// The wire forwards $.auth.user.id all the way: the FIRST call carried X-Aidos-User: alice (so the
	// sidecar saw "alice"); the SECOND carried no header (so the boot's deterministic dev default "dev"
	// reached it). This proves the request-header → $.auth.user.id chain (createOrder's userId resolves).
	if len(gotAuthIDs) != 2 {
		t.Fatalf("sidecar saw %d calls, want 2 (header + anonymous): %v", len(gotAuthIDs), gotAuthIDs)
	}
	if gotAuthIDs[0] != "alice" {
		t.Fatalf("sidecar did not receive the header identity: $.auth.user.id = %q, want \"alice\"", gotAuthIDs[0])
	}
	if gotAuthIDs[1] != "dev" {
		t.Fatalf("sidecar did not receive the deterministic dev default: $.auth.user.id = %q, want \"dev\"", gotAuthIDs[1])
	}
}

// TestScaffold_ServesViewAndReadRoute is the WEB journey (the done-criterion of this step): GIVEN the
// web server spec (WebDir + an entity), WHEN we emit the scaffold, drop a fake built dist/index.html and
// BOOT server.ts under node against a fake sidecar, THEN GET / serves the React index (the SPA shell),
// GET /entities/order DELEGATES to the sidecar's list verb and returns the REAL rows (no longer the old
// empty []), and POST /createorder still reaches the sidecar (the API wins over the static fallback).
// The harness builds the SAME EntityLister the emitted boot (createLister) builds — a fetch to
// GET /list?entity=<e> that unwraps { rows } — so the mirror proves the wired delegation, not a stub.
func TestScaffold_ServesViewAndReadRoute(t *testing.T) {
	node := nodeBin(t)
	root := repoRoot(t)

	sidecar := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/interpret" && r.Method == http.MethodPost:
			w.Header().Set("content-type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"operation": "createOrder", "result": map[string]any{"id": "order-1"}, "events": []string{}})
		case r.URL.Path == "/list" && r.Method == http.MethodGet:
			// The sidecar's read verb: every row of the requested entity, in { rows: [...] }. The
			// emitted GET /entities/<e> route must surface these — proving the delegation is real.
			if r.URL.Query().Get("entity") != "order" {
				http.Error(w, "unknown entity", http.StatusNotFound)
				return
			}
			w.Header().Set("content-type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"rows": []map[string]any{
				{"id": "order-1", "status": "pending"},
				{"id": "order-2", "status": "shipped"},
			}})
		default:
			http.Error(w, "nope", http.StatusNotFound)
		}
	}))
	t.Cleanup(sidecar.Close)

	arts, br := EmitServerScaffold(webServerSpec())
	if br != nil {
		t.Fatalf("EmitServerScaffold refused: %s", br.Explanation)
	}

	dir, err := os.MkdirTemp(root, "honoemit-web-")
	if err != nil {
		t.Fatalf("mkdir temp under root: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	write(t, filepath.Join(dir, "server.ts"), scaffoldByPath(t, arts, "server.ts").Bytes)
	// A fake built React app under ./web/dist (what `vite build` produces in the image). The SPA index
	// the server serves on GET / and on any non-API path (the catch-all fallback).
	if err := os.MkdirAll(filepath.Join(dir, "web", "dist"), 0o755); err != nil {
		t.Fatalf("mkdir web/dist: %v", err)
	}
	write(t, filepath.Join(dir, "web", "dist", "index.html"), []byte(`<!doctype html><html><body><div id="root">AIDOS-VIEW</div></body></html>`+"\n"))

	// Boot harness: build the same interpreter + LISTER + auth deriver the boot builds, create the app,
	// and drive it through Hono's app.request — proving the EMITTED server.ts serves the view AND the API,
	// and that GET /entities/order DELEGATES to the sidecar's list verb (the same createLister the boot
	// wires: fetch GET /list?entity=<e> → unwrap { rows }).
	harness := `
import { createApp } from "./server.ts";
const baseUrl = process.env["INTERPRETER_URL"];
const interpret = async (operation, input, auth) => {
  const res = await fetch(` + "`${baseUrl}/interpret`" + `, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation, input, auth: auth ?? {} }) });
  if (!res.ok) throw new Error("interpreter " + res.status);
  return res.json();
};
const list = async (entity) => {
  const res = await fetch(` + "`${baseUrl}/list?entity=${encodeURIComponent(entity)}`" + `);
  if (!res.ok) throw new Error("lister " + res.status);
  const body = await res.json();
  return body.rows ?? [];
};
const app = createApp({ interpret, list, auth: (c) => ({ user: { id: "dev" } }) });
const out = {};
const idxRes = await app.request("/");
out.indexStatus = idxRes.status;
out.indexBody = await idxRes.text();
const entRes = await app.request("/entities/order");
out.entStatus = entRes.status;
out.entBody = await entRes.json();
const opRes = await app.request("/createorder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ total: 1 }) });
out.opStatus = opRes.status;
process.stdout.write(JSON.stringify(out));
`
	write(t, filepath.Join(dir, "harness.ts"), []byte(harness))

	cmd := exec.Command(node, "--experimental-strip-types", "--no-warnings", filepath.Join(dir, "harness.ts"))
	cmd.Dir = dir // run from the stack dir so serveStatic's relative ./web/dist resolves.
	cmd.Env = append(os.Environ(), "INTERPRETER_URL="+sidecar.URL)
	stdout, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			t.Fatalf("emitted web scaffold failed to boot: %v\nstderr:\n%s", err, ee.Stderr)
		}
		t.Fatalf("node run failed: %v", err)
	}

	var res struct {
		IndexStatus int              `json:"indexStatus"`
		IndexBody   string           `json:"indexBody"`
		EntStatus   int              `json:"entStatus"`
		EntBody     []map[string]any `json:"entBody"`
		OpStatus    int              `json:"opStatus"`
	}
	if err := json.Unmarshal(stdout, &res); err != nil {
		t.Fatalf("harness output not JSON: %v\nraw: %s", err, stdout)
	}
	// THEN: GET / serves the React SPA shell (the view IS served by the app).
	if res.IndexStatus != 200 || !strings.Contains(res.IndexBody, "AIDOS-VIEW") {
		t.Fatalf("GET / did not serve the React index: status=%d body=%q", res.IndexStatus, res.IndexBody)
	}
	// GET /entities/order DELEGATES to the sidecar's list verb and surfaces the REAL rows (no longer the
	// old empty []): the two rows the fake sidecar served, in order. This is the read verb closing the loop.
	if res.EntStatus != 200 {
		t.Fatalf("GET /entities/order did not return 200: status=%d", res.EntStatus)
	}
	if len(res.EntBody) != 2 {
		t.Fatalf("GET /entities/order must surface the sidecar's 2 rows, got %d (%v)", len(res.EntBody), res.EntBody)
	}
	if res.EntBody[0]["id"] != "order-1" || res.EntBody[1]["id"] != "order-2" {
		t.Fatalf("GET /entities/order rows out of order/wrong: %v", res.EntBody)
	}
	// POST /createorder still reaches the sidecar (the API route wins over the static fallback).
	if res.OpStatus != 201 {
		t.Fatalf("POST /createorder did not win over the static fallback: status=%d", res.OpStatus)
	}
}
