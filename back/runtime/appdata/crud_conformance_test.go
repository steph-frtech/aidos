package appdata

// crud_conformance_test.go — le MIROIR (rouge→vert) du CÂBLAGE du harness Ashby (S82, ADR 0082)
// dans le chemin d'émission par projet (déterminisme-first §6/§8, le mur §2). Écrit ROUGE avant
// crud_conformance.go.
//
// LE TROU (l'audit dormant déterministe). Le harness `runtime/harness` (Ashby T1) construit + teste
// un CATALOGUE de fragments de conformité — CrudFragment(), ConformantCrudCell(), Inspect(), Hash() —
// mais AUCUN consommateur ne l'appelait : un MONSTRE au sens KRD (une capacité sans usage). Le sens
// d'Ashby (loi de la variété requise) + « conformant-CRUD » dicte l'attache : le fragment CRUD est le
// MIROIR DE CONFORMITÉ des cellules CRUD que l'app-builder ÉMET. EmitProjectServer (le vrai émetteur
// par projet) produit une cellule CRUD ; CrudConformance OBSERVE cette cellule émise et l'INSPECTE
// contre le fragment CRUD du harness — la régulation de variété, appliquée au résultat codé.
//
// L'OBSERVATION EST GENUINE (pas un appel bidon). Chaque capacité ∈ {identity, validation, transitions,
// audit} est lue d'un SIGNAL RÉEL de la cellule émise (ProjectServer) :
//   - identity   ← Schema non vide (le DDL donne à chaque entité son identité content-adressée) ;
//   - validation ← entities.json porte des champs typés (les écritures validées contre le contrat) ;
//   - transitions← Server != nil (les routes d'opération = les transitions déclarées) ;
//   - audit      ← Worker != nil (le worker draine l'outbox = la piste d'audit append-only S73/S74).
// Une app entités-seules (demoshop/techstore : 0 op) manque DONC genuinement transitions+audit — le
// harness le DIT (sensors rouges). Une app sync+async complète est conforme (tous verts). Le miroir
// est DISCRIMINANT : il rougit quand la cellule émise perd une capacité — il n'est pas tautologique.
//
// DÉTERMINISME-FIRST. ObserveCrudCell + CrudConformance sont PURES, TOTALES : (ProjectServer) → même
// cellule observée → même verdict de conformité. Aucune horloge, aucun RNG. Aucune écriture de vérité
// (le mur §2) : une lecture below-the-line de l'artefact émis, projetée sur le fragment du harness.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/harness"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// fullCrudOps is a sync+async cut: createOrder (sync → an HTTP transition route) + sendReceipt (async →
// a worker dispatcher = the outbox/audit trail). It drives the emitter to a CONFORMANT CRUD cell.
func fullCrudOps() []honoemit.Op {
	return []honoemit.Op{
		{Name: "createOrder"},
		{Name: "sendReceipt", Async: true, Trigger: operation.AsyncTrigger{Kind: operation.TriggerNotification}},
	}
}

// TestCrudConformance_FullCellIsConformant — GIVEN a project emitted with a full sync+async cut (data +
// server + worker), THEN the emitted CRUD cell declares ALL FOUR Ashby invariants (identity, validation,
// transitions, audit) and CrudConformance returns NO fired sensor — the cell conforms to the §48 CRUD
// topology's required variety. This is the REAL consumer of harness.CrudFragment().Inspect.
func TestCrudConformance_FullCellIsConformant(t *testing.T) {
	ps, err := EmitProjectServer("shop", orderEntity(), fullCrudOps())
	if err != nil {
		t.Fatalf("EmitProjectServer refused a valid full cut: %v", err)
	}
	fired := CrudConformance(ps)
	if len(fired) != 0 {
		t.Fatalf("a full sync+async CRUD cell must be conformant, yet sensors fired: %v", fired)
	}
}

// TestCrudConformance_EntitiesOnlyMissesTransitionsAndAudit — GIVEN an entities-only project (demoshop/
// techstore shape: 0 ops → no server, no worker), THEN the emitted cell genuinely LACKS the transitions
// (no operation routes) and audit (no outbox worker) capabilities, so the harness FIRES those two sensors
// — and ONLY those two (identity+validation hold: a schema + typed fields are still emitted). This proves
// the conformance is GENUINE (it reads real signals), DISCRIMINANT (a thinner cell reddens), and not a
// rubber-stamp.
func TestCrudConformance_EntitiesOnlyMissesTransitionsAndAudit(t *testing.T) {
	ps, err := EmitProjectServer("shop", orderEntity(), nil)
	if err != nil {
		t.Fatalf("EmitProjectServer refused the entities-only cut: %v", err)
	}
	fired := CrudConformance(ps)
	got := map[string]bool{}
	for _, k := range fired {
		got[k] = true
	}
	if got[harness.CrudIdentity] || got[harness.CrudValidation] {
		t.Fatalf("identity/validation must hold for an entities-only cell (schema+fields emitted), fired=%v", fired)
	}
	if !got[harness.CrudTransitions] {
		t.Fatalf("an entities-only cell has NO operation routes — the transitions sensor must fire, fired=%v", fired)
	}
	if !got[harness.CrudAudit] {
		t.Fatalf("an entities-only cell has NO outbox worker — the audit sensor must fire, fired=%v", fired)
	}
	if len(fired) != 2 {
		t.Fatalf("exactly transitions+audit must fire for an entities-only cell, got %v", fired)
	}
}

