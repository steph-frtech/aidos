package appdata

// projectserver.go — le CÂBLAGE du PROJECTEUR D'OPÉRATIONS dans le chemin d'émission par projet.
//
// LE TROU (l'audit). EmitProjectData n'émet que les DONNÉES (schema.sql + entities.json) — le CRUD
// générique aidos-app. Le projecteur d'opérations honoemit.EmitServer (prouvé en or par la fixture S87 :
// Ops createOrder/cancelOrder + sendReceipt async → routes Hono interpréteur-backed) existe mais n'était
// PAS branché ici. EmitProjectServer comble le trou en RÉUTILISANT honoemit.EmitServer / EmitWorker — il
// ne FORKE PAS un second projecteur (ADR 0007 reuse, déterminisme-first §6/§8).
//
// ADDITIF (anti-overwrite §9). EmitProjectServer est un SUR-ENSEMBLE de EmitProjectData :
//   - len(ops) == 0 → comportement INCHANGÉ : seuls (schema, entities.json) sont rendus, le CRUD
//     générique ; AUCUN serveur/worker — exactement ce que EmitProjectData rend (les projets
//     entités-seules existants, demoshop/techstore, restent byte-identiques, zéro régression) ;
//   - len(ops) > 0 → émet AUSSI le serveur d'opérations (honoemit.EmitServer) et, dès qu'une op est
//     async, le worker (honoemit.EmitWorker). La couche données est toujours émise (jamais remplacée).
//
// DÉTERMINISME-FIRST. EmitProjectServer est PURE, TOTALE, byte-stable : (project, Canonicalize(entities),
// ops) → mêmes artefacts. Elle hérite la byte-stabilité de EmitProjectData ET de honoemit (tri d'ops
// canonique, ordre d'import fixé, sauts de ligne "\n"). Aucune horloge, aucun RNG. Une op malformée /
// un projet sans nom / aucune entité surface la cause (BlockReason honoemit ou erreur appdata) — jamais
// un rendu partiel, jamais un panic, jamais une route inventée. C'est une PROJECTION below-the-line :
// elle n'écrit AUCUNE vérité (le mur §2).

import (
	"fmt"

	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// ProjectServer is the full per-project emission bundle: the entity DATA layer (the EXACT two artifacts
// EmitProjectData renders — schema.sql + entities.json, what Pulumi mounts) PLUS the OPTIONAL operation
// server/worker. Server and Worker are nil for an entities-only project (no ops) — so the entities-only
// path is structurally indistinguishable from a direct EmitProjectData call (the additivity guarantee).
//
// Schema/EntitiesJSON are raw bytes (the data layer Pulumi mounts verbatim). Server/Worker are honoemit
// Artifacts (content-addressed, with their relative gen/<project>/server/*.ts path) the deploy lands and
// the per-project Hono image builds.
type ProjectServer struct {
	Schema       []byte             // 01-schema.sql — the project's DDL (EmitProjectData, unchanged).
	EntitiesJSON []byte             // entities.json — the per-entity CRUD metadata (EmitProjectData, unchanged).
	Server       *honoemit.Artifact // gen/<project>/server/server.ts — nil when no ops (CRUD-only).
	Worker       *honoemit.Artifact // gen/<project>/server/worker.ts — nil when no ASYNC op.
	// Conformance is the Ashby T1 verdict (runtime/harness, ADR 0082) over the emitted bundle —
	// how many of the four CRUD invariants (identity/validation/transitions/audit) the cell holds
	// vs the required variety, + the missing set. A REPORT (never a gate), the LIVE consumer that
	// wires runtime/harness (the audit's single net dormant hole) into the deploy emit path. It
	// changes no emitted bytes (Schema/EntitiesJSON/Server/Worker) — additivity preserved.
	Conformance CrudVariety `json:"conformance"`
}

// EmitProjectServer is the per-project emitter that WIRES the operation projector into the emission path,
// additively over EmitProjectData. It is PURE, TOTAL, byte-stable.
//
//	EmitProjectServer(project, entities, nil)  ≡  EmitProjectData(project, entities) + Server/Worker nil
//	EmitProjectServer(project, entities, ops)  → the above + honoemit.EmitServer(+EmitWorker if async)
//
// The data layer is ALWAYS emitted first (and its refusal — empty project / no entities — surfaces
// verbatim, so an entities-only deploy fails exactly as it does today). The operation server is emitted
// ONLY when ops are present, reusing honoemit.EmitServer (never a second projector). A malformed op
// surfaces the honoemit BlockReason folded into an error (the S13 honesty shape, never a partial render).
//
// hasAnyAsync decides the worker: honoemit.EmitWorker accepts a spec with no async op (it renders a valid
// empty-dispatcher worker), but emitting one when no op is async would be dead bytes the deploy never
// runs — so the worker is emitted ONLY when at least one op is async (the honest minimal projection).
func EmitProjectServer(project string, entities []generators.EntitySource, ops []honoemit.Op) (ProjectServer, error) {
	// (1) The DATA layer — ALWAYS emitted, reusing EmitProjectData unchanged. Its refusal (empty project /
	// no entities) is the same refusal the existing entities-only deploy already surfaces.
	schema, entitiesJSON, err := EmitProjectData(project, entities)
	if err != nil {
		return ProjectServer{}, err
	}

	ps := ProjectServer{Schema: schema, EntitiesJSON: entitiesJSON}

	// (2) Ops present → ALSO emit the operation server (reuse honoemit.EmitServer, never a second
	// projector) + the worker iff an op is async. No ops → CRUD-only, the data layer stays exactly
	// what EmitProjectData renders (Server/Worker nil — additivity, zero regression).
	if len(ops) > 0 {
		spec := honoemit.ServerSpec{Project: project, Ops: ops}
		server, br := honoemit.EmitServer(spec)
		if br != nil {
			return ProjectServer{}, fmt.Errorf("appdata: emit server for project %q refused (%s): %s", project, br.Code, br.Explanation)
		}
		ps.Server = &server
		if hasAnyAsync(ops) {
			worker, br := honoemit.EmitWorker(spec)
			if br != nil {
				return ProjectServer{}, fmt.Errorf("appdata: emit worker for project %q refused (%s): %s", project, br.Code, br.Explanation)
			}
			ps.Worker = &worker
		}
	}

	// (3) Ashby T1 CONFORMANCE — the live consumer of runtime/harness (ADR 0082), computed over the
	// FINAL bundle (after Server/Worker). A pure report; it sets only the Conformance field, never
	// a mounted byte. This is what makes the harness reachable from the deploy emit path.
	ps.Conformance = CrudVarietyOf(ps)
	return ps, nil
}

// hasAnyAsync reports whether any operation in the cut is async — a pure predicate over the closed Async
// flag (so the worker is emitted iff there is an effect to drain).
func hasAnyAsync(ops []honoemit.Op) bool {
	for _, op := range ops {
		if op.Async {
			return true
		}
	}
	return false
}
