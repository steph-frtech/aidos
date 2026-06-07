// Package projectscope is the S54 Archive layer that SCOPES the truth-store to a
// project (app-builder EPIC 1). Until S53 the whole AIDOS truth-store was ONE
// undivided global graph; S53 added the `project` record; S54 threads a
// `project_id` FK through every truth + derived table —
//
//	kernel (truth·layer·link) · mirrors · ideas · changesets · dag · brain · context
//
// — and BACKFILLS the pre-existing singleton graph (the Order demo) into a seed
// project __system__.
//
// This package is PURE and DETERMINISTIC (CLAUDE.md §6/§8 determinism-first):
//
//   - SystemSeed() returns the content-addressed __system__ seed project — the
//     SAME record the migration INSERTs, computed with the S01/S02 records.Hash
//     scheme (never a forked hashing path). The migration_property_test pins the
//     SQL literal byte-for-byte against this Go, so the two can never drift.
//
//   - ScopedTables() is the CLOSED, ordered set of (schema, table) pairs the
//     migration scopes — the single source of truth for "which tables carry a
//     project_id". The migration and the read-path both read this list.
//
//   - ScopedSelect(schema, table, projectID) builds the deterministic, parameter-
//     ised, project-scoped read SQL ($1 = project_id). It is the read door the
//     engine uses so a query scoped to project A can NEVER return a project B row
//     (the cross-project-isolation done-criterion). Pure string assembly — no DB,
//     no clock, no rng; same input → same SQL (reproducibility mirror).
//
//   - EmitMigration() re-emits the project-scope migration DDL deterministically
//     from ScopedTables() + SystemSeed(): same inputs → byte-identical SQL (the
//     "émission de migration reproductible" done-criterion).
//
// THE WALL (CLAUDE.md §2): project_id is a SCOPE column, not a truth body. This
// package writes nothing; the migration adds the column + FK below the line and
// the agent keeps SELECT-only on kernel/mirrors (re-asserted in the SQL). RLS
// keyed on the propagated identity is S55; S54 lays the column + FK it keys on.
package projectscope

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/project"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// SystemSlug is the reserved slug of the seed project that adopts the pre-S54
// singleton graph (the Order demo). It is never a user-creatable slug.
const SystemSlug = "__system__"

// SystemOwner is the reserved owner_ref of the seed project — AIDOS itself, not a
// real human (a real owner arrives with S62).
const SystemOwner = "__aidos__"

// systemName / systemCreatedAt are the FIXED human fields of the seed, chosen so
// the seed's content address is STABLE and reproducible (no clock enters).
const (
	systemName      = "AIDOS System (Order demo)"
	systemCreatedAt = "1970-01-01T00:00:00Z"
)

// SystemSeed returns the content-addressed __system__ seed project. It is the
// exact record the S54 migration INSERTs: id == version == records.Hash of the
// canonical body, using the SAME S01/S02 content-address scheme as every project
// (records.Hash ∘ records.Canonicalize) — never a forked hashing path.
//
// The seed is the ONE reserved system project: its slug `__system__` is
// deliberately NOT a user-creatable slug (it does not pass the S53 slug regex),
// so the seed is built DIRECTLY from its canonical body rather than through
// project.New's user-facing validator. This is intentional — a human can never
// mint a project that collides with __system__. Pure + deterministic, no clock.
// project_scope_property_test.go asserts the SQL literal equals SystemSeed().ID so
// the migration and this Go can never drift.
func SystemSeed() project.Project {
	canon := SystemSeedCanonicalBody()
	h := records.Hash(canon)
	return project.Project{
		ID:        h,
		Slug:      SystemSlug,
		Name:      systemName,
		OwnerRef:  SystemOwner,
		CreatedAt: systemCreatedAt,
		Lifecycle: project.LifecycleActive,
		Version:   h,
	}
}

