// Package provision is the AIDOS S89 per-app DATASTORE PROVISIONER (app-builder
// EPIC 9, ROADMAP-app-builder §S89, ADR 0006 addendum 0047, ROADMAP-provisioning-
// deploy DP15, ADR 0043).
//
// THE STEP. Given a per-app provisioning spec (the project, its chosen datastore
// target, the S88 go/no-go Decision, the entity ASTs to project, and whether the
// app needs vector search), this package PLANS the datastore that the emitted app
// runs against:
//
//   - plain-Postgres is the DEFAULT target (+ a pgvector sidecar iff the app needs
//     vector search) — the escape hatch by construction (S88);
//   - Doltgres (Postgres-wire, git-for-data: branch/merge/diff/`as of`) is OPT-IN
//     per app, and only legal when the S88 Decision's verdict is Go (Plan refuses a
//     doltgres opt-in under a no-go Decision — honesty, never a silent downgrade);
//   - the SAME Atlas migration emitter (S95/gen/db.EmitMigration) renders the DDL,
//     and the SAME Postgres dialect is reused on both targets (a TS Postgres client
//     drives the emitted app per the EPIC 9 preamble — no sqlc/pgx in the tree);
//   - a narrowing (destructive) Atlas expand-contract migration is HUMAN-GATED via a
//     declared DataTruthScope (db.RequireMigration) — Plan surfaces the BlockReason
//     verbatim, it never bypasses the gate;
//   - each project gets an ISOLATED datastore (a per-project database name +
//     namespace, deterministically derived from the project id), so project A never
//     reaches project B's data (S55/S82 isolation, the wall §2);
//   - the plan is emitted as a Pulumi RESOURCE descriptor (DP15, ADR 0043) consumed
//     by the deploy track at pre-deploy (DDL → Atlas → start).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Plan is a PURE, TOTAL, DETERMINISTIC
// function of its spec — no clock, no RNG, no map-order leak, no absolute paths,
// normalized newlines, stable (sorted) field/entity order. The plan is content-
// addressed (id == Hash(Canonicalize(body)), S02 reused): same spec → byte-
// identical plan. The reproducibility mirror (provision_property_test.go in Go,
// lib/provision.test.ts in TS) pins same-input→same-output. No LLM enters: target
// resolution is a membership check, isolation is a hash, the DDL comes from the
// existing emitter, the gate is the existing pure guard.
//
// THE WALL (CLAUDE.md §2). Plan READS the entity ASTs (a prior Kernel truth, never
// authored here), the S88 Decision, and an OPTIONAL declared DataTruthScope; it
// EMITS a plan/descriptor BELOW the line (a projection). It writes NO truth: no
// kernel/mirrors/fitness write. Applying the plan against a real container is the
// Testcontainers MIRROR's job (provision_apply_test.go) — this package only plans.
package provision

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/doltgresspike"
	"github.com/steph-frtech/aidos/back/runtime/generators"
)

// Target is the per-app datastore target. It re-uses the S88 Target vocabulary so
// the default/opt-in semantics never drift from the spike's verdict.
type Target = doltgresspike.Target

const (
	// PlainPostgres is the DEFAULT per-app target (the escape hatch by construction).
	PlainPostgres = doltgresspike.PlainPostgres
	// Doltgres is the OPT-IN, git-for-data target — legal only under an S88 Go Decision.
	Doltgres = doltgresspike.Doltgres
)

