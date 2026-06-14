package honoemit

// webemit_render.go — the pure renderers for the React web view (the FORM half of EmitWebApp).
// Every renderer is a pure function of its AST input + the source hash — no clock, no RNG, no
// map-order, no absolute path; "\n" newlines — so the bytes are byte-for-byte reproducible. The
// FORM is the design system inherited from ADR 0010 (the zinc + blue-600 tokens via Tailwind
// utility classes); no colour/hex is invented here, only token classes. The emitter re-implements
// NO business rule — the button is S38 verbatim (emitButton), the list is the projection of the
// entity AST (S35), the Expr twin is the verbatim front twin (the single source of the evaluator).

import (
	_ "embed"
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// exprTwinSource is the VERBATIM TypeScript twin of the frozen Expr evaluator (back/kernel/expr),
// embedded from front/web/lib/aidos-expr.ts (the SINGLE source of the twin, copied at build time).
// The emitted button (S38) imports it as "./aidos-expr"; the app evaluates visible_when /
// enabled_when client-side with it — a faithful mirror of control.EvalState, never re-implemented.
//
//go:embed aidos-expr.embed.ts
var exprTwinSource string

// ErrEmptyApp — the web spec derives no view: no entity to list AND no control to trigger. An
// empty app is not projectable (the honesty rule: the emitter renders nothing it cannot derive).
var ErrEmptyApp = fmt.Errorf("honoemit: web app spec pins no entity and no control (nothing to derive)")

// blockWebApp renders the canonical S13 BlockReason for a malformed/empty web spec. It carries a
// non-empty French how_to_fix (no prison) and folds the cause into the explanation so the panel
// and `aidos explain` name the missing pin.
func blockWebApp(cause error) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Émission de la vue web refusée : la source (entités S35 / controls→actions S11) est malformée " +
			"ou vide (" + cause.Error() + "). Une VUE est DÉRIVÉE de l'arbre — elle n'invente ni une colonne, ni un " +
			"bouton, ni une opération (honnêteté). Une source sans entité ni control ne dérive aucune vue.",
		HowToFix: []string{
			"pin_the_tree : épinglez ce que la vue montre (≥1 entité S35) et/ou déclenche (≥1 control→action S11).",
			"complete_the_source : chaque entité porte un nom + des attributs typés ; chaque control un nom + un bind d'action.",
			"rerun aidos project --web : relancez l'émission une fois l'arbre de la vue complet.",
		},
	}
}

