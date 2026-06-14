// masterview_test.go — le MIROIR de la VUE MAÎTRE + du WEB CHILD (le done-criterion du modèle
// « une maître + trois enfants distincts »). Écrit RED avant EmitMasterView / EmitWebChild, ce
// fixture grave le JOURNEY, pas un match structurel :
//
//   - la vue MAÎTRE est une PROJECTION PURE de l'arbre : une entité → une SECTION (champs en
//     ordre source), un control→action → une ACTION (l'opération liée + visible_when/enabled_when),
//     plus les INVARIANTS déclarés — plateforme-agnostique, content-adressée ;
//
//   - le WEB CHILD DÉRIVE de la maître (ParentID == MasterViewHash) MAIS reste BYTE-IDENTIQUE à
//     EmitWebApp (anti-overwrite §9 : shopapp web inchangé) ;
//
//   - EmitMasterView est DÉTERMINISTE (mêmes specs, modulo l'ordre d'entrée → MÊME maître → MÊME
//     hash).
//
//     mirrors schema · reflects: runtime.honoemit.EmitMasterView / EmitWebChild · test_kind: fixture
//     · cert_language: operation-dsl/go · authority: below · liveness: live
package honoemit

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
)

// TestEmitMasterView_DerivesSectionsActionsInvariants — la maître porte SECTIONS (une par entité,
// champs en ordre source) + ACTIONS (une par control→action, opération + Expr) + INVARIANTS
// déclarés. Une projection PURE de l'arbre, plateforme-agnostique.
func TestEmitMasterView_DerivesSectionsActionsInvariants(t *testing.T) {
	spec := shopWebSpec()
	spec.Invariants = []string{"every order has a positive total", "cart non-empty before checkout"}

	m, br := EmitMasterView(spec)
	if br != nil {
		t.Fatalf("EmitMasterView refused a projectable spec: %s", br.Explanation)
	}
	if m.Project != "shop" {
		t.Fatalf("master project = %q, want %q", m.Project, "shop")
	}

	// One SECTION per entity, fields IN SOURCE ORDER (the projection of the AST, never invented).
	if len(m.Sections) != 1 {
		t.Fatalf("master has %d sections, want 1 (one per entity)", len(m.Sections))
	}
	sec := m.Sections[0]
	if sec.Entity != "Order" {
		t.Fatalf("section entity = %q, want Order", sec.Entity)
	}
	wantFields := entities.AttributeSet(entities.Order())
	if len(sec.Fields) != len(wantFields) {
		t.Fatalf("section has %d fields, entity pins %d (no invented field)", len(sec.Fields), len(wantFields))
	}
	for i, f := range wantFields {
		if sec.Fields[i] != f {
			t.Fatalf("section field %d = %q, want %q (source order)", i, sec.Fields[i], f)
		}
	}

	// One ACTION per control→action, carrying the bound operation + the canonicalised Expr.
	if len(m.Actions) != 1 {
		t.Fatalf("master has %d actions, want 1 (one per control→action)", len(m.Actions))
	}
	act := m.Actions[0]
	if act.Control != "checkout-button" {
		t.Fatalf("action control = %q, want checkout-button", act.Control)
	}
	if act.Invoke != "createOrder" {
		t.Fatalf("action invoke = %q, want createOrder (action.Invoke verbatim)", act.Invoke)
	}
	if act.VisibleWhen == "" || act.EnabledWhen == "" {
		t.Fatalf("action must carry canonicalised visible_when/enabled_when Expr; got %q / %q", act.VisibleWhen, act.EnabledWhen)
	}

	// The DECLARED invariants ride in the master, in canonical (sorted) order — never invented.
	if len(m.Invariants) != 2 {
		t.Fatalf("master has %d invariants, want 2 (declared)", len(m.Invariants))
	}
	if m.Invariants[0] > m.Invariants[1] {
		t.Fatalf("master invariants not in canonical order: %v", m.Invariants)
	}
}

// TestEmitMasterView_ContentAddressedDeterministic — la maître est content-adressée et byte-stable :
// mêmes specs → MÊME maître → MÊME hash, twice et sous permutation de l'ordre d'entrée. C'est
// l'ADRESSE du PARENT (le parentId que chaque enfant épingle).
func TestEmitMasterView_ContentAddressedDeterministic(t *testing.T) {
	spec := shopWebSpec()
	spec.Invariants = []string{"b-second", "a-first"}

	m1, br := EmitMasterView(spec)
	if br != nil {
		t.Fatalf("EmitMasterView refused: %s", br.Explanation)
	}
	// shuffledWebSpec only permutes entities/buttons; carry the invariants across so the second
	// master is the SAME cut in another input order (the permutation invariance the master pins).
	shuffled := shuffledWebSpec(spec)
	shuffled.Invariants = []string{"b-second", "a-first"}
	m2, _ := EmitMasterView(shuffled)
	if m1.Hash() != m2.Hash() {
		t.Fatalf("master hash diverged under input permutation: %q vs %q", m1.Hash(), m2.Hash())
	}

	// The value's Hash() and MasterViewHash(spec) agree (round-trip: the master IS its address).
	h, br := MasterViewHash(spec)
	if br != nil {
		t.Fatalf("MasterViewHash refused: %s", br.Explanation)
	}
	if h != m1.Hash() {
		t.Fatalf("MasterViewHash(spec) %q != master value Hash() %q", h, m1.Hash())
	}

	// A changed structure yields a NEW parent address (anti-overwrite §9: a new node, never a mutation).
	bigger := shopWebSpec()
	bigger.Invariants = append([]string{"new-invariant"}, spec.Invariants...)
	mB, _ := EmitMasterView(bigger)
	if mB.Hash() == m1.Hash() {
		t.Fatalf("adding an invariant did not change the master hash (not content-addressed)")
	}
}

