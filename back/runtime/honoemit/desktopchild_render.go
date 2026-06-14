package honoemit

// desktopchild_render.go — les renderers PURS de la vue DESKTOP (la moitié FORME du desktop child).
// Chaque renderer est une fonction pure de la MAÎTRE + le source hash — aucune horloge, aucun RNG,
// aucun map-order, aucun chemin absolu ; "\n" newlines — donc les octets sont reproductibles. La
// FORME est l'IDIOME DESKTOP (Electron), DISTINCT du web (table/page) et du mobile (FlatList) :
//
//   - main.js      : le main process Electron — BrowserWindow + app.whenReady + un MENU applicatif
//                    (Menu.buildFromTemplate) avec un item + un RACCOURCI (accelerator) par Action ;
//   - preload.js   : le pont sécurisé contextBridge ;
//   - renderer.tsx : des PANNEAUX multi-colonnes denses (grid-cols), un panneau par Section, une
//                    barre d'actions (un bouton par Action, POST /<operation>), l'Expr via le twin ;
//   - index.html   : le shell HTML du renderer (#root, tokens ADR 0010) ;
//   - package.json : electron + "main": "main.js" + le script start.
//
// L'émetteur re-implémente AUCUNE règle métier : sections + actions viennent de la MAÎTRE (dérivée
// de S35/S11) ; le twin Expr est le verbatim front. Le desktop ADAPTE la forme, il ne re-dérive rien.

import (
	"fmt"
	"strings"
)

// emitDesktopMain renders the Electron MAIN process: it creates the BrowserWindow, boots the app
// lifecycle (app.whenReady), wires window-all-closed/activate, and builds the APPLICATION MENU
// (Menu.buildFromTemplate) — one item per master Action, each with a keyboard ACCELERATOR, sending
// the bound operation to the renderer over the secure IPC channel. The menu + accelerators are the
// DESKTOP idiom (web/mobile have neither). The window title is the adaptation override (or the
// project name by default — the per-platform adaptation point made visible).
func emitDesktopMain(m MasterView, adapt DesktopAdaptation, sourceHash string) []byte {
	title := adapt.WindowTitle
	if title == "" {
		title = m.Project
	}

	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// Desktop child (Electron): the MAIN process. BrowserWindow + app lifecycle + the\n")
	b.WriteString("// APPLICATION MENU (one item + keyboard accelerator per master Action). The desktop idiom —\n")
	b.WriteString("// NOT the web view wrapped. Below the line: it writes NO Kernel truth (a runtime projection).\n")
	b.WriteString("const { app, BrowserWindow, Menu, ipcMain } = require(\"electron\");\n")
	b.WriteString("const path = require(\"node:path\");\n\n")

	b.WriteString("// The bound operations the menu exposes (one per master Action), each → POST /<operation>\n")
	b.WriteString("// against the live API. Declared at emit time so the desktop affordances are static + visible.\n")
	b.WriteString("const ACTIONS = [\n")
	for _, act := range m.Actions {
		if act.Invoke == "" {
			continue
		}
		fmt.Fprintf(&b, "\t{ invoke: %s, route: %s, label: %s, accelerator: %s },\n",
			jsStr(act.Invoke), jsStr(routeOf(act.Invoke)), jsStr(menuLabel(act)), jsStr(menuAccelerator(act)))
	}
	b.WriteString("];\n\n")

	b.WriteString("function createWindow() {\n")
	b.WriteString("\tconst win = new BrowserWindow({\n")
	fmt.Fprintf(&b, "\t\ttitle: %s,\n", jsStr(title))
	b.WriteString("\t\twidth: 1280,\n")
	b.WriteString("\t\theight: 800,\n")
	b.WriteString("\t\twebPreferences: {\n")
	b.WriteString("\t\t\tpreload: path.join(__dirname, \"preload.js\"),\n")
	b.WriteString("\t\t\tcontextIsolation: true,\n")
	b.WriteString("\t\t\tnodeIntegration: false,\n")
	b.WriteString("\t\t},\n")
	b.WriteString("\t});\n")
	b.WriteString("\tvoid win.loadFile(path.join(__dirname, \"index.html\"));\n")
	b.WriteString("\treturn win;\n")
	b.WriteString("}\n\n")

	// The application MENU — the desktop idiom. One submenu item per Action, each with a keyboard
	// accelerator, dispatching the bound operation to the renderer (which POSTs it to the live API).
	b.WriteString("// buildMenu — the application menu (the desktop idiom). One item + accelerator per Action,\n")
	b.WriteString("// each dispatches its bound operation to the renderer over IPC (the renderer POSTs the route).\n")
	b.WriteString("function buildMenu(win) {\n")
	b.WriteString("\tconst actionItems = ACTIONS.map((a) => ({\n")
	b.WriteString("\t\tlabel: a.label,\n")
	b.WriteString("\t\taccelerator: a.accelerator,\n")
	b.WriteString("\t\tclick: () => win.webContents.send(\"aidos:invoke\", a.invoke),\n")
	b.WriteString("\t}));\n")
	b.WriteString("\tconst template = [\n")
	b.WriteString("\t\t{ label: \"Application\", submenu: [{ role: \"quit\" }] },\n")
	b.WriteString("\t\t{ label: \"Actions\", submenu: actionItems },\n")
	b.WriteString("\t\t{ label: \"Affichage\", submenu: [{ role: \"reload\" }, { role: \"toggleDevTools\" }] },\n")
	b.WriteString("\t];\n")
	b.WriteString("\tMenu.setApplicationMenu(Menu.buildFromTemplate(template));\n")
	b.WriteString("}\n\n")

	b.WriteString("app.whenReady().then(() => {\n")
	b.WriteString("\tconst win = createWindow();\n")
	b.WriteString("\tbuildMenu(win);\n")
	b.WriteString("\tipcMain.handle(\"aidos:actions\", () => ACTIONS);\n")
	b.WriteString("\tapp.on(\"activate\", () => {\n")
	b.WriteString("\t\tif (BrowserWindow.getAllWindows().length === 0) buildMenu(createWindow());\n")
	b.WriteString("\t});\n")
	b.WriteString("});\n\n")
	b.WriteString("app.on(\"window-all-closed\", () => {\n")
	b.WriteString("\tif (process.platform !== \"darwin\") app.quit();\n")
	b.WriteString("});\n")

	return []byte(strings.TrimRight(b.String(), "\n") + "\n")
}

