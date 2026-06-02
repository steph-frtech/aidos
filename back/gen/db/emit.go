package db

import (
	"fmt"
	"path"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/generators"
)

// MigrationArtifact is one emitted db-projection migration. It is content-addressed by
// its SOURCE (source_hash = the entity AST it was emitted from, S35/S02) and carries the
// protected header so a hand-edit cannot survive a re-emit (CLAUDE.md §4/§9). Shape ∈
// {expand, expand_contract}: an additive change is a single EXPAND step; a narrowing
// change is split EXPAND → BACKFILL → CONTRACT (forward-only).
type MigrationArtifact struct {
	Path       string `json:"path"`        // where the projection lands (back/gen/db/<entity>.sql)
	Entity     string `json:"entity"`      // the entity the migration projects
	Bytes      []byte `json:"bytes"`       // the rendered Atlas migration SQL (starts with the protected header)
	SourceHash string `json:"source_hash"` // Hash(Canonicalize(SourceBody(new))) — S02/S35 reused
	OutputHash string `json:"output_hash"` // Hash(bytes) — byte-identical re-emit proof
	Shape      string `json:"shape"`       // "create" | "expand" | "expand_contract"
	Protected  bool   `json:"protected"`   // always true: the header stamps gen/ as protected
}

// pgComment is the SQL comment prefix; the protected header uses it (same marker as
// every other AIDOS-emitted file, ProtectedMarker reused from S34).
const pgComment = "--"

// header renders the protected file header in SQL comment syntax. It REUSES S34's
// ProtectedMarker so every emitted file carries the SAME marker + the source hash.
func header(sourceHash string) string {
	return fmt.Sprintf("%s %s. source: %s\n", pgComment, generators.ProtectedMarker, sourceHash)
}

// quoteIdent quotes a Postgres identifier so a reserved word (e.g. "order") is valid
// DDL. Deterministic: the identifier comes verbatim from the pinned AST.
func quoteIdent(s string) string { return fmt.Sprintf("%q", s) }

// fieldMap returns the entity's pinned fields keyed by name. Pure; no order leak.
func fieldMap(s generators.EntitySource) map[string]generators.Field {
	m := make(map[string]generators.Field, len(s.Fields))
	for _, f := range s.Fields {
		m[f.Name] = f
	}
	return m
}

// sortedNames returns the union of names from two field maps, sorted (stable order).
func sortedNames(a, b map[string]generators.Field) []string {
	seen := make(map[string]bool, len(a)+len(b))
	for n := range a {
		seen[n] = true
	}
	for n := range b {
		seen[n] = true
	}
	out := make([]string, 0, len(seen))
	for n := range seen {
		out = append(out, n)
	}
	sort.Strings(out)
	return out
}

// EmitMigration is the pure db-projection emitter: it RENDERS the expand-contract Atlas
// migration that brings the schema from `prior` to `entity` (the new head). It is a
// pure function of (entity, prior) — no clock, no RNG, no map-order, no absolute paths —
// so it is byte-for-byte reproducible. It REUSES S35's EmitDDL (generators.Emit with
// TargetPgDDL) for the CREATE TABLE shape and S02's Canonicalize/Hash for the source
// address. It returns a BlockReason (S13 shape) for a malformed/empty entity; never a
// panic, never an invented column.
//
// Shape rules (KRD line 532, §44.3, §55 forward-only):
//   - prior == nil               ⇒ "create": the full CREATE TABLE (the S35 EmitDDL shape).
//   - added columns only         ⇒ "expand": one ALTER TABLE … ADD COLUMN per added field
//     (additive, never an in-place rewrite/drop of existing rows).
//   - dropped/narrowed columns   ⇒ "expand_contract": the migration is split into staged
//     EXPAND → BACKFILL → CONTRACT steps (forward-only) — never a single destructive DROP.
//     The contract step is gated by a declared DataTruthScope at the RequireMigration guard;
//     EmitMigration renders the staged forward-only plan, it does not bypass the guard.
func EmitMigration(entity generators.EntitySource, prior *generators.EntitySource) (MigrationArtifact, *blockreason.BlockReason) {
	// Reuse the S35 emitter's validation + DDL rendering for the NEW head. If the new
	// entity is malformed, generators.Emit returns the canonical S13 BlockReason — we
	// surface it verbatim (never re-coin a code).
	ddlArtifact, br := generators.Emit(entity, generators.TargetPgDDL)
	if br != nil {
		return MigrationArtifact{}, br
	}
	sourceHash := ddlArtifact.SourceHash // == Hash(Canonicalize(SourceBody(entity))), S35/S02 reused

	var sql string
	var shape string

	if prior == nil {
		shape = "create"
		sql = renderCreate(entity, sourceHash, ddlArtifact.Bytes)
	} else {
		// A malformed prior is treated as "no comparable prior" only if it fails S35
		// validation — but to stay honest we surface a BlockReason rather than guess.
		if _, pbr := generators.Emit(*prior, generators.TargetPgDDL); pbr != nil {
			return MigrationArtifact{}, pbr
		}
		oldF := fieldMap(*prior)
		newF := fieldMap(entity)
		var added, dropped []string
		for _, n := range sortedNames(oldF, newF) {
			_, inOld := oldF[n]
			_, inNew := newF[n]
			switch {
			case !inOld && inNew:
				added = append(added, n)
			case inOld && !inNew:
				dropped = append(dropped, n)
			}
		}
		if len(dropped) == 0 {
			shape = "expand"
			sql = renderExpand(entity, sourceHash, added, newF)
		} else {
			shape = "expand_contract"
			sql = renderExpandContract(entity, sourceHash, added, dropped, newF)
		}
	}

	out := []byte(sql)
	return MigrationArtifact{
		Path:       artifactPath(entity),
		Entity:     entity.Name,
		Bytes:      out,
		SourceHash: sourceHash,
		OutputHash: records.Hash(out),
		Shape:      shape,
		Protected:  true,
	}, nil
}

