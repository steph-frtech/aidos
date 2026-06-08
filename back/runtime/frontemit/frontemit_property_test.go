// frontemit_property_test.go — the S93 INVARIANT mirror (the reproducibility + sensor
// properties), rapid (the frozen Go property slot). It pins the done-criteria a fixture
// cannot: "même Kernel → bundle byte-identique" (byte-stability over arbitrary specs, INVARIANT
// to input order) AND "chaque bouton porte sa fixture control-spec comme senseur" (every
// control's emitted button carries its fixture JSON). Same input → same output, every run.
package frontemit

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/entities/blob"
	"github.com/steph-frtech/aidos/back/kernel/entities/ref"
	"pgregory.net/rapid"
)

// genFrontSpec draws an arbitrary projectable FrontSpec: a non-empty project + ≥ 1 entity (with
// scalar attributes, an optional blob, an optional relation) + ≥ 1 control with a bound op and
// fixture rows. Names are distinct so the canonical order is total.
func genFrontSpec(t *rapid.T) FrontSpec {
	project := rapid.StringMatching(`[a-z][a-z0-9]{0,7}`).Draw(t, "project")

	nEnt := rapid.IntRange(1, 3).Draw(t, "nent")
	ents := make([]EntityModel, 0, nEnt)
	seenEnt := map[string]bool{}
	scalars := entities.ScalarTypes()
	for i := 0; i < nEnt; i++ {
		name := rapid.StringMatching(`[a-z][a-z]{0,6}`).Draw(t, "entname")
		if seenEnt[name] {
			continue
		}
		seenEnt[name] = true
		nAttr := rapid.IntRange(1, 3).Draw(t, "nattr")
		attrs := make([]entities.Attribute, 0, nAttr)
		seenAttr := map[string]bool{}
		for j := 0; j < nAttr; j++ {
			an := rapid.StringMatching(`[a-z][a-z]{0,5}`).Draw(t, "attrname")
			if seenAttr[an] {
				continue
			}
			seenAttr[an] = true
			attrs = append(attrs, entities.Attribute{
				Name:     an,
				Type:     scalars[rapid.IntRange(0, len(scalars)-1).Draw(t, "stype")],
				Required: rapid.Bool().Draw(t, "req"),
			})
		}
		if len(attrs) == 0 {
			attrs = append(attrs, entities.Attribute{Name: "field", Type: entities.TypeString})
		}
		em := EntityModel{Entity: entities.Entity{Name: name, Attributes: attrs}}
		if rapid.Bool().Draw(t, "hasblob") {
			em.Blobs = []blob.BlobAttribute{{Name: "file", AllowedMIME: []string{"image/png"}, MaxBytes: 1024}}
		}
		if rapid.Bool().Draw(t, "hasrel") {
			cards := ref.Cardinalities()
			em.Refs = []ref.Relation{{
				Name:        "owner",
				Target:      "Other",
				Cardinality: cards[rapid.IntRange(0, len(cards)-1).Draw(t, "card")],
				Semantic:    ref.FK,
			}}
		}
		ents = append(ents, em)
	}
	if len(ents) == 0 {
		ents = append(ents, EntityModel{Entity: entities.Entity{Name: "thing", Attributes: []entities.Attribute{{Name: "field", Type: entities.TypeString}}}})
	}

	nCtl := rapid.IntRange(1, 3).Draw(t, "nctl")
	ctrls := make([]ControlModel, 0, nCtl)
	seenCtl := map[string]bool{}
	for i := 0; i < nCtl; i++ {
		cn := rapid.StringMatching(`[a-z][a-z]{0,6}`).Draw(t, "ctlname")
		if seenCtl[cn] {
			continue
		}
		seenCtl[cn] = true
		ctrls = append(ctrls, ControlModel{
			Name:      cn,
			View:      "main",
			Label:     "btn." + cn,
			Operation: "do" + cn,
			Fixtures: []FixtureRow{
				{Given: "ready", Visible: true, Enabled: true},
				{Given: "loading", Visible: true, Enabled: false},
			},
		})
	}
	if len(ctrls) == 0 {
		ctrls = append(ctrls, ControlModel{Name: "go", View: "main", Label: "btn.go", Operation: "dogo", Fixtures: []FixtureRow{{Given: "ready", Visible: true, Enabled: true}}})
	}

	return FrontSpec{Project: project, Entities: ents, Controls: ctrls}
}

// shuffled returns the same spec with entities/controls in a DIFFERENT slice order — the
// emitter must be invariant (canonical name order owns the bytes).
func shuffled(s FrontSpec) FrontSpec {
	out := FrontSpec{Project: s.Project}
	out.Entities = append([]EntityModel(nil), s.Entities...)
	out.Controls = append([]ControlModel(nil), s.Controls...)
	if len(out.Entities) >= 2 {
		out.Entities[0], out.Entities[len(out.Entities)-1] = out.Entities[len(out.Entities)-1], out.Entities[0]
	}
	if len(out.Controls) >= 2 {
		out.Controls[0], out.Controls[len(out.Controls)-1] = out.Controls[len(out.Controls)-1], out.Controls[0]
	}
	return out
}

