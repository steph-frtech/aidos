package honoemit

// screendesign_root_test.go — le MIROIR de la coordonnée ROOT/APP (ADR 0071, Task 2 §2) + des seams
// publics EmitWebAppWithScreenOverrides / AdaptationOverrideFromScreens (la voie que l'exécuteur
// aidospulumi appelle pour RÉ-APPLIQUER un ScreenDesign capturé au redeploy — la PERMANENCE du « rouge »).
//
// On prouve, byte-stable, sans LLM (déterminisme-first §6/§8) :
//   - un override ROOT (coord root, bg=destructive) re-style le conteneur racine <main data-aidos-root> ;
//   - le sentinel {section, entity:"app"|"root"} MAPPE sur la même coordonnée racine (normalizeRootCoord) ;
//   - SANS override la vue est BYTE-IDENTIQUE à EmitWebApp (anti-overwrite §9) ;
//   - EmitWebAppWithScreenOverrides(spec, nil) ≡ EmitWebApp(spec) octet pour octet ;
//   - coordExists(master, rootCoord) est vrai pour une maître projetable (la racine existe toujours).

import (
	"strings"
	"testing"
)

// appArtifactBody returns the app.tsx artifact body for a spec + overrides (the root container lives in
// app.tsx). Fails the test if the emitter refuses.
func appArtifactBody(t *testing.T, s WebAppSpec, overrides []ScreenOverride) string {
	t.Helper()
	arts, br := EmitWebAppWithScreenOverrides(s, overrides)
	if br != nil {
		t.Fatalf("EmitWebAppWithScreenOverrides refused: %s", br.Explanation)
	}
	for _, a := range arts {
		if strings.HasSuffix(a.Path, "app.tsx") {
			return string(a.Bytes)
		}
	}
	t.Fatalf("app.tsx not emitted")
	return ""
}

// TestEmitWebApp_RootOverride_StylesShell — a root override (coord root, bg=destructive) re-styles the
// ROOT container (<main data-aidos-root> gets bg-destructive). The whole app's fond is overridden.
func TestEmitWebApp_RootOverride_StylesShell(t *testing.T) {
	overrides := []ScreenOverride{{
		Coord:  ScreenCoord{Kind: CoordRoot, Entity: "root"},
		Styles: []StyleToken{{Property: "bg", Token: "destructive"}},
	}}
	app := appArtifactBody(t, shopWebSpec(), overrides)
	if !strings.Contains(app, "data-aidos-root") {
		t.Fatalf("the root override did not stamp data-aidos-root on <main>:\n%s", app)
	}
	if !strings.Contains(app, "bg-destructive") {
		t.Fatalf("the root override did not append bg-destructive to the <main> fond:\n%s", app)
	}
}

// TestEmitWebApp_RootOverride_AppSentinelMaps — the {section, entity:"app"} sentinel folds onto the
// canonical root coordinate (normalizeRootCoord) — the "root/app" case where the front stamps the shell
// as a section. Deterministic mapping to the nearest coordinate (the root container).
func TestEmitWebApp_RootOverride_AppSentinelMaps(t *testing.T) {
	for _, entity := range []string{"app", "root"} {
		overrides := []ScreenOverride{{
			Coord:  ScreenCoord{Kind: CoordSection, Entity: entity},
			Styles: []StyleToken{{Property: "bg", Token: "destructive"}},
		}}
		app := appArtifactBody(t, shopWebSpec(), overrides)
		if !strings.Contains(app, "data-aidos-root") || !strings.Contains(app, "bg-destructive") {
			t.Fatalf("the {section, entity:%q} sentinel did not map to the root container:\n%s", entity, app)
		}
	}
}

// TestEmitWebAppWithScreenOverrides_NilByteIdentical — anti-overwrite §9 (the load-bearing property):
// EmitWebAppWithScreenOverrides(spec, nil) is BYTE-IDENTICAL to EmitWebApp(spec). The no-override path
// changes NOTHING — no data-aidos-root, no stray class, every artifact byte-for-byte equal.
func TestEmitWebAppWithScreenOverrides_NilByteIdentical(t *testing.T) {
	spec := shopWebSpec()
	canon, br := EmitWebApp(spec)
	if br != nil {
		t.Fatalf("EmitWebApp refused: %s", br.Explanation)
	}
	adapted, br := EmitWebAppWithScreenOverrides(spec, nil)
	if br != nil {
		t.Fatalf("EmitWebAppWithScreenOverrides(nil) refused: %s", br.Explanation)
	}
	if len(canon) != len(adapted) {
		t.Fatalf("artifact count drifted: %d vs %d", len(canon), len(adapted))
	}
	for i := range canon {
		if canon[i].Path != adapted[i].Path {
			t.Fatalf("artifact %d path drifted: %q vs %q", i, canon[i].Path, adapted[i].Path)
		}
		if string(canon[i].Bytes) != string(adapted[i].Bytes) {
			t.Fatalf("artifact %q bytes drifted on the nil-override path (anti-overwrite §9 broken)", canon[i].Path)
		}
	}
	// And the canonical app.tsx carries NO data-aidos-root (the conditional keeps the no-override line stable).
	if strings.Contains(appArtifactBody(t, spec, nil), "data-aidos-root") {
		t.Fatalf("the no-override app.tsx leaked a data-aidos-root attribute (anti-overwrite §9 broken)")
	}
}

// TestEmitScreenDesign_RootCoordAccepted — a root coordinate is NOT structural: EmitScreenDesign accepts
// a root override over a projectable master (the shell always exists). coordExists(master, rootCoord)==true.
func TestEmitScreenDesign_RootCoordAccepted(t *testing.T) {
	m, br := EmitMasterView(shopWebSpec())
	if br != nil {
		t.Fatalf("EmitMasterView refused: %s", br.Explanation)
	}
	if !coordExists(m, rootCoord()) {
		t.Fatalf("coordExists(master, rootCoord) is false — the root shell must always exist for a projectable master")
	}
	d, br := EmitScreenDesign(m, ChildWeb, []ScreenOverride{{
		Coord:  rootCoord(),
		Styles: []StyleToken{{Property: "bg", Token: "destructive"}},
	}})
	if br != nil {
		t.Fatalf("EmitScreenDesign refused a root override (it must be accepted, not structural): %s", br.Explanation)
	}
	if d.ID == "" {
		t.Fatalf("EmitScreenDesign returned an empty ID for a valid root design")
	}
}
