package honoemit

// scaffold.go — LE SERVEUR HONO ÉMIS RUNNABLE (la clé de voûte côté serveur, ADR 0040).
//
// Intention (utilisatrice, 2026-06-14) : « déployer l'app ÉMISE DEPUIS LES SPECS, voie Hono/TS
// PROPRE — serveur Hono émis (operations→routes) + SIDECAR INTERPRÉTEUR Go (exécute les operations
// sur la DB) + postgres ». EmitServer (honoemit.go) rend DÉJÀ le server.ts pur (createApp(deps)) :
// une route POST par operation sync qui délègue à deps.interpret(opName, input). Mais createApp est
// une FABRIQUE pure — elle ne se BOOTE pas seule. Il manquait le SCAFFOLD bootable autour : le boot
// index.ts (qui câble deps.interpret sur le SIDECAR via fetch vers INTERPRETER_URL + sert via
// @hono/node-server), le package.json (hono + @hono/node-server), et le Dockerfile node.
//
// EmitServerScaffold(spec) → les artefacts du scaffold runnable, EN PLUS de server.ts (EmitServer) :
//
//   - server.ts   : le serveur pur (createApp(deps)) — RÉUTILISE EmitServer VERBATIM, jamais reforké ;
//   - index.ts    : le BOOT — import createApp, deps.interpret = fetch POST ${INTERPRETER_URL}/interpret
//                   {operation, input}, serve(createApp(deps), { port }). C'est ICI que le port
//                   OperationInterpreter d'ADR 0040 se RÉSOUT sur le sidecar HTTP (interpretsvc) ;
//   - package.json: les deps épinglées (hono + @hono/node-server) ;
//   - Dockerfile  : image node multi-stage (build → runtime) qui boote index.ts.
//
// DÉTERMINISME-FIRST (le mur, §2/§6/§8). EmitServerScaffold est une FONCTION PURE, TOTALE, byte-stable
// de Canonicalize(spec) — aucune horloge, aucun RNG, ordre canonique, "\n" newlines, versions épinglées
// (le miroir de reproductibilité, scaffold_test.go, le scelle). Le boot index.ts est FN02-pur : la
// dépendance (interpret) est construite DANS une fonction, jamais une mutable de portée module. L'émetteur
// n'écrit AUCUNE vérité (une projection below-the-line, gen/<project>/server/…) ; un spec malformé est un
// BlockReason typé (la forme S13), jamais un render partiel — exactement comme EmitServer.