// TestProp_BundleByteIdentical — same Kernel cut → byte-identical front bundle, twice and under
// input-order permutation. THE S93 reproducibility done-criterion ("même Kernel → bundle
// byte-identique").
func TestProp_BundleByteIdentical(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genFrontSpec(t)

		a1, br := EmitBundle(spec)
		if br != nil {
			t.Fatalf("EmitBundle refused a projectable spec: %s", br.Explanation)
		}
		a2, _ := EmitBundle(shuffled(spec))
		if string(a1.Bytes) != string(a2.Bytes) {
			t.Fatalf("front bundle not byte-identical under input-order permutation")
		}
		if a1.OutputHash != a2.OutputHash || a1.SourceHash != a2.SourceHash {
			t.Fatalf("bundle hashes diverged: out %s/%s src %s/%s", a1.OutputHash, a2.OutputHash, a1.SourceHash, a2.SourceHash)
		}
	})
}

// TestProp_EveryControlCarriesItsFixture — every control's emitted button carries its
// control-spec fixture (the bound op + every fixture row's given/visible/enabled) in its
// data-aidos-fixture sensor. THE done-criterion "chaque bouton portant sa fixture control-spec
// comme senseur".
func TestProp_EveryControlCarriesItsFixture(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genFrontSpec(t)
		arts, br := EmitFront(spec)
		if br != nil {
			t.Fatalf("EmitFront refused: %s", br.Explanation)
		}
		var controls string
		for _, a := range arts {
			if a.Target == TargetControls {
				controls = string(a.Bytes)
			}
		}
		if controls == "" {
			t.Fatalf("no controls artifact emitted")
		}
		for _, c := range spec.Controls {
			// The bound operation must appear as the button's invoke binding.
			if !strings.Contains(controls, `data-aidos-invoke="`+c.Operation+`"`) {
				t.Fatalf("control %q button does not bind its operation %q", c.Name, c.Operation)
			}
			// The fixture sensor must carry the op and every row's given.
			if !strings.Contains(controls, `\"op\":\"`+c.Operation+`\"`) {
				t.Fatalf("control %q fixture sensor missing op", c.Name)
			}
			for _, f := range c.Fixtures {
				if !strings.Contains(controls, `\"given\":\"`+f.Given+`\"`) {
					t.Fatalf("control %q fixture sensor missing given %q", c.Name, f.Given)
				}
			}
		}
	})
}

// TestProp_EmittedFrontHasNoModuleScopeMutable — no emitted module carries a module-scope
// mutable binding (`let`/`var` at column 0): the FN02 purity mandate (ADR 0036/0040) holds for
// the front too. Emitted JSX is pure component factories, no module-scope mutable state.
func TestProp_EmittedFrontHasNoModuleScopeMutable(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genFrontSpec(t)
		arts, br := EmitFront(spec)
		if br != nil {
			t.Fatalf("EmitFront refused: %s", br.Explanation)
		}
		for _, a := range arts {
			for _, line := range strings.Split(string(a.Bytes), "\n") {
				if strings.HasPrefix(line, "let ") || strings.HasPrefix(line, "var ") {
					t.Fatalf("module-scope mutable binding in %s: %q", a.Target, line)
				}
			}
		}
	})
}

// TestProp_EveryEntityGetsAForm — every entity in the spec gets exactly one form artifact, and
// every blob attribute becomes a type=file input (the upload). Completeness honesty: no entity
// is silently dropped, no blob silently becomes a scalar.
func TestProp_EveryEntityGetsAForm(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genFrontSpec(t)
		arts, br := EmitFront(spec)
		if br != nil {
			t.Fatalf("EmitFront refused: %s", br.Explanation)
		}
		forms := map[string]string{}
		for _, a := range arts {
			if a.Target == TargetEntityForm {
				forms[a.Path] = string(a.Bytes)
			}
		}
		if len(forms) != len(spec.Entities) {
			t.Fatalf("expected %d forms, got %d", len(spec.Entities), len(forms))
		}
		for _, e := range spec.Entities {
			path := "gen/" + spec.Project + "/web/" + strings.ToLower(e.Entity.Name) + ".form.tsx"
			body, ok := forms[path]
			if !ok {
				t.Fatalf("entity %q has no form at %s", e.Entity.Name, path)
			}
			for _, bl := range e.Blobs {
				if !strings.Contains(body, `name="`+bl.Name+`" type="file"`) {
					t.Fatalf("blob %q on entity %q not rendered as type=file", bl.Name, e.Entity.Name)
				}
			}
		}
	})
}
