// scaffold_otel_test.go — le MIROIR du SERVEUR ÉMIS QUI ÉMET DE LA TÉLÉMÉTRIE PAR DÉFAUT
// + EST CÂBLÉ AU SUBSTRAT (cache Valkey / bus NATS). Intention (utilisatrice, 2026-06-14) :
// « toute belle app mais tout ça en par défaut dans les spec et déploie tout » — l'app ÉMISE
// doit, SANS qu'on l'y force, exporter ses traces vers l'OpenTelemetry Collector partagé et
// porter les URL du cache/bus prêtes à l'emploi.
//
// Le miroir prouve, RED→VERT :
//
//	(a) la JOURNÉE — le boot émis INITIALISE OpenTelemetry quand OTEL_EXPORTER_OTLP_ENDPOINT est
//	    défini, SANS crash (il boote, GET /healthz reste vert) ; et SANS endpoint il boote QUAND
//	    MÊME (no-op silencieux, jamais un crash) — l'OTel ne doit JAMAIS faire tomber le serveur ;
//	(b) le PAQUETAGE — package.json émis porte les deps OTel (sdk-node + auto-instrumentations +
//	    exporter-trace-otlp-http), versions épinglées, ordre alpha byte-stable ;
//	(c) le CÂBLAGE — le boot LIT REDIS_URL (cache Valkey) et NATS_URL (bus) depuis l'env (lisibles,
//	    prêts à l'emploi), et le service.name OTel = le projet.
//
// DÉTERMINISME-FIRST + LE MUR (§2/§6/§8). L'instrumentation émise est une PROJECTION PURE
// below-the-line (aucune vérité écrite) ; la byte-stabilité + FN02 sont déjà scellées par
// scaffold_test.go (TestScaffold_ByteStable_AndFN02Pure couvre TOUT le .ts émis, dont
// instrumentation.ts). Le boot OTel n'écrit RIEN dans le Kernel.
package honoemit

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

// TestScaffold_PackageJSONCarriesOTelDeps — le PAQUETAGE (b) : le package.json émis porte les
// trois deps OTel, en plus de hono + @hono/node-server, en ordre alphabétique byte-stable.
func TestScaffold_PackageJSONCarriesOTelDeps(t *testing.T) {
	arts, br := EmitServerScaffold(checkoutSpec())
	if br != nil {
		t.Fatalf("EmitServerScaffold refused: %s", br.Explanation)
	}
	pkg := string(scaffoldByPath(t, arts, "package.json").Bytes)
	for _, want := range []string{
		`"@opentelemetry/sdk-node":`,
		`"@opentelemetry/auto-instrumentations-node":`,
		`"@opentelemetry/exporter-trace-otlp-http":`,
		// the existing runtime deps stay (no-fork — purely additive).
		`"@hono/node-server":`,
		`"hono":`,
	} {
		if !strings.Contains(pkg, want) {
			t.Fatalf("package.json missing OTel/runtime dep %q\n%s", want, pkg)
		}
	}
	// The dependency block must be VALID, parseable JSON with all five deps (no trailing-comma
	// drift), and the keys must be in strict ascending (alpha) order so the bytes are stable.
	var parsed struct {
		Dependencies map[string]string `json:"dependencies"`
	}
	if err := json.Unmarshal([]byte(pkg), &parsed); err != nil {
		t.Fatalf("package.json is not valid JSON: %v\n%s", err, pkg)
	}
	for _, name := range []string{
		"@hono/node-server", "@opentelemetry/auto-instrumentations-node",
		"@opentelemetry/exporter-trace-otlp-http", "@opentelemetry/sdk-node", "hono",
	} {
		if parsed.Dependencies[name] == "" {
			t.Fatalf("dependencies missing %q (have %v)", name, parsed.Dependencies)
		}
	}
}

