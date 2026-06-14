// desktopchild_test.go — le MIROIR du DESKTOP CHILD (Electron), écrit RED avant
// EmitDesktopChild. Le done-criterion est le MODÈLE « une maître + trois enfants DISTINCTS » :
//
//   - le desktop child DÉRIVE de la MÊME maître (parentId == master.Hash() — l'arête composes
//     S18) que le web et le mobile ;
//
// la FORME est l'IDIOME DESKTOP (Electron : main.js BrowserWindow, preload, menu applicatif,
// raccourcis clavier, panneaux multi-colonnes denses) — PAS la vue web emballée, PAS la vue
// mobile : un troisième enfant distinct. Chaque Section → un PANNEAU/tableau dense ; chaque
// Action → un item de MENU + un bouton (POST /<operation>) ; fetch GET /entities/<e> ; Expr
// évalué côté client (le twin). EmitDesktopChild est DÉTERMINISTE (même maître → mêmes artefacts
// byte-stables) et porte un point d'ADAPTATION per-plateforme (capitalisable, loopback compound).
//
// mirrors schema · reflects: runtime.honoemit.EmitDesktopChild · test_kind: fixture
// · cert_language: operation-dsl/go · authority: below · liveness: live
package honoemit

import (
	"strings"
	"testing"
)

// masterOf emits the master view for the canonical shop spec (the parent the three children
// derive from). A helper so every desktop test starts from the SAME parent the web/mobile do.
func masterOf(t *testing.T) MasterView {
	t.Helper()
	spec := shopWebSpec()
	spec.Invariants = []string{"every order has a positive total"}
	m, br := EmitMasterView(spec)
	if br != nil {
		t.Fatalf("EmitMasterView refused the shop spec: %s", br.Explanation)
	}
	return m
}

// TestEmitDesktopChild_DerivesFromMaster — le cœur du modèle : le desktop child porte le parentId
// de la maître (l'arête composes S18) et émet ses artefacts sous gen/<project>/desktop/.
func TestEmitDesktopChild_DerivesFromMaster(t *testing.T) {
	m := masterOf(t)
	child, br := EmitDesktopChild(m)
	if br != nil {
		t.Fatalf("EmitDesktopChild refused a projectable master: %s", br.Explanation)
	}

	if child.Target != ChildDesktop {
		t.Fatalf("child target = %q, want %q", child.Target, ChildDesktop)
	}
	if child.ParentID != m.Hash() {
		t.Fatalf("child ParentID = %q, want master hash %q (the composes edge)", child.ParentID, m.Hash())
	}
	if child.MasterHash != child.ParentID {
		t.Fatalf("child MasterHash %q != ParentID %q", child.MasterHash, child.ParentID)
	}
	if len(child.Artifacts) == 0 {
		t.Fatalf("desktop child emitted no artifacts")
	}
	// Every artifact lands under gen/<project>/desktop/, protected + content-addressed.
	for _, a := range child.Artifacts {
		if !strings.HasPrefix(a.Path, "gen/shop/desktop/") {
			t.Fatalf("artifact %q is not under gen/shop/desktop/", a.Path)
		}
		if !a.Protected {
			t.Fatalf("artifact %q not protected", a.Path)
		}
		if a.Target != TargetDesktopApp {
			t.Fatalf("artifact %q target = %q, want %q", a.Path, a.Target, TargetDesktopApp)
		}
		if a.SourceHash == "" || a.OutputHash == "" {
			t.Fatalf("artifact %q not content-addressed (source/output hash empty)", a.Path)
		}
	}
}