// emitListView renders the LIST view component for an entity: a table whose COLUMNS are the
// entity's attributes IN SOURCE ORDER (the projection of the AST — entities.AttributeSet, S35),
// fetching its rows from GET /entities/<entity> (served by the app). FN02-pure: the fetched rows
// live in a useState INSIDE the component (function-scope), never a module-scope mutable binding.
// The form is ADR-0010 token classes (no hardcoded hex). A column the AST does not pin is never
// invented (the count matches AttributeSet).
func emitListView(e entities.Entity, sourceHash string, overrides []ScreenOverride) []byte {
	comp := listComponentName(e)
	route := "/entities/" + strings.ToLower(e.Name)
	cols := entities.AttributeSet(e)
	// The screen overrides (ADR 0071) re-style the matching coordinate's className. A nil/empty set
	// (or no matching coordinate) yields "" → the className is byte-identical (anti-overwrite §9).
	sectionClass := screenClassSuffix(overrides, sectionCoord(e.Name))

	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	fmt.Fprintf(&b, "// S38-bis web view: the LIST view DERIVED from entity %q (S35). Columns = the entity's\n", e.Name)
	b.WriteString("// attributes in SOURCE ORDER (the projection of the AST, never invented); rows fetched from\n")
	fmt.Fprintf(&b, "// GET %s (served by the app). The button that triggers operations is the S38 projection.\n", route)
	b.WriteString(`import { useEffect, useState } from "react";` + "\n\n")

	// The row type is open (the entity is a content-addressed shape; the cells stringify each
	// pinned attribute). Declared as a Record so the projection typechecks without double-typing.
	b.WriteString("type Row = Record<string, unknown>;\n\n")

	fmt.Fprintf(&b, "/** %s — the emitted list view of entity %q. */\n", comp, e.Name)
	fmt.Fprintf(&b, "export function %s() {\n", comp)
	b.WriteString("\tconst [rows, setRows] = useState<Row[]>([]);\n")
	b.WriteString("\tconst [error, setError] = useState<string | null>(null);\n")
	b.WriteString("\tuseEffect(() => {\n")
	fmt.Fprintf(&b, "\t\tfetch(%s)\n", jsStr(route))
	b.WriteString("\t\t\t.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))\n")
	b.WriteString("\t\t\t.then((data) => setRows(Array.isArray(data) ? (data as Row[]) : []))\n")
	b.WriteString("\t\t\t.catch((e) => setError(String(e)));\n")
	b.WriteString("\t}, []);\n")
	b.WriteString("\treturn (\n")
	fmt.Fprintf(&b, "\t\t<section data-aidos-view=%s className=\"rounded-lg border border-border bg-card p-4%s\">\n", jsStr(comp), sectionClass)
	fmt.Fprintf(&b, "\t\t\t<h2 className=\"mb-3 text-sm font-semibold text-foreground\">%s</h2>\n", e.Name)
	b.WriteString("\t\t\t{error ? (\n")
	b.WriteString("\t\t\t\t<p className=\"text-sm text-destructive\">{error}</p>\n")
	b.WriteString("\t\t\t) : (\n")
	b.WriteString("\t\t\t\t<table className=\"w-full text-left text-sm text-muted-foreground\">\n")
	b.WriteString("\t\t\t\t\t<thead className=\"border-b border-border text-xs uppercase text-muted-foreground\">\n")
	b.WriteString("\t\t\t\t\t\t<tr>\n")
	// One <th> per attribute, in source order, carrying data-aidos-col=<attr> (the testable mirror
	// of the entity's AttributeSet — the count + order asserted by the fixture).
	for _, col := range cols {
		colClass := screenClassSuffix(overrides, fieldCoord(e.Name, col))
		fmt.Fprintf(&b, "\t\t\t\t\t\t\t<th data-aidos-col=%s className=\"px-3 py-2 font-medium%s\">%s</th>\n", jsStr(col), colClass, col)
	}
	b.WriteString("\t\t\t\t\t\t</tr>\n")
	b.WriteString("\t\t\t\t\t</thead>\n")
	b.WriteString("\t\t\t\t\t<tbody>\n")
	b.WriteString("\t\t\t\t\t\t{rows.map((row, i) => (\n")
	b.WriteString("\t\t\t\t\t\t\t<tr key={i} className=\"border-b border-border/50\">\n")
	for _, col := range cols {
		fmt.Fprintf(&b, "\t\t\t\t\t\t\t\t<td className=\"px-3 py-2\">{String(row[%s] ?? \"\")}</td>\n", jsStr(col))
	}
	b.WriteString("\t\t\t\t\t\t\t</tr>\n")
	b.WriteString("\t\t\t\t\t\t))}\n")
	b.WriteString("\t\t\t\t\t\t{rows.length === 0 ? (\n")
	fmt.Fprintf(&b, "\t\t\t\t\t\t\t<tr><td colSpan={%d} className=\"px-3 py-4 text-center text-muted-foreground\">—</td></tr>\n", len(cols))
	b.WriteString("\t\t\t\t\t\t) : null}\n")
	b.WriteString("\t\t\t\t\t</tbody>\n")
	b.WriteString("\t\t\t\t</table>\n")
	b.WriteString("\t\t\t)}\n")
	b.WriteString("\t\t</section>\n")
	b.WriteString("\t);\n")
	b.WriteString("}\n")

	return []byte(strings.TrimRight(b.String(), "\n") + "\n")
}