// TestScaffold_BootWiresSubstrateEnv — le CÂBLAGE (c) : le boot index.ts LIT REDIS_URL (cache) et
// NATS_URL (bus) depuis l'env, et imprime/expose le service.name = le projet pour l'OTel. Ces URL
// sont prêtes à l'emploi (lisibles), sans forcer une lib redis/nats si l'app n'en a pas besoin.
func TestScaffold_BootWiresSubstrateEnv(t *testing.T) {
	arts, br := EmitServerScaffold(checkoutSpec())
	if br != nil {
		t.Fatalf("EmitServerScaffold refused: %s", br.Explanation)
	}
	idx := string(scaffoldByPath(t, arts, "index.ts").Bytes)
	for _, want := range []string{
		`process.env["REDIS_URL"]`,
		`process.env["NATS_URL"]`,
		// the instrumentation module is imported FIRST (before the app boots) so auto-instrumentation
		// wraps http/fetch before the routes are registered.
		`import "./instrumentation.ts";`,
	} {
		if !strings.Contains(idx, want) {
			t.Fatalf("boot index.ts missing substrate wiring %q\n%s", want, idx)
		}
	}
	// instrumentation.ts is a SEPARATE emitted module: the OTel SDK init, the service.name = project,
	// the OTLP/HTTP exporter reading OTEL_EXPORTER_OTLP_ENDPOINT, started only when the endpoint is set.
	instr := string(scaffoldByPath(t, arts, "instrumentation.ts").Bytes)
	for _, want := range []string{
		`OTEL_EXPORTER_OTLP_ENDPOINT`,
		`@opentelemetry/sdk-node`,
		`@opentelemetry/exporter-trace-otlp-http`,
		// service.name = the project (the app emits telemetry under its own name).
		`"shop"`,
	} {
		if !strings.Contains(instr, want) {
			t.Fatalf("instrumentation.ts missing %q\n%s", want, instr)
		}
	}
	// The DOCKERFILE must COPY instrumentation.ts into the image — index.ts imports it FIRST, so an
	// image that ships index.ts without it CRASHES on boot (module not found). The mirror that the
	// emitted module reaches the running container, not just the test dir.
	dockerfile := string(scaffoldByPath(t, arts, "Dockerfile").Bytes)
	if !strings.Contains(dockerfile, "instrumentation.ts") {
		t.Fatalf("Dockerfile must COPY instrumentation.ts (index.ts imports it — else the image crashes)\n%s", dockerfile)
	}
	// The boot MUST node --import ./instrumentation.ts: in ESM the whole graph links before any body
	// runs, so a top-of-index.ts import is too late to patch node:http (loaded via @hono/node-server).
	// --import runs the SDK FIRST → auto-instrumentation actually wraps http → the app emits traces.
	if !strings.Contains(dockerfile, `"--import", "./instrumentation.ts"`) {
		t.Fatalf("Dockerfile CMD must node --import ./instrumentation.ts (ESM: top-import is too late to patch http)\n%s", dockerfile)
	}
}

