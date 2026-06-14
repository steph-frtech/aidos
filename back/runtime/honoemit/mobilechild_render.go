package honoemit

// mobilechild_render.go — les renderers PURS de la vue Expo / React-Native (la moitié FORME du
// mobile child). Chaque renderer est une fonction pure de son entrée (la maître) + le source hash —
// aucune horloge, aucun RNG, aucun ordre de map, aucun chemin absolu ; "\n" newlines — donc les
// octets sont byte-pour-byte reproductibles. La FORME est l'IDIOME MOBILE : écrans tactiles
// (FlatList / View / Text / Pressable) + classes NativeWind (les tokens ADR 0010 que NativeWind
// compile), DISTINCT de la table/page web et des panneaux/menu desktop. L'émetteur ne re-render
// AUCUNE règle métier — les champs sont la projection de la Section (ordre source), l'Expr est le
// twin verbatim, l'invoke est l'opération de l'Action (verbatim, jamais inventée).

import (
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// blockMobileChild renders the canonical S13 BlockReason for an empty/malformed mobile-child master.
// It carries a non-empty French how_to_fix (no prison) and names the MOBILE target so the panel +
// `aidos explain` distinguish "the mobile child refused" from the web/desktop siblings.
func blockMobileChild(cause error) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Émission du MOBILE CHILD (Expo / React-Native) refusée : la vue MAÎTRE est vide ou malformée (" +
			cause.Error() + "). Le mobile child est une PROJECTION PURE de la maître — il n'invente ni un écran, ni " +
			"un Pressable, ni une opération (honnêteté, le mur §8). Une maître sans section ni action ne dérive aucun enfant.",
		HowToFix: []string{
			"pin_the_master : la vue MAÎTRE doit porter ≥1 section (entité S35) et/ou ≥1 action (control→action S11).",
			"emit_the_master_first : dérivez la maître via EmitMasterView(spec) avant le mobile child.",
			"rerun : relancez EmitMobileChild une fois la maître complète.",
		},
	}
}

// mobileSourceHash is the content address of (master ⊕ adaptation): the SourceHash every mobile
// artifact carries. Any change to the master (a new section, a new field, a new action, a changed
// Expr) OR the mobile override yields a new hash — so the mobile child is content-addressed, and a
// changed adaptation produces visibly distinct artifacts.
func mobileSourceHash(m MasterView, adapt MobileAdaptation) (string, error) {
	body := map[string]any{
		"master":     m,
		"adaptation": adapt,
		"target":     TargetMobileApp,
	}
	canon, err := records.Canonicalize(mustJSON(body))
	if err != nil {
		return "", fmt.Errorf("mobile source hash: %w", err)
	}
	return records.Hash(canon), nil
}

// emitExpoAppJSON renders the Expo manifest (app.json): the displayed name (the adaptation override
// or the project default), the slug, and the platform targets. Valid JSON carrying the source hash
// as a _source field so it stays content-addressed. Deterministic — no clock, no resolver.
func emitExpoAppJSON(m MasterView, adapt MobileAdaptation, sourceHash string) []byte {
	name := adapt.AppName
	if name == "" {
		name = m.Project
	}
	var b strings.Builder
	b.WriteString("{\n")
	b.WriteString("\t\"_aidos\": " + jsStr(protectedMarker) + ",\n")
	b.WriteString("\t\"_source\": " + jsStr(sourceHash) + ",\n")
	b.WriteString("\t\"expo\": {\n")
	b.WriteString("\t\t\"name\": " + jsStr(name) + ",\n")
	b.WriteString("\t\t\"slug\": " + jsStr(m.Project) + ",\n")
	b.WriteString("\t\t\"version\": \"1.0.0\",\n")
	b.WriteString("\t\t\"orientation\": \"portrait\",\n")
	b.WriteString("\t\t\"userInterfaceStyle\": \"automatic\",\n")
	b.WriteString("\t\t\"platforms\": [\"ios\", \"android\"],\n")
	b.WriteString("\t\t\"newArchEnabled\": true\n")
	b.WriteString("\t}\n")
	b.WriteString("}\n")
	return []byte(b.String())
}

