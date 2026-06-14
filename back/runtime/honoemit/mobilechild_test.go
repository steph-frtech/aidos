// mobilechild_test.go — le MIROIR du MOBILE CHILD (Expo / React-Native), écrit RED avant
// EmitMobileChild. C'est le done-criterion du DEUXIÈME enfant distinct du modèle « une maître +
// trois enfants distincts » (web React DÉJÀ fait · mobile Expo ICI · desktop Electron en parallèle) :
//
//   - le mobile child DÉRIVE de la MÊME maître que le web et le desktop (ParentID == master.Hash())
//     — l'arête composes (S18) parent → enfant ; les trois enfants portent le MÊME parentId ;
//
//   - mais il porte l'IDIOME MOBILE, DISTINCT du web et du desktop : une App Expo (app.json +
//     package.json expo/RN + App.tsx), chaque Section → une FlatList (View/Text + NativeWind,
//     écrans/tactile — PAS une <table> web, PAS un panneau desktop), chaque Action → un Pressable
//     (POST /<operation>), le fetch via EXPO_PUBLIC_API_URL, l'Expr évaluée client par le twin
//     aidos-expr (le MÊME catalogue gelé) ;
//
//   - il est BYTE-STABLE (fonction pure de la maître — mêmes sections/actions → MÊMES octets) ;
//
//   - il porte un POINT D'ADAPTATION per-plateforme (l'override mobile) qu'une adaptation validée
//     capitalise (le loopback, back/runtime/compound) : EmitMobileChildAdapted change les bytes mais
//     JAMAIS le parentId (la maître reste la même).
//
//     mirrors schema · reflects: runtime.honoemit.EmitMobileChild · test_kind: fixture
//     · cert_language: operation-dsl/go · authority: below · liveness: live
package honoemit

import (
	"strings"
	"testing"
)

// TestEmitMobileChild_DerivesFromMaster — le CŒUR du modèle : le mobile child porte le parentId de
// la maître (l'arête composes S18) et émet ses artefacts sous gen/<project>/mobile/. Il partage le
// MÊME parent que le web et le desktop (un parent, trois enfants distincts).
func TestEmitMobileChild_DerivesFromMaster(t *testing.T) {
	m := masterOf(t)
	child, br := EmitMobileChild(m)
	if br != nil {
		t.Fatalf("EmitMobileChild refused a projectable master: %s", br.Explanation)
	}

	if child.Target != ChildMobile {
		t.Fatalf("child target = %q, want %q", child.Target, ChildMobile)
	}
	if child.ParentID != m.Hash() {
		t.Fatalf("child ParentID = %q, want master hash %q (the composes edge)", child.ParentID, m.Hash())
	}
	if child.MasterHash != child.ParentID {
		t.Fatalf("child MasterHash %q != ParentID %q", child.MasterHash, child.ParentID)
	}
	if len(child.Artifacts) == 0 {
		t.Fatalf("mobile child emitted no artifacts")
	}
	// Every artifact lands under gen/<project>/mobile/, protected + content-addressed, path-sorted.
	for _, a := range child.Artifacts {
		if !strings.HasPrefix(a.Path, "gen/shop/mobile/") {
			t.Fatalf("artifact %q is not under gen/shop/mobile/", a.Path)
		}
		if !a.Protected {
			t.Fatalf("artifact %q not protected", a.Path)
		}
		if a.Target != TargetMobileApp {
			t.Fatalf("artifact %q target = %q, want %q", a.Path, a.Target, TargetMobileApp)
		}
		if a.SourceHash == "" || a.OutputHash == "" {
			t.Fatalf("artifact %q not content-addressed (source/output hash empty)", a.Path)
		}
	}
	for i := 1; i < len(child.Artifacts); i++ {
		if child.Artifacts[i-1].Path >= child.Artifacts[i].Path {
			t.Fatalf("artifacts not path-sorted: %q !< %q", child.Artifacts[i-1].Path, child.Artifacts[i].Path)
		}
	}

	// SAME parent as the web + desktop children (one master, three distinct children).
	web, br := EmitWebChild(shopWebSpecWithInv())
	if br != nil {
		t.Fatalf("EmitWebChild refused: %s", br.Explanation)
	}
	if child.ParentID != web.ParentID {
		t.Fatalf("mobile + web children do not share the same parent: %q vs %q", child.ParentID, web.ParentID)
	}
}

