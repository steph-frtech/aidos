package main

// materialise_hono_screendesign_test.go — le MIROIR de la PERMANENCE du « rouge » (ADR 0071, Task 2).
//
// Le défaut corrigé : un ScreenDesign validé dans le Design Lab (un ScreenOverride : coord + StyleToken
// ADR 0010) était capturé MAIS le redeploy ne le RÉ-APPLIQUAIT pas — `MaterialiseHono` émettait la vue
// web via `EmitWebApp` brut (sans override) → le rouge ne survivait pas. LE FIX : `aidospulumi up --hono`
// gagne `--screen-design <file.json>` ; fourni, la vue est émise via `honoemit.EmitWebChildAdapted`
// (les classes-token ADR 0010 posées sur les data-aidos-* correspondants) ; SANS le flag → `EmitWebApp`
// byte-identique (anti-overwrite §9).
//
// DÉTERMINISME-FIRST (§6/§8) : tout est déterministe, byte-stable ; aucun pulumi n'est lancé (le demi
// pur). On prouve : (a) un override section/root re-style l'élément émis ; (b) sans override la vue est
// BYTE-IDENTIQUE ; (c) un override déplace le tag content-adressé (Pulumi recrée le conteneur) ; (d)
// `loadScreenOverrides` parse les DEUX formats ([]ScreenOverride et []ScreenDesign).

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// writeScreenDesignFile writes a JSON []honoemit.ScreenOverride (or []ScreenDesign) to a temp file and
// returns its path. The deterministic fixture the --screen-design flag reads.
func writeScreenDesignFile(t *testing.T, dir, name, body string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatalf("write screen-design file: %v", err)
	}
	return p
}

// readMatFile reads a materialised file under <ServerDir>/web/<base>.
func readWebFile(t *testing.T, mat Materialised, base string) string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(mat.ServerDir, "web", base))
	if err != nil {
		t.Fatalf("read server/web/%s: %v", base, err)
	}
	return string(b)
}

// TestMaterialiseHono_ScreenDesign_SectionOverride — RED→GREEN, the CORE behaviour. A deploy with a
// captured ScreenOverride (coord section/Order, bg=destructive) re-applies the ADR-0010 token class on
// the matching <section data-aidos-view> of the emitted list view. Without the flag the SAME view is
// byte-identical to EmitWebApp (the anti-overwrite control is the sibling test below).
func TestMaterialiseHono_ScreenDesign_SectionOverride(t *testing.T) {
	root := t.TempDir()
	sd := writeScreenDesignFile(t, t.TempDir(), "screen.json", `[
		{"coord":{"kind":"section","entity":"Order"},"styles":[{"property":"bg","token":"destructive"}]}
	]`)

	mat, err := MaterialiseHono(root, "shop", "dev", "", "", sd)
	if err != nil {
		t.Fatalf("MaterialiseHono(--screen-design): %v", err)
	}
	// The Order list view's <section> carries the overridden token class (bg-destructive) — the captured
	// "red" survived the redeploy (reused via EmitWebChildAdapted, never re-implemented).
	orderList := readWebFile(t, mat, "OrderList.tsx")
	if !contains(orderList, "bg-destructive") {
		t.Fatalf("OrderList.tsx does NOT carry the overridden bg-destructive token — the ScreenDesign was not re-applied:\n%s", orderList)
	}
	// data-aidos-view is the coordinate the override matched (the section).
	if !contains(orderList, "data-aidos-view") {
		t.Fatalf("OrderList.tsx lost its data-aidos-view coordinate:\n%s", orderList)
	}
}

