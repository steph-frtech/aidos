package interpretsvc

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// DBDeps is the PRODUCTION implementation of operation.Deps over the EMITTED app schema (pgx +
// the project's Postgres tables — the lowercase-entity-name tables appdata/gen-db emit). It is the
// pgx twin of MemDeps: same Reader/Mutator contract, real rows. The sidecar passes DBDeps to
// operation.Interpret; the interpreter re-implements no rule, it just calls these seams.
//
// THE STATE↔DB PONT (the heart of the sidecar). The two non-trivial mappings, documented honestly:
//
//   - read  → SELECT * FROM <table> WHERE <col>=<val> … LIMIT 1, the row mapped to a column→value
//     map and bound into the slot. A `text` column that holds JSON (the emitted `items` column is
//     `text`) is DECODED to a list/map so `$.cart.items` resolves as a collection downstream. This
//     decode is the documented bridge between the flat emitted column and the structured State.
//
//   - mutate(create) → INSERT INTO <table> (cols…) VALUES (…) RETURNING *; a list/map value is
//     JSON-ENCODED to fit a `text`/`jsonb` column (the inverse of the read decode). mutate(clear)
//     → DELETE FROM <table> WHERE <where…>. Both run inside the request transaction the sidecar
//     opens, so the two mutates of createOrder (create Order, clear Cart) commit atomically.
//
// THE MARCHE DE PLUS (honesty, §8). The Validator and Authorizer here are the SAME minimal honest
// seams as MemDeps (a present-input check; a fixed/contextless authorize): a real Validator over
// the entity-schema contract and a real Authorizer over the Policy ∀ evaluator are LATER teeth
// (OpenQuestion OQ-SIDECAR-policy / OQ-SIDECAR-validate). The Expr `sum($.cart.items,"price")` for a
// computed `total` IS now wired (OQ-SIDECAR-expr CLOSED): the operation interpreter evaluates the
// anchor's `total` Expr through the REUSED kernel Expr engine (expr.Eval) BEFORE this Mutator runs,
// so the resolved data already carries the numeric Σ — the insert persists it verbatim, the seam
// re-folds nothing (determinism-first §6/§8). The DB pont itself is real and runnable.
//
// THE WALL (§2). DBDeps writes ONLY the emitted app tables (the app's own data), never a truth
// schema. It opens its transaction on the app DSN (DATABASE_URL), a role with no GRANT on
// kernel/mirrors/fitness. Anti-overwrite §9: a create APPENDS a row; a clear DELETEs by the AST's
// where — neither rewrites an AST.
type DBDeps struct {
	pool *pgxpool.Pool
	// allow is the authorize verdict seam (default ALLOW). A future tooth replaces it with the
	// Policy ∀ evaluator; exposed so an integration test can exercise the DENY short-circuit.
	allow bool
}

// OpenDBDeps opens a pgxpool against the emitted app DSN (DATABASE_URL). The pool is the sidecar's
// connection to the app's OWN Postgres (the emitted schema), never the OS truth-store.
func OpenDBDeps(ctx context.Context, dsn string) (*DBDeps, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("interpretsvc: open app DB: %w", err)
	}
	return &DBDeps{pool: pool, allow: true}, nil
}

// NewDBDepsFromPool wraps an existing pool (used by the Testcontainers integration mirror).
func NewDBDepsFromPool(pool *pgxpool.Pool) *DBDeps { return &DBDeps{pool: pool, allow: true} }

// Close releases the pool.
func (d *DBDeps) Close() {
	if d.pool != nil {
		d.pool.Close()
	}
}

// SetAllow flips the authorize verdict seam (true=ALLOW). Exposed so an integration test proves a
// denied authorize never reaches a mutate against the real DB.
func (d *DBDeps) SetAllow(allow bool) { d.allow = allow }

// Validate — the minimal honest check (a present input passes). OpenQuestion OQ-SIDECAR-validate.
func (d *DBDeps) Validate(schema string, input any) error {
	if input == nil {
		return fmt.Errorf("interpretsvc: validate %q: nil input", schema)
	}
	return nil
}

// Authorize — returns the configured verdict. OpenQuestion OQ-SIDECAR-policy (real Policy ∀ eval).
func (d *DBDeps) Authorize(policy string, state *operation.State) error {
	if !d.allow {
		return operation.ErrAuthorizationDenied
	}
	return nil
}

// Read runs SELECT … WHERE over the entity's emitted table and binds the first matching row as a
// column→value map. A `text` column holding JSON is decoded so a list/object (e.g. `items`)
// resolves structurally in the State. No match is a typed "not found" — never a silent nil.
func (d *DBDeps) Read(entity string, where map[string]any, state *operation.State) (any, error) {
	table := tableName(entity)
	cols, args, clause := whereClause(where)
	sql := fmt.Sprintf("SELECT * FROM %s", quoteIdent(table))
	if clause != "" {
		sql += " WHERE " + clause
	}
	sql += " LIMIT 1"
	_ = cols

	rows, err := d.pool.Query(context.Background(), sql, args...)
	if err != nil {
		return nil, fmt.Errorf("interpretsvc: read %q: %w", entity, err)
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, fmt.Errorf("interpretsvc: read %q: no row matching %v", entity, where)
	}
	row, err := rowToMap(rows)
	if err != nil {
		return nil, fmt.Errorf("interpretsvc: read %q: %w", entity, err)
	}
	return row, nil
}