// emitDesktopPreload renders the secure preload: it exposes (over contextBridge) the bound action
// list + an onInvoke subscription (the menu → renderer channel) to the renderer's isolated world,
// without leaking Node. The contextBridge is the Electron security idiom (no nodeIntegration).
func emitDesktopPreload(sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// Desktop child (Electron): the secure PRELOAD. Exposes the bound action list + the menu→\n")
	b.WriteString("// renderer invoke channel over contextBridge (no nodeIntegration — the Electron security idiom).\n")
	b.WriteString("const { contextBridge, ipcRenderer } = require(\"electron\");\n\n")
	b.WriteString("contextBridge.exposeInMainWorld(\"aidos\", {\n")
	b.WriteString("\tactions: () => ipcRenderer.invoke(\"aidos:actions\"),\n")
	b.WriteString("\tonInvoke: (cb) => {\n")
	b.WriteString("\t\tconst handler = (_e, invoke) => cb(invoke);\n")
	b.WriteString("\t\tipcRenderer.on(\"aidos:invoke\", handler);\n")
	b.WriteString("\t\treturn () => ipcRenderer.removeListener(\"aidos:invoke\", handler);\n")
	b.WriteString("\t},\n")
	b.WriteString("});\n")
	return []byte(strings.TrimRight(b.String(), "\n") + "\n")
}

// emitDesktopIndexHTML renders the renderer's HTML shell: a #root mount, the design tokens (ADR
// 0010 via the Tailwind CDN), and the module entry (renderer.tsx). Loaded by main.js via loadFile.
func emitDesktopIndexHTML(m MasterView, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString("<!doctype html>\n")
	fmt.Fprintf(&b, "<!-- %s. source: %s -->\n", protectedMarker, sourceHash)
	b.WriteString("<html lang=\"fr\">\n")
	b.WriteString("\t<head>\n")
	b.WriteString("\t\t<meta charset=\"utf-8\" />\n")
	b.WriteString("\t\t<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self' 'unsafe-inline' https:; connect-src *\" />\n")
	fmt.Fprintf(&b, "\t\t<title>%s — bureau</title>\n", m.Project)
	b.WriteString("\t\t<script src=\"https://cdn.tailwindcss.com\"></script>\n")
	b.WriteString("\t</head>\n")
	b.WriteString("\t<body class=\"bg-background text-foreground\">\n")
	b.WriteString("\t\t<div id=\"root\"></div>\n")
	b.WriteString("\t\t<script type=\"module\" src=\"./renderer.tsx\"></script>\n")
	b.WriteString("\t</body>\n")
	b.WriteString("</html>\n")
	return []byte(b.String())
}