// TestMaterialiseHono_ScreenDesign_RootOverride — the "root/app" case (Task 2 §2): a coord root/app
// (a bg override on the SHELL/fond, e.g. bg=destructive) applies to the ROOT container of the view (the
// <main data-aidos-root>). The override on the body re-styles the WHOLE app's background. Byte-stable.
func TestMaterialiseHono_ScreenDesign_RootOverride(t *testing.T) {
	root := t.TempDir()
	// The front may emit the root coordinate as {kind:"root"} OR as the section/app sentinel — both fold
	// onto the canonical rootCoord (normalizeRootCoord). Here the explicit root kind.
	sd := writeScreenDesignFile(t, t.TempDir(), "root.json", `[
		{"coord":{"kind":"root","entity":"root"},"styles":[{"property":"bg","token":"destructive"}]}
	]`)

	mat, err := MaterialiseHono(root, "shop", "dev", "", "", sd)
	if err != nil {
		t.Fatalf("MaterialiseHono(root override): %v", err)
	}
	app := readWebFile(t, mat, "app.tsx")
	// The <main> root container carries the data-aidos-root coordinate + the appended fond class.
	if !contains(app, "data-aidos-root") {
		t.Fatalf("app.tsx <main> did not get the data-aidos-root coordinate for the root override:\n%s", app)
	}
	if !contains(app, "bg-destructive") {
		t.Fatalf("app.tsx <main> did NOT get the overridden bg-destructive fond class:\n%s", app)
	}
}

// TestMaterialiseHono_ScreenDesign_RootViaAppAlias — the "root/app" sentinel mapping (Task 2 §2): a
// coord whose entity is the "app" sentinel (no explicit root kind, e.g. a section coord the front stamps
// for the shell) maps to the nearest coordinate — the root container. Deterministic, byte-stable.
func TestMaterialiseHono_ScreenDesign_RootViaAppAlias(t *testing.T) {
	root := t.TempDir()
	sd := writeScreenDesignFile(t, t.TempDir(), "app.json", `[
		{"coord":{"kind":"section","entity":"app"},"styles":[{"property":"bg","token":"destructive"}]}
	]`)

	mat, err := MaterialiseHono(root, "shop", "dev", "", "", sd)
	if err != nil {
		t.Fatalf("MaterialiseHono(app alias): %v", err)
	}
	app := readWebFile(t, mat, "app.tsx")
	if !contains(app, "data-aidos-root") || !contains(app, "bg-destructive") {
		t.Fatalf("the section/app sentinel did not map to the root container fond:\n%s", app)
	}
}

// TestMaterialiseHono_ScreenDesign_NoFlagByteIdentical — anti-overwrite §9: WITHOUT --screen-design the
// emitted web view is BYTE-IDENTICAL to the canonical materialisation. The result inventory's web-file
// hashes (server/web/<base>) match between a no-flag run and a no-flag run; AND the no-flag app.tsx
// carries NEITHER data-aidos-root NOR a stray override class (the canonical <main>).
func TestMaterialiseHono_ScreenDesign_NoFlagByteIdentical(t *testing.T) {
	a, err := MaterialiseHono(t.TempDir(), "shop", "dev", "", "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono(no flag) #1: %v", err)
	}
	b, err := MaterialiseHono(t.TempDir(), "shop", "dev", "", "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono(no flag) #2: %v", err)
	}
	for name, h := range a.Files {
		if h2, ok := b.Files[name]; !ok || h2 != h {
			t.Fatalf("no-flag file %s hash drifted (%q vs %q)", name, h, h2)
		}
	}
	// The canonical <main> has NO data-aidos-root (the conditional keeps the no-override path byte-stable).
	app := readWebFile(t, a, "app.tsx")
	if contains(app, "data-aidos-root") {
		t.Fatalf("the no-override app.tsx leaked a data-aidos-root attribute (anti-overwrite §9 broken):\n%s", app)
	}
}