// SystemSeedCanonicalBody returns the canonical JSONB bytes the seed's id is the
// hash of — the exact bytes the migration's INSERT body hashes to. It marshals the
// seed's body in the SAME shape project.CanonicalBody uses (kind/slug/name/
// owner_ref/created_at/lifecycle) and runs records.Canonicalize, so the seed's
// content address is byte-identical to what an ordinary project of these fields
// would produce. Exposed so the property mirror can compare against the SQL.
func SystemSeedCanonicalBody() []byte {
	raw, err := json.Marshal(struct {
		Kind      string `json:"kind"`
		Slug      string `json:"slug"`
		Name      string `json:"name"`
		OwnerRef  string `json:"owner_ref"`
		CreatedAt string `json:"created_at"`
		Lifecycle string `json:"lifecycle"`
	}{
		Kind:      "project",
		Slug:      SystemSlug,
		Name:      systemName,
		OwnerRef:  SystemOwner,
		CreatedAt: systemCreatedAt,
		Lifecycle: string(project.LifecycleActive),
	})
	if err != nil {
		panic(fmt.Sprintf("projectscope: marshal seed body: %v", err))
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		panic(fmt.Sprintf("projectscope: canonicalize seed body: %v", err))
	}
	return canon
}

// SystemGenesisNode is the seed project's per-project DAG genesis node id (the
// dag_root row the migration inserts). The seed predates the S24 dag.NodeID
// scheme's run, so its genesis carries a fixed, reserved id rather than a derived
// one — it is the only project whose root is pinned (every user project derives
// its root via project.RootNode at S56).
const SystemGenesisNode = SystemSlug + "-genesis"

// ScopedTable names one truth/derived table that gains a project_id FK in S54.
type ScopedTable struct {
	Schema string
	Table  string
}

// Qualified returns the schema-qualified table name, e.g. "kernel.truth".
func (s ScopedTable) Qualified() string { return s.Schema + "." + s.Table }

// FKName / IndexName are the deterministic names the migration uses, so a re-emit
// is byte-identical and a roundtrip test can look them up.
func (s ScopedTable) FKName() string    { return s.Schema + "_" + s.Table + "_project_fk" }
func (s ScopedTable) IndexName() string { return s.Schema + "_" + s.Table + "_project_idx" }

// ScopedTables is the CLOSED, ordered set of tables S54 threads a project_id
// through — the SINGLE source of truth (the migration and the read-path both read
// it). In CLAUDE.md §1 order. Adding a scoped table = adding an entry here, never
// a one-off in the SQL (anti-drift, determinism-first).
func ScopedTables() []ScopedTable {
	return []ScopedTable{
		{Schema: "kernel", Table: "truth"},
		{Schema: "kernel", Table: "layer"},
		{Schema: "kernel", Table: "link"},
		{Schema: "mirrors", Table: "mirror"},
		{Schema: "ideas", Table: "idea"},
		{Schema: "changesets", Table: "changeset"},
		{Schema: "dag", Table: "phase"},
		{Schema: "brain", Table: "memory_item"},
		{Schema: "context", Table: "context_graph_decision"},
	}
}

// IsScoped reports whether (schema, table) is one of the S54 scoped tables. Used
// to refuse an unscoped read on a known-scoped table (anti-cross-project leak).
func IsScoped(schema, table string) bool {
	for _, s := range ScopedTables() {
		if s.Schema == schema && s.Table == table {
			return true
		}
	}
	return false
}

// ErrUnknownScopedTable is returned by ScopedSelect for a table not in the closed
// set — never a guessed table name (honesty: no fabricated scope).
type ErrUnknownScopedTable struct {
	Schema string
	Table  string
}

func (e ErrUnknownScopedTable) Error() string {
	return fmt.Sprintf("projectscope: %s.%s is not a project-scoped table", e.Schema, e.Table)
}

// ScopedSelect builds the deterministic, parameterised, project-scoped read SQL
// for one scoped table: it ALWAYS carries a `WHERE project_id = $1` clause, so a
// query scoped to project A can never return a project B row (the cross-project
// isolation done-criterion). The caller binds $1 = projectID. Pure string
// assembly — same (schema, table) → same SQL (reproducibility mirror). It refuses
// a table outside the closed set rather than emitting an unscoped query.
func ScopedSelect(schema, table string) (string, error) {
	if !IsScoped(schema, table) {
		return "", ErrUnknownScopedTable{Schema: schema, Table: table}
	}
	// SELECT * keeps the projection table-agnostic; the WHERE is the scope wall.
	// Identifiers come from the CLOSED set above, never user input — no injection
	// surface. $1 is the only bind, always present.
	return fmt.Sprintf("SELECT * FROM %s.%s WHERE project_id = $1", schema, table), nil
}

