package appdata

// crud_conformance.go — le CÂBLAGE du harness Ashby (S82, ADR 0082) dans le chemin d'émission par projet.
//
// LE TROU (l'audit dormant déterministe). Le harness `runtime/harness` (Ashby T1) construit + teste un
// CATALOGUE de fragments de conformité — CrudFragment(), ConformantCrudCell(), Inspect(), Hash(),
// Topologies() — mais AUCUN consommateur ne l'appelait : un MONSTRE au sens KRD (une capacité sans usage,
// §1/§6). Le sens d'Ashby (loi de la variété requise §136) + « conformant-CRUD » dicte l'attache : le
// fragment CRUD est le MIROIR DE CONFORMITÉ des cellules CRUD que l'app-builder ÉMET. EmitProjectServer
// (le vrai émetteur par projet, déjà branché dans aidosappemit/aidospulumi) produit une cellule CRUD ;
// ICI on OBSERVE cette cellule émise et on l'INSPECTE contre le fragment CRUD du harness — la régulation
// de variété appliquée au résultat codé (le « BDD du résultat codé »).
//
// CE N'EST PAS UN APPEL BIDON (usefulNotFake). L'observation lit des SIGNAUX RÉELS de l'artefact émis :
// la cellule conforme déclare une capacité IFF le bundle ProjectServer porte vraiment cette capacité.
// Une app entités-seules (demoshop/techstore : 0 op) manque genuinement transitions+audit — le harness
// le DIT. Le verdict CHANGE quand la cellule émise change : c'est un vrai détecteur, pas un constant-green.
//
// DÉTERMINISME-FIRST (§6/§8). ObserveCrudCell + CrudConformance sont PURES, TOTALES : (ProjectServer) →
// même cellule observée → même verdict. Aucune horloge, aucun RNG, aucune fuite d'ordre. Le fragment et
// son adresse content-addressée (Hash) sont stables (la loi de reproductibilité). Aucune écriture de
// vérité (le mur §2) : une lecture below-the-line de l'artefact émis, projetée sur le harness — qui lui
// n'importe que records pour son schéma d'adresse. C'est une PROJECTION, régénérable.

import (
	"github.com/steph-frtech/aidos/back/runtime/harness"
)

// ObserveCrudCell projects an emitted per-project bundle (ProjectServer) into the deterministic
// harness.ObservedCell the CRUD sensors inspect. Each of the four §19 capabilities is read from a REAL
// field of the bundle — never a constant — so the observation is wired to the artefact the emitter
// actually produced:
//
//   - identity   ← a non-empty Schema: the DDL gives every entity a content-addressed table identity.
//   - validation ← a non-empty EntitiesJSON: the entity metadata pins the typed fields writes validate
//     against (the entity contract the generic CRUD admin enforces).
//   - transitions← a Server artifact: the emitted Hono server carries one route per operation (S87) —
//     the declared state transitions. An entities-only cell (no ops) has none.
//   - audit      ← a Worker artifact: the async worker drains the outbox (S73/S74) — the append-only
//     audit/effect trail. A purely-sync or entities-only cell has none.
//
// It is PURE and TOTAL: a nil-field bundle simply yields a cell that does not declare that capability
// (and the matching sensor will fire), never a panic.
func ObserveCrudCell(ps ProjectServer) harness.ObservedCell {
	has := map[string]bool{
		harness.CrudIdentity:    len(ps.Schema) > 0,
		harness.CrudValidation:  len(ps.EntitiesJSON) > 0,
		harness.CrudTransitions: ps.Server != nil,
		harness.CrudAudit:       ps.Worker != nil,
	}
	return harness.ObservedCell{Has: has}
}

// CrudConformance is the REAL consumer of the Ashby harness: it observes the emitted CRUD cell and runs
// the closed CRUD fragment's deterministic sensors over it (harness.CrudFragment().Inspect). It returns
// the keys of the capabilities the emitted cell FAILS to declare (the fired sensors), in the fragment's
// declared order — an empty result means the emitted cell holds the §48 CRUD topology's full required
// variety (Ashby: the regulator's variety ≥ the regulated cell's). The caller (the deploy cockpit /
// `aidos project`) surfaces a non-empty result as the honest list of missing CRUD capabilities.
//
// It is PURE, TOTAL, deterministic: same emitted bundle ⇒ same fired set. It writes no truth (the wall).
func CrudConformance(ps ProjectServer) []string {
	return harness.CrudFragment().Inspect(ObserveCrudCell(ps))
}

// CrudFragmentAddress is the content address of the CRUD fragment the conformance check uses — the S02
// Hash over the fragment's canonical body (reused via harness.HarnessFragment.Hash, never forked). It is
// stable (same fragment ⇒ same address) and lets the cockpit pin WHICH harness version judged a cell
// (the reproducibility mirror, ADR 0082 §21).
func CrudFragmentAddress() (string, error) {
	return harness.CrudFragment().Hash()
}

// CrudVariety is the HONEST conformance ratio of an emitted cell: how many of the §48 CRUD topology's
// required capabilities the cell declares, out of the full required variety. The denominator is the
// closed capability set (harness.CrudCapabilities — the full required variety per Ashby), NOT a magic
// number, so the ratio tracks the catalogue: add a CRUD invariant by ADR and Required grows with it.
type CrudVariety struct {
	// Present is the count of CRUD capabilities the emitted cell declares.
	Present int `json:"present"`
	// Required is the full required variety of the topology (len(CrudCapabilities)).
	Required int `json:"required"`
	// Missing names the capabilities the cell fails to declare (the fired sensors), in declared order.
	Missing []string `json:"missing,omitempty"`
}

// CrudVarietyOf reports the conformance ratio of an emitted per-project cell against the CRUD topology's
// full required variety. It REUSES the harness's closed required-variety set (CrudCapabilities) as the
// denominator and CrudConformance (the harness Inspect) for the missing set — so Present = Required −
// len(Missing) is an honest count, never a fabricated one. PURE, TOTAL, deterministic; writes no truth.
func CrudVarietyOf(ps ProjectServer) CrudVariety {
	required := harness.CrudCapabilities()
	missing := CrudConformance(ps)
	return CrudVariety{
		Present:  len(required) - len(missing),
		Required: len(required),
		Missing:  missing,
	}
}