// Spec is the per-app provisioning request. It is the PURE input of Plan: Plan
// fetches nothing (no DB, no clock, no RNG) — every field is supplied.
type Spec struct {
	// ProjectID is the emitted app's project id (S55). It seeds the deterministic
	// per-project isolation (database name + namespace). Required.
	ProjectID string `json:"projectId"`
	// Target is the CHOSEN datastore target. Empty ⇒ PlainPostgres (the default by
	// construction). A Doltgres choice is honoured only under an S88 Go Decision.
	Target Target `json:"target"`
	// Decision is the S88 go/no-go Decision the choice is validated against. A
	// Doltgres opt-in under a no-go (or absent) Decision is REFUSED.
	Decision doltgresspike.Decision `json:"decision"`
	// Entities are the entity ASTs to project into the datastore DDL (S35/S74). The
	// emitted CREATE-TABLE DDL is rendered by the SAME Atlas emitter (gen/db).
	Entities []generators.EntitySource `json:"entities"`
	// NeedsVector declares whether the app needs vector search; iff true a pgvector
	// sidecar is added to a plain-Postgres plan (Doltgres carries no pgvector sidecar).
	NeedsVector bool `json:"needsVector"`
	// Change is the OPTIONAL §44.3 change descriptor for the migration the DDL effects.
	// When it touches historical data without a declared DataTruthScope, Plan surfaces
	// the human-gate BlockReason (it never bypasses db.RequireMigration). nil ⇒ a fresh
	// provision (create-only, no historical impact).
	Change *db.Change `json:"change,omitempty"`
}

// Sidecar is one auxiliary service the datastore needs (currently only pgvector).
type Sidecar struct {
	// Kind is the sidecar kind. Closed set: only "pgvector" today.
	Kind string `json:"kind"`
	// Image is the declared container image (above-the-line, never discovered).
	Image string `json:"image"`
}

const (
	// pgvectorImage is the DECLARED pgvector-enabled Postgres image (above the line).
	pgvectorImage = "pgvector/pgvector:pg16"
	// plainPostgresImage is the DECLARED plain-Postgres image.
	plainPostgresImage = "postgres:16-alpine"
	// doltgresImage is the DECLARED Doltgres (Postgres-wire) image.
	doltgresImage = "dolthub/doltgresql:latest"
)

// DeclaredImages returns the per-target container images (above-the-line, never
// learned). The MCP `images` tool and the Workbench legend read this single source
// so the image set is never re-invented downstream.
func DeclaredImages() map[string]string {
	return map[string]string{
		"plain-postgres": plainPostgresImage,
		"pgvector":       pgvectorImage,
		"doltgres":       doltgresImage,
	}
}

// PulumiResource is the DP15/ADR 0043 resource descriptor the deploy track emits.
// It is a declarative resource (a Pulumi ComponentResource shape), not executable
// code here — the deploy emitter (DP15) renders it to Pulumi/TS at pre-deploy.
type PulumiResource struct {
	// Type is the Pulumi resource type token (a stable, declared string).
	Type string `json:"type"`
	// Name is the resource name (the isolated datastore name — per project).
	Name string `json:"name"`
	// Image is the container image the resource runs.
	Image string `json:"image"`
	// Database is the per-project database name (isolation).
	Database string `json:"database"`
	// Env is the declared, SORTED environment for the resource (never secrets here —
	// only non-secret wiring; deterministic order so the descriptor is reproducible).
	Env []KV `json:"env"`
}

// KV is a sorted key/value pair (so the descriptor is order-stable / reproducible).
type KV struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// Plan is the content-addressed per-app provisioning plan Plan emits. It is a
// RECORD (a projection), never a truth: id == Hash(Canonicalize(canonical body)).
type Plan struct {
	// ID is the S02 content address of the plan body (reproducible / tamper-evident).
	ID string `json:"id"`
	// ProjectID echoes the project the plan provisions.
	ProjectID string `json:"projectId"`
	// Target is the RESOLVED target (plain-postgres unless a legal doltgres opt-in).
	Target Target `json:"target"`
	// Image is the container image for the resolved target (+ pgvector when needed).
	Image string `json:"image"`
	// Database is the per-project isolated database name (deterministic from ProjectID).
	Database string `json:"database"`
	// Namespace is the per-project isolated namespace/schema (deterministic from ProjectID).
	Namespace string `json:"namespace"`
	// Sidecars are the auxiliary services (pgvector iff NeedsVector on plain-postgres).
	Sidecars []Sidecar `json:"sidecars"`
	// DDL is the rendered Atlas migration SQL (CREATE TABLE per entity, in sorted order),
	// from the SAME emitter as the OS (gen/db.EmitMigration). It applies on the resolved
	// target (both targets speak the same Postgres dialect).
	DDL string `json:"ddl"`
	// SupportsAsOf reports whether the resolved target supports `as of` time-travel
	// queries (git-for-data). True only for Doltgres.
	SupportsAsOf bool `json:"supportsAsOf"`
	// MigrationRequired echoes db.RequireMigration: the change needs a declared migration.
	MigrationRequired bool `json:"migrationRequired"`
	// Resource is the Pulumi resource descriptor (DP15) the deploy track consumes.
	Resource PulumiResource `json:"resource"`
	// Reasons explains the resolution in deterministic, actionable terms.
	Reasons []string `json:"reasons"`
}

