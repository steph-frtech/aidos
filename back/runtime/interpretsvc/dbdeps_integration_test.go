package interpretsvc

// dbdeps_integration_test.go — the DB PONT integration mirror: reflects=runtime.interpretsvc.dbpont,
// test_kind=integration, liveness=live. It spins up a throwaway Postgres (Testcontainers — the frozen
// stack, S05), applies the REAL EMITTED app schema (appdata.EmitProjectData over the Cart+Order
// entities — never a hand-written DDL), seeds a Cart row, then runs the REAL createOrder anchor
// THROUGH the pgx-backed DBDeps and asserts the State↔DB pont:
//
//   - the read verb SELECTs the seeded cart and binds it (items decoded from the text column);
//   - the create mutate INSERTs an Order row carrying the cart's items;
//   - the clear mutate DELETEs the cart row;
//   - the emitted events are [OrderCreated, CartCleared];
//   - a denied authorize creates NO order (the short-circuit holds against the real DB).
//
// THE WALL (§2): every write lands in the EMITTED app tables (cart/order), never a truth schema.
// DETERMINISM: the SQL the pont renders is byte-stable (sorted columns); the run is reproducible.
//
// It SKIPS gracefully when Docker is unavailable, so `go test ./...` stays green everywhere; when
// Docker is present it runs for real (the live proof the pgx pont works end to end).

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/appdata"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// appEntities are the two entities the createOrder pont touches, in the emitter's EntitySource shape.
// The Cart holds an `items` text column (JSON-encoded list — the read decodes it); the Order mirrors
// it plus the fields the anchor's mutate data pins (userId, status). Reusing appdata.EmitProjectData
// means the schema is the SAME DDL the deploy path emits — never a forked table shape.
func appEntities() []generators.EntitySource {
	return []generators.EntitySource{
		{ID: "e_Cart", Kind: generators.KindEntity, Name: "Cart", Fields: []generators.Field{
			{Name: "id", Type: "text"},
			{Name: "items", Type: "text"},
		}},
		{ID: "e_Order", Kind: generators.KindEntity, Name: "Order", Fields: []generators.Field{
			{Name: "id", Type: "text"},
			{Name: "userId", Type: "text"},
			{Name: "items", Type: "text"},
			// total is the §93 computed column — sum($.cart.items,"price"). The emitted
			// schema declares it numeric so the create mutate's evaluated Σ lands; without
			// it the INSERT fails (the pont proves the value is really computed + written).
			{Name: "total", Type: "numeric"},
			{Name: "status", Type: "text"},
		}},
	}
}

// startAppDB spins up a throwaway Postgres and applies the emitted app schema. It skips the test if
// Docker is not reachable (so the suite stays green without Docker).
func startAppDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("appdb"),
		postgres.WithUsername("app"),
		postgres.WithPassword("app"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(60*time.Second)),
	)
	if err != nil {
		t.Skipf("Docker/Postgres unavailable, skipping the DB-pont integration mirror: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(context.Background()) })

	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	t.Cleanup(pool.Close)

	// Apply the EMITTED schema (the real appdata emitter — the same DDL the deploy path mounts).
	schema, _, err := appdata.EmitProjectData("shop", appEntities())
	if err != nil {
		t.Fatalf("emit app schema: %v", err)
	}
	if _, err := pool.Exec(ctx, string(schema)); err != nil {
		t.Fatalf("apply emitted schema:\n%s\nerr: %v", schema, err)
	}
	return pool
}

func TestIntegration_DBPont_CreateOrder(t *testing.T) {
	pool := startAppDB(t)
	ctx := context.Background()

	// Seed a cart row: items is a JSON-encoded list in the text column (the read decodes it).
	_, err := pool.Exec(ctx,
		`INSERT INTO "cart" ("id","items") VALUES ($1,$2)`,
		"cart-1", `[{"product":"widget","price":10,"quantity":2},{"product":"gadget","price":5,"quantity":1}]`)
	if err != nil {
		t.Fatalf("seed cart: %v", err)
	}

	reg, err := NewRegistry([]operation.Operation{operation.CreateOrder()})
	if err != nil {
		t.Fatalf("registry: %v", err)
	}
	deps := NewDBDepsFromPool(pool)

	out, err := Interpret(reg, "createOrder",
		map[string]any{"cartId": "cart-1"},
		map[string]any{"user": map[string]any{"id": "u-1"}},
		deps)
	if err != nil {
		t.Fatalf("Interpret over the real DB: %v", err)
	}

	// Events match the §93 anchor.
	if len(out.Events) != 2 || out.Events[0] != "OrderCreated" || out.Events[1] != "CartCleared" {
		t.Fatalf("expected [OrderCreated CartCleared], got %v", out.Events)
	}

	// The effect: exactly one Order row landed in the emitted table, carrying the cart's userId/status.
	var orderCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM "order"`).Scan(&orderCount); err != nil {
		t.Fatalf("count orders: %v", err)
	}
	if orderCount != 1 {
		t.Fatalf("expected 1 order row, got %d", orderCount)
	}
	var userID, status, items string
	var total float64
	if err := pool.QueryRow(ctx, `SELECT "userId","status","items","total" FROM "order" LIMIT 1`).
		Scan(&userID, &status, &items, &total); err != nil {
		t.Fatalf("read order: %v", err)
	}
	if userID != "u-1" {
		t.Errorf("expected userId u-1, got %q", userID)
	}
	if status != "pending" {
		t.Errorf("expected status pending, got %q", status)
	}
	// The items column carries the cart's two items (JSON-encoded by the mutate pont).
	if items == "" || items == "null" {
		t.Errorf("expected the order to carry the cart items, got %q", items)
	}
	// The total column carries the COMPUTED sum: 10 + 5 = 15 (the §93 anchor's
	// total: sum($.cart.items,"price"), evaluated by the Expr engine, persisted by the
	// pont — never null, never re-folded ad-hoc). This is the OQ-SIDECAR-expr gap closed.
	if total != 15 {
		t.Errorf("expected the computed total 15 (= sum of item prices), got %v", total)
	}

	// The cart was cleared (the second mutate's DELETE).
	var cartCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM "cart"`).Scan(&cartCount); err != nil {
		t.Fatalf("count carts: %v", err)
	}
	if cartCount != 0 {
		t.Errorf("expected the cart to be cleared, %d row(s) remain", cartCount)
	}
}