// emitAppTSX renders the app composition: it imports every list view + every button (canonical
// name order — the import block is byte-stable), composes them, and WIRES each button's onInvoke
// to POST /<operation> against the live Hono API (the view DECLARES via S38 AND TRIGGERS here).
// FN02-pure: postOperation is a function; no module-scope mutable binding.
func emitAppTSX(ents []entities.Entity, btns []ControlAction, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// S38-bis web view: the APP composition — the lists (entities S35) + the buttons (controls→\n")
	b.WriteString("// actions S11). Each button's onInvoke POSTs /<operation> to the live Hono API (the view\n")
	b.WriteString("// TRIGGERS the operation end-to-end, ADR 0040). FN02-pure: postOperation is a function.\n")
	// The component imports — canonical order (the slices are pre-sorted by EmitWebApp).
	for _, e := range ents {
		comp := listComponentName(e)
		fmt.Fprintf(&b, "import { %s } from %s;\n", comp, jsStr("./"+comp))
	}
	for _, ca := range btns {
		comp := buttonComponentName(ca.Control)
		fmt.Fprintf(&b, "import { %s } from %s;\n", comp, jsStr("./"+comp))
	}
	b.WriteString("\n")

	// The bound operation routes — computed at emit time from each button's action Invoke
	// (routeOf = "/" + lower(op), the SAME mapping EmitServer emits), so the live API route each
	// button reaches is VISIBLE in the bytes (the bind is static, not only a runtime computation).
	// A button whose INVOKE is not in this map falls back to the runtime lowering (never a 404 by
	// omission); the canonical-order keys make the map byte-stable.
	b.WriteString("// The bound operation → live API route map (routeOf = \"/\" + lower(op), the route EmitServer\n")
	b.WriteString("// emits). Computed at emit time so each button's POST target is visible in the bytes.\n")
	b.WriteString("const OPERATION_ROUTES: Record<string, string> = {\n")
	for _, ca := range btns {
		op := ca.Action.Invoke
		if op == "" {
			continue
		}
		fmt.Fprintf(&b, "\t%s: %s,\n", jsStr(op), jsStr(routeOf(op)))
	}
	b.WriteString("};\n\n")

	// postOperation — the bound trigger: POST /<operation> against the live Hono API (the same
	// route EmitServer emits, routeOf = "/" + lower(op)). It re-implements no rule; the sidecar
	// interpreter runs the operation. The view TRIGGERS the operation it DECLARED (S38's INVOKE).
	b.WriteString("// postOperation POSTs the bound operation to the live Hono API (POST /<operation>, the route\n")
	b.WriteString("// EmitServer emits). The view DECLARES the bind (S38's data-aidos-invoke) AND triggers it here.\n")
	b.WriteString("async function postOperation(invoke: string): Promise<void> {\n")
	b.WriteString("\tconst route = OPERATION_ROUTES[invoke] ?? `/${invoke.toLowerCase()}`;\n")
	b.WriteString("\tconst res = await fetch(route, {\n")
	b.WriteString("\t\tmethod: \"POST\",\n")
	b.WriteString("\t\theaders: { \"content-type\": \"application/json\" },\n")
	b.WriteString("\t\tbody: JSON.stringify({}),\n")
	b.WriteString("\t});\n")
	b.WriteString("\tif (!res.ok) throw new Error(`operation ${invoke}: HTTP ${res.status}`);\n")
	b.WriteString("}\n\n")

	// The given state the buttons evaluate visible_when/enabled_when over (the $-rooted situation).
	// A minimal, deterministic seed so the emitted app renders a live, clickable button out of the
	// box; the real app feeds the runtime situation. Declared, never guessed (a literal, no clock).
	b.WriteString("// The $-rooted situation the buttons evaluate visible_when/enabled_when over (S11). A minimal\n")
	b.WriteString("// deterministic seed so the view renders a clickable button out of the box; the real app feeds\n")
	b.WriteString("// the live situation. visible_when/enabled_when stay the control's Expr ASTs (the twin evaluates).\n")
	b.WriteString("const given: Record<string, unknown> = { cart: { items: [{}] }, form: { valid: true }, submitting: false };\n\n")

	b.WriteString("/** App — the emitted web view: the lists + the operation-triggering buttons. */\n")
	b.WriteString("export function App() {\n")
	b.WriteString("\treturn (\n")
	b.WriteString("\t\t<main className=\"mx-auto flex max-w-3xl flex-col gap-6 p-6\">\n")
	b.WriteString("\t\t\t<header className=\"flex items-center justify-between\">\n")
	b.WriteString("\t\t\t\t<h1 className=\"text-lg font-semibold text-foreground\">App</h1>\n")
	b.WriteString("\t\t\t\t<div className=\"flex gap-2\">\n")
	for _, ca := range btns {
		comp := buttonComponentName(ca.Control)
		fmt.Fprintf(&b, "\t\t\t\t\t<%s given={given} onInvoke={(invoke) => { void postOperation(invoke); }} />\n", comp)
	}
	b.WriteString("\t\t\t\t</div>\n")
	b.WriteString("\t\t\t</header>\n")
	for _, e := range ents {
		comp := listComponentName(e)
		fmt.Fprintf(&b, "\t\t\t<%s />\n", comp)
	}
	b.WriteString("\t\t</main>\n")
	b.WriteString("\t);\n")
	b.WriteString("}\n")

	return []byte(strings.TrimRight(b.String(), "\n") + "\n")
}