// TestEmitDesktopChild_IsAnElectronApp — la FORME est une VRAIE app Electron : main.js
// (BrowserWindow), preload.js, package.json (electron), renderer.tsx + index.html. PAS un simple
// serveur statique web.
func TestEmitDesktopChild_IsAnElectronApp(t *testing.T) {
	m := masterOf(t)
	child, br := EmitDesktopChild(m)
	if br != nil {
		t.Fatalf("EmitDesktopChild refused: %s", br.Explanation)
	}
	arts := child.Artifacts

	main := findArt(t, arts, "main.js")
	if !strings.Contains(string(main.Bytes), "BrowserWindow") {
		t.Fatalf("main.js is not an Electron main process (no BrowserWindow)")
	}
	if !strings.Contains(string(main.Bytes), "app.whenReady") {
		t.Fatalf("main.js does not boot the Electron app lifecycle")
	}

	preload := findArt(t, arts, "preload.js")
	if !strings.Contains(string(preload.Bytes), "contextBridge") {
		t.Fatalf("preload.js does not use contextBridge (the secure Electron preload idiom)")
	}

	pkg := findArt(t, arts, "package.json")
	if !strings.Contains(string(pkg.Bytes), "electron") {
		t.Fatalf("package.json does not pin electron")
	}
	if !strings.Contains(string(pkg.Bytes), "\"main\": \"main.js\"") {
		t.Fatalf("package.json does not declare main.js as the Electron entry")
	}

	// The renderer + its HTML shell exist (the desktop UI half).
	findArt(t, arts, "renderer.tsx")
	html := findArt(t, arts, "index.html")
	if !strings.Contains(string(html.Bytes), "id=\"root\"") {
		t.Fatalf("index.html has no #root mount")
	}
}

// TestEmitDesktopChild_DesktopIdiom_NotWebWrapped — le point CENTRAL : le renderer desktop est une
// VUE DESKTOP-ADAPTÉE (panneaux multi-colonnes, menu applicatif, raccourcis clavier), PAS la vue
// web emballée. On le prouve par les marqueurs de l'idiome desktop ET par la non-réutilisation
// verbatim de la forme web.
func TestEmitDesktopChild_DesktopIdiom_NotWebWrapped(t *testing.T) {
	m := masterOf(t)
	child, br := EmitDesktopChild(m)
	if br != nil {
		t.Fatalf("EmitDesktopChild refused: %s", br.Explanation)
	}
	arts := child.Artifacts

	main := string(findArt(t, arts, "main.js").Bytes)
	// Application MENU + keyboard ACCELERATORS — the desktop idiom (web has neither).
	if !strings.Contains(main, "Menu.buildFromTemplate") {
		t.Fatalf("desktop child has no application menu (Menu.buildFromTemplate) — not the desktop idiom")
	}
	if !strings.Contains(main, "accelerator") {
		t.Fatalf("desktop child binds no keyboard shortcut (accelerator) — not the desktop idiom")
	}

	renderer := string(findArt(t, arts, "renderer.tsx").Bytes)
	// Multi-column DENSE PANELS — the desktop layout (not the web single-column max-w-3xl page).
	if !strings.Contains(renderer, "grid-cols") {
		t.Fatalf("desktop renderer is not a multi-column panel layout (no grid-cols)")
	}
	if strings.Contains(renderer, "max-w-3xl") {
		t.Fatalf("desktop renderer reuses the WEB page layout (max-w-3xl) — must be a distinct desktop view")
	}

	// NOT the web view wrapped: the desktop renderer must NOT import the web App component, and the
	// web app.tsx/main.tsx must NOT be among the desktop artifacts.
	for _, a := range arts {
		base := a.Path[strings.LastIndex(a.Path, "/")+1:]
		if base == "app.tsx" || base == "main.tsx" {
			t.Fatalf("desktop child emitted the WEB file %q — it must NOT wrap the web view", base)
		}
	}
	if strings.Contains(renderer, `from "./app"`) {
		t.Fatalf("desktop renderer imports the web App component — it must be a distinct desktop view")
	}

	// And it is DISTINCT from the web child byte-wise: the renderer is not byte-equal to any web
	// artifact (a different view, not a re-pathed copy).
	web, br := EmitWebChild(shopWebSpecWithInv())
	if br != nil {
		t.Fatalf("EmitWebChild refused: %s", br.Explanation)
	}
	for _, wa := range web.Artifacts {
		if string(wa.Bytes) == renderer {
			t.Fatalf("desktop renderer is byte-identical to web artifact %q — not a distinct view", wa.Path)
		}
	}
}