// emitMobilePackageJSON renders the Expo app's package.json: expo + react + react-native + nativewind
// (+ the safe-area + screens deps), the Expo entry (expo/AppEntry via "main"), the dev/build scripts.
// Valid JSON carrying the source hash as a _source field. Pinned, deterministic versions.
func emitMobilePackageJSON(m MasterView, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString("{\n")
	b.WriteString("\t\"_aidos\": " + jsStr(protectedMarker) + ",\n")
	b.WriteString("\t\"_source\": " + jsStr(sourceHash) + ",\n")
	b.WriteString("\t\"name\": " + jsStr(m.Project+"-mobile") + ",\n")
	b.WriteString("\t\"private\": true,\n")
	b.WriteString("\t\"main\": \"index.js\",\n")
	b.WriteString("\t\"scripts\": {\n")
	b.WriteString("\t\t\"start\": \"expo start\",\n")
	b.WriteString("\t\t\"android\": \"expo start --android\",\n")
	b.WriteString("\t\t\"ios\": \"expo start --ios\"\n")
	b.WriteString("\t},\n")
	b.WriteString("\t\"dependencies\": {\n")
	b.WriteString("\t\t\"expo\": " + jsStr(expoVersion) + ",\n")
	b.WriteString("\t\t\"" + expoStatusBarPkg + "\": " + jsStr(expoStatusBarVer) + ",\n")
	b.WriteString("\t\t\"nativewind\": " + jsStr(nativeWindVersion) + ",\n")
	b.WriteString("\t\t\"react\": " + jsStr(reactVersion) + ",\n")
	b.WriteString("\t\t\"react-native\": " + jsStr(reactNativeVersion) + ",\n")
	b.WriteString("\t\t\"react-native-safe-area-context\": " + jsStr(rnSafeAreaVersion) + ",\n")
	b.WriteString("\t\t\"react-native-screens\": " + jsStr(rnScreensVersion) + "\n")
	b.WriteString("\t},\n")
	b.WriteString("\t\"devDependencies\": {\n")
	b.WriteString("\t\t\"tailwindcss\": \"^3.4.0\"\n")
	b.WriteString("\t}\n")
	b.WriteString("}\n")
	return []byte(b.String())
}

// emitExpoBabelConfig renders babel.config.js: the Expo preset + the NativeWind babel plugin (the RN
// build pipeline that compiles the className utility classes). FN02-pure: a single exported function.
func emitExpoBabelConfig(sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// The Expo / React-Native babel pipeline: the Expo preset + the NativeWind plugin (compiles the\n")
	b.WriteString("// className utility classes to RN styles). Below the line: a runtime projection, no Kernel truth.\n")
	b.WriteString("module.exports = function (api) {\n")
	b.WriteString("\tapi.cache(true);\n")
	b.WriteString("\treturn {\n")
	b.WriteString("\t\tpresets: [[\"babel-preset-expo\", { jsxImportSource: \"nativewind\" }], \"nativewind/babel\"],\n")
	b.WriteString("\t};\n")
	b.WriteString("};\n")
	return []byte(b.String())
}

// emitMobileGlobalCSS renders the Tailwind directives NativeWind compiles (the design system tokens
// inherited, ADR 0010 — the SAME utility classes the web view uses, here compiled for RN). No
// hardcoded hex; only the @tailwind directives.
func emitMobileGlobalCSS(sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("/* %s. source: %s */\n", protectedMarker, sourceHash))
	b.WriteString("@tailwind base;\n")
	b.WriteString("@tailwind components;\n")
	b.WriteString("@tailwind utilities;\n")
	return []byte(b.String())
}