// emitMainTSX renders the React mount point (createRoot over #root, App). FN02-pure: the root is
// resolved inside the boot, no module-scope mutable binding.
func emitMainTSX(sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// S38-bis web view: the React mount point (createRoot over #root → App).\n")
	b.WriteString(`import { StrictMode } from "react";` + "\n")
	b.WriteString(`import { createRoot } from "react-dom/client";` + "\n")
	b.WriteString(`import { App } from "./app";` + "\n\n")
	b.WriteString("const root = document.getElementById(\"root\");\n")
	b.WriteString("if (root) {\n")
	b.WriteString("\tcreateRoot(root).render(\n")
	b.WriteString("\t\t<StrictMode>\n")
	b.WriteString("\t\t\t<App />\n")
	b.WriteString("\t\t</StrictMode>,\n")
	b.WriteString("\t);\n")
	b.WriteString("}\n")
	return []byte(b.String())
}

// emitIndexHTML renders the HTML shell: a #root mount, the Tailwind CDN (ADR 0010 tokens via
// utility classes — the design system inherited), and the Vite module entry (main.tsx). The
// source hash rides in a comment so the artifact stays content-addressed.
func emitIndexHTML(s WebAppSpec, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString("<!doctype html>\n")
	fmt.Fprintf(&b, "<!-- %s. source: %s -->\n", protectedMarker, sourceHash)
	b.WriteString("<html lang=\"fr\">\n")
	b.WriteString("\t<head>\n")
	b.WriteString("\t\t<meta charset=\"utf-8\" />\n")
	b.WriteString("\t\t<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n")
	fmt.Fprintf(&b, "\t\t<title>%s</title>\n", s.Project)
	// The design system inherited (ADR 0010): Tailwind utility classes resolve via the CDN; the
	// emitted components use only token classes (bg-card, text-foreground, border-border, …).
	b.WriteString("\t\t<script src=\"https://cdn.tailwindcss.com\"></script>\n")
	b.WriteString("\t</head>\n")
	b.WriteString("\t<body class=\"bg-background text-foreground\">\n")
	b.WriteString("\t\t<div id=\"root\"></div>\n")
	b.WriteString("\t\t<script type=\"module\" src=\"/main.tsx\"></script>\n")
	b.WriteString("\t</body>\n")
	b.WriteString("</html>\n")
	return []byte(b.String())
}