import (
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// The pinned dependency versions the boot scaffold ships. Pinned (no resolver, no clock) so the
// emitted package.json is byte-stable + content-addressed. They match the repo's node_modules (the
// boot fixture resolves the emitted `import { Hono } from "hono"` upward against them).
const (
	honoVersion       = "^4.12.0"
	nodeServerVersion = "^1.19.0"
)

// The pinned OpenTelemetry (JS/TS SDK — ADR 0040, never Go) deps the emitted app ships SO IT EMITS
// TELEMETRY BY DEFAULT (the utilisatrice's « tout ça par défaut dans les spec »). The HTTP exporter
// (over @opentelemetry/exporter-trace-otlp-http, port 4318) targets the shared OpenTelemetry Collector
// the instance already runs (http://opentelemetry-collector:4318). Pinned (no resolver, no clock) so
// the emitted package.json stays byte-stable + content-addressed. The package set mirrors the DP17
// observabilityfragments declaration (the HTTP exporter, since the substrate's collector listens on the
// OTLP/HTTP port 4318). Extending the set is an addendum + a /goal.
const (
	otelSDKVersion            = "^0.205.0" // @opentelemetry/sdk-node
	otelAutoInstrumentVersion = "^0.62.0"  // @opentelemetry/auto-instrumentations-node
	otelExporterHTTPVersion   = "^0.205.0" // @opentelemetry/exporter-trace-otlp-http
	otelResourcesVersion      = "^2.0.0"   // @opentelemetry/resources (the service.name resource)
	otelSemConvVersion        = "^1.30.0"  // @opentelemetry/semantic-conventions (ATTR_SERVICE_NAME)
)

// The OTel boot env knob: the OTLP/HTTP endpoint the emitted app exports its traces to. The instance's
// shared OpenTelemetry Collector listens on http://opentelemetry-collector:4318 — the Pulumi stack points
// this var there per env. When ABSENT the instrumentation is a SILENT NO-OP (never a crash) — a bare run
// (no collector) still boots. Declared, never guessed.
const otelEndpointEnv = "OTEL_EXPORTER_OTLP_ENDPOINT"

// The substrate cabling env knobs the boot reads so the cache/bus are PRESENT + ready to use: REDIS_URL
// points the shared Valkey cache (redis://valkey-<env>:6379), NATS_URL the shared NATS bus
// (nats://nats:4222). The boot only READS + logs them (no forced redis/nats lib) — the env is present and
// the app picks it up when it needs the cache/bus. Declared, never guessed.
const (
	redisURLEnv = "REDIS_URL"
	natsURLEnv  = "NATS_URL"
)

// The boot env knob: the sidecar interpreter's base URL. The emitted index.ts reads it and POSTs
// every operation to ${INTERPRETER_URL}/interpret. Default points the Pulumi-wired sidecar container
// (<stack>-interpreter) by name — overridable per environment. Declared, never guessed.
const interpreterURLEnv = "INTERPRETER_URL"

// The caller-identity request header the boot reads to build $.auth. A trusted upstream (the gateway /
// Traefik forward-auth) sets X-Aidos-User to the authenticated user id; the boot maps it into the
// conventional shape {user:{id:<header>}} the operations resolve ($.auth.user.id). When the header is
// absent the boot uses the DETERMINISTIC dev identity (devUserID) — never a clock, never an RNG, so the
// emitted boot stays a pure function of the request. The route invents no authentication scheme; it only
// forwards the identity an upstream already established (or the dev default in a bare deployment).
const (
	authHeader = "x-aidos-user"
	devUserID  = "dev"
)

// EmitServerScaffold renders the BOOTABLE Hono server scaffold for the project, IN ADDITION to the
// pure server.ts (EmitServer): server.ts (reused verbatim), the boot index.ts (wires deps.interpret
// on the sidecar via fetch + serves via @hono/node-server), package.json (hono + @hono/node-server),
// and the node Dockerfile. The artifacts come back in a FIXED, path-sorted order so the slice is
// byte-stable. A malformed spec is a typed BlockReason (the honesty rule), never a partial render.
func EmitServerScaffold(s ServerSpec) ([]Artifact, *blockreason.BlockReason) {
	// server.ts — the pure server, reused verbatim (no fork). Its validation owns the boundary:
	// a malformed spec is refused here, so the scaffold never lands an orphan boot.
	server, br := EmitServer(s)
	if br != nil {
		return nil, br
	}
	sourceHash := server.SourceHash // the scaffold shares the server's content address (same source).

	index := emitBootIndex(s, sourceHash)
	instrumentation := emitInstrumentation(s, sourceHash)
	pkg := emitServerPackageJSON(s, sourceHash)
	dockerfile := emitServerDockerfile(s, sourceHash)

	dir := "gen/" + s.Project + "/server/"
	arts := []Artifact{
		server,
		artifact(dir+"Dockerfile", TargetHonoServer, dockerfile, sourceHash),
		artifact(dir+"index.ts", TargetHonoServer, index, sourceHash),
		artifact(dir+"instrumentation.ts", TargetHonoServer, instrumentation, sourceHash),
		artifact(dir+"package.json", TargetHonoServer, pkg, sourceHash),
	}
	sortArtifacts(arts)
	return arts, nil
}

// emitBootIndex renders the BOOT entrypoint (index.ts): it imports createApp from ./server.ts, builds
// the OperationInterpreter as a fetch POST to ${INTERPRETER_URL}/interpret {operation, input}, and
// serves the app via @hono/node-server. FN02-pure: the interpret callback is built inside a function
// (createInterpreter), never a module-scope mutable binding; the only top-level bindings are `const`.
// The handler RE-IMPLEMENTS NO RULE — it forwards the command to the Go sidecar (ADR 0040 Déc.7).
func emitBootIndex(s ServerSpec, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// S87 emitted app server BOOT (Hono/functional TS, ADR 0040). Wires deps.interpret onto the\n")
	b.WriteString("// Go sidecar interpreter (POST ${INTERPRETER_URL}/interpret) and serves via @hono/node-server.\n\n")
	// TELEMETRY FIRST (the side-effecting import): instrumentation.ts starts the OTel NodeSDK BEFORE any
	// other module loads, so the auto-instrumentation patches http/fetch before the server registers its
	// routes. That is how the app EMITS TELEMETRY BY DEFAULT — endpoint absent → a silent no-op (it boots).
	b.WriteString("// Telemetry FIRST: start OpenTelemetry before anything else so auto-instrumentation wraps http/fetch.\n")
	b.WriteString("import \"./instrumentation.ts\";\n")
	b.WriteString("import { serve } from \"@hono/node-server\";\n")
	b.WriteString("import type { Context } from \"hono\";\n")
	// The EntityLister type is imported only when the server serves a view (it has entity read routes);
	// a pure API server stays import-clean (the no-fork guarantee — same bytes it always emitted).
	if len(s.Entities) > 0 {
		b.WriteString("import { createApp, type OperationInterpreter, type EntityLister } from \"./server.ts\";\n")
	} else {
		b.WriteString("import { createApp, type OperationInterpreter } from \"./server.ts\";\n")
	}
	// When the server SERVES the view, server.ts mounts the static React build via @hono/node-server's
	// serve-static (resolved relative to the process CWD, i.e. /app/web/dist in the image). The boot
	// notes the dependency so the served-view wiring is visible at the entrypoint (no extra import — the
	// middleware lives in createApp, where the routes are registered in order).
	if s.WebDir != "" {
		fmt.Fprintf(&b, "// SERVES THE VIEW: server.ts mounts the React build (@hono/node-server/serve-static) from %s\n", jsStr(s.WebDir))
		b.WriteString("// (the built dist/ copied into the image). GET / returns the SPA shell; the API routes win first.\n")
	}
	b.WriteString("\n")

	// authFromRequest — the PURE deriver of the caller identity from the request, INJECTED into createApp
	// (deps.auth) so it runs in server.ts's first middleware (before every route, where c.get("auth")
	// resolves). It reads the trusted X-Aidos-User header (set by the upstream gateway / Traefik forward-
	// auth) and maps it into the conventional {user:{id}} shape the operations resolve ($.auth.user.id).
	// Absent header → the DETERMINISTIC dev identity (no clock, no RNG): the boot is a pure function of the
	// request, and a bare deployment (no gateway) still resolves $.auth without a 500. It invents no auth
	// scheme — it only forwards an already-established identity (or the dev default).
	b.WriteString("// authFromRequest derives the caller identity ($.auth) from the request: it reads the trusted\n")
	b.WriteString("// X-Aidos-User header an upstream gateway sets and shapes it into { user: { id } }. Absent →\n")
	b.WriteString("// the deterministic dev identity (no clock, no RNG). It is injected into createApp (deps.auth).\n")
	b.WriteString("function authFromRequest(c: Context): { user: { id: string } } {\n")
	b.WriteString("\tconst id = c.req.header(" + jsStr(authHeader) + ") ?? " + jsStr(devUserID) + ";\n")
	b.WriteString("\treturn { user: { id } };\n")
	b.WriteString("}\n\n")

	// createInterpreter — a PURE FACTORY of the OperationInterpreter port. It closes over the sidecar
	// base URL; every call POSTs {operation, input} to /interpret and returns the sidecar's result.
	b.WriteString("// createInterpreter builds the OperationInterpreter port over the Go sidecar's HTTP wire\n")
	b.WriteString("// contract (POST /interpret → { operation, result, events }). It re-implements no rule —\n")
	b.WriteString("// the sidecar (interpretsvc) runs operation.Interpret; this only forwards the command.\n")
	b.WriteString("function createInterpreter(baseUrl: string): OperationInterpreter {\n")
	b.WriteString("\treturn async (operation: string, input: unknown, auth?: unknown): Promise<unknown> => {\n")
	b.WriteString("\t\tconst res = await fetch(`${baseUrl}/interpret`, {\n")
	b.WriteString("\t\t\tmethod: \"POST\",\n")
	b.WriteString("\t\t\theaders: { \"content-type\": \"application/json\" },\n")
	b.WriteString("\t\t\tbody: JSON.stringify({ operation, input, auth: auth ?? {} }),\n")
	b.WriteString("\t\t});\n")
	b.WriteString("\t\tif (!res.ok) {\n")
	b.WriteString("\t\t\tconst detail = await res.text();\n")
	b.WriteString("\t\t\tthrow new Error(`interpreter ${res.status}: ${detail}`);\n")
	b.WriteString("\t\t}\n")
	b.WriteString("\t\treturn res.json();\n")
	b.WriteString("\t};\n")
	b.WriteString("}\n\n")

	// createLister — a PURE FACTORY of the EntityLister port over the sidecar's READ-ONLY list verb
	// (GET ${baseUrl}/list?entity=<e> → { rows: [...] }). The served view's GET /entities/<e> route
	// delegates to it; it re-implements no query — the Go sidecar (interpretsvc.List) runs the scoped
	// SELECT, this only forwards the entity name and unwraps the rows envelope. Emitted ONLY when the
	// server serves a view (it has entity read routes) — a pure API server stays clean (no-fork).
	if len(s.Entities) > 0 {
		b.WriteString("// createLister builds the EntityLister port over the Go sidecar's read verb\n")
		b.WriteString("// (GET /list?entity=<e> → { rows: [...] }). It re-implements no query — the sidecar\n")
		b.WriteString("// (interpretsvc.List) runs the scoped SELECT; this forwards the entity + unwraps the rows.\n")
		b.WriteString("function createLister(baseUrl: string): EntityLister {\n")
		b.WriteString("\treturn async (entity: string): Promise<unknown[]> => {\n")
		b.WriteString("\t\tconst res = await fetch(`${baseUrl}/list?entity=${encodeURIComponent(entity)}`);\n")
		b.WriteString("\t\tif (!res.ok) {\n")
		b.WriteString("\t\t\tconst detail = await res.text();\n")
		b.WriteString("\t\t\tthrow new Error(`lister ${res.status}: ${detail}`);\n")
		b.WriteString("\t\t}\n")
		b.WriteString("\t\tconst body = (await res.json()) as { rows?: unknown[] };\n")
		b.WriteString("\t\treturn body.rows ?? [];\n")
		b.WriteString("\t};\n")
		b.WriteString("}\n\n")
	}

	// The boot constants — the sidecar URL (env, with a localhost dev default) + the listen port.
	b.WriteString("// The sidecar base URL (the Pulumi stack points it at http://<stack>-interpreter:PORT) and the\n")
	b.WriteString("// listen port. Both are env-driven with deterministic dev defaults (no clock, no RNG).\n")
	b.WriteString("const interpreterUrl = process.env[" + jsStr(interpreterURLEnv) + "] ?? \"http://localhost:8080\";\n")
	b.WriteString("const port = Number(process.env.PORT ?? \"3000\");\n")
	// THE SUBSTRATE CABLING: the shared cache (Valkey) + bus (NATS) URLs are PRESENT, ready to use. The
	// boot only READS them (no forced redis/nats lib) — the env is wired by the Pulumi stack
	// (redis://valkey-<env>:6379, nats://nats:4222), so the app picks them up the moment it needs them.
	b.WriteString("// The shared substrate: the cache (Valkey) + bus (NATS) URLs, wired by the Pulumi stack. Read here\n")
	b.WriteString("// so they are PRESENT + ready to use (no forced redis/nats lib) — the app picks them up when needed.\n")
	b.WriteString("const redisUrl = process.env[" + jsStr(redisURLEnv) + "] ?? \"\";\n")
	b.WriteString("const natsUrl = process.env[" + jsStr(natsURLEnv) + "] ?? \"\";\n\n")

	// Build the app with the wired interpreter, the entity LISTER (the read verb → GET /list?entity)
	// AND the injected auth deriver (the request-header → $.auth reader), then serve it. createApp +
	// createInterpreter + createLister + authFromRequest are pure factories/derivers; serve is the
	// side-effecting boot (the gated gesture), exactly like the sidecar's ListenAndServe. The deriver is
	// injected into createApp so it runs in the FIRST middleware (before every route) — a middleware
	// installed here, after the routes, would not wrap them (Hono registration order).
	b.WriteString("// Boot: build the app (wired interpreter + entity lister + the request-header auth deriver) and serve it.\n")
	if len(s.Entities) > 0 {
		b.WriteString("const app = createApp({ interpret: createInterpreter(interpreterUrl), list: createLister(interpreterUrl), auth: authFromRequest });\n")
	} else {
		b.WriteString("const app = createApp({ interpret: createInterpreter(interpreterUrl), auth: authFromRequest });\n")
	}
	b.WriteString("serve({ fetch: app.fetch, port });\n")
	// The startup line surfaces the wired substrate (interpreter + cache + bus) so the cabling is visible
	// in the logs — and it READS redisUrl/natsUrl so they are live bindings the app reuses, not dead env.
	b.WriteString("console.log(`" + s.Project + " server listening on :${port} (interpreter ${interpreterUrl}, cache ${redisUrl || \"none\"}, bus ${natsUrl || \"none\"})`);\n")

	return []byte(strings.TrimRight(b.String(), "\n") + "\n")
}

// emitInstrumentation renders the OpenTelemetry bootstrap module (instrumentation.ts) the emitted app
// imports FIRST (before any other module) so the auto-instrumentation wraps http/fetch before the routes
// register — that is how the app EMITS TELEMETRY BY DEFAULT (the utilisatrice's intention). It is a PURE
// projection of the project (service.name = the project namespace). The OTLP/HTTP exporter reads
// OTEL_EXPORTER_OTLP_ENDPOINT (the shared OpenTelemetry Collector, http://opentelemetry-collector:4318):
//   - endpoint SET   → the NodeSDK starts, traces flow to the collector ;
//   - endpoint ABSENT → a SILENT NO-OP (the SDK never starts), the server boots anyway — OTel must NEVER
//     crash the app (a bare run without a collector still comes up).
//
// FN02-pure: the SDK is built + started INSIDE a function (startTelemetry), invoked once at import; the
// only top-level bindings are `const`. The whole start is wrapped in try/catch so an init fault degrades
// to a logged no-op, never an unhandled crash.
func emitInstrumentation(s ServerSpec, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// S87 emitted app OTEL INSTRUMENTATION (ADR 0040 — JS/TS OTel SDK, never Go). Imported FIRST by\n")
	b.WriteString("// index.ts so the auto-instrumentation wraps http/fetch before the routes register. The app emits\n")
	b.WriteString("// traces BY DEFAULT to the shared OpenTelemetry Collector (OTEL_EXPORTER_OTLP_ENDPOINT, OTLP/HTTP\n")
	b.WriteString("// :4318). Endpoint absent → a SILENT no-op; OTel never crashes the server (a bare run still boots).\n\n")
	// ESM auto-instrumentation needs the import-in-the-middle loader hook registered BEFORE the app's
	// module graph links — otherwise node:http (loaded via @hono/node-server) is already linked unpatched
	// and NO spans are produced. This module is --import'd first (Dockerfile CMD), so registering the hook
	// here patches every subsequent ESM import. import-in-the-middle ships with @opentelemetry/instrumentation.
	b.WriteString("import { register } from \"node:module\";\n")
	b.WriteString("register(\"import-in-the-middle/hook.mjs\", import.meta.url);\n\n")
	b.WriteString("import { NodeSDK } from \"@opentelemetry/sdk-node\";\n")
	b.WriteString("import { getNodeAutoInstrumentations } from \"@opentelemetry/auto-instrumentations-node\";\n")
	b.WriteString("import { OTLPTraceExporter } from \"@opentelemetry/exporter-trace-otlp-http\";\n")
	b.WriteString("import { resourceFromAttributes } from \"@opentelemetry/resources\";\n")
	b.WriteString("import { ATTR_SERVICE_NAME } from \"@opentelemetry/semantic-conventions\";\n\n")

	// The service name = the project (the app emits telemetry under its OWN name). The OTEL_SERVICE_NAME
	// env wins if an upstream sets it (the conventional override), defaulting to the emitted project — a
	// pure function of the spec + the request env, no clock, no RNG.
	b.WriteString("// service.name = the project (the app emits telemetry under its own name); OTEL_SERVICE_NAME\n")
	b.WriteString("// overrides it if an upstream sets the conventional env. The OTLP endpoint is the shared collector.\n")
	b.WriteString("const serviceName = process.env.OTEL_SERVICE_NAME ?? " + jsStr(s.Project) + ";\n")
	b.WriteString("const otlpEndpoint = process.env[" + jsStr(otelEndpointEnv) + "];\n\n")

	// startTelemetry — a PURE FACTORY/STARTER of the NodeSDK. Returns true when started (endpoint set),
	// false when it no-ops (endpoint absent). Wrapped in try/catch so an init fault degrades to a logged
	// no-op, never an unhandled crash. FN02: the SDK is constructed inside the function, never a module mut.
	b.WriteString("// startTelemetry builds + starts the NodeSDK when the OTLP endpoint is set; otherwise it is a\n")
	b.WriteString("// SILENT no-op (returns false). Any init fault is caught + logged — OTel never crashes the boot.\n")
	b.WriteString("function startTelemetry(): boolean {\n")
	b.WriteString("\tif (!otlpEndpoint) {\n")
	b.WriteString("\t\treturn false; // no collector wired — silent no-op, the server still boots.\n")
	b.WriteString("\t}\n")
	b.WriteString("\ttry {\n")
	b.WriteString("\t\tconst sdk = new NodeSDK({\n")
	b.WriteString("\t\t\tresource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),\n")
	b.WriteString("\t\t\ttraceExporter: new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }),\n")
	b.WriteString("\t\t\tinstrumentations: [getNodeAutoInstrumentations()],\n")
	b.WriteString("\t\t});\n")
	b.WriteString("\t\tsdk.start();\n")
	b.WriteString("\t\tprocess.on(\"SIGTERM\", () => { void sdk.shutdown(); });\n")
	b.WriteString("\t\treturn true;\n")
	b.WriteString("\t} catch (err) {\n")
	b.WriteString("\t\tconsole.error(`" + s.Project + " telemetry init failed (continuing without it):`, err);\n")
	b.WriteString("\t\treturn false;\n")
	b.WriteString("\t}\n")
	b.WriteString("}\n\n")

	// The diagnostic line goes to STDERR (console.error) — operational logs belong on stderr (12-factor),
	// leaving stdout for the app's own protocol/data. Telemetry on → the collector URL; off → the no-op note.
	b.WriteString("const telemetryStarted = startTelemetry();\n")
	b.WriteString("console.error(`" + s.Project + " telemetry ${telemetryStarted ? `→ ${otlpEndpoint}` : \"disabled (no OTEL_EXPORTER_OTLP_ENDPOINT)\"}`);\n")

	return []byte(strings.TrimRight(b.String(), "\n") + "\n")
}

// emitServerPackageJSON renders the boot scaffold's package.json: the project name, type=module (the
// emitted TS is ESM), the start script (node boots index.ts), and the pinned hono + @hono/node-server
// deps. Valid JSON (no comments) carrying the source hash as a _source field so it stays content-
// addressed. Pinned, deterministic versions (no resolver, no clock).
func emitServerPackageJSON(s ServerSpec, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString("{\n")
	b.WriteString("\t\"_aidos\": " + jsStr(protectedMarker) + ",\n")
	b.WriteString("\t\"_source\": " + jsStr(sourceHash) + ",\n")
	b.WriteString("\t\"name\": " + jsStr(s.Project+"-server") + ",\n")
	b.WriteString("\t\"private\": true,\n")
	b.WriteString("\t\"type\": \"module\",\n")
	b.WriteString("\t\"main\": \"index.ts\",\n")
	b.WriteString("\t\"scripts\": {\n")
	b.WriteString("\t\t\"start\": \"node --experimental-strip-types index.ts\"\n")
	b.WriteString("\t},\n")
	// Dependencies in STRICT alphabetical key order (byte-stable): the runtime (hono + node-server) plus
	// the OpenTelemetry SDK so the emitted app EMITS TELEMETRY BY DEFAULT. resources + semantic-conventions
	// back the service.name resource the instrumentation builds (every direct import is declared — honesty).
	b.WriteString("\t\"dependencies\": {\n")
	b.WriteString("\t\t\"@hono/node-server\": " + jsStr(nodeServerVersion) + ",\n")
	b.WriteString("\t\t\"@opentelemetry/auto-instrumentations-node\": " + jsStr(otelAutoInstrumentVersion) + ",\n")
	b.WriteString("\t\t\"@opentelemetry/exporter-trace-otlp-http\": " + jsStr(otelExporterHTTPVersion) + ",\n")
	b.WriteString("\t\t\"@opentelemetry/resources\": " + jsStr(otelResourcesVersion) + ",\n")
	b.WriteString("\t\t\"@opentelemetry/sdk-node\": " + jsStr(otelSDKVersion) + ",\n")
	b.WriteString("\t\t\"@opentelemetry/semantic-conventions\": " + jsStr(otelSemConvVersion) + ",\n")
	b.WriteString("\t\t\"hono\": " + jsStr(honoVersion) + "\n")
	b.WriteString("\t}\n")
	b.WriteString("}\n")
	return []byte(b.String())
}

// emitServerDockerfile renders the node Dockerfile that boots the emitted Hono server: a multi-stage
// build (install deps with the lockless package.json, copy the emitted TS) then a slim runtime that
// runs `npm start` (node --experimental-strip-types index.ts). Deterministic — pinned base image,
// no clock; the source hash rides in a comment so the artifact stays content-addressed.
//
// When the spec SERVES the view (WebDir set), an EXTRA `web` build stage runs `vite build` over the
// emitted React app (copied under web/ next to the server) and the runtime copies the built dist/ to
// web/dist — so the single server image serves BOTH the API and the React view from the same origin.
// A spec with no WebDir emits the SAME Dockerfile it always did (no web stage — the no-fork guarantee).
func emitServerDockerfile(s ServerSpec, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("#", sourceHash))
	b.WriteString("# The emitted Hono server (ADR 0040): routes each operation to the Go sidecar interpreter.\n")
	b.WriteString("# It reads INTERPRETER_URL (the sidecar base URL) and PORT (default 3000). Below the line:\n")
	b.WriteString("# it writes NO Kernel truth — a runtime projection of the project's operations.\n\n")

	if s.WebDir != "" {
		// --- web build: compile the emitted React view (EmitWebApp) to static dist/ ---
		b.WriteString("# --- web build: compile the emitted React view to static dist/ (vite build) ---\n")
		b.WriteString("FROM node:22-alpine AS web\n")
		b.WriteString("WORKDIR /web\n")
		b.WriteString("COPY web/package.json ./\n")
		b.WriteString("RUN npm install\n")
		b.WriteString("COPY web/ ./\n")
		b.WriteString("RUN npm run build\n\n")
	}

	b.WriteString("# --- build ---\n")
	b.WriteString("FROM node:22-alpine AS build\n")
	b.WriteString("WORKDIR /app\n")
	b.WriteString("COPY package.json ./\n")
	b.WriteString("RUN npm install --omit=dev\n")
	b.WriteString("COPY server.ts index.ts instrumentation.ts ./\n\n")
	b.WriteString("# --- runtime ---\n")
	b.WriteString("FROM node:22-alpine\n")
	b.WriteString("WORKDIR /app\n")
	b.WriteString("COPY --from=build /app /app\n")
	if s.WebDir != "" {
		// The built React view lands at web/dist — the path server.ts's serveStatic({ root: "./web/dist" })
		// resolves relative to the process CWD (/app). The view is served alongside the API.
		b.WriteString("COPY --from=web /web/dist /app/web/dist\n")
	}
	b.WriteString("ENV PORT=3000\n")
	b.WriteString("EXPOSE 3000\n")
	// --import ./instrumentation.ts loads the OTel SDK BEFORE the app's ESM graph links — in ESM the
	// whole graph is linked before any module body runs, so a top-of-index.ts `import` is too late to
	// patch node:http (already loaded via @hono/node-server). --import runs it first → http/fetch are
	// auto-instrumented → the app emits traces by default. (index.ts also imports it: same cached module.)
	b.WriteString("CMD [\"node\", \"--experimental-strip-types\", \"--import\", \"./instrumentation.ts\", \"index.ts\"]\n")
	return []byte(b.String())
}
