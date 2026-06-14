// webemit_property_test.go — the S38-bis WEB VIEW INVARIANT mirror (the reproducibility +
// purity + no-fork properties), rapid (the frozen Go property slot). It pins what a fixture
// cannot: "même arbre (entités ⊕ controls/actions) → vue byte-identique" (byte-stability over
// arbitrary specs, modulo input order) AND "l'UI émise est FN02-pure" (no module-scope mutable
// binding) AND "le bouton est S38 verbatim, import réécrit" (the no-fork frontier, over arbitrary
// entity/button counts). Same input → same output, on every run and machine.
package honoemit

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/runtime/generators/webcomponent"
	"pgregory.net/rapid"
)

// genWebAppSpec draws an arbitrary projectable WebAppSpec: a non-empty project + 0..3 entities
// (distinct names, each ≥1 typed attribute) + 0..2 buttons (the S11 anchors, distinct control
// names), with at least one entity OR one button (the empty app is refused, not drawn).
func genWebAppSpec(t *rapid.T) WebAppSpec {
	project := rapid.StringMatching(`[a-z][a-z0-9]{0,7}`).Draw(t, "project")

	nEnt := rapid.IntRange(0, 3).Draw(t, "nent")
	ents := make([]entities.Entity, 0, nEnt)
	seenEnt := map[string]bool{}
	types := entities.ScalarTypes()
	for i := 0; i < nEnt; i++ {
		name := rapid.StringMatching(`[A-Z][a-zA-Z0-9]{0,7}`).Draw(t, "entname")
		if seenEnt[name] {
			continue
		}
		seenEnt[name] = true
		nAttr := rapid.IntRange(1, 4).Draw(t, "nattr")
		attrs := make([]entities.Attribute, 0, nAttr)
		seenAttr := map[string]bool{}
		for j := 0; j < nAttr; j++ {
			an := rapid.StringMatching(`[a-z][a-z0-9_]{0,7}`).Draw(t, "attr")
			if seenAttr[an] {
				continue
			}
			seenAttr[an] = true
			tp := types[rapid.IntRange(0, len(types)-1).Draw(t, "type")]
			attrs = append(attrs, entities.Attribute{Name: an, Type: tp, Required: rapid.Bool().Draw(t, "req")})
		}
		if len(attrs) == 0 {
			attrs = append(attrs, entities.Attribute{Name: "id", Type: entities.TypeInt, Required: true})
		}
		ents = append(ents, entities.Entity{Name: name, Attributes: attrs})
	}

	// Buttons: 0..2 reuse the S11 anchor (the only well-formed control→action fixture), with the
	// control renamed so the action's on:click + the control's triggers stay aligned (S38 validates
	// the bind). A renamed pair preserves the bind, so the emitter accepts it.
	nBtn := rapid.IntRange(0, 2).Draw(t, "nbtn")
	btns := make([]ControlAction, 0, nBtn)
	seenBtn := map[string]bool{}
	for i := 0; i < nBtn; i++ {
		cn := rapid.StringMatching(`btn[0-9]`).Draw(t, "btnname")
		if seenBtn[cn] {
			continue
		}
		seenBtn[cn] = true
		btns = append(btns, renamedButton(cn))
	}

	if len(ents) == 0 && len(btns) == 0 {
		btns = append(btns, renamedButton("btn0"))
	}
	return WebAppSpec{Project: project, Entities: ents, Buttons: btns}
}

// renamedButton clones the S11 checkout anchor with the control renamed to name, keeping the
// control→action bind aligned (control.Triggers == action.Name, action.On.Control == name). A
// well-formed, S38-projectable pair under an arbitrary control name.
func renamedButton(name string) ControlAction {
	c := control.CheckoutButton()
	a := action.CheckoutSubmit()
	actName := name + "-submit"
	c.Name = name
	c.Triggers = actName
	a.Name = actName
	a.On = action.On{Kind: action.EventClick, Control: name}
	return ControlAction{Control: c, Action: a}
}

// shuffledWebSpec returns the same spec with entities + buttons in a DIFFERENT slice order — the
// emitter must be invariant to input order (canonical name order owns the bytes).
func shuffledWebSpec(s WebAppSpec) WebAppSpec {
	out := WebAppSpec{Project: s.Project}
	out.Entities = append([]entities.Entity(nil), s.Entities...)
	out.Buttons = append([]ControlAction(nil), s.Buttons...)
	if len(out.Entities) >= 2 {
		out.Entities[0], out.Entities[len(out.Entities)-1] = out.Entities[len(out.Entities)-1], out.Entities[0]
	}
	if len(out.Buttons) >= 2 {
		out.Buttons[0], out.Buttons[len(out.Buttons)-1] = out.Buttons[len(out.Buttons)-1], out.Buttons[0]
	}
	return out
}

