package interpretsvc

import (
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/operation"
)

// MemStore is an in-memory backing store for the sidecar's seams — a table → rows map. It is the
// pure-logic stand-in for the emitted Postgres schema (dbdeps.go is its pgx twin): a Reader loads
// a seeded row by a where-key match, a Mutator appends a created row / clears a target. It exists
// so the mirror proves the FULL State↔store pont — build State → Interpret → effect lands in the
// store — WITHOUT a real database (the §6 "test the pure logic, keep the DB pont minimal" rule).
//
// The contract MemStore implements is IDENTICAL to the pgx store's: same Reader/Mutator surface,
// same create/clear semantics, same event emission. Swapping MemStore for the pgx store changes
// where the rows live, never what the operation does — that is the seam's whole point.
type MemStore struct {
	// rows maps an entity name to its rows (each row a map of column → value). Seeded for reads
	// (a Cart to load), grown by creates (an Order appended), shrunk by clears (a Cart removed).
	rows map[string][]map[string]any
	// nextID is the deterministic id counter for created rows (the in-memory id seam). It is the
	// ONLY non-input value the store introduces, and it is deterministic given the call order —
	// the pgx store uses a real sequence / generated id instead.
	nextID int
}

// NewMemStore builds an empty in-memory store.
func NewMemStore() *MemStore {
	return &MemStore{rows: map[string][]map[string]any{}}
}

// Seed inserts a row into an entity's table (used by the mirror to plant the Cart the read loads).
// It is NOT an operation effect — it is test/setup data, the equivalent of a pre-existing DB row.
func (s *MemStore) Seed(entity string, row map[string]any) {
	s.rows[entity] = append(s.rows[entity], cloneRow(row))
}

// Rows returns a copy of the rows currently held for an entity (so the mirror can assert the
// effect — e.g. "after createOrder there is exactly one Order row with the cart's items").
func (s *MemStore) Rows(entity string) []map[string]any {
	src := s.rows[entity]
	out := make([]map[string]any, len(src))
	for i, r := range src {
		out[i] = cloneRow(r)
	}
	return out
}

// ── The four Deps seams (operation.Validator/Authorizer/Reader/Mutator) ──────────────────────
//
// MemDeps wraps a MemStore and an authorize verdict to satisfy operation.Deps. The Validator and
// Authorizer are intentionally MINIMAL and HONEST (see the package doc / README OpenQuestions):
// the real Validator runs the entity-schema contract and the real Authorizer runs the Policy ∀
// evaluator — later teeth. Here the Validator accepts a present input and the Authorizer returns
// the configured verdict, so the mirror can exercise BOTH the happy path AND the DENY
// short-circuit (proving the pipeline order is real) without faking a rule the sidecar must not own.

// MemDeps is the in-memory implementation of operation.Deps over a MemStore.
type MemDeps struct {
	Store *MemStore
	// Allow is the authorize verdict: true → ALLOW, false → DENY (ErrAuthorizationDenied). The
	// mirror flips it to prove a denied authorize never reaches a mutate (no Order row is created).
	Allow bool
}

// NewMemDeps builds the seams over a store with an ALLOW verdict (the happy path).
func NewMemDeps(store *MemStore) *MemDeps {
	return &MemDeps{Store: store, Allow: true}
}

// Validate shape-checks the input. The minimal honest check: a non-nil input passes. The real
// validator runs the named entity-schema contract — a documented OpenQuestion, not faked here.
func (d *MemDeps) Validate(schema string, input any) error {
	if input == nil {
		return fmt.Errorf("interpretsvc: validate %q: nil input", schema)
	}
	return nil
}

// Authorize returns the configured verdict: nil for ALLOW, ErrAuthorizationDenied for DENY. The
// real authorizer delegates to the Policy ∀ evaluator over the live ctx — a documented
// OpenQuestion. Returning the verdict here lets the mirror prove the short-circuit is real.
func (d *MemDeps) Authorize(policy string, state *operation.State) error {
	if !d.Allow {
		return operation.ErrAuthorizationDenied
	}
	return nil
}

// Read loads the FIRST row of the entity whose columns match every key/value in where, binds it
// into the step's slot. A where with no match is a typed "not found" (the read declared a target
// it could not load) — never a silent nil. This is the in-memory twin of the pgx SELECT … WHERE.
func (d *MemDeps) Read(entity string, where map[string]any, state *operation.State) (any, error) {
	for _, row := range d.Store.rows[entity] {
		if rowMatches(row, where) {
			return cloneRow(row), nil
		}
	}
	return nil, fmt.Errorf("interpretsvc: read %q: no row matching %v", entity, where)
}