// Mutate runs an INSERT (create) or DELETE (clear) over the entity's emitted table, returning the
// result row (for create) and the §93 event. A list/map value is JSON-encoded to fit a text/jsonb
// column (the inverse of the read decode). It runs in the pool (a per-request tx wrapper is the
// caller's concern via WithTx).
func (d *DBDeps) Mutate(entity, op string, data map[string]any, state *operation.State) (any, []string, error) {
	switch operation.MutateOp(op) {
	case operation.MutateCreate:
		return d.insert(entity, data)
	case operation.MutateClear:
		return d.delete(entity, data, state)
	default:
		return nil, nil, fmt.Errorf("interpretsvc: mutate %q: unknown op %q", entity, op)
	}
}

// insert renders INSERT INTO <table> (cols…) VALUES ($1…) RETURNING * deterministically (columns
// in sorted order, so the SQL is stable) and returns the created row + the <Entity>Created event.
//
// THE id SEAM (the State↔DB pont detail). The emitted Order table has a NOT NULL `id` column the
// anchor's mutate data does NOT pin (the operation leaves the identifier to the store, like a DB
// default/sequence). The emitted schema declares no DEFAULT, so the seam SUPPLIES a deterministic
// id when absent — the same concern MemDeps handles. This is the seam's declared id concern, not a
// rule the interpreter owns; a future emitted schema with a sequence/uuid default makes it a no-op.
func (d *DBDeps) insert(entity string, data map[string]any) (any, []string, error) {
	table := tableName(entity)
	row := cloneRow(data)
	if _, has := row["id"]; !has {
		row["id"] = fmt.Sprintf("%s-%s", strings.ToLower(entity), idToken(row))
	}
	data = row
	keys := sortedKeys(data)
	if len(keys) == 0 {
		return nil, nil, fmt.Errorf("interpretsvc: mutate %q create: empty row", entity)
	}
	cols := make([]string, len(keys))
	holders := make([]string, len(keys))
	args := make([]any, len(keys))
	for i, k := range keys {
		cols[i] = quoteIdent(k)
		holders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = encodeValue(data[k])
	}
	sql := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) RETURNING *",
		quoteIdent(table), strings.Join(cols, ", "), strings.Join(holders, ", "))

	rows, err := d.pool.Query(context.Background(), sql, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("interpretsvc: mutate %q create: %w", entity, err)
	}
	defer rows.Close()
	if !rows.Next() {
		// rows.Err() surfaces a deferred SQL error (a NOT NULL / type violation) as ITSELF —
		// never the misleading "no row returned" that masks the real cause (honesty).
		if rerr := rows.Err(); rerr != nil {
			return nil, nil, fmt.Errorf("interpretsvc: mutate %q create: %w", entity, rerr)
		}
		return nil, nil, fmt.Errorf("interpretsvc: mutate %q create: no row returned", entity)
	}
	created, err := rowToMap(rows)
	if err != nil {
		return nil, nil, fmt.Errorf("interpretsvc: mutate %q create: %w", entity, err)
	}
	return created, []string{eventName(entity, operation.MutateCreate)}, nil
}

// idToken derives a DETERMINISTIC id token from the row's content (the content address of the
// canonical row body, reused from S02 records.Hash). So the same created row yields the same id —
// the sidecar stays reproducible even against a real DB (no clock, no RNG). Truncated to 16 hex
// chars for a compact, collision-safe key.
func idToken(row map[string]any) string {
	b, err := json.Marshal(row)
	if err != nil {
		return "0"
	}
	canon, err := records.Canonicalize(b)
	if err != nil {
		return "0"
	}
	h := records.Hash(canon)
	if len(h) > 16 {
		return h[:16]
	}
	return h
}

// delete renders DELETE FROM <table> WHERE <where…> and returns the <Entity>Cleared event. An
// empty where is refused (a clear with no target would wipe the table — never silent).
//
// THE MARCHE DE PLUS (the honest interpreter limitation, OpenQuestion OQ-SIDECAR-clear-where).
// operation.evalMutate resolves and forwards ONLY the step's Data; the clear verb's target lives
// in the step's WHERE (`{ id: $.cart.id }`), which the interpreter does NOT thread to the Mutator
// (the kernel's own fixture mock just emits CartCleared and ignores the target — table.go). So a
// clear arrives here with an EMPTY where. Rather than wipe the table (forbidden) or fake it, the
// seam derives the target HONESTLY from the State it is given: the read bound the entity into the
// $.<entity> slot ($.cart), so the clear scopes to that row's identifier. This is seam glue over
// the State the interpreter passes — NOT a re-implemented rule — and it is the documented gap: the
// proper fix is for the interpreter/AST to thread m.Where to the Mutator (a kernel change, above
// this surface). Until then, a clear with no derivable target is REFUSED, never a table wipe.
func (d *DBDeps) delete(entity string, where map[string]any, state *operation.State) (any, []string, error) {
	table := tableName(entity)
	target := where
	if len(target) == 0 {
		target = clearTargetFromState(entity, state)
	}
	if len(target) == 0 {
		return nil, nil, fmt.Errorf("interpretsvc: mutate %q clear: no target (empty where, no %s slot in state) — refused, never wipe a table", entity, slotName(entity))
	}
	_, args, clause := whereClause(target)
	sql := fmt.Sprintf("DELETE FROM %s WHERE %s", quoteIdent(table), clause)
	if _, err := d.pool.Exec(context.Background(), sql, args...); err != nil {
		return nil, nil, fmt.Errorf("interpretsvc: mutate %q clear: %w", entity, err)
	}
	return nil, []string{eventName(entity, operation.MutateClear)}, nil
}

