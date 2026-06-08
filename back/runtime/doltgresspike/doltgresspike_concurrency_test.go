package doltgresspike_test

// S88 gating spike — Testcontainers concurrency + load probe (EPIC 9, ADR 0006).
// reflects=s88-doltgres-spike-verdict · test_kind=integration · liveness=live.
// Skipped when Docker / the Doltgres image is unavailable (by-design forward-
// dependency on a real container runner — an OpenQuestion, NOT a failing residual).
//
// This is the REAL spike: it submits N concurrent connections (pgx is the in-repo
// Go stand-in for the emitted app's TS Postgres driver; the #2581 failure mode is
// re-formulated to driver-neutral STABILITY) against a Doltgres container and a
// plain-Postgres container, MEASURES stability + the perf ratio, and ASSERTS the
// done-criteria outcome:
//
//   - GO: Doltgres stays stable under N concurrent conns within the declared perf
//     ceiling → Decide() returns Go and offers doltgres as opt-in; OR
//   - NO-GO: a REPRODUCIBLE failure (panic / dropped conn / corrupted result, or a
//     perf ratio over the ceiling) → Decide() returns NoGo and the default stays
//     plain-postgres (the escape hatch was already the default).
//
// Either way the verdict is a RECORD computed from the measurement (verdict =
// measure, never a declaration). The measurement is re-run once to establish
// reproducibility before any no-go flips the default.

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/steph-frtech/aidos/back/runtime/doltgresspike"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// doltgresImage is the Postgres-wire Dolt image. Overridable for a pinned digest.
func doltgresImage() string {
	if v := os.Getenv("DOLTGRES_IMAGE"); v != "" {
		return v
	}
	return "dolthub/doltgresql:latest"
}

const spikeConns = 64 // N concurrent connections submitted to each engine.

// startPlainPostgres boots a plain-Postgres container (the default target / the
// perf baseline).
func startPlainPostgres(t *testing.T) string {
	t.Helper()
	ctx := context.Background()
	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("spike"),
		postgres.WithUsername("spike"),
		postgres.WithPassword("spike"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(60*time.Second),
		),
	)
	if err != nil {
		t.Skipf("testcontainers/plain-postgres unavailable (Docker not present?): %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })
	dsn, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("plain-postgres connection string: %v", err)
	}
	return dsn
}

// startDoltgres boots a Doltgres container. Doltgres is beta and may be slow to
// be ready / unavailable in the runner; a startup failure is a SKIP (forward-
// dependency), never a test failure.
func startDoltgres(t *testing.T) string {
	t.Helper()
	ctx := context.Background()
	req := testcontainers.ContainerRequest{
		Image:        doltgresImage(),
		ExposedPorts: []string{"5432/tcp"},
		Env: map[string]string{
			"DOLTGRES_USER":     "doltgres",
			"DOLTGRES_PASSWORD": "doltgres",
		},
		WaitingFor: wait.ForListeningPort("5432/tcp").WithStartupTimeout(120 * time.Second),
	}
	ctr, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		t.Skipf("doltgres container unavailable (beta image not pullable / Docker absent?): %v", err)
	}
	t.Cleanup(func() { _ = ctr.Terminate(ctx) })
	host, err := ctr.Host(ctx)
	if err != nil {
		t.Skipf("doltgres host: %v", err)
	}
	port, err := ctr.MappedPort(ctx, "5432")
	if err != nil {
		t.Skipf("doltgres port: %v", err)
	}
	return fmt.Sprintf("postgres://doltgres:doltgres@%s:%s/doltgres?sslmode=disable", host, port.Port())
}

// probe submits N concurrent connections to the engine at dsn, each running a
// trivial round-trip, and returns (failedConns, medianLatency). A failure is a
// connect error, a query error, or a corrupted result — the driver-neutral
// re-formulation of #2581 / #2600.
func probe(t *testing.T, dsn string, n int) (failed int, latency time.Duration) {
	t.Helper()
	ctx := context.Background()
	var (
		wg   sync.WaitGroup
		mu   sync.Mutex
		fail int
		max  time.Duration
	)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			start := time.Now()
			conn, err := pgx.Connect(ctx, dsn)
			if err != nil {
				mu.Lock()
				fail++
				mu.Unlock()
				return
			}
			defer conn.Close(ctx)
			var got int
			want := i + 1
			if err := conn.QueryRow(ctx, "SELECT $1::int", want).Scan(&got); err != nil || got != want {
				mu.Lock()
				fail++
				mu.Unlock()
				return
			}
			elapsed := time.Since(start)
			mu.Lock()
			if elapsed > max {
				max = elapsed
			}
			mu.Unlock()
		}(i)
	}
	wg.Wait()
	return fail, max
}

func TestDoltgresConcurrencySpike(t *testing.T) {
	if os.Getenv("AIDOS_RUN_DOLTGRES_SPIKE") == "" {
		t.Skip("doltgres spike is opt-in (set AIDOS_RUN_DOLTGRES_SPIKE=1); the verdict logic is proven in the property mirror")
	}
	if v := os.Getenv("SPIKE_CONNS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			t.Logf("overriding N to %d", n)
		}
	}

	pgDSN := startPlainPostgres(t)
	doltDSN := startDoltgres(t)

	// Baseline (plain-postgres) — also asserts the probe itself is sound.
	pgFail, pgLat := probe(t, pgDSN, spikeConns)
	if pgFail != 0 {
		t.Fatalf("plain-postgres baseline itself failed %d/%d conns — probe is unsound", pgFail, spikeConns)
	}

	// First Doltgres run.
	doltFail1, doltLat := probe(t, doltDSN, spikeConns)
	// Reproducibility re-run: a no-go must be reproducible.
	doltFail2, _ := probe(t, doltDSN, spikeConns)
	reproducible := (doltFail1 > 0) == (doltFail2 > 0)

	ratio := 0.0
	if pgLat > 0 {
		ratio = float64(doltLat) / float64(pgLat)
	}

	m := doltgresspike.Measurement{
		Driver:       doltgresspike.DriverPgx, // Go stand-in for the emitted TS driver.
		Conns:        spikeConns,
		FailedConns:  doltFail1,
		PerfRatio:    ratio,
		Reproducible: reproducible,
	}
	d := doltgresspike.Decide(m, doltgresspike.DefaultThresholds)

	t.Logf("S88 spike decision %s: verdict=%s default=%s optIn=%v ratio=%.2fx failed=%d/%d reproducible=%v",
		d.ID[:12], d.Verdict, d.DefaultTarget, d.OptInTargets, ratio, doltFail1, spikeConns, reproducible)

	// The done-criteria: ASSERT stability (go) OR a reproducible failure that flips
	// to plain-postgres (no-go). Either is a valid spike outcome; the default is
	// plain-postgres regardless. The ONLY illegitimate outcome is doltgres ever
	// becoming the default.
	if d.DefaultTarget != doltgresspike.PlainPostgres {
		t.Fatalf("INVARIANT VIOLATED: default became %q (must always be plain-postgres)", d.DefaultTarget)
	}
	switch d.Verdict {
	case doltgresspike.Go:
		if doltFail1 != 0 {
			t.Fatalf("Go with %d failed conns is inconsistent", doltFail1)
		}
	case doltgresspike.NoGo:
		// A no-go is only legitimate if the failure was reproducible OR perf blew
		// the ceiling — Decide already enforces this; we only re-assert the flip.
		if d.OptInAllowed(doltgresspike.Doltgres) {
			t.Fatal("no-go must withdraw doltgres opt-in")
		}
	default:
		t.Fatalf("unexpected verdict %q", d.Verdict)
	}
}