// THE LIST PONT integration mirror: the READ-ONLY list verb over the REAL emitted schema. It seeds
// two Order rows (out of id order), runs DBDeps.List THROUGH pgx, and asserts the State↔DB read:
//   - List returns BOTH rows (2 seeded → 2 returned), in the DETERMINISTIC pk order (order-1 before
//     order-2), with the JSON `items` text column decoded back to a list (the rowToMap pont);
//   - an unknown entity is REFUSED (ErrUnknownEntity) against the real catalog — fail-closed, never
//     a "relation does not exist" leak nor a silent empty list.
//
// THE WALL (§2): List reads only the emitted app table, writes nothing, runs no effect.
func TestIntegration_DBPont_List(t *testing.T) {
	pool := startAppDB(t)
	ctx := context.Background()

	// Seed two Order rows, inserted out of id order so the deterministic ORDER BY is proven.
	for _, row := range []struct{ id, items, total, status string }{
		{"order-2", `[{"product":"gadget","price":5}]`, "5", "shipped"},
		{"order-1", `[{"product":"widget","price":10}]`, "10", "pending"},
	} {
		if _, err := pool.Exec(ctx,
			`INSERT INTO "order" ("id","userId","items","total","status") VALUES ($1,$2,$3,$4,$5)`,
			row.id, "u-1", row.items, row.total, row.status); err != nil {
			t.Fatalf("seed order %s: %v", row.id, err)
		}
	}

	deps := NewDBDepsFromPool(pool)

	rows, err := deps.List("Order")
	if err != nil {
		t.Fatalf("List(Order) over the real DB: %v", err)
	}
	if len(rows) != 2 {
		t.Fatalf("expected 2 order rows, got %d (%v)", len(rows), rows)
	}
	// Deterministic pk order: order-1 before order-2 (NOT insertion order).
	if rows[0]["id"] != "order-1" || rows[1]["id"] != "order-2" {
		t.Fatalf("expected rows ordered by pk [order-1, order-2], got [%v, %v]", rows[0]["id"], rows[1]["id"])
	}
	// The items text column decoded back to a list (the rowToMap pont, like Read).
	if _, ok := rows[0]["items"].([]any); !ok {
		t.Errorf("expected order-1 items decoded to a list, got %T (%v)", rows[0]["items"], rows[0]["items"])
	}

	// An unknown entity is refused against the real catalog — fail-closed.
	if _, err := deps.List("Nope"); !errors.Is(err, ErrUnknownEntity) {
		t.Fatalf("expected ErrUnknownEntity for an unknown table, got %v", err)
	}
}

func TestIntegration_DBPont_DeniedAuthorizeCreatesNoOrder(t *testing.T) {
	pool := startAppDB(t)
	ctx := context.Background()

	_, err := pool.Exec(ctx,
		`INSERT INTO "cart" ("id","items") VALUES ($1,$2)`,
		"cart-1", `[{"product":"widget","price":10,"quantity":2}]`)
	if err != nil {
		t.Fatalf("seed cart: %v", err)
	}

	reg, _ := NewRegistry([]operation.Operation{operation.CreateOrder()})
	deps := NewDBDepsFromPool(pool)
	deps.SetAllow(false) // DENY

	_, err = Interpret(reg, "createOrder",
		map[string]any{"cartId": "cart-1"},
		map[string]any{"user": map[string]any{"id": "u-1"}}, deps)
	if err == nil {
		t.Fatalf("expected a denied-authorize error, got nil")
	}

	var orderCount int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM "order"`).Scan(&orderCount); err != nil {
		t.Fatalf("count orders: %v", err)
	}
	if orderCount != 0 {
		t.Fatalf("a denied authorize must create no order, got %d", orderCount)
	}
}