// TestEmitDesktopChild_PanelPerSection_ActionPerControl — chaque Section → un panneau/tableau
// (data-aidos-panel + une colonne par champ en ordre source) ; chaque Action → un item de menu +
// un bouton (POST /<operation>) ; fetch GET /entities/<e> ; Expr évalué côté client.
func TestEmitDesktopChild_PanelPerSection_ActionPerControl(t *testing.T) {
	m := masterOf(t)
	child, br := EmitDesktopChild(m)
	if br != nil {
		t.Fatalf("EmitDesktopChild refused: %s", br.Explanation)
	}
	renderer := string(findArt(t, child.Artifacts, "renderer.tsx").Bytes)

	// One PANEL per section, named after the entity.
	for _, sec := range m.Sections {
		if !strings.Contains(renderer, "data-aidos-panel=\""+sec.Entity+"\"") {
			t.Fatalf("desktop renderer has no panel for section %q", sec.Entity)
		}
		// fetches GET /entities/<entity> for the panel rows.
		if !strings.Contains(renderer, "/entities/"+strings.ToLower(sec.Entity)) {
			t.Fatalf("desktop panel for %q does not fetch GET /entities/%s", sec.Entity, strings.ToLower(sec.Entity))
		}
		// One column per field, in SOURCE ORDER (the projection of the master section — the fields
		// ride in the panel's literal fields={[...]} array, in order, and the table renders one
		// <th data-aidos-col={f}> per field). We assert the field literals appear in source order.
		lastIdx := -1
		for _, f := range sec.Fields {
			idx := strings.Index(renderer, jsStr(f))
			if idx < 0 {
				t.Fatalf("desktop panel for %q misses column %q", sec.Entity, f)
			}
			if idx < lastIdx {
				t.Fatalf("desktop panel for %q has column %q out of source order", sec.Entity, f)
			}
			lastIdx = idx
		}
		// The table binds each field to a data-aidos-col attribute (the testable column marker).
		if !strings.Contains(renderer, "data-aidos-col={f}") {
			t.Fatalf("desktop panel does not render a data-aidos-col per field")
		}
	}

	// One ACTION per master action: a button that POSTs /<operation>, evaluating the Expr client-side.
	for _, act := range m.Actions {
		if !strings.Contains(renderer, "data-aidos-invoke=\""+act.Invoke+"\"") {
			t.Fatalf("desktop renderer has no action button for invoke %q", act.Invoke)
		}
		if !strings.Contains(renderer, routeOf(act.Invoke)) {
			t.Fatalf("desktop action %q does not POST %q", act.Invoke, routeOf(act.Invoke))
		}
	}
	// The Expr twin is evaluated client-side (the SAME catalogue the web/mobile use, never re-implemented).
	if !strings.Contains(renderer, "evalState") {
		t.Fatalf("desktop renderer does not evaluate the Expr twin client-side (evalState)")
	}

	// The application MENU (in main.js) carries one item per action invoke (the desktop affordance).
	main := string(findArt(t, child.Artifacts, "main.js").Bytes)
	for _, act := range m.Actions {
		if !strings.Contains(main, act.Invoke) {
			t.Fatalf("application menu has no item for action invoke %q", act.Invoke)
		}
	}
}

// TestEmitDesktopChild_ByteStableDeterministic — la projection est DÉTERMINISTE : même maître →
// MÊMES artefacts, byte-pour-byte, sur chaque run (le miroir de reproductibilité).
func TestEmitDesktopChild_ByteStableDeterministic(t *testing.T) {
	m := masterOf(t)
	a1, br := EmitDesktopChild(m)
	if br != nil {
		t.Fatalf("EmitDesktopChild refused: %s", br.Explanation)
	}
	a2, br := EmitDesktopChild(m)
	if br != nil {
		t.Fatalf("EmitDesktopChild refused on second call: %s", br.Explanation)
	}
	if len(a1.Artifacts) != len(a2.Artifacts) {
		t.Fatalf("desktop artifact count not stable: %d vs %d", len(a1.Artifacts), len(a2.Artifacts))
	}
	for i := range a1.Artifacts {
		if a1.Artifacts[i].Path != a2.Artifacts[i].Path {
			t.Fatalf("desktop artifact %d path not stable: %q vs %q", i, a1.Artifacts[i].Path, a2.Artifacts[i].Path)
		}
		if string(a1.Artifacts[i].Bytes) != string(a2.Artifacts[i].Bytes) {
			t.Fatalf("desktop artifact %q not byte-stable across calls", a1.Artifacts[i].Path)
		}
		if a1.Artifacts[i].OutputHash != a2.Artifacts[i].OutputHash {
			t.Fatalf("desktop artifact %q output hash not stable", a1.Artifacts[i].Path)
		}
	}
	// The slice is path-sorted (byte-stable order).
	for i := 1; i < len(a1.Artifacts); i++ {
		if a1.Artifacts[i-1].Path > a1.Artifacts[i].Path {
			t.Fatalf("desktop artifacts not path-sorted: %q before %q", a1.Artifacts[i-1].Path, a1.Artifacts[i].Path)
		}
	}
}

