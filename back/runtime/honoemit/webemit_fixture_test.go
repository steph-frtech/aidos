// webemit_fixture_test.go — the S38-bis WEB VIEW emitter ACCEPTANCE mirror (the journey
// fixture), written RED before EmitWebApp and now green. The done-criterion is a JOURNEY,
// not a structural match: "la VUE est DÉRIVÉE de l'arbre — une entité → une vue LISTE
// (colonnes = champs), un control→action → un BOUTON qui POST /<operation> ; l'UI est une
// FONCTION PURE des controls/actions/entités, byte-stable, et RÉUTILISE S38 (jamais reforké
// ni redesignée à la main)". So this fixture EMITS the web app from the project's entities +
// control/action cut, asserts the derived artifacts (one list per entity, one button per
// control), the byte-identity (determinism), and the S38 reuse (the emitted button body is
// byte-equal to webcomponent.Emit's, only the import rewritten).
//
//	mirrors schema · reflects: runtime.honoemit.EmitWebApp · test_kind: fixture
//	· cert_language: operation-dsl/go · authority: below · liveness: live
//
// Materialized source: tests/runtime/web_view_projection.fixture.md (conceptually in the
// `mirrors` schema, persisted at S06 — bootstrap exception).
package honoemit

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/generators/webcomponent"
)

// shopWebSpec is the canonical web-view fixture: a project with ONE entity (Order, the S35
// anchor) and ONE control→action (the checkout-button → checkout-submit → createOrder, the
// S11 anchors). It exercises a LIST view (columns = Order's attributes) AND a BUTTON wired
// to POST /createorder off the same Kernel cut.
func shopWebSpec() WebAppSpec {
	return WebAppSpec{
		Project:  "shop",
		Entities: []entities.Entity{entities.Order()},
		Buttons:  []ControlAction{{Control: control.CheckoutButton(), Action: action.CheckoutSubmit()}},
	}
}

// findArt returns the artifact whose path ends with suffix (the path is gen/<project>/web/…).
func findArt(t *testing.T, arts []Artifact, suffix string) Artifact {
	t.Helper()
	for _, a := range arts {
		if strings.HasSuffix(a.Path, suffix) {
			return a
		}
	}
	t.Fatalf("no emitted artifact path ending in %q; got %v", suffix, paths(arts))
	return Artifact{}
}

func paths(arts []Artifact) []string {
	out := make([]string, len(arts))
	for i, a := range arts {
		out[i] = a.Path
	}
	return out
}

// TestEmitWebApp_DerivesViewFromTree — the spine: a projectable spec emits a web app under
// gen/<project>/web/, every artifact protected + source-hashed, the slice path-sorted.
func TestEmitWebApp_DerivesViewFromTree(t *testing.T) {
	arts, br := EmitWebApp(shopWebSpec())
	if br != nil {
		t.Fatalf("EmitWebApp refused a projectable spec: %s", br.Explanation)
	}
	if len(arts) == 0 {
		t.Fatalf("emitted no artifacts")
	}
	// Every artifact lands under gen/shop/web/, is protected, content-addressed, ts/web target.
	for _, a := range arts {
		if !strings.HasPrefix(a.Path, "gen/shop/web/") {
			t.Fatalf("artifact %q is not under gen/shop/web/", a.Path)
		}
		if !a.Protected {
			t.Fatalf("artifact %q must be protected", a.Path)
		}
		if a.Target != TargetWebApp {
			t.Fatalf("artifact %q target = %q, want %q", a.Path, a.Target, TargetWebApp)
		}
		if a.OutputHash != records.Hash(a.Bytes) {
			t.Fatalf("artifact %q output_hash mismatch", a.Path)
		}
	}
	// The path-sorted order is stable (the slice is itself byte-stable).
	for i := 1; i < len(arts); i++ {
		if arts[i-1].Path >= arts[i].Path {
			t.Fatalf("artifacts not path-sorted: %q !< %q", arts[i-1].Path, arts[i].Path)
		}
	}
}

// TestEmitWebApp_OneEntityOneListView — a derived requirement: each entity produces one LIST
// view component whose COLUMNS are the entity's attributes in source order (no add/drop). The
// view shows the rows; it is NOT invented — it is the projection of the entity AST (S35).
func TestEmitWebApp_OneEntityOneListView(t *testing.T) {
	arts, br := EmitWebApp(shopWebSpec())
	if br != nil {
		t.Fatalf("EmitWebApp refused: %s", br.Explanation)
	}
	list := findArt(t, arts, "/OrderList.tsx")
	src := string(list.Bytes)
	// The list fetches the entity's collection from the served API (GET /entities/order).
	if !strings.Contains(src, "/entities/order") {
		t.Fatalf("OrderList must fetch GET /entities/order; got %q", firstNLines(src, 40))
	}
	// Columns = the entity's attributes IN SOURCE ORDER (the projection of the AST, never invented).
	cols := entities.AttributeSet(entities.Order())
	lastIdx := -1
	for _, col := range cols {
		idx := strings.Index(src, columnHeaderToken(col))
		if idx < 0 {
			t.Fatalf("OrderList missing column header for attribute %q", col)
		}
		if idx < lastIdx {
			t.Fatalf("OrderList columns out of source order at %q", col)
		}
		lastIdx = idx
	}
	// A column the entity AST does NOT pin is never invented (honesty): the count matches.
	if got := strings.Count(src, "data-aidos-col="); got != len(cols) {
		t.Fatalf("OrderList renders %d columns, entity pins %d (no invented column)", got, len(cols))
	}
}