// emitDesktopRenderer renders the DESKTOP VIEW: a MULTI-COLUMN PANEL grid (grid-cols), one dense
// panel per master Section (a table whose columns are the section's fields in source order, rows
// fetched GET /entities/<entity>), and an ACTION BAR with one button per master Action that POSTs
// /<operation> to the live API, evaluating the Expr client-side via the twin (evalState). The menu's
// invoke channel (window.aidos.onInvoke) triggers the SAME actions — the keyboard/menu affordance.
// This is the desktop idiom — NOT the web single-column page, NOT the mobile FlatList screen.
func emitDesktopRenderer(m MasterView, sourceHash string, overrides []ScreenOverride) []byte {
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// Desktop child (Electron): the RENDERER — the DESKTOP view. Multi-column dense PANELS (one\n")
	b.WriteString("// per master Section), an action bar (one button per master Action → POST /<operation>), the\n")
	b.WriteString("// Expr evaluated client-side via the twin (evalState). Distinct from the web page + mobile list.\n")
	b.WriteString(`import { StrictMode, useEffect, useState } from "react";` + "\n")
	b.WriteString(`import { createRoot } from "react-dom/client";` + "\n")
	b.WriteString(`import { evalState, type ExprNode } from "./aidos-expr";` + "\n\n")

	b.WriteString("type Row = Record<string, unknown>;\n\n")

	// The action descriptors — one per master Action: the bound operation, its live route, and the
	// canonicalised visible_when/enabled_when Expr (parsed to ExprNode and evaluated by the twin).
	b.WriteString("// The bound actions, one per master Action: the operation, its live route, and the\n")
	b.WriteString("// canonicalised visible_when/enabled_when Expr (the SAME frozen catalogue, evaluated by the twin).\n")
	b.WriteString("type DesktopAction = { invoke: string; route: string; control: string; visibleWhen: ExprNode | null; enabledWhen: ExprNode | null };\n")
	b.WriteString("const ACTIONS: DesktopAction[] = [\n")
	for _, act := range m.Actions {
		fmt.Fprintf(&b, "\t{ invoke: %s, route: %s, control: %s, visibleWhen: %s, enabledWhen: %s },\n",
			jsStr(act.Invoke), jsStr(routeOf(act.Invoke)), jsStr(act.Control),
			exprNodeLiteral(act.VisibleWhen), exprNodeLiteral(act.EnabledWhen))
	}
	b.WriteString("];\n\n")

	// The $-rooted situation the actions evaluate visible_when/enabled_when over (a deterministic
	// seed so the view renders out of the box; the real app feeds the live situation).
	b.WriteString("// The $-rooted situation the actions evaluate visible_when/enabled_when over (S11). A minimal\n")
	b.WriteString("// deterministic seed so the desktop view renders clickable actions; the real app feeds the live one.\n")
	b.WriteString("const given: Record<string, unknown> = { cart: { items: [{}] }, form: { valid: true }, submitting: false };\n\n")

	// postOperation — POST the bound operation to the live API (the SAME route EmitServer emits).
	b.WriteString("// postOperation POSTs the bound operation to the live API (POST /<operation>). Triggered both by\n")
	b.WriteString("// the action-bar button AND by the application menu (window.aidos.onInvoke) — the desktop idiom.\n")
	b.WriteString("async function postOperation(route: string): Promise<void> {\n")
	b.WriteString("\tconst res = await fetch(route, { method: \"POST\", headers: { \"content-type\": \"application/json\" }, body: \"{}\" });\n")
	b.WriteString("\tif (!res.ok) throw new Error(`operation ${route}: HTTP ${res.status}`);\n")
	b.WriteString("}\n\n")

	// The Panel component — one dense table per section, rows fetched from GET /entities/<entity>.
	b.WriteString("// Panel — one dense table per master Section: columns = the section's fields (source order),\n")
	b.WriteString("// rows fetched GET /entities/<entity> from the live API. The desktop panel (dense, multi-column).\n")
	b.WriteString("function Panel({ entity, route, fields }: { entity: string; route: string; fields: string[] }) {\n")
	b.WriteString("\tconst [rows, setRows] = useState<Row[]>([]);\n")
	b.WriteString("\tconst [error, setError] = useState<string | null>(null);\n")
	b.WriteString("\tuseEffect(() => {\n")
	b.WriteString("\t\tfetch(route)\n")
	b.WriteString("\t\t\t.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))\n")
	b.WriteString("\t\t\t.then((data) => setRows(Array.isArray(data) ? (data as Row[]) : []))\n")
	b.WriteString("\t\t\t.catch((e) => setError(String(e)));\n")
	b.WriteString("\t}, [route]);\n")
	b.WriteString("\treturn (\n")
	b.WriteString("\t\t<section data-aidos-panel={entity} className=\"flex flex-col rounded-lg border border-border bg-card\">\n")
	b.WriteString("\t\t\t<header className=\"border-b border-border px-3 py-2 text-sm font-semibold text-foreground\">{entity}</header>\n")
	b.WriteString("\t\t\t<div className=\"overflow-auto\">\n")
	b.WriteString("\t\t\t\t{error ? (\n")
	b.WriteString("\t\t\t\t\t<p className=\"p-3 text-sm text-destructive\">{error}</p>\n")
	b.WriteString("\t\t\t\t) : (\n")
	b.WriteString("\t\t\t\t\t<table className=\"w-full text-left text-xs text-muted-foreground\">\n")
	b.WriteString("\t\t\t\t\t\t<thead className=\"sticky top-0 bg-card text-[10px] uppercase\">\n")
	b.WriteString("\t\t\t\t\t\t\t<tr>\n")
	b.WriteString("\t\t\t\t\t\t\t\t{fields.map((f) => (\n")
	b.WriteString("\t\t\t\t\t\t\t\t\t<th key={f} data-aidos-col={f} className=\"px-2 py-1 font-medium\">{f}</th>\n")
	b.WriteString("\t\t\t\t\t\t\t\t))}\n")
	b.WriteString("\t\t\t\t\t\t\t</tr>\n")
	b.WriteString("\t\t\t\t\t\t</thead>\n")
	b.WriteString("\t\t\t\t\t\t<tbody>\n")
	b.WriteString("\t\t\t\t\t\t\t{rows.map((row, i) => (\n")
	b.WriteString("\t\t\t\t\t\t\t\t<tr key={i} className=\"border-t border-border/40\">\n")
	b.WriteString("\t\t\t\t\t\t\t\t\t{fields.map((f) => (\n")
	b.WriteString("\t\t\t\t\t\t\t\t\t\t<td key={f} className=\"px-2 py-1\">{String(row[f] ?? \"\")}</td>\n")
	b.WriteString("\t\t\t\t\t\t\t\t\t))}\n")
	b.WriteString("\t\t\t\t\t\t\t\t</tr>\n")
	b.WriteString("\t\t\t\t\t\t\t))}\n")
	b.WriteString("\t\t\t\t\t\t</tbody>\n")
	b.WriteString("\t\t\t\t\t</table>\n")
	b.WriteString("\t\t\t\t)}\n")
	b.WriteString("\t\t\t</div>\n")
	b.WriteString("\t\t</section>\n")
	b.WriteString("\t);\n")
	b.WriteString("}\n\n")

	// The ActionButton — evaluates the Expr client-side (evalState), POSTs the operation when enabled.
	b.WriteString("// ActionButton — one per master Action. Evaluates visible_when/enabled_when client-side via the\n")
	b.WriteString("// twin (evalState, the SAME semantics as the web/mobile children), POSTs the operation when enabled.\n")
	b.WriteString("function ActionButton({ action }: { action: DesktopAction }) {\n")
	b.WriteString("\tconst empty: ExprNode = { kind: \"lit\", value: true };\n")
	b.WriteString("\tconst state = evalState(action.visibleWhen ?? empty, action.enabledWhen ?? empty, given);\n")
	b.WriteString("\tif (!state.visible) return null;\n")
	b.WriteString("\treturn (\n")
	b.WriteString("\t\t<button\n")
	b.WriteString("\t\t\tdata-aidos-invoke={action.invoke}\n")
	b.WriteString("\t\t\tdisabled={!state.enabled}\n")
	b.WriteString("\t\t\tonClick={() => { void postOperation(action.route); }}\n")
	b.WriteString("\t\t\tclassName=\"rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50\"\n")
	b.WriteString("\t\t>\n")
	b.WriteString("\t\t\t{action.control}\n")
	b.WriteString("\t\t</button>\n")
	b.WriteString("\t);\n")
	b.WriteString("}\n\n")

	// The App — the desktop shell: an action toolbar + a MULTI-COLUMN panel grid. The menu's invoke
	// channel triggers the SAME postOperation (the keyboard/menu affordance, the desktop idiom).
	b.WriteString("// App — the desktop shell: a top action TOOLBAR + a MULTI-COLUMN dense PANEL grid (grid-cols).\n")
	b.WriteString("// The application menu (window.aidos.onInvoke) triggers the SAME operations — menu + shortcuts.\n")
	b.WriteString("function App() {\n")
	b.WriteString("\tuseEffect(() => {\n")
	b.WriteString("\t\tconst api = (window as unknown as { aidos?: { onInvoke?: (cb: (invoke: string) => void) => () => void } }).aidos;\n")
	b.WriteString("\t\tif (!api?.onInvoke) return;\n")
	b.WriteString("\t\treturn api.onInvoke((invoke) => {\n")
	b.WriteString("\t\t\tconst a = ACTIONS.find((x) => x.invoke === invoke);\n")
	b.WriteString("\t\t\tif (a) void postOperation(a.route);\n")
	b.WriteString("\t\t});\n")
	b.WriteString("\t}, []);\n")
	b.WriteString("\treturn (\n")
	b.WriteString("\t\t<div className=\"flex h-screen flex-col\">\n")
	b.WriteString("\t\t\t<header className=\"flex items-center gap-2 border-b border-border bg-card px-4 py-2\">\n")
	fmt.Fprintf(&b, "\t\t\t\t<h1 className=\"mr-auto text-sm font-semibold text-foreground\">%s</h1>\n", m.Project)
	// One ActionButton per master Action — the literal data-aidos-invoke marker is baked at the call
	// site (the deterministic per-action element); the ActionButton evaluates the Expr + POSTs.
	for i, act := range m.Actions {
		// The action coordinate styling (drift: invoke→action) lands on the deterministic per-action
		// <span data-aidos-invoke> wrapper. A nil/empty override yields "" → bytes unchanged (§9).
		actionClass := screenClassSuffix(overrides, actionCoord("", act.Control))
		if actionClass != "" {
			fmt.Fprintf(&b, "\t\t\t\t<span data-aidos-invoke=%s className=\"%s\">\n", jsStr(act.Invoke), classBody(actionClass))
		} else {
			fmt.Fprintf(&b, "\t\t\t\t<span data-aidos-invoke=%s>\n", jsStr(act.Invoke))
		}
		fmt.Fprintf(&b, "\t\t\t\t\t<ActionButton action={ACTIONS[%d]} />\n", i)
		b.WriteString("\t\t\t\t</span>\n")
	}
	b.WriteString("\t\t\t</header>\n")
	fmt.Fprintf(&b, "\t\t\t<main className=\"grid flex-1 gap-3 overflow-auto p-3 %s\">\n", desktopGridCols(len(m.Sections)))
	// One Panel per section — the literal data-aidos-panel marker is baked at the call site (the
	// deterministic per-section element), the Panel component carries the dense table + the fetch.
	for _, sec := range m.Sections {
		// The section coordinate styling (drift: panel→section) lands on the deterministic per-section
		// <div data-aidos-panel> wrapper. A nil/empty override yields "" → bytes unchanged (§9).
		sectionClass := screenClassSuffix(overrides, sectionCoord(sec.Entity))
		if sectionClass != "" {
			fmt.Fprintf(&b, "\t\t\t\t<div data-aidos-panel=%s className=\"%s\">\n", jsStr(sec.Entity), classBody(sectionClass))
		} else {
			fmt.Fprintf(&b, "\t\t\t\t<div data-aidos-panel=%s>\n", jsStr(sec.Entity))
		}
		fmt.Fprintf(&b, "\t\t\t\t\t<Panel entity=%s route=%s fields={%s} />\n",
			jsStr(desktopPanelTitle(sec)), jsStr(desktopEntityRoute(sec)), fieldsLiteral(sec.Fields))
		b.WriteString("\t\t\t\t</div>\n")
	}
	b.WriteString("\t\t\t</main>\n")
	b.WriteString("\t\t</div>\n")
	b.WriteString("\t);\n")
	b.WriteString("}\n\n")

	b.WriteString("const root = document.getElementById(\"root\");\n")
	b.WriteString("if (root) {\n")
	b.WriteString("\tcreateRoot(root).render(\n")
	b.WriteString("\t\t<StrictMode>\n")
	b.WriteString("\t\t\t<App />\n")
	b.WriteString("\t\t</StrictMode>,\n")
	b.WriteString("\t);\n")
	b.WriteString("}\n")

	return []byte(strings.TrimRight(b.String(), "\n") + "\n")
}

