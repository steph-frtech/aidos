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

	// (2) No ops → the CRUD-only path, byte-identical to EmitProjectData (additivity, zero regression).
	if len(ops) == 0 {
		return ps, nil
	}

	// (3) Ops present → ALSO emit the operation server (reuse honoemit.EmitServer, never a second
	// projector). A malformed op is a typed BlockReason folded into an error (honesty, never a partial).
	spec := honoemit.ServerSpec{Project: project, Ops: ops}
	server, br := honoemit.EmitServer(spec)
	if br != nil {
		return ProjectServer{}, fmt.Errorf("appdata: emit server for project %q refused (%s): %s", project, br.Code, br.Explanation)
	}
	ps.Server = &server

	// (4) The WORKER — only when at least one op is async (an async op gets a dispatcher, never a sync
	// HTTP handler). Reuses honoemit.EmitWorker. An all-sync cut emits no worker (no dead bytes).
	if hasAnyAsync(ops) {
		worker, br := honoemit.EmitWorker(spec)
		if br != nil {
			return ProjectServer{}, fmt.Errorf("appdata: emit worker for project %q refused (%s): %s", project, br.Code, br.Explanation)
		}
		ps.Worker = &worker
	}

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