// emitMobileList renders the FlatList SCREEN for a master section: a touch list (FlatList over rows
// fetched from GET /entities/<entity> via EXPO_PUBLIC_API_URL), each row a View with one Text per
// field IN SOURCE ORDER (the projection of the section, never invented). The form is NativeWind
// token classes (no hardcoded hex). FN02-pure: the rows live in a useState inside the component. The
// RN idiom (FlatList/View/Text), DISTINCT from the web <table>.
func emitMobileList(sec MasterSection, sourceHash string) []byte {
	comp := pascal(sec.Entity) + "List"
	route := "/entities/" + strings.ToLower(sec.Entity)
	fields := sec.Fields

	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	fmt.Fprintf(&b, "// Mobile child (Expo): the FlatList SCREEN DERIVED from master section %q. Fields = the section's\n", sec.Entity)
	b.WriteString("// fields in SOURCE ORDER (the projection of the master, never invented); rows fetched from\n")
	fmt.Fprintf(&b, "// GET %s via EXPO_PUBLIC_API_URL (the live Hono API). The touch idiom — NOT a web table.\n", route)
	b.WriteString(`import { useState } from "react";` + "\n")
	b.WriteString(`import { ActivityIndicator, FlatList, Text, View } from "react-native";` + "\n\n")

	// The API base, read from the Expo public env (EXPO_PUBLIC_* is inlined by the Expo bundler).
	b.WriteString("const API = process.env.EXPO_PUBLIC_API_URL ?? \"\";\n\n")

	b.WriteString("type Row = Record<string, unknown>;\n\n")
	fmt.Fprintf(&b, "/** %s — the emitted mobile list screen of section %q (FlatList). */\n", comp, sec.Entity)
	fmt.Fprintf(&b, "export function %s() {\n", comp)
	b.WriteString("\tconst [rows, setRows] = useState<Row[]>([]);\n")
	b.WriteString("\tconst [error, setError] = useState<string | null>(null);\n")
	b.WriteString("\tconst [loading, setLoading] = useState<boolean>(true);\n\n")
	b.WriteString("\tconst load = () => {\n")
	b.WriteString("\t\tsetLoading(true);\n")
	b.WriteString("\t\tsetError(null);\n")
	fmt.Fprintf(&b, "\t\tfetch(`${API}%s`)\n", route)
	b.WriteString("\t\t\t.then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))\n")
	b.WriteString("\t\t\t.then((data) => setRows(Array.isArray(data) ? (data as Row[]) : []))\n")
	b.WriteString("\t\t\t.catch((e) => setError(String(e)))\n")
	b.WriteString("\t\t\t.finally(() => setLoading(false));\n")
	b.WriteString("\t};\n\n")
	b.WriteString("\treturn (\n")
	fmt.Fprintf(&b, "\t\t<View data-aidos-screen=%s className=\"rounded-lg border border-border bg-card p-4\">\n", jsStr(comp))
	fmt.Fprintf(&b, "\t\t\t<Text className=\"mb-3 text-sm font-semibold text-foreground\">%s</Text>\n", sec.Entity)
	b.WriteString("\t\t\t{loading ? (\n")
	b.WriteString("\t\t\t\t<ActivityIndicator />\n")
	b.WriteString("\t\t\t) : error ? (\n")
	b.WriteString("\t\t\t\t<Text className=\"text-sm text-destructive\" onPress={load}>{error} (toucher pour réessayer)</Text>\n")
	b.WriteString("\t\t\t) : (\n")
	b.WriteString("\t\t\t\t<FlatList\n")
	b.WriteString("\t\t\t\t\tdata={rows}\n")
	b.WriteString("\t\t\t\t\tkeyExtractor={(_item, index) => String(index)}\n")
	b.WriteString("\t\t\t\t\tListEmptyComponent={<Text className=\"py-4 text-center text-muted-foreground\">—</Text>}\n")
	b.WriteString("\t\t\t\t\trenderItem={({ item }) => (\n")
	b.WriteString("\t\t\t\t\t\t<View className=\"flex flex-col gap-1 border-b border-border/50 py-2\">\n")
	// One Text row per field, in source order, carrying data-aidos-field=<field> (the testable mirror
	// of the section's fields — the count + order asserted by the fixture). NOT a <td>.
	for _, f := range fields {
		fmt.Fprintf(&b, "\t\t\t\t\t\t\t<View data-aidos-field=%s className=\"flex flex-row justify-between gap-2\">\n", jsStr(f))
		fmt.Fprintf(&b, "\t\t\t\t\t\t\t\t<Text className=\"text-xs uppercase text-muted-foreground\">%s</Text>\n", f)
		fmt.Fprintf(&b, "\t\t\t\t\t\t\t\t<Text className=\"text-sm text-foreground\">{String(item[%s] ?? \"\")}</Text>\n", jsStr(f))
		b.WriteString("\t\t\t\t\t\t\t</View>\n")
	}
	b.WriteString("\t\t\t\t\t\t</View>\n")
	b.WriteString("\t\t\t\t\t)}\n")
	b.WriteString("\t\t\t\t/>\n")
	b.WriteString("\t\t\t)}\n")
	b.WriteString("\t\t</View>\n")
	b.WriteString("\t);\n")
	b.WriteString("}\n")

	return []byte(strings.TrimRight(b.String(), "\n") + "\n")
}