// emitDesktopPackageJSON renders the desktop app's package.json: electron (+ electron-builder), the
// "main": "main.js" entry, the start script (electron .). Valid JSON carrying the source hash as a
// _source field so it stays content-addressed. Pinned, deterministic versions (no resolver, no clock).
func emitDesktopPackageJSON(m MasterView, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString("{\n")
	b.WriteString("\t\"_aidos\": " + jsStr(protectedMarker) + ",\n")
	b.WriteString("\t\"_source\": " + jsStr(sourceHash) + ",\n")
	b.WriteString("\t\"name\": " + jsStr(m.Project+"-desktop") + ",\n")
	b.WriteString("\t\"private\": true,\n")
	b.WriteString("\t\"main\": \"main.js\",\n")
	b.WriteString("\t\"scripts\": {\n")
	b.WriteString("\t\t\"start\": \"electron .\",\n")
	b.WriteString("\t\t\"dist\": \"electron-builder\"\n")
	b.WriteString("\t},\n")
	b.WriteString("\t\"dependencies\": {\n")
	b.WriteString("\t\t\"react\": " + jsStr(reactVersion) + ",\n")
	b.WriteString("\t\t\"react-dom\": " + jsStr(reactDOMVersion) + "\n")
	b.WriteString("\t},\n")
	b.WriteString("\t\"devDependencies\": {\n")
	b.WriteString("\t\t\"electron\": " + jsStr(electronVersion) + ",\n")
	b.WriteString("\t\t\"electron-builder\": " + jsStr(electronBuilderVersion) + "\n")
	b.WriteString("\t}\n")
	b.WriteString("}\n")
	return []byte(b.String())
}