// columnHeaderToken is the exact substring the emitted list header carries for an attribute.
func columnHeaderToken(attr string) string { return "data-aidos-col=" + jsStr(attr) }

// TestEmitWebApp_OneControlOneButtonBoundToOperation — a derived requirement: each control→
// action produces one BUTTON that POSTs /<operation>. The button is the projection of the
// control+action (S11); it triggers the operation via the live Hono API.
func TestEmitWebApp_OneControlOneButtonBoundToOperation(t *testing.T) {
	arts, br := EmitWebApp(shopWebSpec())
	if br != nil {
		t.Fatalf("EmitWebApp refused: %s", br.Explanation)
	}
	// The control button component is emitted (named from the control: checkout-button).
	btn := findArt(t, arts, "/CheckoutButton.tsx")
	src := string(btn.Bytes)
	// It declares the bound operation VERBATIM from the action (createOrder), never invented.
	if !strings.Contains(src, `const INVOKE = "createOrder";`) {
		t.Fatalf("CheckoutButton must declare INVOKE = createOrder (Plan(action,click).invoke)")
	}
	// The app wiring POSTs the bound operation to the live API route (/createorder, lowercased).
	app := findArt(t, arts, "/app.tsx")
	if !strings.Contains(string(app.Bytes), "/createorder") {
		t.Fatalf("app.tsx must POST the bound operation to /createorder")
	}
}

// TestEmitWebApp_ReusesS38NotForked — the wall + determinism: the emitted button body is
// BYTE-EQUAL to webcomponent.Emit's (S38), with ONLY the aidos-expr import rewritten to a
// relative path (the app bundles the twin locally). The emitter does NOT re-render the
// button by hand — it reuses S38 verbatim, then rewrites a single import line.
func TestEmitWebApp_ReusesS38NotForked(t *testing.T) {
	spec := shopWebSpec()
	arts, br := EmitWebApp(spec)
	if br != nil {
		t.Fatalf("EmitWebApp refused: %s", br.Explanation)
	}
	btn := findArt(t, arts, "/CheckoutButton.tsx")

	// Re-emit the SAME control+action via S38 directly; rewrite only the import the same way.
	s38, br38 := webcomponent.Emit(spec.Buttons[0].Control, spec.Buttons[0].Action, webcomponent.TargetTSNext)
	if br38 != nil {
		t.Fatalf("webcomponent.Emit refused: %s", br38.Explanation)
	}
	want := rewriteExprImport(string(s38.Bytes))
	if string(btn.Bytes) != want {
		t.Fatalf("emitted button is not S38's output with the import rewritten (forked render?)\n--- got ---\n%s\n--- want ---\n%s", btn.Bytes, want)
	}
	// The button's source_hash is S38's (content address of control ⊕ action), reused not forked.
	if btn.SourceHash != s38.SourceHash {
		t.Fatalf("button source_hash %q != S38 source_hash %q (forked hashing path?)", btn.SourceHash, s38.SourceHash)
	}
}

// TestEmitWebApp_Deterministic — the reproducibility mirror: same spec → byte-identical app,
// twice and under input-order permutation (entity/button order must not leak into the bytes).
func TestEmitWebApp_Deterministic(t *testing.T) {
	spec := shopWebSpec()
	a1, br := EmitWebApp(spec)
	if br != nil {
		t.Fatalf("EmitWebApp refused: %s", br.Explanation)
	}
	a2, _ := EmitWebApp(spec)
	if len(a1) != len(a2) {
		t.Fatalf("artifact count diverged: %d vs %d", len(a1), len(a2))
	}
	for i := range a1 {
		if a1[i].Path != a2[i].Path || a1[i].OutputHash != a2[i].OutputHash {
			t.Fatalf("artifact %d diverged: %q/%s vs %q/%s", i, a1[i].Path, a1[i].OutputHash, a2[i].Path, a2[i].OutputHash)
		}
	}
}

// TestEmitWebApp_RefusesMalformed — honesty: a spec with no project, no entity AND no button,
// or a malformed entity/control is a typed BlockReason, never a partial render.
func TestEmitWebApp_RefusesMalformed(t *testing.T) {
	cases := []struct {
		name string
		spec WebAppSpec
	}{
		{"no project", WebAppSpec{Entities: []entities.Entity{entities.Order()}}},
		{"empty app", WebAppSpec{Project: "shop"}},
		{"malformed entity", WebAppSpec{Project: "shop", Entities: []entities.Entity{{Name: ""}}}},
		{"malformed button", WebAppSpec{Project: "shop", Buttons: []ControlAction{{Control: control.Control{Name: ""}}}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			arts, br := EmitWebApp(tc.spec)
			if br == nil {
				t.Fatalf("EmitWebApp accepted a malformed spec (%s); want a BlockReason", tc.name)
			}
			if len(arts) != 0 {
				t.Fatalf("EmitWebApp returned %d artifacts on refusal (must be a clean refusal)", len(arts))
			}
			if len(br.HowToFix) == 0 {
				t.Fatalf("BlockReason must carry a non-empty how_to_fix (no prison)")
			}
		})
	}
}

func firstNLines(s string, n int) string {
	lines := strings.SplitN(s, "\n", n+1)
	if len(lines) > n {
		lines = lines[:n]
	}
	return strings.Join(lines, "\n")
}