// emitMobilePressable renders the Pressable for a master action: a touch button that evaluates the
// control's visible_when/enabled_when CLIENT-SIDE via the Expr twin (evalState — the SAME frozen
// catalogue the web/desktop use), shows only when visible, is touchable only when enabled, and calls
// onInvoke(<operation>) on press. The operation is the action's Invoke verbatim (never invented). The
// touch idiom (Pressable + NativeWind), DISTINCT from the web <button>.
func emitMobilePressable(act MasterAction, sourceHash string) []byte {
	comp := pascal(act.Control)
	vw := act.VisibleWhen
	if vw == "" {
		vw = "true"
	}
	ew := act.EnabledWhen
	if ew == "" {
		ew = "true"
	}

	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	fmt.Fprintf(&b, "// Mobile child (Expo): the Pressable DERIVED from master action %q. It evaluates visible_when/\n", act.Control)
	b.WriteString("// enabled_when CLIENT-SIDE via the Expr twin (evalState — the SAME frozen catalogue the web/desktop\n")
	fmt.Fprintf(&b, "// use) and calls onInvoke(%q) on press. The touch idiom — NOT a web <button>.\n", act.Invoke)
	b.WriteString(`import { Pressable, Text } from "react-native";` + "\n")
	b.WriteString(`import { evalState, type ExprNode } from "./aidos-expr";` + "\n\n")

	// The bound operation, verbatim from the action (never invented).
	fmt.Fprintf(&b, "const INVOKE = %s;\n", jsStr(act.Invoke))
	// The control's two predicates as canonical Expr AST JSON (the twin evaluates them — no rule re-typed).
	fmt.Fprintf(&b, "const VISIBLE_WHEN: ExprNode = %s;\n", vw)
	fmt.Fprintf(&b, "const ENABLED_WHEN: ExprNode = %s;\n\n", ew)

	fmt.Fprintf(&b, "/** %s — the emitted mobile action button (Pressable). */\n", comp)
	fmt.Fprintf(&b, "export function %s({ given, onInvoke }: { given: Record<string, unknown>; onInvoke: (invoke: string) => void }) {\n", comp)
	b.WriteString("\tconst state = evalState(VISIBLE_WHEN, ENABLED_WHEN, given);\n")
	b.WriteString("\tif (!state.visible) return null;\n")
	b.WriteString("\treturn (\n")
	fmt.Fprintf(&b, "\t\t<Pressable\n")
	fmt.Fprintf(&b, "\t\t\tdata-aidos-invoke=%s\n", jsStr(act.Invoke))
	b.WriteString("\t\t\taccessibilityRole=\"button\"\n")
	fmt.Fprintf(&b, "\t\t\taccessibilityLabel=%s\n", jsStr(comp))
	b.WriteString("\t\t\tdisabled={!state.enabled}\n")
	b.WriteString("\t\t\tonPress={() => { if (state.enabled) onInvoke(INVOKE); }}\n")
	b.WriteString("\t\t\tclassName={state.enabled ? \"rounded-md bg-primary px-4 py-2\" : \"rounded-md bg-muted px-4 py-2 opacity-50\"}\n")
	b.WriteString("\t\t>\n")
	fmt.Fprintf(&b, "\t\t\t<Text className=\"text-sm font-medium text-primary-foreground\">%s</Text>\n", comp)
	b.WriteString("\t\t</Pressable>\n")
	b.WriteString("\t);\n")
	b.WriteString("}\n")

	return []byte(strings.TrimRight(b.String(), "\n") + "\n")
}

