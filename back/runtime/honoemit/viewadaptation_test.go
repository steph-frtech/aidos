package honoemit_test

// viewadaptation_test.go — LE MIROIR DU LOOPBACK (vue validée → requirement capitalisé → reproduit),
// RED FIRST. Modèle (utilisatrice, gravé 2026-06-14) : « comme il y a un LOOPBACK, quand j'ai VALIDÉ
// une vue elle devient requirement complet (pas au sens fort, mais pour que ça se REPRODUISE) ».
//
// Une adaptation ENFANT (un override per-plateforme — WindowTitle desktop, AppName mobile) que
// l'humain VALIDE devient une requirement SOFT capitalisée (pas un invariant, pas une vérité au sens
// fort) : content-adressée, append-only, provenancée (qui / quel enfant / quelle maître). Le RECOMPILE
// l'applique PUREMENT — l'enfant reproduit l'override validé sans qu'on le re-saisisse.
//
// LES QUATRE ASSERTIONS PORTEUSES :
//   (a) une adaptation NON validée n'est PAS capitalisée — l'enfant reste BASE (byte-identique au
//       canonique, anti-overwrite §9) ;
//   (b) une adaptation VALIDÉE est capitalisée + le recompile la REPRODUIT — EmitDesktopChildAdapted
//       avec la capitalisation = BYTE-ÉGAL à ce qui a été validé ;
//   (c) déterminisme — mêmes capitalisations ⇒ même enfant (byte-stable) ;
//   (d) le parentId reste la MAÎTRE — l'adaptation ne change pas la requirement canonique.
//
// RÉUTILISE compound (ne forke pas) : CapitaliseViewAdaptation route le motif via compound.Compound
// (la MÊME boucle que les behaviors/procédures, le mur firewall.ViaIdea) — aucune écriture kernel.