// TestEmitMobileChild_IsAnExpoApp — la FORME est une VRAIE app Expo : app.json (le manifeste Expo),
// package.json (expo + react-native + nativewind), App.tsx (le point de montage RN). L'idiome
// mobile, PAS un index.html web, PAS un main.js Electron.
func TestEmitMobileChild_IsAnExpoApp(t *testing.T) {
	m := masterOf(t)
	child, br := EmitMobileChild(m)
	if br != nil {
		t.Fatalf("EmitMobileChild refused: %s", br.Explanation)
	}
	arts := child.Artifacts

	appJSON := string(findArt(t, arts, "app.json").Bytes)
	if !strings.Contains(appJSON, "\"expo\"") {
		t.Fatalf("app.json must carry the Expo manifest; got %q", firstNLines(appJSON, 10))
	}

	pkg := string(findArt(t, arts, "package.json").Bytes)
	for _, dep := range []string{"expo", "react-native", "nativewind"} {
		if !strings.Contains(pkg, "\""+dep+"\"") {
			t.Fatalf("package.json missing %q dep; got %q", dep, pkg)
		}
	}

	// App.tsx is the RN mount (the touch-app root), not a web createRoot over #root.
	app := string(findArt(t, arts, "App.tsx").Bytes)
	if strings.Contains(app, "createRoot") || strings.Contains(app, "react-dom") {
		t.Fatalf("App.tsx leaks the WEB mount (react-dom/createRoot) — the mobile mount is RN")
	}

	// The web/desktop idioms must NOT leak into the mobile child.
	for _, a := range arts {
		base := baseName(a.Path)
		if base == "index.html" || base == "vite.config.ts" || base == "main.js" || base == "preload.js" {
			t.Fatalf("mobile child carries a non-mobile artifact %q (the idiom must be DISTINCT)", base)
		}
	}
}

// TestEmitMobileChild_SectionIsFlatListNotTable — chaque Section de la maître → une FlatList RN
// (View/Text/NativeWind), pas une <table> web ni un panneau grid desktop. L'idiome tactile,
// byte-distinct du web.
func TestEmitMobileChild_SectionIsFlatListNotTable(t *testing.T) {
	m := masterOf(t)
	child, br := EmitMobileChild(m)
	if br != nil {
		t.Fatalf("EmitMobileChild refused: %s", br.Explanation)
	}
	for _, sec := range m.Sections {
		list := string(findArt(t, child.Artifacts, "/"+pascal(sec.Entity)+"List.tsx").Bytes)
		// The RN idiom: FlatList + View/Text, from react-native, NOT a web <table>/<th>/<td>.
		for _, rn := range []string{"FlatList", "View", "Text", "react-native"} {
			if !strings.Contains(list, rn) {
				t.Fatalf("%s must use the RN idiom (%q); got %q", sec.Entity, rn, firstNLines(list, 30))
			}
		}
		for _, web := range []string{"<table", "<th", "<td"} {
			if strings.Contains(list, web) {
				t.Fatalf("%s leaks the WEB idiom (%q) — the mobile section must be DISTINCT", sec.Entity, web)
			}
		}
		// It fetches the entity collection via EXPO_PUBLIC_API_URL + GET /entities/<e> (the live API).
		if !strings.Contains(list, "EXPO_PUBLIC_API_URL") {
			t.Fatalf("%s must read EXPO_PUBLIC_API_URL; got %q", sec.Entity, firstNLines(list, 30))
		}
		if !strings.Contains(list, "/entities/"+strings.ToLower(sec.Entity)) {
			t.Fatalf("%s must fetch GET /entities/%s; got %q", sec.Entity, strings.ToLower(sec.Entity), firstNLines(list, 30))
		}
		// Fields = the section's fields IN SOURCE ORDER (the projection of the master, never invented).
		lastIdx := -1
		for _, f := range sec.Fields {
			idx := strings.Index(list, "data-aidos-field="+jsStr(f))
			if idx < 0 {
				t.Fatalf("%s missing field marker for %q", sec.Entity, f)
			}
			if idx < lastIdx {
				t.Fatalf("%s fields out of source order at %q", sec.Entity, f)
			}
			lastIdx = idx
		}
		// A field the master does NOT pin is never invented (honesty): the count matches.
		if got := strings.Count(list, "data-aidos-field="); got != len(sec.Fields) {
			t.Fatalf("%s renders %d fields, master pins %d (no invented field)", sec.Entity, got, len(sec.Fields))
		}
	}
}

