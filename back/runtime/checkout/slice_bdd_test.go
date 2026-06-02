package checkout_test

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/cucumber/godog"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/checkout"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// Acceptance mirror runner (Godog, N0): drives tests/runtime/demo-checkout.feature —
// the LOOP driver. reflects=examples.checkout.full-loop · test_kind=gherkin ·
// cert_language=godog · authority=above · liveness=live. The createOrder persistence
// runs against REAL Postgres (Testcontainers, S05/S37): the slice's OrderStore seam
// is backed by a pgx pool with the example-local order/line-item schema, so the
// scenario "an Order row is persisted in Postgres" is proven on a real database, not
// a mock. The slice writes no truth (the wall): the kernel write is the approved,
// completeness-gated changeset.

// pgOrderStore is the real-Postgres OrderStore the acceptance mirror injects — it
// persists the order and its line items in the example-local schema and reads the
// persisted line items back, so "an Order row is persisted" and "the line items match
// the cart" are proven against a live database (N in ⇒ N out, no mock).
type pgOrderStore struct {
	ctx  context.Context
	pool *pgxpool.Pool
}

func (s *pgOrderStore) CreateOrder(cart checkout.Cart) (checkout.PlacedOrder, *blockreason.BlockReason) {
	if len(cart.Items) == 0 {
		br := blockreason.For(blockreason.CodeNoRedSet)
		return checkout.PlacedOrder{}, &br
	}
	orderID := cart.ID + "-order"
	// The slice is idempotent from a clean phase: each scenario re-runs the loop, so
	// clear this order's prior rows first (a clean phase, not a duplicate-key crash).
	if _, err := s.pool.Exec(s.ctx, `DELETE FROM demo_order_line WHERE order_id = $1`, orderID); err != nil {
		br := blockreason.For(blockreason.CodeNoRedSet)
		return checkout.PlacedOrder{}, &br
	}
	if _, err := s.pool.Exec(s.ctx, `DELETE FROM demo_order WHERE id = $1`, orderID); err != nil {
		br := blockreason.For(blockreason.CodeNoRedSet)
		return checkout.PlacedOrder{}, &br
	}
	if _, err := s.pool.Exec(s.ctx, `INSERT INTO demo_order (id) VALUES ($1)`, orderID); err != nil {
		br := blockreason.For(blockreason.CodeNoRedSet)
		return checkout.PlacedOrder{}, &br
	}
	for i, it := range cart.Items {
		if _, err := s.pool.Exec(s.ctx,
			`INSERT INTO demo_order_line (order_id, line_no, product, quantity) VALUES ($1,$2,$3,$4)`,
			orderID, i, it.Product, it.Quantity); err != nil {
			br := blockreason.For(blockreason.CodeNoRedSet)
			return checkout.PlacedOrder{}, &br
		}
	}
	// Read the persisted line items back (proving they actually landed in Postgres).
	rows, err := s.pool.Query(s.ctx,
		`SELECT product, quantity FROM demo_order_line WHERE order_id = $1 ORDER BY line_no`, orderID)
	if err != nil {
		br := blockreason.For(blockreason.CodeNoRedSet)
		return checkout.PlacedOrder{}, &br
	}
	defer rows.Close()
	var items []checkout.LineItem
	for rows.Next() {
		var li checkout.LineItem
		if err := rows.Scan(&li.Product, &li.Quantity); err != nil {
			br := blockreason.For(blockreason.CodeNoRedSet)
			return checkout.PlacedOrder{}, &br
		}
		items = append(items, li)
	}
	return checkout.PlacedOrder{ID: orderID, Items: items}, nil
}