// emitMobileApp renders the App composition: it imports every FlatList screen + every Pressable
// (canonical name order — the import block is byte-stable), composes them inside a SafeAreaView
// ScrollView (the touch shell), and WIRES each Pressable's onInvoke to POST /<operation> against the
// live Hono API via EXPO_PUBLIC_API_URL. FN02-pure: postOperation is a function.
func emitMobileApp(m MasterView, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// Mobile child (Expo): the App composition — the FlatList screens (sections) + the Pressables\n")
	b.WriteString("// (actions). Each Pressable's onInvoke POSTs /<operation> to the live Hono API via\n")
	b.WriteString("// EXPO_PUBLIC_API_URL (the touch app TRIGGERS the operation end-to-end). FN02-pure.\n")
	b.WriteString(`import { ScrollView, View } from "react-native";` + "\n")
	b.WriteString(`import { SafeAreaView } from "react-native-safe-area-context";` + "\n")
	b.WriteString(`import { StatusBar } from "expo-status-bar";` + "\n")

	// Component imports — canonical (sorted) order so the import block is byte-stable.
	listComps := make([]string, 0, len(m.Sections))
	for _, sec := range m.Sections {
		listComps = append(listComps, pascal(sec.Entity)+"List")
	}
	sort.Strings(listComps)
	for _, comp := range listComps {
		fmt.Fprintf(&b, "import { %s } from %s;\n", comp, jsStr("./"+comp))
	}
	btnComps := make([]string, 0, len(m.Actions))
	for _, act := range m.Actions {
		btnComps = append(btnComps, pascal(act.Control))
	}
	sort.Strings(btnComps)
	for _, comp := range btnComps {
		fmt.Fprintf(&b, "import { %s } from %s;\n", comp, jsStr("./"+comp))
	}
	b.WriteString("\n")

	// The API base + the bound operation → live API route map (computed at emit time, byte-stable).
	b.WriteString("const API = process.env.EXPO_PUBLIC_API_URL ?? \"\";\n\n")
	b.WriteString("// The bound operation → live API route map (routeOf = \"/\" + lower(op), the route EmitServer\n")
	b.WriteString("// emits). Computed at emit time so each Pressable's POST target is visible in the bytes.\n")
	b.WriteString("const OPERATION_ROUTES: Record<string, string> = {\n")
	seenRoute := map[string]bool{}
	routeKeys := make([]string, 0, len(m.Actions))
	for _, act := range m.Actions {
		if act.Invoke == "" || seenRoute[act.Invoke] {
			continue
		}
		seenRoute[act.Invoke] = true
		routeKeys = append(routeKeys, act.Invoke)
	}
	sort.Strings(routeKeys)
	for _, inv := range routeKeys {
		fmt.Fprintf(&b, "\t%s: %s,\n", jsStr(inv), jsStr(routeOf(inv)))
	}
	b.WriteString("};\n\n")

	// postOperation — POST /<operation> against the live Hono API via EXPO_PUBLIC_API_URL.
	b.WriteString("// postOperation POSTs the bound operation to the live Hono API (POST /<operation> via\n")
	b.WriteString("// EXPO_PUBLIC_API_URL). The Pressable DECLARES the bind (data-aidos-invoke) AND triggers it here.\n")
	b.WriteString("async function postOperation(invoke: string): Promise<void> {\n")
	b.WriteString("\tconst route = OPERATION_ROUTES[invoke] ?? `/${invoke.toLowerCase()}`;\n")
	b.WriteString("\tconst res = await fetch(`${API}${route}`, {\n")
	b.WriteString("\t\tmethod: \"POST\",\n")
	b.WriteString("\t\theaders: { \"content-type\": \"application/json\" },\n")
	b.WriteString("\t\tbody: JSON.stringify({}),\n")
	b.WriteString("\t});\n")
	b.WriteString("\tif (!res.ok) throw new Error(`operation ${invoke}: HTTP ${res.status}`);\n")
	b.WriteString("}\n\n")

	// The $-rooted situation the Pressables evaluate visible_when/enabled_when over (a deterministic
	// seed so the touch app renders a live Pressable out of the box; the real app feeds the situation).
	b.WriteString("// The $-rooted situation the Pressables evaluate visible_when/enabled_when over (S11). A minimal\n")
	b.WriteString("// deterministic seed so the screen renders a touchable Pressable out of the box; the real app feeds\n")
	b.WriteString("// the live situation. visible_when/enabled_when stay the control's Expr ASTs (the twin evaluates).\n")
	b.WriteString("const given: Record<string, unknown> = { cart: { items: [{}] }, form: { valid: true }, submitting: false };\n\n")

	b.WriteString("/** App — the emitted mobile view: the FlatList screens + the operation-triggering Pressables. */\n")
	b.WriteString("export default function App() {\n")
	b.WriteString("\treturn (\n")
	b.WriteString("\t\t<SafeAreaView className=\"flex-1 bg-background\">\n")
	b.WriteString("\t\t\t<StatusBar style=\"auto\" />\n")
	b.WriteString("\t\t\t<ScrollView contentContainerClassName=\"flex flex-col gap-6 p-4\">\n")
	b.WriteString("\t\t\t\t<View className=\"flex flex-row flex-wrap gap-2\">\n")
	for _, comp := range btnComps {
		fmt.Fprintf(&b, "\t\t\t\t\t<%s given={given} onInvoke={(invoke) => { void postOperation(invoke); }} />\n", comp)
	}
	b.WriteString("\t\t\t\t</View>\n")
	for _, comp := range listComps {
		fmt.Fprintf(&b, "\t\t\t\t<%s />\n", comp)
	}
	b.WriteString("\t\t\t</ScrollView>\n")
	b.WriteString("\t\t</SafeAreaView>\n")
	b.WriteString("\t);\n")
	b.WriteString("}\n")

	return []byte(strings.TrimRight(b.String(), "\n") + "\n")
}