// TestCrudConformance_SyncOnlyMissesAudit — GIVEN a project with a SYNC-only op (createOrder → a server,
// but no async op → no worker), THEN transitions holds (the server route exists) but audit fires (no
// outbox worker drains effects). A different cell ⇒ a different firing set: the sensor is bound to a real
// signal, not a constant.
func TestCrudConformance_SyncOnlyMissesAudit(t *testing.T) {
	ps, err := EmitProjectServer("shop", orderEntity(), []honoemit.Op{{Name: "createOrder"}})
	if err != nil {
		t.Fatalf("EmitProjectServer refused a sync-only cut: %v", err)
	}
	fired := CrudConformance(ps)
	got := map[string]bool{}
	for _, k := range fired {
		got[k] = true
	}
	if got[harness.CrudTransitions] {
		t.Fatalf("a sync-op cell emits a server route — transitions must hold, fired=%v", fired)
	}
	if !got[harness.CrudAudit] {
		t.Fatalf("a sync-only cell has no outbox worker — the audit sensor must fire, fired=%v", fired)
	}
	if len(fired) != 1 {
		t.Fatalf("exactly audit must fire for a sync-only cell, got %v", fired)
	}
}

// TestCrudConformance_Deterministic — same emitted cell ⇒ same conformance verdict, every run (the
// reproducibility law, §8). The fragment Hash is also stable (proven once here through the public path).
func TestCrudConformance_Deterministic(t *testing.T) {
	ps, err := EmitProjectServer("shop", orderEntity(), fullCrudOps())
	if err != nil {
		t.Fatalf("EmitProjectServer refused: %v", err)
	}
	a := CrudConformance(ps)
	b := CrudConformance(ps)
	if len(a) != 0 || len(b) != 0 {
		t.Fatalf("full cell expected conformant on both runs, got a=%v b=%v", a, b)
	}
	h1, err := CrudFragmentAddress()
	if err != nil {
		t.Fatalf("CrudFragmentAddress errored: %v", err)
	}
	h2, err := CrudFragmentAddress()
	if err != nil {
		t.Fatalf("CrudFragmentAddress errored (2): %v", err)
	}
	if h1 == "" || h1 != h2 {
		t.Fatalf("CRUD fragment address must be stable & non-empty, got %q vs %q", h1, h2)
	}
}

// TestCrudVarietyOf_HonestRatio — the conformance ratio is honest: a full cell is 4/4 with no missing; an
// entities-only cell is 2/4 missing exactly transitions+audit. The denominator is the closed required
// variety (harness.CrudCapabilities), so Present = Required − len(Missing) — never a fabricated count.
func TestCrudVarietyOf_HonestRatio(t *testing.T) {
	full, err := EmitProjectServer("shop", orderEntity(), fullCrudOps())
	if err != nil {
		t.Fatalf("EmitProjectServer refused full cut: %v", err)
	}
	v := CrudVarietyOf(full)
	if v.Required != len(harness.CrudCapabilities()) {
		t.Fatalf("Required must equal the closed required variety, got %d want %d", v.Required, len(harness.CrudCapabilities()))
	}
	if v.Present != v.Required || len(v.Missing) != 0 {
		t.Fatalf("a full cell must be %d/%d with no missing, got %d/%d missing=%v", v.Required, v.Required, v.Present, v.Required, v.Missing)
	}

	ents, err := EmitProjectServer("shop", orderEntity(), nil)
	if err != nil {
		t.Fatalf("EmitProjectServer refused entities-only cut: %v", err)
	}
	ev := CrudVarietyOf(ents)
	if ev.Present != ev.Required-2 || len(ev.Missing) != 2 {
		t.Fatalf("an entities-only cell must be %d/%d missing 2, got %d/%d missing=%v", ev.Required-2, ev.Required, ev.Present, ev.Required, ev.Missing)
	}
}

// TestObserveCrudCell_GenuineSignals — the observation maps each capability to a REAL field of the emitted
// bundle, not a constant. Breaking a signal (drop the schema) drops the matching capability — the
// observation is wired to the artefact, not fabricated.
func TestObserveCrudCell_GenuineSignals(t *testing.T) {
	ps, err := EmitProjectServer("shop", orderEntity(), fullCrudOps())
	if err != nil {
		t.Fatalf("EmitProjectServer refused: %v", err)
	}
	cell := ObserveCrudCell(ps)
	for _, c := range harness.CrudCapabilities() {
		if !cell.Has[c] {
			t.Fatalf("a full emitted cell must declare %q, has=%v", c, cell.Has)
		}
	}
	// Fault-inject the artefact: a cell with no schema loses identity (the signal is real, not constant).
	ps.Schema = nil
	broken := ObserveCrudCell(ps)
	if broken.Has[harness.CrudIdentity] {
		t.Fatalf("dropping the schema must drop the identity capability (signal not wired)")
	}
}