// Plan is the AUTHORITATIVE pure provisioner: Spec → (Plan, BlockReason?). It is
// total, deterministic and side-effect-free. It returns a BlockReason (the S13
// shape) — never a panic — for:
//   - a Doltgres opt-in under a no-go / absent S88 Go Decision (CodeOutOfScope: the
//     chosen target is not in the Decision's legal opt-in set);
//   - a malformed entity AST (the gen/db emitter's BlockReason, surfaced verbatim);
//   - a historical-impact migration without a declared DataTruthScope (the human-gate
//     BlockReason from db.RequireMigration, surfaced verbatim).
//
// It NEVER invents a target, a column, or a database name; isolation is a pure hash
// of the project id, the DDL comes from the existing emitter, the gate is the
// existing pure guard. No LLM enters.
func BuildPlan(s Spec) (Plan, *blockreason.BlockReason) {
	if strings.TrimSpace(s.ProjectID) == "" {
		br := blockreason.For(blockreason.CodeOutOfScope)
		return Plan{}, &br
	}

	// 1. Resolve the target. Empty ⇒ the default (plain-postgres) by construction.
	resolved := s.Target
	if resolved == "" {
		resolved = PlainPostgres
	}
	reasons := make([]string, 0, 4)
	switch resolved {
	case PlainPostgres:
		reasons = append(reasons, "target plain-postgres (the default by construction; escape hatch always available)")
	case Doltgres:
		// Doltgres is opt-in ONLY under an S88 Go Decision. Honesty: refuse, never
		// silently downgrade to plain-postgres.
		if !s.Decision.OptInAllowed(Doltgres) {
			br := blockreason.For(blockreason.CodeOutOfScope)
			return Plan{}, &br
		}
		reasons = append(reasons, fmt.Sprintf(
			"target doltgres (opt-in, legal under S88 Decision %s = %s; default stays plain-postgres)",
			short(s.Decision.ID), s.Decision.Verdict))
	default:
		// An unknown target is refused, never coerced.
		br := blockreason.For(blockreason.CodeOutOfScope)
		return Plan{}, &br
	}

	// 2. Per-project isolation: a deterministic database name + namespace from the
	//    project id (a hash, never a guess). Project A never collides with project B.
	db4 := isolation(s.ProjectID)
	dbName := "app_" + db4
	namespace := "proj_" + db4

	// 3. Image + sidecars. pgvector sidecar only on a plain-postgres plan that needs
	//    vector search (Doltgres carries no pgvector sidecar today).
	image := plainPostgresImage
	sidecars := []Sidecar{}
	supportsAsOf := false
	switch resolved {
	case PlainPostgres:
		if s.NeedsVector {
			image = pgvectorImage
			sidecars = append(sidecars, Sidecar{Kind: "pgvector", Image: pgvectorImage})
			reasons = append(reasons, "pgvector sidecar added (app needs vector search)")
		}
	case Doltgres:
		image = doltgresImage
		supportsAsOf = true
		reasons = append(reasons, "doltgres supports `as of` time-travel (branch/merge/diff/as-of)")
		if s.NeedsVector {
			// Honesty: no pgvector on doltgres today — record the caveat, do not fabricate one.
			reasons = append(reasons, "note: vector search requested but pgvector sidecar is plain-postgres only — not added on doltgres")
		}
	}

	// 4. Human-gate the migration (db.RequireMigration) BEFORE rendering DDL. A
	//    historical-impact change without a declared DataTruthScope is REFUSED here —
	//    Plan surfaces the gate's BlockReason verbatim, never bypasses it.
	migrationRequired := false
	if s.Change != nil {
		required, br := db.RequireMigration(*s.Change)
		if br != nil {
			return Plan{}, br
		}
		migrationRequired = required
		if required {
			reasons = append(reasons, "migration human-gated via declared DataTruthScope (expand-contract, forward-only)")
		}
	}

	// 5. Render the DDL from the SAME Atlas emitter as the OS. Entities are sorted so
	//    the DDL is byte-stable. A malformed entity surfaces the emitter's BlockReason.
	ddl, br := renderDDL(s.Entities)
	if br != nil {
		return Plan{}, br
	}

	// 6. The Pulumi resource descriptor (DP15). Env is sorted for reproducibility.
	res := PulumiResource{
		Type:     "aidos:datastore:" + string(resolved),
		Name:     dbName,
		Image:    image,
		Database: dbName,
		Env: sortedKV(map[string]string{
			"POSTGRES_DB":     dbName,
			"AIDOS_NAMESPACE": namespace,
			"AIDOS_TARGET":    string(resolved),
		}),
	}

	p := Plan{
		ProjectID:         s.ProjectID,
		Target:            resolved,
		Image:             image,
		Database:          dbName,
		Namespace:         namespace,
		Sidecars:          sidecars,
		DDL:               ddl,
		SupportsAsOf:      supportsAsOf,
		MigrationRequired: migrationRequired,
		Resource:          res,
		Reasons:           reasons,
	}
	p.ID = records.Hash(p.canonicalPayload())
	return p, nil
}