// exprNodeLiteral emits the canonicalised Expr JSON (a string already in the frozen JSON form) as a
// TS literal the renderer parses to an ExprNode. An empty Expr (the source pins no predicate) is the
// JS `null` (the renderer falls back to a lit-true — never a guessed visible button). The canonical
// JSON is emitted verbatim (it IS valid TS object syntax for the frozen catalogue), never re-typed.
func exprNodeLiteral(canon string) string {
	if strings.TrimSpace(canon) == "" {
		return "null"
	}
	// The canonical JSON is a valid TS expression (object/array/scalar). Wrap as a typed assertion so
	// the renderer reads it as an ExprNode without re-parsing at runtime.
	return "(" + canon + " as unknown as ExprNode)"
}

// fieldsLiteral renders a field-name slice as a TS string-array literal, in source order (the
// projection of the master section — never reordered, never invented).
func fieldsLiteral(fields []string) string {
	parts := make([]string, 0, len(fields))
	for _, f := range fields {
		parts = append(parts, jsStr(f))
	}
	return "[" + strings.Join(parts, ", ") + "]"
}

// desktopGridCols picks the dense panel grid column count for n sections (the desktop multi-column
// layout — distinct from the web single column). Deterministic: 1 section → 1 col, 2 → 2, ≥3 → 3
// (a dense desktop grid). It always emits a grid-cols-* class (the desktop idiom marker).
func desktopGridCols(n int) string {
	switch {
	case n <= 1:
		return "grid-cols-1"
	case n == 2:
		return "grid-cols-2"
	default:
		return "grid-cols-3"
	}
}

// menuLabel is the application-menu item label for an action (the control name — what the human
// reads in the menu). Trivial + total; the master pins it, the emitter never invents a label.
func menuLabel(act MasterAction) string {
	if act.Control != "" {
		return act.Control
	}
	return act.Invoke
}

// menuAccelerator assigns a deterministic keyboard shortcut to an action (CmdOrCtrl+<first letter of
// the invoke, uppercased>). Deterministic from the invoke name; the desktop idiom (web/mobile have no
// accelerators). A fallback "CmdOrCtrl+K" when the invoke is empty (never a missing accelerator).
func menuAccelerator(act MasterAction) string {
	src := act.Invoke
	if src == "" {
		src = act.Control
	}
	if src == "" {
		return "CmdOrCtrl+K"
	}
	return "CmdOrCtrl+" + strings.ToUpper(src[:1])
}