func startCheckoutPostgres(t *testing.T) (context.Context, *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos_owner"),
		postgres.WithPassword("aidos"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Fatalf("testcontainers: start postgres: %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })
	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("testcontainers: dsn: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool: %v", err)
	}
	t.Cleanup(pool.Close)
	ddl, err := os.ReadFile("../../../examples/checkout/order_line_items.sql")
	if err != nil {
		t.Fatalf("read example DDL: %v", err)
	}
	if _, err := pool.Exec(ctx, string(ddl)); err != nil {
		t.Fatalf("apply example DDL: %v", err)
	}
	return ctx, pool
}

// bddState threads the slice's progressive trace across the loop scenarios.
type bddState struct {
	store checkout.OrderStore
	trace checkout.Trace
	block *blockreason.BlockReason
}

func TestDemoCheckoutBDD(t *testing.T) {
	ctx, pool := startCheckoutPostgres(t)

	suite := godog.TestSuite{
		Name: "demo-checkout",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			st := &bddState{store: &pgOrderStore{ctx: ctx, pool: pool}}

			run := func() {
				in := checkout.ExampleInput()
				in.Store = st.store
				st.trace, st.block = checkout.RunSlice(in)
			}

			// --- givens (the loop is re-run idempotently from a clean phase per scenario) ---
			sc.Step(`^a clean stable phase$`, func() error { return nil })
			sc.Step(`^the idea "([^"]*)" is intaken into the ideas schema$`, func(_ string) error {
				run()
				return st.err()
			})
			sc.Step(`^a red set for "createOrder"$`, func() error { run(); return st.err() })
			sc.Step(`^the kernel head exposes "createOrder"$`, func() error { run(); return st.err() })
			sc.Step(`^the createOrder slice is green$`, func() error { run(); return st.err() })

			// --- whens ---
			sc.Step(`^a /goal is opened from that idea$`, func() error { return st.hasEvent(checkout.EventGoalOpened) })
			sc.Step(`^the Order entity AST and the createOrder operation/control/action AST are applied via an approved changeset$`,
				func() error { return st.hasEvent(checkout.EventChangeSetApplied) })
			sc.Step(`^the emitters run$`, func() error { return st.hasEvent(checkout.EventArtifactsEmitted) })
			sc.Step(`^createOrder is invoked with a cart of 2 line items$`, func() error {
				return st.hasEvent(checkout.EventOrderPlaced)
			})
			sc.Step(`^the phase is sealed$`, func() error { return st.hasEvent(checkout.EventPhaseSealed) })

			// --- thens ---
			sc.Step(`^a red set exists for "createOrder"$`, func() error {
				if len(st.trace.Goal.RedSet) == 0 {
					return fmt.Errorf("the /goal wrote no red set")
				}
				return nil
			})
			sc.Step(`^no kernel truth has been written yet$`, func() error {
				// At goal-open the changeset is still DRAFT until Apply — the agent has no
				// grant; the door is the changeset. (The trace records the eventual APPLIED
				// stamp, but OpenGoal itself opened only a DRAFT — the red is the goal.)
				if st.trace.Goal.ChangeSet.Status != changeset.StatusDraft {
					return fmt.Errorf("OpenGoal must leave the changeset DRAFT, got %q", st.trace.Goal.ChangeSet.Status)
				}
				return nil
			})
			sc.Step(`^the kernel head exposes the createOrder operation content hash$`, func() error {
				if st.trace.ASTs.OperationID == "" {
					return fmt.Errorf("the createOrder operation content hash is empty")
				}
				if st.trace.ChangeSet.Status != changeset.StatusApplied {
					return fmt.Errorf("the changeset must be APPLIED, got %q", st.trace.ChangeSet.Status)
				}
				return nil
			})
			sc.Step(`^the mirror reflecting "createOrder" is live$`, func() error {
				if st.trace.ChangeSet.MirrorDelta == nil {
					return fmt.Errorf("no live mirror (the changeset carries no mirror_delta — a monster)")
				}
				return nil
			})
			sc.Step(`^an Order row is persisted in Postgres$`, func() error {
				if st.trace.Order.ID == "" {
					return fmt.Errorf("no Order persisted")
				}
				var n int
				if err := pool.QueryRow(ctx, `SELECT count(*) FROM demo_order WHERE id = $1`, st.trace.Order.ID).Scan(&n); err != nil {
					return err
				}
				if n != 1 {
					return fmt.Errorf("expected exactly 1 persisted order row, got %d", n)
				}
				return nil
			})
			sc.Step(`^the order's line items match the cart$`, func() error {
				want := checkout.ExampleCart().Items
				if len(st.trace.Order.Items) != len(want) {
					return fmt.Errorf("order has %d line items, cart has %d", len(st.trace.Order.Items), len(want))
				}
				for i := range want {
					if st.trace.Order.Items[i] != want[i] {
						return fmt.Errorf("line item %d mismatch: %+v vs %+v", i, st.trace.Order.Items[i], want[i])
					}
				}
				return nil
			})
			sc.Step(`^a new stable phase exists on the dag$`, func() error {
				if st.trace.SealedPhase == "" {
					return fmt.Errorf("no stable phase sealed")
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"../../../tests/runtime/demo-checkout.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("the demo-checkout loop feature is RED")
	}
}

func (s *bddState) err() error {
	if s.block != nil {
		return fmt.Errorf("slice blocked: %s", string(s.block.Code))
	}
	return nil
}

func (s *bddState) hasEvent(e checkout.Event) error {
	if s.block != nil {
		return fmt.Errorf("slice blocked: %s", string(s.block.Code))
	}
	for _, got := range s.trace.Events {
		if got == e {
			return nil
		}
	}
	return fmt.Errorf("event %q not emitted; got %v", e, s.trace.Events)
}