// TestEmitDesktopChild_CarriesAdaptationPoint — le desktop child porte un point d'ADAPTATION
// per-plateforme (capitalisable, loopback compound) : un override desktop change ses bytes mais
// JAMAIS le parentId (la maître reste la même).
func TestEmitDesktopChild_CarriesAdaptationPoint(t *testing.T) {
	m := masterOf(t)
	base, br := EmitDesktopChild(m)
	if br != nil {
		t.Fatalf("EmitDesktopChild refused: %s", br.Explanation)
	}
	adapted, br := EmitDesktopChildAdapted(m, DesktopAdaptation{WindowTitle: "Mon App Bureau"})
	if br != nil {
		t.Fatalf("EmitDesktopChildAdapted refused: %s", br.Explanation)
	}
	// Same parent (the master is unchanged — the adaptation is per-platform, not a new requirement).
	if adapted.ParentID != base.ParentID {
		t.Fatalf("adaptation changed the parentId %q -> %q (must derive from the SAME master)", base.ParentID, adapted.ParentID)
	}
	// But the bytes differ (the override is applied — the window title shows up).
	main := string(findArt(t, adapted.Artifacts, "main.js").Bytes)
	if !strings.Contains(main, "Mon App Bureau") {
		t.Fatalf("desktop adaptation (window title) was not applied")
	}
	baseMain := string(findArt(t, base.Artifacts, "main.js").Bytes)
	if baseMain == main {
		t.Fatalf("the adaptation did not change any byte (no per-platform adaptation point)")
	}
	// The default child carries the empty adaptation (the capitalisable override slot). The
	// DesktopAdaptation now holds a Screen *ScreenOverride (ADR 0071, additive) so it is no longer
	// == comparable; check the exported override fields are all zero.
	if base.Adaptation.WindowTitle != "" || base.Adaptation.Screen != nil {
		t.Fatalf("default desktop child carries a non-empty adaptation: %+v", base.Adaptation)
	}
}

// TestEmitDesktopChild_RefusesEmptyMaster — honesty: a master with no section AND no action derives
// no desktop view (a typed BlockReason, never a partial child).
func TestEmitDesktopChild_RefusesEmptyMaster(t *testing.T) {
	child, br := EmitDesktopChild(MasterView{Project: "shop"})
	if br == nil {
		t.Fatalf("EmitDesktopChild accepted an empty master; want a BlockReason")
	}
	if len(child.Artifacts) != 0 || child.ParentID != "" {
		t.Fatalf("EmitDesktopChild returned a partial child on refusal")
	}
	if len(br.HowToFix) == 0 {
		t.Fatalf("BlockReason must carry a non-empty how_to_fix (no prison)")
	}

	// A master with no project at all is also refused.
	if _, br := EmitDesktopChild(MasterView{Sections: []MasterSection{{Entity: "Order", Fields: []string{"id"}}}}); br == nil {
		t.Fatalf("EmitDesktopChild accepted a master with no project")
	}
}

// shopWebSpecWithInv is the shop spec with the canonical invariant (the SAME cut masterOf emits
// from) — used to contrast the desktop child against the web child byte-wise.
func shopWebSpecWithInv() WebAppSpec {
	s := shopWebSpec()
	s.Invariants = []string{"every order has a positive total"}
	return s
}