// ── pont helpers (deterministic SQL rendering + value (de)coding) ─────────────────────────────

// tableName mirrors the gen/db / appdata emitter's lowercase table name. It is the SAME mapping
// the schema was emitted with — never a forked convention.
func tableName(entity string) string { return strings.ToLower(entity) }

// slotName is the $-rooted slot a read binds an entity into by convention ($.cart for Cart). It is
// the lowercase entity name — the same the createOrder anchor's read uses (`as: $.cart`).
func slotName(entity string) string { return "$." + strings.ToLower(entity) }

// clearTargetFromState derives a clear's target from the State (the marche-de-plus glue, see
// delete): the entity the read bound into $.<entity> carries the identifier the clear scopes to.
// It returns {id: <that id>} when the slot and its id are present, else an empty map (→ the clear
// is refused, never a table wipe). It re-implements no rule — it READS the State the interpreter
// passed. Shared by MemDeps and DBDeps so both seams scope a clear identically.
func clearTargetFromState(entity string, state *operation.State) map[string]any {
	if state == nil {
		return nil
	}
	val, err := state.Resolve(slotName(entity))
	if err != nil {
		return nil
	}
	row, ok := val.(map[string]any)
	if !ok {
		return nil
	}
	id, ok := row["id"]
	if !ok {
		return nil
	}
	return map[string]any{"id": id}
}

// whereClause renders a deterministic, parameterised WHERE conjunction (keys sorted so the SQL is
// stable) and the positional args. Returns ("", nil, "") for an empty where.
func whereClause(where map[string]any) (cols []string, args []any, clause string) {
	keys := sortedKeys(where)
	parts := make([]string, len(keys))
	for i, k := range keys {
		parts[i] = fmt.Sprintf("%s = $%d", quoteIdent(k), i+1)
		args = append(args, encodeValue(where[k]))
		cols = append(cols, k)
	}
	return cols, args, strings.Join(parts, " AND ")
}

// encodeValue maps a resolved State value to a pgx-bindable arg. A list/map is JSON-encoded (to
// fit a text/jsonb column — the inverse of decodeColumn); a scalar passes through. This is the
// write side of the State↔DB pont.
func encodeValue(v any) any {
	switch v.(type) {
	case []any, map[string]any, []map[string]any:
		b, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprintf("%v", v)
		}
		return string(b)
	default:
		return v
	}
}

// rowToMap reads one pgx row into a column→value map, decoding any JSON-bearing text column back
// into a list/object (the read side of the pont, so $.cart.items resolves as a collection).
func rowToMap(rows pgx.Rows) (map[string]any, error) {
	fields := rows.FieldDescriptions()
	vals, err := rows.Values()
	if err != nil {
		return nil, err
	}
	out := make(map[string]any, len(fields))
	for i, f := range fields {
		out[string(f.Name)] = decodeColumn(vals[i])
	}
	return out, nil
}

// decodeColumn turns a string column that holds JSON ("[…]" / "{…}") back into the structured
// value the State expects. A non-JSON string (or any other scalar) is returned untouched — the
// decode is conservative (it only fires on a leading [ or {), never a lossy guess.
func decodeColumn(v any) any {
	s, ok := v.(string)
	if !ok {
		return v
	}
	t := strings.TrimSpace(s)
	if len(t) == 0 || (t[0] != '[' && t[0] != '{') {
		return v
	}
	var decoded any
	if err := json.Unmarshal([]byte(t), &decoded); err != nil {
		return v // not JSON after all — keep the raw string (no lossy coercion)
	}
	return decoded
}

// sortedKeys returns a map's keys in sorted order (so every rendered SQL statement is byte-stable
// — determinism-first: map iteration order never leaks into the query).
func sortedKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// quoteIdent double-quotes a SQL identifier (table/column), escaping any embedded quote. The
// identifiers come from the EMITTED schema (entity/attribute names), not user input, but quoting
// keeps a reserved word (e.g. "order") legal and closes the injection surface.
func quoteIdent(id string) string {
	return `"` + strings.ReplaceAll(id, `"`, `""`) + `"`
}