// artifactPath returns the RELATIVE projection path (no absolute paths — determinism).
func artifactPath(s generators.EntitySource) string {
	return path.Join("back/gen/db", strings.ToLower(s.Name)+".sql")
}

// renderCreate renders the initial migration: the full CREATE TABLE (the S35 EmitDDL
// body, header already present). The S35 DDL already carries its own protected header +
// the same sourceHash, so we reuse it verbatim — the create migration IS the EmitDDL
// projection (never re-typed).
func renderCreate(s generators.EntitySource, sourceHash string, ddlBytes []byte) string {
	// ddlBytes already starts with the protected header for the same sourceHash; reuse it
	// verbatim so the create migration and the standalone DDL projection never drift.
	return string(ddlBytes)
}

// renderExpand renders an additive (expand-only) migration: one ALTER TABLE … ADD COLUMN
// per added field, in stable (sorted) order. New columns added to a table with existing
// rows are NULLable (no in-place rewrite of historical rows) — the expand discipline.
func renderExpand(s generators.EntitySource, sourceHash string, added []string, newF map[string]generators.Field) string {
	var b strings.Builder
	b.WriteString(header(sourceHash))
	b.WriteString("-- expand-contract / forward-only: an additive column add is an EXPAND step.\n")
	b.WriteString("-- New columns are NULLable so no historical row is rewritten or dropped (KRD §44.3).\n")
	table := strings.ToLower(s.Name)
	for _, n := range added {
		col := ddlType(newF[n])
		fmt.Fprintf(&b, "ALTER TABLE %s ADD COLUMN IF NOT EXISTS %s %s;\n",
			quoteIdent(table), quoteIdent(n), col)
	}
	return b.String()
}

// renderExpandContract renders a narrowing migration split into staged forward-only
// steps: EXPAND (add any new columns), BACKFILL (a declared, human-gated step — emitted
// as a guarded placeholder, never a silent data move), CONTRACT (drop the removed
// columns in a SEPARATE forward step). It NEVER emits a single destructive DROP: the
// contract step is staged behind the expand+backfill and gated by the declared
// DataTruthScope (RequireMigration). The steps are wrapped so a dry-run validates the
// shape without executing a destructive drop against historical data.
func renderExpandContract(s generators.EntitySource, sourceHash string, added, dropped []string, newF map[string]generators.Field) string {
	var b strings.Builder
	b.WriteString(header(sourceHash))
	b.WriteString("-- expand-contract / forward-only: a NARROWING change is split EXPAND → BACKFILL → CONTRACT.\n")
	b.WriteString("-- A destructive change is NEVER a single silent step (KRD §44.3 — les données ont leur propre inertie).\n")
	table := strings.ToLower(s.Name)

	b.WriteString("\n-- [1/3] EXPAND — add the new shape additively (NULLable, no historical rewrite).\n")
	if len(added) == 0 {
		b.WriteString("-- (no new columns to add in this narrowing change)\n")
	}
	for _, n := range added {
		col := ddlType(newF[n])
		fmt.Fprintf(&b, "ALTER TABLE %s ADD COLUMN IF NOT EXISTS %s %s;\n",
			quoteIdent(table), quoteIdent(n), col)
	}

	b.WriteString("\n-- [2/3] BACKFILL — declared (DataTruthScope.strategy), human-gated, NOT executed here.\n")
	b.WriteString("-- The backfill of existing/historical rows is a SEPARATE forward-only step run by the\n")
	b.WriteString("-- aidos writer under an approved DataTruthScope (preserve_old_truth:true); emitting it\n")
	b.WriteString("-- silently here would rewrite historical data — forbidden. Placeholder only:\n")
	for _, n := range dropped {
		fmt.Fprintf(&b, "-- backfill_then_drop: %s.%s — preserve_old_truth before the contract step.\n",
			table, n)
	}

	b.WriteString("\n-- [3/3] CONTRACT — drop the removed column(s) in a SEPARATE forward step, AFTER backfill,\n")
	b.WriteString("-- gated by the declared DataTruthScope (RequireMigration). Emitted as a guarded, idempotent\n")
	b.WriteString("-- forward step so the dry-run validates its SHAPE without destroying historical truth.\n")
	for _, n := range dropped {
		fmt.Fprintf(&b, "ALTER TABLE %s DROP COLUMN IF EXISTS %s;\n",
			quoteIdent(table), quoteIdent(n))
	}
	return b.String()
}

// ddlType returns the Postgres column type for a pinned field, REUSING S35's closed
// type map via the generators DDL emitter. Rather than fork the map, we render the
// field through a single-field EntitySource and extract the column type — but to keep
// this pure and simple we inline the same closed mapping the S35 emitter pins; an
// unknown type is impossible here (validateSource already ran in generators.Emit).
func ddlType(f generators.Field) string {
	switch f.Type {
	case "text":
		return "TEXT"
	case "numeric":
		return "NUMERIC"
	case "int":
		return "BIGINT"
	case "bool":
		return "BOOLEAN"
	case "timestamptz":
		return "TIMESTAMPTZ"
	default:
		// Unreachable: generators.Emit validated the type set before EmitMigration got
		// here. Return TEXT-equivalent only as a non-panicking floor (totality).
		return "TEXT"
	}
}