import (
	"bytes"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/brain/memory"
	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// loopbackMaster is the canonical master the children derive from (≥1 section + ≥1 action so it is
// projectable). The SAME master across the four assertions so the parentId is the load-bearing
// constant the adaptation never bends.
func loopbackMaster(t *testing.T) honoemit.MasterView {
	t.Helper()
	m, br := honoemit.EmitMasterView(loopbackSpec())
	if br != nil {
		t.Fatalf("EmitMasterView refused the loopback master: %s", br.Explanation)
	}
	return m
}

func loopbackSpec() honoemit.WebAppSpec {
	return honoemit.WebAppSpec{
		Project:  "shop",
		Entities: []entities.Entity{entities.Order()},
		Buttons:  []honoemit.ControlAction{{Control: control.CheckoutButton(), Action: action.CheckoutSubmit()}},
	}
}

// (a) — une adaptation NON validée n'est PAS capitalisée : l'enfant reste BASE.
func TestViewAdaptation_NotValidated_NotCapitalised(t *testing.T) {
	m := loopbackMaster(t)

	adapt := honoemit.ViewAdaptation{
		ChildTarget: honoemit.ChildDesktop,
		ParentID:    m.Hash(),
		Override:    honoemit.AdaptationOverride{WindowTitle: "Shop — Console"},
	}
	// La validation REFUSE l'override (Validated=false).
	cap, err := honoemit.CapitaliseViewAdaptation(adapt, honoemit.AdaptationValidation{Validated: false, By: "alice"})
	if err != nil {
		t.Fatalf("CapitaliseViewAdaptation returned error: %v", err)
	}
	if cap.Capitalised {
		t.Fatalf("a NON-validated adaptation must NOT be capitalised, got Capitalised=true")
	}
	if len(cap.Capture.ProceduralWrites) != 0 || len(cap.Capture.BehaviorCandidates) != 0 {
		t.Fatalf("a NON-validated adaptation must capitalise NOTHING via compound, got %d procedural / %d behavior",
			len(cap.Capture.ProceduralWrites), len(cap.Capture.BehaviorCandidates))
	}

	// L'enfant reproduit SANS capitalisation = la forme BASE (canonique), byte-identique.
	reproduced, br := honoemit.ReproduceWithCapitalised(m, honoemit.ChildDesktop, nil)
	if br != nil {
		t.Fatalf("ReproduceWithCapitalised(base) refused: %s", br.Explanation)
	}
	base, br := honoemit.EmitDesktopChild(m)
	if br != nil {
		t.Fatalf("EmitDesktopChild(base) refused: %s", br.Explanation)
	}
	assertChildrenByteEqual(t, base.Artifacts, reproduced.Artifacts, "base ≠ reproduced(no capitalisation)")
}

// (b) — une adaptation VALIDÉE est capitalisée + le recompile la REPRODUIT (byte-égal au validé).
func TestViewAdaptation_Validated_CapitalisedAndReproduced(t *testing.T) {
	m := loopbackMaster(t)

	override := honoemit.AdaptationOverride{WindowTitle: "Shop — Console"}
	adapt := honoemit.ViewAdaptation{
		ChildTarget: honoemit.ChildDesktop,
		ParentID:    m.Hash(),
		Override:    override,
	}
	cap, err := honoemit.CapitaliseViewAdaptation(adapt, honoemit.AdaptationValidation{Validated: true, By: "alice"})
	if err != nil {
		t.Fatalf("CapitaliseViewAdaptation returned error: %v", err)
	}
	if !cap.Capitalised {
		t.Fatalf("a VALIDATED adaptation must be capitalised, got Capitalised=false")
	}
	// REUSES compound — the SAME loop as behaviors/procedures: one procedural recall + one behavior
	// candidate, NO kernel write (the wall).
	if len(cap.Capture.ProceduralWrites) != 1 {
		t.Fatalf("expected exactly 1 procedural memory write-input, got %d", len(cap.Capture.ProceduralWrites))
	}
	if cap.Capture.ProceduralWrites[0].Kind != memory.KindProcedural {
		t.Fatalf("expected KindProcedural, got %q", cap.Capture.ProceduralWrites[0].Kind)
	}
	if len(cap.Capture.BehaviorCandidates) != 1 {
		t.Fatalf("expected exactly 1 behavior candidate idea, got %d", len(cap.Capture.BehaviorCandidates))
	}
	if cap.Capture.WroteKernel() {
		t.Fatalf("capitalising an adaptation must write NO kernel truth (the wall)")
	}
	// The capitalised requirement is content-addressed + carries the validation provenance.
	if cap.Requirement.ID == "" {
		t.Fatalf("the capitalised requirement must be content-addressed (non-empty ID)")
	}
	if cap.Requirement.By != "alice" {
		t.Fatalf("the capitalised requirement must carry the validator, got By=%q", cap.Requirement.By)
	}
	if !cap.Requirement.Validated {
		t.Fatalf("the capitalised requirement must be Validated=true")
	}

	// RECOMPILE applying the capitalised requirement → BYTE-EQUAL to what was validated.
	reproduced, br := honoemit.ReproduceWithCapitalised(m, honoemit.ChildDesktop, []honoemit.ViewAdaptation{cap.Requirement})
	if br != nil {
		t.Fatalf("ReproduceWithCapitalised refused: %s", br.Explanation)
	}
	validated, br := honoemit.EmitDesktopChildAdapted(m, honoemit.DesktopAdaptation{WindowTitle: "Shop — Console"})
	if br != nil {
		t.Fatalf("EmitDesktopChildAdapted(validated) refused: %s", br.Explanation)
	}
	assertChildrenByteEqual(t, validated.Artifacts, reproduced.Artifacts, "validated override ≠ reproduced(capitalised)")

	// And the reproduced child is DISTINCT from the base (the override actually bent the bytes).
	base, _ := honoemit.EmitDesktopChild(m)
	if childrenByteEqual(base.Artifacts, reproduced.Artifacts) {
		t.Fatalf("a validated override must change the bytes vs the base child (it did not)")
	}
}

// (b-mobile) — the SIBLING contract: a validated MOBILE override (AppName) reproduces byte-equal.
func TestViewAdaptation_Validated_MobileChild_Reproduced(t *testing.T) {
	m := loopbackMaster(t)

	adapt := honoemit.ViewAdaptation{
		ChildTarget: honoemit.ChildMobile,
		ParentID:    m.Hash(),
		Override:    honoemit.AdaptationOverride{AppName: "Shop Mobile"},
	}
	cap, err := honoemit.CapitaliseViewAdaptation(adapt, honoemit.AdaptationValidation{Validated: true, By: "bob"})
	if err != nil {
		t.Fatalf("CapitaliseViewAdaptation(mobile) returned error: %v", err)
	}
	if !cap.Capitalised {
		t.Fatalf("a VALIDATED mobile adaptation must be capitalised")
	}

	reproduced, br := honoemit.ReproduceWithCapitalised(m, honoemit.ChildMobile, []honoemit.ViewAdaptation{cap.Requirement})
	if br != nil {
		t.Fatalf("ReproduceWithCapitalised(mobile) refused: %s", br.Explanation)
	}
	validated, br := honoemit.EmitMobileChildAdapted(m, honoemit.MobileAdaptation{AppName: "Shop Mobile"})
	if br != nil {
		t.Fatalf("EmitMobileChildAdapted(validated) refused: %s", br.Explanation)
	}
	assertChildrenByteEqual(t, validated.Artifacts, reproduced.Artifacts, "validated mobile override ≠ reproduced")
}

// (c) — déterminisme : mêmes capitalisations ⇒ même enfant (byte-stable, re-run).
func TestViewAdaptation_Reproduce_Deterministic(t *testing.T) {
	m := loopbackMaster(t)
	caps := []honoemit.ViewAdaptation{{
		ChildTarget: honoemit.ChildDesktop,
		ParentID:    m.Hash(),
		Override:    honoemit.AdaptationOverride{WindowTitle: "Shop — Console"},
		Validated:   true,
		By:          "alice",
	}}

	first, br := honoemit.ReproduceWithCapitalised(m, honoemit.ChildDesktop, caps)
	if br != nil {
		t.Fatalf("ReproduceWithCapitalised first refused: %s", br.Explanation)
	}
	second, br := honoemit.ReproduceWithCapitalised(m, honoemit.ChildDesktop, caps)
	if br != nil {
		t.Fatalf("ReproduceWithCapitalised second refused: %s", br.Explanation)
	}
	assertChildrenByteEqual(t, first.Artifacts, second.Artifacts, "same capitalisations produced different children (non-deterministic)")

	// And the capitalised requirement id is itself deterministic (content-addressed).
	a := honoemit.ViewAdaptation{ChildTarget: honoemit.ChildDesktop, ParentID: m.Hash(), Override: honoemit.AdaptationOverride{WindowTitle: "X"}}
	c1, _ := honoemit.CapitaliseViewAdaptation(a, honoemit.AdaptationValidation{Validated: true, By: "alice"})
	c2, _ := honoemit.CapitaliseViewAdaptation(a, honoemit.AdaptationValidation{Validated: true, By: "alice"})
	if c1.Requirement.ID != c2.Requirement.ID {
		t.Fatalf("the capitalised requirement id must be deterministic (content-addressed): %q ≠ %q", c1.Requirement.ID, c2.Requirement.ID)
	}
}

// (d) — le parentId reste la MAÎTRE : l'adaptation ne change pas la requirement canonique.
func TestViewAdaptation_ParentStaysMaster(t *testing.T) {
	m := loopbackMaster(t)
	caps := []honoemit.ViewAdaptation{{
		ChildTarget: honoemit.ChildDesktop,
		ParentID:    m.Hash(),
		Override:    honoemit.AdaptationOverride{WindowTitle: "Shop — Console"},
		Validated:   true,
		By:          "alice",
	}}

	reproduced, br := honoemit.ReproduceWithCapitalised(m, honoemit.ChildDesktop, caps)
	if br != nil {
		t.Fatalf("ReproduceWithCapitalised refused: %s", br.Explanation)
	}
	if reproduced.ParentID != m.Hash() {
		t.Fatalf("the reproduced child's parentId must stay the MASTER %q, got %q", m.Hash(), reproduced.ParentID)
	}

	// A child reproduced WITHOUT capitalisation carries the SAME parentId (the master is invariant).
	base, _ := honoemit.ReproduceWithCapitalised(m, honoemit.ChildDesktop, nil)
	if base.ParentID != reproduced.ParentID {
		t.Fatalf("the override must not change the parentId: base %q ≠ adapted %q", base.ParentID, reproduced.ParentID)
	}
}

// assertChildrenByteEqual fails the test unless the two artifact slices are byte-for-byte identical
// (same paths, same bytes, same order). The loopback's load-bearing reproduction proof.
func assertChildrenByteEqual(t *testing.T, want, got []honoemit.Artifact, msg string) {
	t.Helper()
	if !childrenByteEqual(want, got) {
		t.Fatalf("%s: artifact slices differ (want %d artifacts, got %d)", msg, len(want), len(got))
	}
}

func childrenByteEqual(a, b []honoemit.Artifact) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Path != b[i].Path || a[i].OutputHash != b[i].OutputHash || !bytes.Equal(a[i].Bytes, b[i].Bytes) {
			return false
		}
	}
	return true
}
