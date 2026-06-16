package appdata

// projectops_reader.go — le LECTEUR (SELECT-only) des OPÉRATIONS d'un projet depuis kernel.operation,
// et leur MAPPING PUR vers honoemit.Op (le cut que le projecteur de serveur Hono consomme).
//
// LE TROU (le rebranchement). materialise_hono.go projectOps(project) renvoie aujourd'hui l'ANCRE
// STATIQUE createOrder (extraction pure de operation.CreateOrder()). Ce fichier comble le trou côté
// LECTURE : il SELECT les opérations SCOPÉES au projet dans kernel.operation, décode le body JSONB
// (l'AST operation.Operation + son bloc Async optionnel), et le MAPPE PUREMENT vers []honoemit.Op
// (Name + Async + Trigger dérivés de l'AST). Le serveur émis porte alors les routes des VRAIES
// opérations du projet — POST /<op> par op sync, dispatcher worker par op async.
//
// LE MUR (CLAUDE.md §2). Ce lecteur est SELECT-ONLY : il LIT kernel.operation (rôle SELECT-only —
// l'agent est lu par la vérité, ne l'écrit pas) et n'émet AUCUNE écriture. La population de
// kernel.operation = un ChangeSet approuvé (/goal HUMAIN), HORS scope (forward-dep, OQ-SIDECAR-registry
// S17/S31). Le mapping AST→honoemit.Op est une PROJECTION below-the-line.
//
// DÉTERMINISME-FIRST (§6/§8). Le mapping (mapOperationToOp) est une FONCTION PURE, byte-stable : même
// AST → même Op, aucun LLM, aucune horloge, aucun RNG. La seule partie I/O (la requête pgx) est isolée
// derrière la seam OpSource ; le mirror unitaire injecte un OpSource MOCK (jamais la vraie DB), de sorte
// que le mapping + l'additivité sont prouvés sans Postgres.
//
// FORWARD-DEP (CLAUDE.md §6 bootstrap exception). La table kernel.operation n'a pas encore de migration
// (grep kernel.operation = 0 ; OpenQuestion OQ-SIDECAR-registry, S17/S31). Sa forme INTENTIONNELLE
// (alignée sur kernel.control / kernel.action, S11) est :
//
//	CREATE TABLE kernel.operation (
//	    id            TEXT NOT NULL PRIMARY KEY,         -- SHA-256(Canonicalize(body))
//	    body          JSONB NOT NULL,                    -- l'AST {name,input,steps,emits,async?}
//	    version       TEXT NOT NULL,                     -- == id (content-addressed)
//	    superseded_by TEXT,                              -- NULL pour la tête (append-only)
//	    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
//	    project_id    TEXT NOT NULL                      -- le scope projet (S54)
//	);
//
// Le SELECT ci-dessous lit cette forme (les rows TÊTE — superseded_by IS NULL — du projet). Tant que la
// table n'existe pas en prod, un appel réel échoue proprement (erreur pgx remontée) ; l'appelant
// (projectOps) ne touche au lecteur QUE si un DSN est disponible, et retombe sinon sur l'ancre (le
// fallback documenté). Aucun comportement existant n'est cassé (additif).

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// operationBody is the DECODE shape of a kernel.operation row's `body` JSONB: the operation.Operation
// AST fields PLUS the OPTIONAL `async` block (operation.Async). The kernel reconstructs an Operation in
// Go without json tags (anchor.go), so we pin the persisted body's field names explicitly here — the
// canonical lower-snake-case JSONB the aidos CLI writes through an approved ChangeSet. The mapping needs
// only `name` (the route key) + `async` (sync vs worker-dispatcher, and the trigger) — `input/steps/
// emits` are decoded for completeness but the Op projection routes on name + async + trigger.
type operationBody struct {
	Name  string           `json:"name"`
	Input string           `json:"input,omitempty"`
	Emits []string         `json:"emits,omitempty"`
	Async *operation.Async `json:"async,omitempty"`
	// Steps stay raw — the Op projection never walks them; decoding them into the typed Step interface
	// would need the kernel's step decoder (out of scope for a route-key projection). json.RawMessage so
	// an unknown/rich steps array never fails the decode.
	Steps json.RawMessage `json:"steps,omitempty"`
}

// OpRow is one persisted operation as the source yields it: the project it is scoped to plus its decoded
// body. The OpSource seam returns these; mapOperationToOp turns each into a honoemit.Op. Kept distinct
// from the DB row so the mock source (the mirror) and the real pgx source share one shape.
type OpRow struct {
	Body operationBody
}

// OpSource is the INJECTED read seam over the project's operations (the wall: the real source is a
// SELECT on kernel.operation; the mirror passes an in-memory mock). The package never queries a DB
// directly through the mapping path — determinism-first: the pure mapping is tested without Postgres.
type OpSource interface {
	// ProjectOps returns the project's HEAD operation rows (superseded_by IS NULL), in a deterministic
	// order (the real query is ORDER BY name; the mock is insertion-ordered then sorted by the reader).
	// SELECT-only — it performs no write.
	ProjectOps(ctx context.Context, project string) ([]OpRow, error)
}