// MustMarshalSeedBody returns the seed body as a compact JSON string identical to
// the SQL literal in the migration — exposed for the property mirror's drift
// check (the SQL must embed exactly this).
func MustMarshalSeedBody() string {
	// Re-marshal from the typed body so the test compares semantic JSON, not the
	// possibly-reordered canonical bytes. The migration embeds this exact string.
	type seedBody struct {
		Kind      string `json:"kind"`
		Slug      string `json:"slug"`
		Name      string `json:"name"`
		OwnerRef  string `json:"owner_ref"`
		CreatedAt string `json:"created_at"`
		Lifecycle string `json:"lifecycle"`
	}
	b, err := json.Marshal(seedBody{
		Kind:      "project",
		Slug:      SystemSlug,
		Name:      systemName,
		OwnerRef:  SystemOwner,
		CreatedAt: systemCreatedAt,
		Lifecycle: string(project.LifecycleActive),
	})
	if err != nil {
		panic(err)
	}
	return string(b)
}

// EmitMigration re-emits the project-scope migration's CORE DDL deterministically
// from ScopedTables() + SystemSeed(). Same inputs → byte-identical output (the
// "émission de migration reproductible" done-criterion; property-pinned). It emits
// the EXPAND→BACKFILL→CONTRACT+FK+INDEX statements per table; the seed INSERT and
// the wall re-assertion are stable preambles. This is the deterministic SOURCE the
// hand-checked project_scope_baseline.sql mirrors (kept in sync by the test).
func EmitMigration() string {
	seed := SystemSeed()
	var b strings.Builder

	// Seed project (content-addressed; id == version).
	fmt.Fprintf(&b, "-- seed project %s\n", SystemSlug)
	fmt.Fprintf(&b,
		"INSERT INTO projects.project (id, body, version, created_at) VALUES (%s, %s::jsonb, %s, %s) ON CONFLICT (id) DO NOTHING;\n",
		sqlStr(seed.ID), sqlStr(MustMarshalSeedBody()), sqlStr(seed.Version), sqlStr(systemCreatedAt))
	fmt.Fprintf(&b,
		"INSERT INTO projects.dag_root (project_id, node_id, label, created_at) VALUES (%s, %s, %s, %s) ON CONFLICT (project_id) DO NOTHING;\n",
		sqlStr(seed.ID), sqlStr(SystemGenesisNode), sqlStr("project:"+SystemSlug+"@"+seed.ID), sqlStr(systemCreatedAt))

	// Per-table expand → backfill → contract → fk → index.
	for _, t := range ScopedTables() {
		q := t.Qualified()
		fmt.Fprintf(&b, "ALTER TABLE %s ADD COLUMN IF NOT EXISTS project_id text;\n", q)
		fmt.Fprintf(&b, "UPDATE %s SET project_id = %s WHERE project_id IS NULL;\n", q, sqlStr(seed.ID))
		fmt.Fprintf(&b, "ALTER TABLE %s ALTER COLUMN project_id SET DEFAULT %s;\n", q, sqlStr(seed.ID))
		fmt.Fprintf(&b, "ALTER TABLE %s ALTER COLUMN project_id SET NOT NULL;\n", q)
		fmt.Fprintf(&b, "ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (project_id) REFERENCES projects.project (id);\n", q, t.FKName())
		fmt.Fprintf(&b, "CREATE INDEX IF NOT EXISTS %s ON %s (project_id);\n", t.IndexName(), q)
	}
	return b.String()
}

// sqlStr renders a single-quoted SQL string literal, doubling embedded quotes.
// Deterministic; used only for the closed, non-user inputs above.
func sqlStr(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}

// keep records import referenced (the seed hash path runs through project.New /
// records.Hash; this var documents the reused content-address scheme).
var _ = records.Hash
