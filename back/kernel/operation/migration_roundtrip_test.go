package operation_test

// Persistence + wall mirror for kernel.operation (ADR 0090 / S17·S31 OpenQuestion;
// the table materialized by the AIDOS CONSTRUCTOR, ADR 0091). It retro-applies
// Mandat A: no truth/substrate without a behaviour proof. It reflects
// kernel.operation-migration · test_kind=integration · cert_language=fixture ·
// liveness=live · authority=above (it proves the PRODUCT GUARANTEE on the table).
//
// On a real Postgres (Testcontainers) with kernel_operation_baseline.sql applied,
// it proves the three load-bearing assertions of the §93 Operation truth-store:
//
//   (a) ROUND-TRIP — the §93 createOrder AST {Name,Input,Steps[],Emits[]} round-trips
//       as content-addressed JSONB: id == version == records.Hash(Canonicalize(body))
//       and the read-back JSONB decodes to the SAME logical AST (the six verbs in
//       order, Name/Input/Emits verbatim, and the `total` Expr surviving byte-identical
//       through expr.Canonicalize). This proves kernel.operation stores the Operation
//       AST §24.3/§93 promises, with the Async{} surface held inside the body.
//
//   (b) CONTENT-ADDRESS — the in-DB CHECK operation_content_addressed (version = id)
//       REFUSES a row whose version != id (no forked hash path can slip in).
//
//   (c) THE WALL (the core) — the agent role aidos_agent has SELECT-ONLY on
//       kernel.operation: every INSERT/UPDATE/DELETE is rejected with permission
//       denied (CLAUDE.md §2, ADR 0091 level L2). This is the product guarantee
//       (the end-user agent is SELECT-only on the truth-store) PROVEN on the table.
//
// REUSE, DON'T REINVENT (ADR 0007): the content hash is records.Hash over the single
// records.Canonicalize address space; the one Expr in the AST (`total`) is rendered
// through expr.Canonicalize — the SAME canonical schemes the sibling kernel tables
// (records/expr/control/action) use. Never a forked hashing path. The Testcontainers
// harness mirrors back/kernel/control/migration_roundtrip_test.go verbatim in shape.
//
// The discriminant (mirror-first) proof — that this mirror goes RED when the CHECK or
// the REVOKE is neutralized — lives in migration_discriminant_test.go.