// TestEmitMobileChild_ActionIsPressable — chaque Action de la maître → un Pressable RN qui POST
// /<operation> contre l'API live, en évaluant l'Expr client (twin aidos-expr).
func TestEmitMobileChild_ActionIsPressable(t *testing.T) {
	m := masterOf(t)
	child, br := EmitMobileChild(m)
	if br != nil {
		t.Fatalf("EmitMobileChild refused: %s", br.Explanation)
	}
	for _, act := range m.Actions {
		btn := string(findArt(t, child.Artifacts, "/"+pascal(act.Control)+".tsx").Bytes)
		if !strings.Contains(btn, "Pressable") {
			t.Fatalf("%s must be a Pressable (the touch idiom); got %q", act.Control, firstNLines(btn, 30))
		}
		// The bound operation, verbatim from the action, never invented.
		if act.Invoke != "" && !strings.Contains(btn, jsStr(act.Invoke)) {
			t.Fatalf("%s must declare the bound operation %q; got %q", act.Control, act.Invoke, firstNLines(btn, 40))
		}
		// It evaluates the Expr client-side via the twin (evalState) — the SAME frozen semantics.
		if !strings.Contains(btn, "evalState") {
			t.Fatalf("%s must evaluate the Expr via the twin (evalState); got %q", act.Control, firstNLines(btn, 40))
		}
	}
	// The Expr twin is bundled (the same evaluator the web child uses, copied verbatim).
	twin := string(findArt(t, child.Artifacts, "/aidos-expr.ts").Bytes)
	if !strings.Contains(twin, "export function evalState") {
		t.Fatalf("the mobile child must bundle the Expr twin (evalState)")
	}
	// App.tsx POSTs the bound operation to the live API via EXPO_PUBLIC_API_URL.
	app := string(findArt(t, child.Artifacts, "App.tsx").Bytes)
	if !strings.Contains(app, "EXPO_PUBLIC_API_URL") {
		t.Fatalf("App.tsx must POST against EXPO_PUBLIC_API_URL; got %q", firstNLines(app, 60))
	}
	for _, act := range m.Actions {
		if act.Invoke == "" {
			continue
		}
		if !strings.Contains(app, routeOf(act.Invoke)) {
			t.Fatalf("App.tsx must POST the bound operation to %q", routeOf(act.Invoke))
		}
	}
}

// TestEmitMobileChild_DistinctFromWeb — le point central : le mobile child est DISTINCT du web
// child. Aucun de ses composants .tsx n'est byte-égal au web (forme adaptée, pas un clone), bien
// qu'ils dérivent de la MÊME maître (même parentId).
func TestEmitMobileChild_DistinctFromWeb(t *testing.T) {
	m := masterOf(t)
	mobile, br := EmitMobileChild(m)
	if br != nil {
		t.Fatalf("EmitMobileChild refused: %s", br.Explanation)
	}
	web, br := EmitWebApp(shopWebSpecWithInv())
	if br != nil {
		t.Fatalf("EmitWebApp refused: %s", br.Explanation)
	}
	// Same parent (same master), but distinct forms: no mobile component byte-equals its web twin.
	webByName := map[string]string{}
	for _, a := range web {
		webByName[baseName(a.Path)] = string(a.Bytes)
	}
	sameComponentCompared := 0
	for _, a := range mobile.Artifacts {
		name := baseName(a.Path)
		if !strings.HasSuffix(name, ".tsx") {
			continue
		}
		if wb, ok := webByName[name]; ok {
			sameComponentCompared++
			if string(a.Bytes) == wb {
				t.Fatalf("mobile component %q is BYTE-IDENTICAL to the web child (a clone, not a distinct child)", name)
			}
		}
	}
	if sameComponentCompared == 0 {
		t.Fatalf("expected at least one same-named .tsx (OrderList) to compare web vs mobile")
	}
}