// mapOperationToOp is the PURE mapping from one decoded operation body to a honoemit.Op — the route-key
// projection the Hono server emitter consumes. It derives:
//   - Name    = the operation name (the POST /<op> route key) ;
//   - Async   = true iff the body carries an `async` block (an async op gets a worker dispatcher, S73,
//     never a sync HTTP handler) ;
//   - Trigger = the async block's trigger (meaningful only when Async is true; the zero AsyncTrigger
//     otherwise — honoemit ignores it for a sync op).
//
// PURE, TOTAL, byte-stable: same body → same Op, no clock, no RNG, no LLM. It invents nothing — a body
// with no async block is a plain sync op (Async false), exactly as operation.Async documents.
func mapOperationToOp(b operationBody) honoemit.Op {
	op := honoemit.Op{Name: b.Name}
	if b.Async != nil {
		op.Async = true
		op.Trigger = b.Async.Trigger
	}
	return op
}

// MapOperationsToOps maps a slice of operation bodies to the honoemit.Op cut, PRESERVING input order.
// PURE — the caller (the reader / the mock) decides the order; this only projects each row. Exposed so
// the mirror can drive the mapping over fixture bodies without a source/DB.
func MapOperationsToOps(rows []OpRow) []honoemit.Op {
	view := make([]honoemit.Op, 0, len(rows))
	for _, r := range rows {
		view = append(view, mapOperationToOp(r.Body))
	}
	return view
}

// ProjectOpsFromSource reads a project's operations through the injected OpSource and maps them to the
// honoemit.Op cut. The orchestration half between the seam (I/O) and the pure mapping. A source error is
// surfaced verbatim (never a partial/invented cut). DETERMINISM-FIRST: the mapping is pure; only the
// source touches the world. This is the function the mirror drives with a MOCK source (no DB).
func ProjectOpsFromSource(ctx context.Context, src OpSource, project string) ([]honoemit.Op, error) {
	rows, err := src.ProjectOps(ctx, project)
	if err != nil {
		return nil, fmt.Errorf("appdata: read project %q operations: %w", project, err)
	}
	return MapOperationsToOps(rows), nil
}

// ── The real pgx source (SELECT-only on kernel.operation) ────────────────────────

// kernelOpSource is the REAL OpSource: a SELECT-only read of kernel.operation scoped to a project. The
// DSN it opens carries the agent's SELECT-only grant (the wall §2 — no INSERT/UPDATE/DELETE on the
// kernel schema exists for this role). It reads only HEAD rows (superseded_by IS NULL), ordered by name
// for a deterministic cut. Forward-dep: until the kernel.operation migration lands (S17/S31), a real
// query errors cleanly and the caller falls back to the documented anchor (it never silently fabricates).
type kernelOpSource struct {
	pool *pgxpool.Pool
}

// ProjectOps SELECTs the project's HEAD operations from kernel.operation and decodes each body JSONB.
// SELECT-only (the wall). Ordered by name (a deterministic cut). A decode failure on a row surfaces the
// cause (never a partial/invented op).
func (s *kernelOpSource) ProjectOps(ctx context.Context, project string) ([]OpRow, error) {
	const q = `
		SELECT body
		FROM kernel.operation
		WHERE project_id = $1 AND superseded_by IS NULL
		ORDER BY body->>'name'`
	rows, err := s.pool.Query(ctx, q, project)
	if err != nil {
		return nil, fmt.Errorf("appdata: query kernel.operation (project %q): %w", project, err)
	}
	defer rows.Close()

	var out []OpRow
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, fmt.Errorf("appdata: scan kernel.operation body: %w", err)
		}
		var body operationBody
		if err := json.Unmarshal(raw, &body); err != nil {
			return nil, fmt.Errorf("appdata: decode kernel.operation body: %w", err)
		}
		out = append(out, OpRow{Body: body})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("appdata: iterate kernel.operation: %w", err)
	}
	return out, nil
}

// ReadProjectOps is the prod entrypoint: open a SELECT-only pgx pool on the DSN, read the project's
// operations from kernel.operation, and map them to the honoemit.Op cut. The DSN carries the agent's
// SELECT-only grant (the wall §2). The pool is opened + closed per call (the materialiser runs once per
// deploy — no long-lived pool needed). DETERMINISM-FIRST: the mapping is pure; only the SELECT touches
// the world. A connection/query failure (e.g. the table not yet migrated — S17/S31 forward-dep) is
// surfaced so the caller can fall back to the documented anchor; this function never fabricates a cut.
func ReadProjectOps(ctx context.Context, dsn, project string) ([]honoemit.Op, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("appdata: open kernel.operation pool: %w", err)
	}
	defer pool.Close()
	return ProjectOpsFromSource(ctx, &kernelOpSource{pool: pool}, project)
}