import (
	"context"
	"encoding/json"
	"os"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/expr"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

const operationBaseline = "../../migrations/kernel_operation_baseline.sql"

// startOperationPostgres spins a real Postgres (Testcontainers), applies the
// kernel.operation baseline, and returns an owner pool + the DSN (for the agent-role
// pool). Mirrors startControlPostgres — same harness, never forked.
func startOperationPostgres(t *testing.T) (*pgxpool.Pool, string) {
	t.Helper()
	ctx := context.Background()

	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos"),
		postgres.WithPassword("aidos"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).
				WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("testcontainers: start postgres: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("testcontainers: connection string: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool: new: %v", err)
	}
	t.Cleanup(pool.Close)

	mig, err := os.ReadFile(operationBaseline)
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if _, err := pool.Exec(ctx, string(mig)); err != nil {
		t.Fatalf("apply migration: %v", err)
	}
	return pool, dsn
}

// canonicalOperationBody renders an Operation AST into the deterministic JSONB body
// the truth-store holds — {Name, Input, Steps[], Emits[]} — and returns the
// content-addressed (id == version) hash and the canonical body bytes.
//
// It encodes the AST in the TEST (the package exposes no production body encoder yet —
// that is a later tooth, written mirror-first when a /goal needs it). The one Expr in
// the AST (the `total: sum($.cart.items,"price")` mutate field) is rendered through
// the REUSED expr.Canonicalize so the body carries the real Expr AST, not a string.
// The whole body then passes through records.Canonicalize → records.Hash: the single
// content-address space (ADR 0007), never a forked hash.
func canonicalOperationBody(t *testing.T, op operation.Operation) (id, body string) {
	t.Helper()

	steps := make([]map[string]any, 0, len(op.Steps))
	for _, s := range op.Steps {
		steps = append(steps, encodeStep(t, s))
	}
	raw := map[string]any{
		"name":  op.Name,
		"input": op.Input,
		"steps": steps,
		"emits": op.Emits,
	}
	rawBytes, err := json.Marshal(raw)
	if err != nil {
		t.Fatalf("marshal operation body: %v", err)
	}
	canon, err := records.Canonicalize(rawBytes)
	if err != nil {
		t.Fatalf("canonicalize operation body: %v", err)
	}
	return records.Hash(canon), string(canon)
}

// encodeStep renders one verb node into its canonical JSON map. Each map carries the
// step's kind (the dispatch discriminator) plus its typed fields; an Expr value (the
// mutate `total`) is rendered through expr.Canonicalize and re-decoded so it nests as
// a JSON object, not an opaque string — the body faithfully carries the Expr AST.
func encodeStep(t *testing.T, s operation.Step) map[string]any {
	t.Helper()
	m := map[string]any{"kind": string(s.Kind())}
	switch n := s.(type) {
	case operation.ValidateStep:
		m["schema"] = n.Schema
	case operation.AuthorizeStep:
		m["policy"] = n.Policy
	case operation.ReadStep:
		m["entity"] = n.Entity
		m["where"] = n.Where
		m["as"] = n.As
	case operation.MutateStep:
		m["entity"] = n.Entity
		m["op"] = string(n.Op)
		if n.Data != nil {
			m["data"] = encodeMaybeExprMap(t, n.Data)
		}
		if n.Where != nil {
			m["where"] = n.Where
		}
		if n.As != "" {
			m["as"] = n.As
		}
	case operation.ReturnStep:
		m["ref"] = n.Ref
	default:
		t.Fatalf("encodeStep: unhandled step kind %T", s)
	}
	return m
}

// encodeMaybeExprMap renders a mutate Data map, replacing any Expr value with its
// canonical Expr JSON (via expr.Canonicalize). Selector strings and literals pass
// through untouched.
func encodeMaybeExprMap(t *testing.T, data map[string]any) map[string]any {
	t.Helper()
	out := make(map[string]any, len(data))
	for k, v := range data {
		if e, ok := v.(expr.Expr); ok {
			canon, err := expr.Canonicalize(e)
			if err != nil {
				t.Fatalf("canonicalize expr %s: %v", k, err)
			}
			var nested any
			if err := json.Unmarshal(canon, &nested); err != nil {
				t.Fatalf("re-decode expr %s: %v", k, err)
			}
			out[k] = nested
			continue
		}
		out[k] = v
	}
	return out
}

func TestOperationASTRoundTripsAsJSONB(t *testing.T) {
	pool, _ := startOperationPostgres(t)
	ctx := context.Background()

	op := operation.CreateOrder()
	id, body := canonicalOperationBody(t, op)

	if _, err := pool.Exec(ctx,
		"INSERT INTO kernel.operation (id, body, version) VALUES ($1, $2::jsonb, $3)",
		id, body, id,
	); err != nil {
		t.Fatalf("insert: %v", err)
	}

	var gotID, gotVer string
	var gotBody []byte
	if err := pool.QueryRow(ctx,
		"SELECT id, body, version FROM kernel.operation WHERE id = $1", id).
		Scan(&gotID, &gotBody, &gotVer); err != nil {
		t.Fatalf("select: %v", err)
	}

	// (a.1) The row stayed content-addressed in the base: re-canonicalizing the
	// read-back JSONB reproduces the same content hash for both id and version.
	reCanon, err := records.Canonicalize(gotBody)
	if err != nil {
		t.Fatalf("re-canonicalize read-back body: %v", err)
	}
	want := records.Hash(reCanon)
	if gotID != want || gotVer != want {
		t.Fatalf("db id/version != content hash: id=%s version=%s want=%s", gotID, gotVer, want)
	}

	// (a.2) The read-back JSONB decodes to the SAME logical AST (the round-trip the
	// truth-store promises): Name/Input/Emits verbatim, the six verbs in order, and
	// the `total` Expr surviving byte-identical.
	var decoded struct {
		Name  string           `json:"name"`
		Input string           `json:"input"`
		Steps []map[string]any `json:"steps"`
		Emits []string         `json:"emits"`
	}
	if err := json.Unmarshal(gotBody, &decoded); err != nil {
		t.Fatalf("decode read-back body: %v", err)
	}
	if decoded.Name != op.Name {
		t.Fatalf("Name lost in round-trip: got %q want %q", decoded.Name, op.Name)
	}
	if decoded.Input != op.Input {
		t.Fatalf("Input lost in round-trip: got %q want %q", decoded.Input, op.Input)
	}
	if strings.Join(decoded.Emits, ",") != strings.Join(op.Emits, ",") {
		t.Fatalf("Emits lost in round-trip: got %v want %v", decoded.Emits, op.Emits)
	}
	// the six verbs, in canonical pipeline order.
	wantKinds := make([]string, 0, len(op.Steps))
	for _, s := range op.Steps {
		wantKinds = append(wantKinds, string(s.Kind()))
	}
	if len(decoded.Steps) != len(wantKinds) {
		t.Fatalf("step count lost: got %d want %d", len(decoded.Steps), len(wantKinds))
	}
	for i, want := range wantKinds {
		if got, _ := decoded.Steps[i]["kind"].(string); got != want {
			t.Fatalf("step[%d].kind = %q, want %q (verbs out of order)", i, got, want)
		}
	}

	// (a.3) The `total` Expr survived as the real Expr AST (not flattened to a string).
	// It is the mutate-create step (index 3). Re-canonicalizing the read-back nested
	// object reproduces the original expr.Canonicalize bytes.
	mutate := decoded.Steps[3]
	data, ok := mutate["data"].(map[string]any)
	if !ok {
		t.Fatalf("mutate.data missing in round-trip: %#v", mutate)
	}
	totalNode, ok := data["total"].(map[string]any)
	if !ok {
		t.Fatalf("total Expr flattened in round-trip (not an object): %#v", data["total"])
	}
	gotTotal, err := json.Marshal(totalNode)
	if err != nil {
		t.Fatalf("marshal read-back total: %v", err)
	}
	wantExpr := expr.Call("sum", expr.Ref("$.cart.items"), expr.Lit("price"))
	wantTotal, err := expr.Canonicalize(wantExpr)
	if err != nil {
		t.Fatalf("canonicalize want total: %v", err)
	}
	if canonJSON(t, gotTotal) != canonJSON(t, wantTotal) {
		t.Fatalf("total Expr changed in round-trip:\n got %s\nwant %s", gotTotal, wantTotal)
	}
}

func TestOperationRejectsNonContentAddressedRow(t *testing.T) {
	pool, _ := startOperationPostgres(t)
	ctx := context.Background()
	_, err := pool.Exec(ctx,
		"INSERT INTO kernel.operation (id, body, version) VALUES ('abc', '{}'::jsonb, 'def')")
	if err == nil {
		t.Fatal("a row whose version != id must be refused by the operation_content_addressed CHECK")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "operation_content_addressed") &&
		!strings.Contains(strings.ToLower(err.Error()), "check") {
		t.Fatalf("rejection was not the content-address CHECK: %v", err)
	}
}

func TestAgentRoleIsSelectOnlyOnOperation(t *testing.T) {
	adminPool, dsn := startOperationPostgres(t)
	ctx := context.Background()

	op := operation.CreateOrder()
	id, body := canonicalOperationBody(t, op)
	if _, err := adminPool.Exec(ctx,
		"INSERT INTO kernel.operation (id, body, version) VALUES ($1, $2::jsonb, $3)",
		id, body, id,
	); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// Give the agent role a LOGIN so we can connect AS it and carry exactly its GRANTs
	// (the product end-user agent role). This adds only LOGIN, never a write grant.
	if _, err := adminPool.Exec(ctx, "ALTER ROLE aidos_agent LOGIN PASSWORD 'agentpw'"); err != nil {
		t.Fatalf("alter role: %v", err)
	}
	agentPool, err := pgxpool.New(ctx, swapUserInfoOperation(dsn, "aidos_agent", "agentpw"))
	if err != nil {
		t.Fatalf("agent pool: %v", err)
	}
	defer agentPool.Close()

	// SELECT is allowed (the agent reads the truth-store).
	var gotID string
	if err := agentPool.QueryRow(ctx,
		"SELECT id FROM kernel.operation WHERE id = $1", id).Scan(&gotID); err != nil {
		t.Fatalf("agent SELECT should be allowed: %v", err)
	}
	if gotID != id {
		t.Fatalf("agent SELECT returned wrong row: %q", gotID)
	}

	// Every write is rejected with permission-denied (the wall — the product guarantee).
	writes := []struct{ name, sql string }{
		{"INSERT", "INSERT INTO kernel.operation (id, body, version) VALUES ('x', '{}'::jsonb, 'x')"},
		{"UPDATE", "UPDATE kernel.operation SET version = id WHERE id = $1"},
		{"DELETE", "DELETE FROM kernel.operation WHERE id = $1"},
	}
	for _, w := range writes {
		var execErr error
		if strings.Contains(w.sql, "$1") {
			_, execErr = agentPool.Exec(ctx, w.sql, id)
		} else {
			_, execErr = agentPool.Exec(ctx, w.sql)
		}
		if execErr == nil {
			t.Fatalf("the wall must reject %s on kernel.operation (agent role)", w.name)
		}
		if !strings.Contains(strings.ToLower(execErr.Error()), "permission denied") {
			t.Fatalf("%s rejected for the wrong reason: %v", w.name, execErr)
		}
	}
}

// canonJSON re-canonicalizes JSON bytes to a stable string so two equal Expr ASTs
// compare equal regardless of key order produced by the round-trip decode.
func canonJSON(t *testing.T, b []byte) string {
	t.Helper()
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatalf("canonJSON unmarshal: %v", err)
	}
	v = sortAny(v)
	out, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("canonJSON marshal: %v", err)
	}
	return string(out)
}

// sortAny recursively re-keys maps so json.Marshal emits a stable byte order.
func sortAny(v any) any {
	switch t := v.(type) {
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		out := make(map[string]any, len(t))
		for _, k := range keys {
			out[k] = sortAny(t[k])
		}
		return out
	case []any:
		for i := range t {
			t[i] = sortAny(t[i])
		}
		return t
	default:
		return v
	}
}

// swapUserInfoOperation rewrites the user:pass of a postgres DSN (so we can connect
// as the agent role). Mirrors swapUserInfoControl.
func swapUserInfoOperation(dsn, user, pass string) string {
	at := strings.Index(dsn, "@")
	scheme := strings.Index(dsn, "://")
	if at < 0 || scheme < 0 {
		return dsn
	}
	return dsn[:scheme+3] + user + ":" + pass + dsn[at:]
}