// renderDDL renders the CREATE-TABLE DDL for the entities, in sorted (by name)
// order, REUSING gen/db.EmitMigration (prior == nil ⇒ the create shape, the S35
// EmitDDL body). It is pure and order-stable. A malformed entity surfaces the
// emitter's BlockReason verbatim (never a re-coined code).
func renderDDL(entities []generators.EntitySource) (string, *blockreason.BlockReason) {
	sorted := make([]generators.EntitySource, len(entities))
	copy(sorted, entities)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Name < sorted[j].Name })

	var b strings.Builder
	for i, e := range sorted {
		art, br := db.EmitMigration(e, nil)
		if br != nil {
			return "", br
		}
		if i > 0 {
			b.WriteString("\n")
		}
		b.Write(art.Bytes)
	}
	return b.String(), nil
}

// isolation derives a deterministic per-project 12-hex isolation token from the
// project id (a hash, never a guess). Project A and project B never collide; the
// same project always maps to the same datastore — reproducible isolation.
func isolation(projectID string) string {
	h := records.Hash([]byte("provision/v1:" + projectID))
	return short(h)
}

// short returns the first 12 hex of a content address (a stable, collision-safe
// prefix for human-facing names; the full hash stays the address).
func short(h string) string {
	if len(h) >= 12 {
		return h[:12]
	}
	return h
}

// sortedKV returns the map as KV pairs in stable (key-sorted) order.
func sortedKV(m map[string]string) []KV {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]KV, 0, len(keys))
	for _, k := range keys {
		out = append(out, KV{Key: k, Value: m[k]})
	}
	return out
}

// canonicalPayload is the deterministic byte representation hashed into the plan
// ID. It excludes the ID itself and the derived human-readable Reasons, so the
// content address keys ONLY on the load-bearing resolution — two plans that agree
// on the resolution agree on the ID.
func (p Plan) canonicalPayload() []byte {
	type payload struct {
		ProjectID         string         `json:"projectId"`
		Target            Target         `json:"target"`
		Image             string         `json:"image"`
		Database          string         `json:"database"`
		Namespace         string         `json:"namespace"`
		Sidecars          []Sidecar      `json:"sidecars"`
		DDL               string         `json:"ddl"`
		SupportsAsOf      bool           `json:"supportsAsOf"`
		MigrationRequired bool           `json:"migrationRequired"`
		Resource          PulumiResource `json:"resource"`
	}
	b, _ := json.Marshal(payload{
		ProjectID:         p.ProjectID,
		Target:            p.Target,
		Image:             p.Image,
		Database:          p.Database,
		Namespace:         p.Namespace,
		Sidecars:          p.Sidecars,
		DDL:               p.DDL,
		SupportsAsOf:      p.SupportsAsOf,
		MigrationRequired: p.MigrationRequired,
		Resource:          p.Resource,
	})
	return b
}