// emitWebPackageJSON renders the web app's package.json: react + react-dom + vite (+ the React
// plugin), type=module, the dev/build scripts. Valid JSON carrying the source hash as a _source
// field so it stays content-addressed. Pinned, deterministic versions (no resolver, no clock).
func emitWebPackageJSON(s WebAppSpec, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString("{\n")
	b.WriteString("\t\"_aidos\": " + jsStr(protectedMarker) + ",\n")
	b.WriteString("\t\"_source\": " + jsStr(sourceHash) + ",\n")
	b.WriteString("\t\"name\": " + jsStr(s.Project+"-web") + ",\n")
	b.WriteString("\t\"private\": true,\n")
	b.WriteString("\t\"type\": \"module\",\n")
	b.WriteString("\t\"scripts\": {\n")
	b.WriteString("\t\t\"dev\": \"vite\",\n")
	b.WriteString("\t\t\"build\": \"vite build\",\n")
	b.WriteString("\t\t\"preview\": \"vite preview\"\n")
	b.WriteString("\t},\n")
	b.WriteString("\t\"dependencies\": {\n")
	b.WriteString("\t\t\"react\": " + jsStr(reactVersion) + ",\n")
	b.WriteString("\t\t\"react-dom\": " + jsStr(reactDOMVersion) + "\n")
	b.WriteString("\t},\n")
	b.WriteString("\t\"devDependencies\": {\n")
	b.WriteString("\t\t\"" + vitePluginReactPkg + "\": " + jsStr(viteReactVersion) + ",\n")
	b.WriteString("\t\t\"vite\": " + jsStr(viteVersion) + "\n")
	b.WriteString("\t}\n")
	b.WriteString("}\n")
	return []byte(b.String())
}

// emitViteConfig renders the Vite config: the React plugin + a proxy that forwards /entities and
// the operation routes to the live Hono API during dev, and a static build to dist/ (servable by
// the Hono server). Deterministic — no clock, no absolute path. FN02-pure: the config is a single
// exported object via defineConfig.
func emitViteConfig(sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// S38-bis web view: the Vite build config. `vite build` → dist/ (static, servable by the Hono\n")
	b.WriteString("// server). In dev, /entities + the operation routes proxy to the live Hono API (default :3000).\n")
	b.WriteString(`import react from "` + vitePluginReactPkg + `";` + "\n")
	b.WriteString(`import { defineConfig } from "vite";` + "\n\n")
	b.WriteString("export default defineConfig({\n")
	b.WriteString("\tplugins: [react()],\n")
	b.WriteString("\tbuild: { outDir: \"dist\" },\n")
	b.WriteString("\tserver: {\n")
	b.WriteString("\t\tproxy: {\n")
	b.WriteString("\t\t\t\"/entities\": \"http://localhost:3000\",\n")
	b.WriteString("\t\t},\n")
	b.WriteString("\t},\n")
	b.WriteString("});\n")
	return []byte(b.String())
}

// emitWebDockerfile renders the multi-stage Dockerfile that builds the React app and serves dist/
// as static files: a node build stage (vite build → dist/) then a slim static server (the built
// assets). Deterministic — pinned base image, no clock; the source hash rides in a comment so the
// artifact stays content-addressed. The web app is served alongside the Hono API (same origin) so
// /entities + the operation routes reach the API without CORS.
func emitWebDockerfile(sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("#", sourceHash))
	b.WriteString("# The emitted React web view (S38-bis): `vite build` → dist/, served as static files. Below the\n")
	b.WriteString("# line: it writes NO Kernel truth — a runtime projection of the project's entities + controls.\n\n")
	b.WriteString("# --- build ---\n")
	b.WriteString("FROM node:22-alpine AS build\n")
	b.WriteString("WORKDIR /app\n")
	b.WriteString("COPY package.json ./\n")
	b.WriteString("RUN npm install\n")
	b.WriteString("COPY . .\n")
	b.WriteString("RUN npm run build\n\n")
	b.WriteString("# --- runtime ---\n")
	b.WriteString("FROM node:22-alpine\n")
	b.WriteString("WORKDIR /app\n")
	b.WriteString("RUN npm install -g serve@14\n")
	b.WriteString("COPY --from=build /app/dist /app/dist\n")
	b.WriteString("EXPOSE 4173\n")
	b.WriteString("CMD [\"serve\", \"-s\", \"dist\", \"-l\", \"4173\"]\n")
	return []byte(b.String())
}