// Mutate creates or clears an entity, returning the result (for a create, the new row) and the
// emitted events in step order. THIS is the State↔store pont — the resolved `data` map the
// interpreter built from the AST becomes the persisted row; the event names follow the §93 anchor
// (OrderCreated / CartCleared). The pgx store does the SAME, against a real table, in a tx.
func (d *MemDeps) Mutate(entity, op string, data map[string]any, state *operation.State) (any, []string, error) {
	switch operation.MutateOp(op) {
	case operation.MutateCreate:
		row := cloneRow(data)
		// The id seam: stamp a deterministic id if the data did not pin one (the emitted Order has
		// an `id` identifier the operation does not set — the store supplies it, like a DB default).
		if _, has := row["id"]; !has {
			d.Store.nextID++
			row["id"] = fmt.Sprintf("%s-%d", entity, d.Store.nextID)
		}
		d.Store.rows[entity] = append(d.Store.rows[entity], row)
		return cloneRow(row), []string{eventName(entity, operation.MutateCreate)}, nil
	case operation.MutateClear:
		// Clear removes the targeted row(s). THE MARCHE DE PLUS (OQ-SIDECAR-clear-where): the
		// interpreter forwards only the step's Data, NOT the clear's Where target, so `data` is
		// empty here — exactly as against the real DB. The seam derives the target from the State
		// (the $.<entity> slot the read bound), identically to DBDeps. An empty target is REFUSED
		// (never wipe every row) — the same honesty the DB guard enforces.
		target := clearTargetFromState(entity, state)
		if len(target) == 0 {
			return nil, nil, fmt.Errorf("interpretsvc: mutate %q clear: no target in state — refused, never wipe", entity)
		}
		kept := d.Store.rows[entity][:0:0]
		for _, r := range d.Store.rows[entity] {
			if !rowMatches(r, target) {
				kept = append(kept, r)
			}
		}
		d.Store.rows[entity] = kept
		return nil, []string{eventName(entity, operation.MutateClear)}, nil
	default:
		return nil, nil, fmt.Errorf("interpretsvc: mutate %q: unknown op %q", entity, op)
	}
}

// List returns EVERY row of the entity's table in a DETERMINISTIC order — sorted by the `id`
// column when the rows carry one (the pk for the app's entities, the same key DBDeps orders by),
// else by the rows' canonical JSON (a stable total order over any shape). It is the in-memory twin
// of DBDeps.List: a SCOPED, READ-ONLY scan of the app's OWN table, no operation, no event, no
// effect (§8 honesty; the wall §2 — it reads only the seeded store, writes nothing). An entity the
// store has never seen is ErrUnknownEntity (fail-closed), never a silent empty list — exactly as the
// pgx twin refuses a table that does not exist. Each returned row is cloned (no aliasing the store).
func (d *MemDeps) List(entity string) ([]map[string]any, error) {
	src, known := d.Store.rows[entity]
	if !known {
		return nil, fmt.Errorf("%w: %q", ErrUnknownEntity, entity)
	}
	out := make([]map[string]any, len(src))
	for i, r := range src {
		out[i] = cloneRow(r)
	}
	sort.SliceStable(out, func(i, j int) bool { return listKey(out[i]) < listKey(out[j]) })
	return out, nil
}

// listKey is the deterministic sort key for a row in List: the `id` value when present (the pk the
// app's entities carry), else the row's canonical JSON. It never panics on a missing/odd value —
// it stringifies, so every shape sorts in a stable total order (determinism-first §6/§8).
func listKey(row map[string]any) string {
	if id, ok := row["id"]; ok {
		return fmt.Sprintf("%v", id)
	}
	keys := make([]string, 0, len(row))
	for k := range row {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, k := range keys {
		fmt.Fprintf(&b, "%s=%v;", k, row[k])
	}
	return b.String()
}

// eventName derives the §93 event name for an entity mutate: Order+create → "OrderCreated",
// Cart+clear → "CartCleared". It mirrors the anchor's declared Emits, deterministically; it coins
// no event the operation's Emits do not pin.
func eventName(entity string, op operation.MutateOp) string {
	switch op {
	case operation.MutateCreate:
		return entity + "Created"
	case operation.MutateClear:
		return entity + "Cleared"
	default:
		return entity + string(op)
	}
}

// rowMatches reports whether row satisfies every key/value in where (a simple equality match,
// the in-memory twin of a SQL WHERE conjunction). An empty where matches every row.
func rowMatches(row, where map[string]any) bool {
	for k, want := range where {
		if !valueEqual(row[k], want) {
			return false
		}
	}
	return true
}

// valueEqual compares two resolved values with JSON-decode tolerance: a where key from the
// command arrives as the JSON type (e.g. a float64 for a number) while a seeded row may carry a
// Go int — fmt-stringify both so "1" == 1.0 holds. It never coerces silently in the data path;
// this tolerance is confined to the match predicate.
func valueEqual(a, b any) bool {
	if a == b {
		return true
	}
	return fmt.Sprintf("%v", a) == fmt.Sprintf("%v", b)
}

// cloneRow shallow-copies a row map so a returned value can never alias the store's internal slice
// (purity at the seam boundary — a caller mutating the result must not corrupt the store).
func cloneRow(row map[string]any) map[string]any {
	out := make(map[string]any, len(row))
	for k, v := range row {
		out[k] = v
	}
	return out
}