// TestScaffold_BootEmitsTelemetry_NoCrash is the JOURNEY (a): GIVEN the checkout scaffold, WHEN we
// boot index.ts under node WITH OTEL_EXPORTER_OTLP_ENDPOINT set at a FAKE OTLP/HTTP collector, THEN
// the server boots, GET /healthz is green, and the collector RECEIVES at least one exported span
// (the app emits telemetry by default). AND WHEN we boot it with NO endpoint, THEN it boots anyway
// (the no-op path — OTel never crashes the server). This is the done-criterion of TÂCHE 1.
func TestScaffold_BootEmitsTelemetry_NoCrash(t *testing.T) {
	node := nodeBin(t)
	root := repoRoot(t)
	requireOTelDeps(t, root)

	// A FAKE OTLP/HTTP collector: it answers POST /v1/traces (the OTLP-HTTP traces path the
	// @opentelemetry/exporter-trace-otlp-http exporter POSTs to) with 200 and records the hit.
	var gotSpan int32
	collector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/v1/") {
			atomic.AddInt32(&gotSpan, 1)
		}
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte("{}"))
	}))
	t.Cleanup(collector.Close)

	// A FAKE sidecar so the operation route resolves (the journey drives one operation to flush a span).
	sidecar := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"operation": "createOrder", "result": map[string]any{"id": "o-1"}, "events": []string{}})
	}))
	t.Cleanup(sidecar.Close)

	arts, br := EmitServerScaffold(checkoutSpec())
	if br != nil {
		t.Fatalf("EmitServerScaffold refused: %s", br.Explanation)
	}
	dir, err := os.MkdirTemp(root, "honoemit-otel-")
	if err != nil {
		t.Fatalf("mkdir temp under root: %v", err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	for _, base := range []string{"server.ts", "index.ts", "instrumentation.ts"} {
		write(t, filepath.Join(dir, base), scaffoldByPath(t, arts, base).Bytes)
	}

	// (1) WITH the endpoint set: boot, GET /healthz, drive one op (to flush a span), then assert the
	// collector received an export. (2) WITH no endpoint: boot must still come up (no-op, no crash).
	// The harness imports the EMITTED instrumentation.ts FIRST (as index.ts does), then createApp.
	harness := `
import "./instrumentation.ts";
import { createApp } from "./server.ts";
import { trace } from "@opentelemetry/api";
const baseUrl = process.env["INTERPRETER_URL"];
const interpret = async (operation, input, auth) => {
  const res = await fetch(` + "`${baseUrl}/interpret`" + `, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operation, input, auth: auth ?? {} }) });
  if (!res.ok) throw new Error("interpreter " + res.status);
  return res.json();
};
const app = createApp({ interpret, auth: (c) => ({ user: { id: "dev" } }) });
const out = {};
const health = await app.request("/healthz");
out.healthStatus = health.status;
const created = await app.request("/createorder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ total: 42 }) });
out.opStatus = created.status;
// The SDK instrumentation.ts started registers the GLOBAL tracer provider — proving it BOOTED, emit one
// explicit span; the batch processor (OTEL_BSP_SCHEDULE_DELAY lowered) flushes it to the OTLP collector.
const span = trace.getTracer("aidos-otel-probe").startSpan("boot-probe");
span.end();
// give the batch span processor a beat to flush to the collector.
await new Promise((r) => setTimeout(r, 1500));
process.stdout.write(JSON.stringify(out));
`
	write(t, filepath.Join(dir, "harness.ts"), []byte(harness))

	run := func(t *testing.T, withEndpoint bool) struct {
		HealthStatus int `json:"healthStatus"`
		OpStatus     int `json:"opStatus"`
	} {
		t.Helper()
		cmd := exec.Command(node, "--experimental-strip-types", "--no-warnings", filepath.Join(dir, "harness.ts"))
		cmd.Dir = root
		env := append(os.Environ(),
			"INTERPRETER_URL="+sidecar.URL,
			"OTEL_SERVICE_NAME=shop",
			// lower the batch span processor's schedule delay so the export flushes within the test's
			// wait window (deterministic — the standard OTel env knob, never a clock in the emitted code).
			"OTEL_BSP_SCHEDULE_DELAY=200",
			// the substrate URLs are PRESENT (the cabling) — readable, prêts à l'emploi.
			"REDIS_URL=redis://valkey-dev:6379",
			"NATS_URL=nats://nats:4222",
		)
		if withEndpoint {
			env = append(env, "OTEL_EXPORTER_OTLP_ENDPOINT="+collector.URL)
		}
		cmd.Env = env
		stdout, err := cmd.Output()
		if err != nil {
			if ee, ok := err.(*exec.ExitError); ok {
				t.Fatalf("emitted server failed to boot (withEndpoint=%v): %v\nstderr:\n%s", withEndpoint, err, ee.Stderr)
			}
			t.Fatalf("node run failed: %v", err)
		}
		var res struct {
			HealthStatus int `json:"healthStatus"`
			OpStatus     int `json:"opStatus"`
		}
		if err := json.Unmarshal(stdout, &res); err != nil {
			t.Fatalf("harness output not JSON: %v\nraw: %s", err, stdout)
		}
		return res
	}

	// (1) WITH the endpoint: boots, healthz green, op routes, and the collector saw at least one export.
	res := run(t, true)
	if res.HealthStatus != 200 {
		t.Fatalf("healthz not green with OTel enabled: %d", res.HealthStatus)
	}
	if res.OpStatus != 201 {
		t.Fatalf("operation route not 201 with OTel enabled: %d", res.OpStatus)
	}
	if atomic.LoadInt32(&gotSpan) == 0 {
		t.Fatalf("the emitted app did not export ANY telemetry to the OTLP collector (OTel did not boot)")
	}

	// (2) WITH no endpoint: the boot must STILL come up (the no-op path — OTel never crashes the server).
	resNoOTel := run(t, false)
	if resNoOTel.HealthStatus != 200 {
		t.Fatalf("server did not boot WITHOUT an OTLP endpoint (no-op path crashed): %d", resNoOTel.HealthStatus)
	}
}

// requireOTelDeps skips the boot fixture when the @opentelemetry/* packages are not installed under
// node_modules (the byte/structural mirrors above still run). The boot fixture needs the real SDK.
func requireOTelDeps(t *testing.T, root string) {
	t.Helper()
	for _, p := range []string{
		filepath.Join("@opentelemetry", "sdk-node"),
		filepath.Join("@opentelemetry", "exporter-trace-otlp-http"),
	} {
		if _, err := os.Stat(filepath.Join(root, "node_modules", p)); err != nil {
			t.Skipf("node_modules/%s absent — skipping the OTel boot fixture (structural mirrors still run)", p)
		}
	}
}
