// roundtrip_bdd_test.go — the S58 ROUND-TRIP mirror (Godog N0 + Testcontainers N5).
// reflects=runtime.gateway-roundtrip · test_kind=acceptance/integration ·
// cert_language=godog · authority=below · liveness=live. Skipped when Docker/
// Testcontainers is unavailable (by-design forward-dependency on a real Postgres).
//
// It proves the two live done-criteria DIRECTLY against Postgres:
//
//   - GODOG ROUND-TRIP: a below-the-line call (store_put then store_get) is ROUTED by
//     the gateway (OutcomeRoute) and, when dispatched, round-trips to the LIVE content
//     store in Postgres — the bytes written come back byte-identical. The gateway
//     routes; the dispatch hits the real archive (the "appel below-the-line round-trip
//     jusqu'au Postgres live").
//   - TESTCONTAINERS GRANT: acting as the FENCED aidos_agent role, a truth-zone write
//     (INSERT into kernel.truth) is REFUSED BY POSTGRES (no GRANT) — the gateway does
//     NOT bypass the GRANTs. Both layers refuse a truth-write: the gateway router at
//     the edge (GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET) AND Postgres at the table (the
//     wall, CLAUDE.md §2) — independently.
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/cucumber/godog"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/archive/contentstore"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func dockerAvailable() bool {
	return os.Getenv("DOCKER_HOST") != "" || fileExists("/var/run/docker.sock")
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func startGatewayPostgres(t *testing.T) (*pgxpool.Pool, string) {
	t.Helper()
	ctx := context.Background()
	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos"),
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
		t.Fatalf("connection string: %v", err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool: %v", err)
	}
	t.Cleanup(pool.Close)
	// Archive baseline (content store) + kernel records baseline (the wall GRANTs).
	for _, f := range []string{"../../migrations/archive_baseline.sql", "../../migrations/kernel_records_baseline.sql"} {
		sqlBytes, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(sqlBytes)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}
	return pool, dsn
}

type rtState struct {
	reg     *gateway.Registry
	store   *contentstore.Store
	dsn     string
	payload []byte
	hash    string
	got     []byte
	routeOK bool
	lastErr error
}

func TestGatewayRoundTripBDD(t *testing.T) {
	if !dockerAvailable() {
		t.Skip("docker unavailable — by-design forward-dependency on a real Postgres runner")
	}
	pool, dsn := startGatewayPostgres(t)
	ctx := context.Background()
	store, err := contentstore.New(ctx, dsn)
	if err != nil {
		t.Fatalf("content store: %v", err)
	}
	t.Cleanup(store.Close)

	st := &rtState{reg: gateway.DefaultRegistry(), store: store, dsn: dsn}

	suite := godog.TestSuite{
		Name: "gateway-roundtrip",
		ScenarioInitializer: func(sc *godog.ScenarioContext) {
			sc.Step(`^the gateway fronts the live archive store$`, func() error {
				st.payload = []byte("S58 below-the-line payload")
				return nil
			})
			sc.Step(`^a below-the-line "([^"]*)" call is routed for the active project$`, func(tool string) error {
				d := st.reg.Route(gateway.Call{
					Scope:  projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"},
					Tool:   tool,
					Target: projectwall.Target{ProjectID: "proj-a"},
				})
				if d.Outcome != gateway.OutcomeRoute {
					return fmt.Errorf("%s not routed: %v", tool, d.Outcome)
				}
				st.routeOK = true
				return nil
			})
			sc.Step(`^the dispatch writes the payload to the live store$`, func() error {
				h, err := st.store.Put(ctx, st.payload)
				if err != nil {
					return err
				}
				st.hash = h
				return nil
			})
			sc.Step(`^the same bytes round-trip back from Postgres$`, func() error {
				b, err := st.store.Get(ctx, st.hash)
				if err != nil {
					return err
				}
				st.got = b
				if string(b) != string(st.payload) {
					return fmt.Errorf("round-trip mismatch: %q != %q", b, st.payload)
				}
				return nil
			})
			sc.Step(`^the fenced agent role attempts a truth-zone write$`, func() error {
				// Act AS the fenced aidos_agent (SELECT-only on kernel) — the gateway
				// does not bypass the GRANTs.
				if _, err := pool.Exec(ctx, "SET ROLE aidos_agent"); err != nil {
					return fmt.Errorf("set role: %w", err)
				}
				_, err := pool.Exec(ctx,
					"INSERT INTO kernel.truth (id, version, body) VALUES ($1,$2,$3)",
					"t1", "v1", "{}")
				st.lastErr = err
				_, _ = pool.Exec(ctx, "RESET ROLE")
				return nil
			})
			sc.Step(`^Postgres refuses it for lack of GRANT$`, func() error {
				if st.lastErr == nil {
					return fmt.Errorf("truth-zone write was NOT refused — the GRANTs were bypassed")
				}
				if !strings.Contains(strings.ToLower(st.lastErr.Error()), "permission denied") {
					return fmt.Errorf("expected permission-denied, got: %v", st.lastErr)
				}
				return nil
			})
		},
		Options: &godog.Options{
			Format:   "pretty",
			Paths:    []string{"testdata/gateway-roundtrip.feature"},
			TestingT: t,
		},
	}
	if suite.Run() != 0 {
		t.Fatal("gateway-roundtrip Godog suite failed")
	}
}