// TestProp_WebAppByteIdentical — same tree cut → byte-identical web app, twice and under input-
// order permutation. The reproducibility mirror (the S38-bis done-criterion).
func TestProp_WebAppByteIdentical(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genWebAppSpec(t)

		a1, br := EmitWebApp(spec)
		if br != nil {
			t.Fatalf("EmitWebApp refused a projectable spec: %s", br.Explanation)
		}
		a2, br := EmitWebApp(shuffledWebSpec(spec))
		if br != nil {
			t.Fatalf("EmitWebApp refused the shuffled spec: %s", br.Explanation)
		}
		if len(a1) != len(a2) {
			t.Fatalf("artifact count diverged under permutation: %d vs %d", len(a1), len(a2))
		}
		for i := range a1 {
			if a1[i].Path != a2[i].Path {
				t.Fatalf("artifact %d path diverged: %q vs %q", i, a1[i].Path, a2[i].Path)
			}
			if string(a1[i].Bytes) != string(a2[i].Bytes) {
				t.Fatalf("artifact %q not byte-identical under input-order permutation", a1[i].Path)
			}
			if a1[i].OutputHash != a2[i].OutputHash || a1[i].SourceHash != a2[i].SourceHash {
				t.Fatalf("artifact %q hashes diverged", a1[i].Path)
			}
		}
	})
}

// TestProp_WebAppFN02Pure — no emitted .tsx/.ts module carries a MODULE-SCOPE mutable binding
// (`let`/`var` at column 0): the FN02 purity mandate (ADR 0036/0040). All mutable state lives
// inside a component/function (useState, the fetch handler), never at module scope.
func TestProp_WebAppFN02Pure(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genWebAppSpec(t)
		arts, br := EmitWebApp(spec)
		if br != nil {
			t.Fatalf("EmitWebApp refused: %s", br.Explanation)
		}
		for _, art := range arts {
			if !strings.HasSuffix(art.Path, ".ts") && !strings.HasSuffix(art.Path, ".tsx") {
				continue // only the TS modules carry the FN02 mandate.
			}
			for _, line := range strings.Split(string(art.Bytes), "\n") {
				if strings.HasPrefix(line, "let ") || strings.HasPrefix(line, "var ") {
					t.Fatalf("module-scope mutable binding in %s: %q", art.Path, line)
				}
			}
		}
	})
}

// TestProp_ButtonIsS38VerbatimImportRewritten — the no-fork frontier over arbitrary buttons: each
// emitted button is BYTE-EQUAL to webcomponent.Emit's output with ONLY the aidos-expr import
// rewritten, and carries S38's source_hash (reused, not forked). Holds for every drawn button.
func TestProp_ButtonIsS38VerbatimImportRewritten(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genWebAppSpec(t)
		arts, br := EmitWebApp(spec)
		if br != nil {
			t.Fatalf("EmitWebApp refused: %s", br.Explanation)
		}
		for _, ca := range spec.Buttons {
			name := buttonComponentName(ca.Control)
			var btn *Artifact
			for i := range arts {
				if strings.HasSuffix(arts[i].Path, "/"+name+".tsx") {
					btn = &arts[i]
					break
				}
			}
			if btn == nil {
				t.Fatalf("no emitted button artifact for control %q", ca.Control.Name)
			}
			s38, br38 := webcomponent.Emit(ca.Control, ca.Action, webcomponent.TargetTSNext)
			if br38 != nil {
				t.Fatalf("webcomponent.Emit refused control %q: %s", ca.Control.Name, br38.Explanation)
			}
			if string(btn.Bytes) != rewriteExprImport(string(s38.Bytes)) {
				t.Fatalf("button %q is not S38's output with the import rewritten (forked render?)", ca.Control.Name)
			}
			if btn.SourceHash != s38.SourceHash {
				t.Fatalf("button %q source_hash %q != S38 %q (forked hashing path?)", ca.Control.Name, btn.SourceHash, s38.SourceHash)
			}
		}
	})
}
