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

// The boot env knob: the sidecar interpreter's base URL. The emitted index.ts reads it and POSTs
// every operation to ${INTERPRETER_URL}/interpret. Default points the Pulumi-wired sidecar container
// (<stack>-interpreter) by name — overridable per environment. Declared, never guessed.
const interpreterURLEnv = "INTERPRETER_URL"

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
	pkg := emitServerPackageJSON(s, sourceHash)
	dockerfile := emitServerDockerfile(sourceHash)

	dir := "gen/" + s.Project + "/server/"
	arts := []Artifact{
		server,
		artifact(dir+"Dockerfile", TargetHonoServer, dockerfile, sourceHash),
		artifact(dir+"index.ts", TargetHonoServer, index, sourceHash),
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
	b.WriteString("import { serve } from \"@hono/node-server\";\n")
	b.WriteString("import { createApp, type OperationInterpreter } from \"./server.ts\";\n\n")

	// createInterpreter — a PURE FACTORY of the OperationInterpreter port. It closes over the sidecar
	// base URL; every call POSTs {operation, input} to /interpret and returns the sidecar's result.
	b.WriteString("// createInterpreter builds the OperationInterpreter port over the Go sidecar's HTTP wire\n")
	b.WriteString("// contract (POST /interpret → { operation, result, events }). It re-implements no rule —\n")
	b.WriteString("// the sidecar (interpretsvc) runs operation.Interpret; this only forwards the command.\n")
	b.WriteString("function createInterpreter(baseUrl: string): OperationInterpreter {\n")
	b.WriteString("\treturn async (operation: string, input: unknown): Promise<unknown> => {\n")
	b.WriteString("\t\tconst res = await fetch(`${baseUrl}/interpret`, {\n")
	b.WriteString("\t\t\tmethod: \"POST\",\n")
	b.WriteString("\t\t\theaders: { \"content-type\": \"application/json\" },\n")
	b.WriteString("\t\t\tbody: JSON.stringify({ operation, input }),\n")
	b.WriteString("\t\t});\n")
	b.WriteString("\t\tif (!res.ok) {\n")
	b.WriteString("\t\t\tconst detail = await res.text();\n")
	b.WriteString("\t\t\tthrow new Error(`interpreter ${res.status}: ${detail}`);\n")
	b.WriteString("\t\t}\n")
	b.WriteString("\t\treturn res.json();\n")
	b.WriteString("\t};\n")
	b.WriteString("}\n\n")

	// The boot constants — the sidecar URL (env, with a localhost dev default) + the listen port.
	b.WriteString("// The sidecar base URL (the Pulumi stack points it at http://<stack>-interpreter:PORT) and the\n")
	b.WriteString("// listen port. Both are env-driven with deterministic dev defaults (no clock, no RNG).\n")
	b.WriteString("const interpreterUrl = process.env[" + jsStr(interpreterURLEnv) + "] ?? \"http://localhost:8080\";\n")
	b.WriteString("const port = Number(process.env.PORT ?? \"3000\");\n\n")

	// Build the app with the wired deps and serve it. createApp + createInterpreter are pure factories;
	// serve is the side-effecting boot (the gated gesture), exactly like the sidecar's ListenAndServe.
	b.WriteString("// Boot: build the app with the wired interpreter and serve it (the side-effecting entrypoint).\n")
	b.WriteString("const app = createApp({ interpret: createInterpreter(interpreterUrl) });\n")
	b.WriteString("serve({ fetch: app.fetch, port });\n")
	b.WriteString("console.log(`" + s.Project + " server listening on :${port} (interpreter ${interpreterUrl})`);\n")

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
	b.WriteString("\t\"dependencies\": {\n")
	b.WriteString("\t\t\"@hono/node-server\": " + jsStr(nodeServerVersion) + ",\n")
	b.WriteString("\t\t\"hono\": " + jsStr(honoVersion) + "\n")
	b.WriteString("\t}\n")
	b.WriteString("}\n")
	return []byte(b.String())
}

// emitServerDockerfile renders the node Dockerfile that boots the emitted Hono server: a multi-stage
// build (install deps with the lockless package.json, copy the emitted TS) then a slim runtime that
// runs `npm start` (node --experimental-strip-types index.ts). Deterministic — pinned base image,
// no clock; the source hash rides in a comment so the artifact stays content-addressed.
func emitServerDockerfile(sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("#", sourceHash))
	b.WriteString("# The emitted Hono server (ADR 0040): routes each operation to the Go sidecar interpreter.\n")
	b.WriteString("# It reads INTERPRETER_URL (the sidecar base URL) and PORT (default 3000). Below the line:\n")
	b.WriteString("# it writes NO Kernel truth — a runtime projection of the project's operations.\n\n")
	b.WriteString("# --- build ---\n")
	b.WriteString("FROM node:22-alpine AS build\n")
	b.WriteString("WORKDIR /app\n")
	b.WriteString("COPY package.json ./\n")
	b.WriteString("RUN npm install --omit=dev\n")
	b.WriteString("COPY server.ts index.ts ./\n\n")
	b.WriteString("# --- runtime ---\n")
	b.WriteString("FROM node:22-alpine\n")
	b.WriteString("WORKDIR /app\n")
	b.WriteString("COPY --from=build /app /app\n")
	b.WriteString("ENV PORT=3000\n")
	b.WriteString("EXPOSE 3000\n")
	b.WriteString("CMD [\"node\", \"--experimental-strip-types\", \"index.ts\"]\n")
	return []byte(b.String())
}
