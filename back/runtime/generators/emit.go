package generators

import (
	"fmt"
	"go/format"
	"path"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// typeBinding maps one canonical entity type token to its three projections. The
// set is CLOSED — a field whose type is not here is a BlockReason, never a guessed
// mapping (honesty). The Go column is the sqlc-emitted type; pgtype.* mirrors the
// existing sqlc output (back/gen/archive/models.go) so the go-sqlc projection is
// what sqlc would produce from the DDL projection — the two cannot drift.
type typeBinding struct {
	ddl string // Postgres column type (the sqlc schema input)
	gos string // Go field type (what sqlc emits from that column)
	ts  string // TypeScript field type
}

var typeMap = map[string]typeBinding{
	"text":        {ddl: "TEXT", gos: "string", ts: "string"},
	"numeric":     {ddl: "NUMERIC", gos: "pgtype.Numeric", ts: "string"},
	"int":         {ddl: "BIGINT", gos: "int64", ts: "number"},
	"bool":        {ddl: "BOOLEAN", gos: "bool", ts: "boolean"},
	"timestamptz": {ddl: "TIMESTAMPTZ", gos: "pgtype.Timestamptz", ts: "string"},
}

// header renders the protected file header for a target. It is the SAME marker on
// every target (ProtectedMarker) plus the source content-hash, in the target's
// comment syntax. The header makes gen/ protection visible and the drift computable.
func header(commentPrefix, sourceHash string) string {
	return fmt.Sprintf("%s %s. source: %s\n", commentPrefix, ProtectedMarker, sourceHash)
}

// goName turns an entity/field name into an exported Go identifier (Order, Id).
// Deterministic: first rune upper, rest verbatim (the AST pins lowercase snake-less
// tokens in the S34 examples; no inflection is invented).
func goName(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// renderPgDDL renders the Postgres DDL projection: a CREATE TABLE with one column
// per pinned field, fields in stable (sorted) order, normalized "\n" newlines. This
// IS the sqlc schema input, so the go-sqlc projection cannot drift from it.
func renderPgDDL(s EntitySource, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("--", sourceHash))
	// Quote the table + column identifiers so a reserved word (e.g. "order") is valid
	// DDL and a safe sqlc schema input. Deterministic: identifiers come verbatim from
	// the pinned AST, lower-cased for the table, in stable (sorted) field order.
	fmt.Fprintf(&b, "CREATE TABLE %q (\n", strings.ToLower(s.Name))
	fields := sortedFields(s)
	for i, f := range fields {
		col := typeMap[f.Type].ddl
		comma := ","
		if i == len(fields)-1 {
			comma = ""
		}
		fmt.Fprintf(&b, "    %q %s NOT NULL%s\n", f.Name, col, comma)
	}
	b.WriteString(");\n")
	return []byte(b.String())
}

// renderGoSqlc renders the typed Go struct sqlc emits from the DDL projection: one
// exported struct, one field per pinned column, fields in stable (sorted) order,
// pgtype.* imported only when used. It mirrors the existing sqlc output shape
// (back/gen/archive/models.go) so the go-sqlc projection is faithful to the frozen
// slot (sqlc, never substituted): the renderer is the deterministic twin of `sqlc
// generate` over the same DDL, used by the pure Emit; the /project gesture also runs
// `sqlc generate` to keep the slot honest end-to-end.
func renderGoSqlc(s EntitySource, sourceHash string) []byte {
	fields := sortedFields(s)
	needsPgtype := false
	for _, f := range fields {
		if strings.HasPrefix(typeMap[f.Type].gos, "pgtype.") {
			needsPgtype = true
		}
	}
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	fmt.Fprintf(&b, "package %sgen\n\n", strings.ToLower(s.Name))
	if needsPgtype {
		b.WriteString("import (\n\t\"github.com/jackc/pgx/v5/pgtype\"\n)\n\n")
	}
	fmt.Fprintf(&b, "type %s struct {\n", goName(s.Name))
	for _, f := range fields {
		fmt.Fprintf(&b, "\t%s %s\n", goName(f.Name), typeMap[f.Type].gos)
	}
	b.WriteString("}\n")
	// go/format is the canonical, deterministic gofmt — reuse it so the emitted Go is
	// already gofmt-clean (aligned fields, gofmt'd imports). format.Source is a pure
	// function of its input, so byte-stability holds. The hand-rolled string above is
	// always well-formed Go; a format error would be a programming bug, so we fall
	// back to the unformatted bytes (Validate-equivalent: never a silent panic).
	formatted, err := format.Source([]byte(b.String()))
	if err != nil {
		return []byte(b.String())
	}
	return formatted
}

// renderTSTypes renders the TypeScript type projection: one exported interface, one
// field per pinned column, fields in stable (sorted) order, normalized "\n". It is
// rendered from the SAME AST as Go/DDL so the three agree on every field — one
// source, never double-typed (CONTEXT-MAP).
func renderTSTypes(s EntitySource, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	fmt.Fprintf(&b, "export interface %s {\n", goName(s.Name))
	for _, f := range sortedFields(s) {
		fmt.Fprintf(&b, "\t%s: %s;\n", f.Name, typeMap[f.Type].ts)
	}
	b.WriteString("}\n")
	return []byte(b.String())
}

// artifactPath returns the RELATIVE projection path for a target (no absolute paths
// — determinism: the same source yields the same path on every machine). Go/DDL
// land under back/gen/<entity>/; TS lands under front/web/gen/<entity>/.
func artifactPath(s EntitySource, t Target) string {
	name := strings.ToLower(s.Name)
	switch t {
	case TargetGoSqlc:
		return path.Join("back/gen", name, name+".go")
	case TargetPgDDL:
		return path.Join("back/gen", name, "schema.sql")
	case TargetTSTypes:
		return path.Join("front/web/gen", name, name+".ts")
	default:
		return ""
	}
}

// render dispatches to the per-target renderer. Closed switch; an unknown target is
// caught upstream in Emit (BlockReason), never reached here with a guess.
func render(s EntitySource, t Target, sourceHash string) []byte {
	switch t {
	case TargetGoSqlc:
		return renderGoSqlc(s, sourceHash)
	case TargetPgDDL:
		return renderPgDDL(s, sourceHash)
	case TargetTSTypes:
		return renderTSTypes(s, sourceHash)
	default:
		return nil
	}
}

// SourceBody re-serializes an EntitySource into the canonical JSON body the kernel
// stores, so source_hash == the entity's kernel head hash. It marshals through
// records.Canonicalize, so object-key order never leaks into the hash; and it sorts
// the fields by name FIRST, so field-array order is not semantic either — reordering
// the pinned fields yields the SAME source_hash (an entity's identity is its field
// SET + types, not the order they were written). This is what makes Project
// order-independent down to the content address.
func SourceBody(s EntitySource) ([]byte, error) {
	norm := s
	norm.Fields = sortedFields(s)
	raw, err := marshalSource(norm)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// Emit is the pure emitter: it RENDERS the projection of an entity AST for one
// target. Emit(s,t) is a pure function of Canonicalize(s) — no clock, no RNG, no
// map-order, no absolute paths — so it is byte-for-byte reproducible. It returns a
// BlockReason (S13 shape) for an unknown target or a malformed/empty AST; never a
// panic, never an invented field.
func Emit(s EntitySource, t Target) (Artifact, *blockreason.BlockReason) {
	if !isKnownTarget(t) {
		br := blockMalformed(fmt.Errorf("%w: %q", ErrUnknownTarget, t))
		return Artifact{}, &br
	}
	if err := validateSource(s); err != nil {
		br := blockMalformed(err)
		return Artifact{}, &br
	}
	body, err := SourceBody(s)
	if err != nil {
		br := blockMalformed(err)
		return Artifact{}, &br
	}
	sourceHash := records.Hash(body)
	bytesOut := render(s, t, sourceHash)
	return Artifact{
		Path:       artifactPath(s, t),
		Target:     t,
		Kind:       KindEntity,
		Bytes:      bytesOut,
		SourceHash: sourceHash,
		OutputHash: records.Hash(bytesOut),
		Protected:  true,
	}, nil
}

// Project fans one or more entity sources across one or more targets, returning the
// artifacts in a STABLE order (by source order, then canonical target order) — so
// the output is order-independent per artifact. The FIRST malformed source/target
// short-circuits to a BlockReason (honesty: a partial emit is never silently kept).
func Project(sources []EntitySource, targets []Target) ([]Artifact, *blockreason.BlockReason) {
	// Targets are emitted in canonical order regardless of the caller's order.
	ordered := orderTargets(targets)
	out := make([]Artifact, 0, len(sources)*len(ordered))
	for _, s := range sources {
		for _, t := range ordered {
			a, br := Emit(s, t)
			if br != nil {
				return nil, br
			}
			out = append(out, a)
		}
	}
	return out, nil
}

// orderTargets returns the requested targets in canonical order, de-duplicated, so
// Project's fan-out is stable regardless of the input order (determinism).
func orderTargets(targets []Target) []Target {
	want := make(map[Target]bool, len(targets))
	for _, t := range targets {
		want[t] = true
	}
	out := make([]Target, 0, len(targets))
	for _, t := range targetOrder {
		if want[t] {
			out = append(out, t)
		}
	}
	return out
}

// Drifted reports whether the bytes on disk diverge from the ledger's recorded
// output_hash for an artifact — i.e. a gen/ file was hand-edited. The drift is
// COMPUTED (it feeds S22's red wave), never hunted. ledgerOutputHash is the hash the
// emitter recorded; onDisk is the current file bytes.
func Drifted(ledgerOutputHash string, onDisk []byte) bool {
	return records.Hash(onDisk) != ledgerOutputHash
}