// TestMaterialiseHono_ScreenDesign_MovesImageTag — the content-address invariant: a captured override
// changes the EMITTED web bytes → a DIFFERENT content-addressed server image tag (so Pulumi recreates the
// container with the new design, the permanence of the "red"). No override → the canonical tag.
func TestMaterialiseHono_ScreenDesign_MovesImageTag(t *testing.T) {
	base, err := MaterialiseHono(t.TempDir(), "shop", "dev", "", "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono(no flag): %v", err)
	}
	sd := writeScreenDesignFile(t, t.TempDir(), "screen.json", `[
		{"coord":{"kind":"section","entity":"Order"},"styles":[{"property":"bg","token":"destructive"}]}
	]`)
	adapted, err := MaterialiseHono(t.TempDir(), "shop", "dev", "", "", sd)
	if err != nil {
		t.Fatalf("MaterialiseHono(--screen-design): %v", err)
	}
	if base.ImageTag == "" || adapted.ImageTag == "" {
		t.Fatalf("an image tag was empty (base=%q adapted=%q)", base.ImageTag, adapted.ImageTag)
	}
	if base.ImageTag == adapted.ImageTag {
		t.Fatalf("the captured ScreenDesign did NOT move the content-addressed tag (%q) — Pulumi would keep the stale image", base.ImageTag)
	}
	// And the materialised opts.HonoImage (referenced by the wired Pulumi program) carries the adapted tag.
	idx, _ := os.ReadFile(filepath.Join(adapted.Dir, "index.ts"))
	if !contains(string(idx), adapted.ImageTag) {
		t.Fatalf("the wired Pulumi program does not reference the adapted image tag %q:\n%s", adapted.ImageTag, string(idx))
	}
}

// TestLoadScreenOverrides_BothFormats — loadScreenOverrides parses EITHER a []ScreenOverride OR a
// []ScreenDesign (folding the designs' overrides out). An empty path → nil (the no-override case). A
// garbage file → an actionable error (never a silent empty).
func TestLoadScreenOverrides_BothFormats(t *testing.T) {
	dir := t.TempDir()

	// Empty path → nil, no error.
	if got, err := loadScreenOverrides(""); err != nil || got != nil {
		t.Fatalf("empty path = (%v, %v), want (nil, nil)", got, err)
	}

	// []ScreenOverride form.
	pOv := writeScreenDesignFile(t, dir, "ov.json", `[
		{"coord":{"kind":"section","entity":"Order"},"styles":[{"property":"bg","token":"destructive"}]}
	]`)
	ov, err := loadScreenOverrides(pOv)
	if err != nil {
		t.Fatalf("loadScreenOverrides([]ScreenOverride): %v", err)
	}
	if len(ov) != 1 || ov[0].Coord.Kind != honoemit.CoordSection || ov[0].Coord.Entity != "Order" {
		t.Fatalf("[]ScreenOverride parsed to %+v, want one section/Order override", ov)
	}

	// []ScreenDesign form — the overrides are folded out.
	pDe := writeScreenDesignFile(t, dir, "design.json", `[
		{"child_target":"web","parent_id":"x","validated":true,"by":"human","overrides":[
			{"coord":{"kind":"root","entity":"root"},"styles":[{"property":"bg","token":"destructive"}]}
		]}
	]`)
	de, err := loadScreenOverrides(pDe)
	if err != nil {
		t.Fatalf("loadScreenOverrides([]ScreenDesign): %v", err)
	}
	if len(de) != 1 || de[0].Coord.Kind != honoemit.CoordRoot {
		t.Fatalf("[]ScreenDesign folded to %+v, want one root override", de)
	}

	// An empty array → nil (the no-override case, not an error).
	pEmpty := writeScreenDesignFile(t, dir, "empty.json", `[]`)
	if got, err := loadScreenOverrides(pEmpty); err != nil || got != nil {
		t.Fatalf("empty array = (%v, %v), want (nil, nil)", got, err)
	}

	// Garbage → an actionable error.
	pBad := writeScreenDesignFile(t, dir, "bad.json", `{"not":"an array"}`)
	if _, err := loadScreenOverrides(pBad); err == nil {
		t.Fatalf("a garbage --screen-design file was NOT refused")
	}
}