// TestEmitWebChild_DerivesFromMaster_ByteIdenticalToEmitWebApp — le CŒUR du modèle : le web child
// DÉRIVE de la maître (ParentID == MasterViewHash) MAIS ses artefacts sont BYTE-IDENTIQUES à
// EmitWebApp (anti-overwrite §9 : shopapp web inchangé).
func TestEmitWebChild_DerivesFromMaster_ByteIdenticalToEmitWebApp(t *testing.T) {
	spec := shopWebSpec()
	spec.Invariants = []string{"every order has a positive total"}

	child, br := EmitWebChild(spec)
	if br != nil {
		t.Fatalf("EmitWebChild refused a projectable spec: %s", br.Explanation)
	}

	// The child is the WEB child, tied to the master by its content address.
	if child.Target != ChildWeb {
		t.Fatalf("child target = %q, want %q", child.Target, ChildWeb)
	}
	wantParent, _ := MasterViewHash(spec)
	if child.ParentID != wantParent {
		t.Fatalf("child ParentID = %q, want master hash %q (the composes edge)", child.ParentID, wantParent)
	}
	if child.MasterHash != child.ParentID {
		t.Fatalf("child MasterHash %q != ParentID %q", child.MasterHash, child.ParentID)
	}

	// BYTE-IDENTITY: the child's artifacts are byte-for-byte what EmitWebApp emits (the reframe is
	// transparent — adding invariants to the spec does NOT change the web bytes).
	web, br := EmitWebApp(spec)
	if br != nil {
		t.Fatalf("EmitWebApp refused: %s", br.Explanation)
	}
	if len(child.Artifacts) != len(web) {
		t.Fatalf("child has %d artifacts, EmitWebApp emits %d (the reframe must be byte-transparent)", len(child.Artifacts), len(web))
	}
	for i := range web {
		if child.Artifacts[i].Path != web[i].Path {
			t.Fatalf("artifact %d path diverged: %q vs %q", i, child.Artifacts[i].Path, web[i].Path)
		}
		if string(child.Artifacts[i].Bytes) != string(web[i].Bytes) {
			t.Fatalf("artifact %q is NOT byte-identical to EmitWebApp (anti-overwrite §9 broken)", web[i].Path)
		}
		if child.Artifacts[i].OutputHash != web[i].OutputHash || child.Artifacts[i].SourceHash != web[i].SourceHash {
			t.Fatalf("artifact %q hashes diverged from EmitWebApp", web[i].Path)
		}
	}
}

// TestEmitWebApp_StaysByteIdentical_WithAndWithoutInvariants — the anti-overwrite §9 frontier
// explicitly: feeding the spec invariants (which flow into the MASTER) must NOT change a single
// byte of the WEB child. The web form was frozen on shopapp; invariants live in the master.
func TestEmitWebApp_StaysByteIdentical_WithAndWithoutInvariants(t *testing.T) {
	bare := shopWebSpec()
	withInv := shopWebSpec()
	withInv.Invariants = []string{"every order has a positive total", "cart non-empty"}

	a1, br := EmitWebApp(bare)
	if br != nil {
		t.Fatalf("EmitWebApp refused bare spec: %s", br.Explanation)
	}
	a2, br := EmitWebApp(withInv)
	if br != nil {
		t.Fatalf("EmitWebApp refused spec with invariants: %s", br.Explanation)
	}
	if len(a1) != len(a2) {
		t.Fatalf("artifact count changed when invariants added: %d vs %d (web bytes must not depend on invariants)", len(a1), len(a2))
	}
	for i := range a1 {
		if a1[i].Path != a2[i].Path || string(a1[i].Bytes) != string(a2[i].Bytes) {
			t.Fatalf("web artifact %q changed when invariants added (anti-overwrite §9: master carries invariants, not the web child)", a1[i].Path)
		}
	}
}

// TestEmitWebChild_RefusesMalformed — honesty: a malformed spec is the SAME typed BlockReason
// (one refusal shape across the family), never a partial child.
func TestEmitWebChild_RefusesMalformed(t *testing.T) {
	cases := []struct {
		name string
		spec WebAppSpec
	}{
		{"no project", WebAppSpec{Entities: []entities.Entity{entities.Order()}}},
		{"empty app", WebAppSpec{Project: "shop"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			child, br := EmitWebChild(tc.spec)
			if br == nil {
				t.Fatalf("EmitWebChild accepted a malformed spec (%s); want a BlockReason", tc.name)
			}
			if len(child.Artifacts) != 0 || child.ParentID != "" {
				t.Fatalf("EmitWebChild returned a partial child on refusal (must be clean)")
			}
			if len(br.HowToFix) == 0 {
				t.Fatalf("BlockReason must carry a non-empty how_to_fix (no prison)")
			}
			// The master refusal also surfaces (the family shares one refusal shape).
			m, brM := EmitMasterView(tc.spec)
			if brM == nil {
				t.Fatalf("EmitMasterView accepted a malformed spec (%s)", tc.name)
			}
			if len(m.Sections) != 0 || len(m.Actions) != 0 {
				t.Fatalf("EmitMasterView returned a partial master on refusal")
			}
			if !strings.Contains(brM.Explanation, "MAÎTRE") {
				t.Fatalf("master BlockReason should name the master source; got %q", brM.Explanation)
			}
		})
	}
}