// baseName returns the final path segment (the file name) of an artifact path.
func baseName(p string) string {
	if i := strings.LastIndex(p, "/"); i >= 0 {
		return p[i+1:]
	}
	return p
}

// TestEmitMobileChild_CarriesAdaptationPoint — le point d'ADAPTATION per-plateforme (l'override
// mobile) qu'une adaptation validée capitalise (le loopback, back/runtime/compound) : un override
// mobile change ses bytes mais JAMAIS le parentId (la maître reste la même).
func TestEmitMobileChild_CarriesAdaptationPoint(t *testing.T) {
	m := masterOf(t)
	base, br := EmitMobileChild(m)
	if br != nil {
		t.Fatalf("EmitMobileChild refused: %s", br.Explanation)
	}
	adapted, br := EmitMobileChildAdapted(m, MobileAdaptation{AppName: "Ma Boutique Mobile"})
	if br != nil {
		t.Fatalf("EmitMobileChildAdapted refused: %s", br.Explanation)
	}
	// Same parent (the master is unchanged — the adaptation is per-platform, not a new requirement).
	if adapted.ParentID != base.ParentID {
		t.Fatalf("adaptation changed the parentId %q -> %q (must derive from the SAME master)", base.ParentID, adapted.ParentID)
	}
	// But the bytes differ (the override is applied — the app name shows up in app.json).
	appJSON := string(findArt(t, adapted.Artifacts, "app.json").Bytes)
	if !strings.Contains(appJSON, "Ma Boutique Mobile") {
		t.Fatalf("mobile adaptation (app name) was not applied; got %q", firstNLines(appJSON, 12))
	}
	baseAppJSON := string(findArt(t, base.Artifacts, "app.json").Bytes)
	if baseAppJSON == appJSON {
		t.Fatalf("the adaptation did not change any byte (no per-platform adaptation point)")
	}
	// The default child carries the empty adaptation (the capitalisable override slot).
	if base.Adaptation != (MobileAdaptation{}) {
		t.Fatalf("default mobile child carries a non-empty adaptation: %+v", base.Adaptation)
	}
}

// TestEmitMobileChild_RefusesEmptyMaster — honnêteté : une maître sans section ET sans action ne
// dérive aucune vue mobile (un BlockReason typé, jamais un enfant partiel). Le refus nomme le mobile.
func TestEmitMobileChild_RefusesEmptyMaster(t *testing.T) {
	child, br := EmitMobileChild(MasterView{Project: "shop"})
	if br == nil {
		t.Fatalf("EmitMobileChild accepted an empty master; want a BlockReason")
	}
	if len(child.Artifacts) != 0 || child.ParentID != "" {
		t.Fatalf("EmitMobileChild returned a partial child on refusal (must be clean)")
	}
	if len(br.HowToFix) == 0 {
		t.Fatalf("BlockReason must carry a non-empty how_to_fix (no prison)")
	}
	if !strings.Contains(br.Explanation, "MOBILE") {
		t.Fatalf("mobile BlockReason should name the mobile child; got %q", br.Explanation)
	}

	// A master with no project at all is also refused.
	if _, br := EmitMobileChild(MasterView{Sections: []MasterSection{{Entity: "Order", Fields: []string{"id"}}}}); br == nil {
		t.Fatalf("EmitMobileChild accepted a master with no project")
	}
}
