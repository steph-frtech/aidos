package propagation_test

// Persistence mirror: reflects=kernel.propagation-migration, test_kind=integration, liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline + the S17 kernel.link +
// the S18 kernel.composes + the S19 kernel.propagation migration applied:
//   - kernel.composes_weight_admission exists (the DECLARED weight-admission table) carrying the
//     enum CHECK (cosmetic|load-bearing|critical) and the conditional "critical ⇒ weight_evidence
//     NOT NULL" CHECK — the wall the engine's ValidateWeight mirrors at the DB level;
//   - kernel.composes_weight exists as a VIEW surfacing weight + weight_evidence from composes
//     link bodies;
//   - a critical admission WITHOUT weight_evidence is REFUSED by the CHECK (the done criterion at
//     the persistence level); WITH evidence it inserts; cosmetic/load-bearing insert without it;
//   - the migration is EXPAND-ONLY (it adds a new table + a view; the S02/S17/S18 tables are
//     untouched — no ALTER);
//   - the wall holds: the agent role keeps SELECT-only on the new table (INSERT refused).
//
// This is the end-to-end proof the migration applies (AIDOS convention: Testcontainers on
// `go test`, the Atlas Pro `migrate lint` not being available).

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startPropagationPostgres(t *testing.T) *pgxpool.Pool {
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

	// Apply S02 baseline → S17 link → S18 composes → S19 propagation (all expand-only).
	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/kernel_link_baseline.sql",
		"../../migrations/kernel_composes_baseline.sql",
		"../../migrations/kernel_propagation_baseline.sql",
	} {
		mig, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read migration %s: %v", f, err)
		}
		if _, err := pool.Exec(ctx, string(mig)); err != nil {
			t.Fatalf("apply migration %s: %v", f, err)
		}
	}
	return pool
}

// TestCriticalWithoutEvidenceRefusedByCheck — THE done criterion at the persistence level: the
// conditional CHECK refuses a `critical` admission with NULL weight_evidence.
func TestCriticalWithoutEvidenceRefusedByCheck(t *testing.T) {
	pool := startPropagationPostgres(t)
	ctx := context.Background()
	body := `{"kind":"composes_weight_admission","link_id":"L-crit","link_version":"v1","weight":"critical"}`
	canon, _ := records.Canonicalize([]byte(body))
	id := records.Hash(canon)
	_, err := pool.Exec(ctx,
		`INSERT INTO kernel.composes_weight_admission (id, link_id, link_version, weight, weight_evidence, body, version)
		 VALUES ($1, 'L-crit', 'v1', 'critical', NULL, $2::jsonb, $1)`,
		id, string(canon))
	if err == nil {
		t.Fatalf("a critical weight with NULL weight_evidence MUST be refused by the conditional CHECK")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "constraint") &&
		!strings.Contains(strings.ToLower(err.Error()), "check") {
		t.Fatalf("refused for the wrong reason (want a CHECK violation): %v", err)
	}
}

// TestCriticalWithEvidenceInserts — a critical admission WITH weight_evidence satisfies the CHECK.
func TestCriticalWithEvidenceInserts(t *testing.T) {
	pool := startPropagationPostgres(t)
	ctx := context.Background()
	body := `{"kind":"composes_weight_admission","link_id":"L-crit2","link_version":"v1","weight":"critical","weight_evidence":"INC-2026-014"}`
	canon, _ := records.Canonicalize([]byte(body))
	id := records.Hash(canon)
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.composes_weight_admission (id, link_id, link_version, weight, weight_evidence, body, version)
		 VALUES ($1, 'L-crit2', 'v1', 'critical', 'INC-2026-014', $2::jsonb, $1)`,
		id, string(canon)); err != nil {
		t.Fatalf("a critical weight WITH evidence must insert: %v", err)
	}
}

// TestCosmeticAndLoadBearingInsertWithoutEvidence — the §112 pair needs no evidence; the enum
// CHECK accepts both.
func TestCosmeticAndLoadBearingInsertWithoutEvidence(t *testing.T) {
	pool := startPropagationPostgres(t)
	ctx := context.Background()
	for _, w := range []string{"cosmetic", "load-bearing"} {
		body := `{"kind":"composes_weight_admission","link_id":"L-` + w + `","link_version":"v1","weight":"` + w + `"}`
		canon, _ := records.Canonicalize([]byte(body))
		id := records.Hash(canon)
		if _, err := pool.Exec(ctx,
			`INSERT INTO kernel.composes_weight_admission (id, link_id, link_version, weight, weight_evidence, body, version)
			 VALUES ($1, $2, 'v1', $3, NULL, $4::jsonb, $1)`,
			id, "L-"+w, w, string(canon)); err != nil {
			t.Fatalf("a %q weight must insert without evidence: %v", w, err)
		}
	}
}

// TestUnknownWeightRefusedByEnumCheck — a weight outside the closed three-tier set is refused.
func TestUnknownWeightRefusedByEnumCheck(t *testing.T) {
	pool := startPropagationPostgres(t)
	ctx := context.Background()
	body := `{"kind":"composes_weight_admission","link_id":"L-bad","link_version":"v1","weight":"vital"}`
	canon, _ := records.Canonicalize([]byte(body))
	id := records.Hash(canon)
	_, err := pool.Exec(ctx,
		`INSERT INTO kernel.composes_weight_admission (id, link_id, link_version, weight, weight_evidence, body, version)
		 VALUES ($1, 'L-bad', 'v1', 'vital', NULL, $2::jsonb, $1)`,
		id, string(canon))
	if err == nil {
		t.Fatalf("a weight outside {cosmetic|load-bearing|critical} MUST be refused by the enum CHECK")
	}
}

// TestComposesWeightView — a composes link with a declared weight + weight_evidence in its body
// surfaces through the kernel.composes_weight view intact.
func TestComposesWeightView(t *testing.T) {
	pool := startPropagationPostgres(t)
	ctx := context.Background()
	body := `{"kind":"link","link_kind":"composes","parent":{"id":"cart","version":"v1"},"child":{"id":"promo-field","version":"v1"},"weight":"critical","weight_evidence":"INC-2026-014"}`
	canon, _ := records.Canonicalize([]byte(body))
	id := records.Hash(canon)
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.link (id, body, version) VALUES ($1, $2::jsonb, $1)`, id, string(canon)); err != nil {
		t.Fatalf("insert composes link: %v", err)
	}
	var weight, evidence string
	if err := pool.QueryRow(ctx,
		`SELECT weight, weight_evidence FROM kernel.composes_weight WHERE link_id = $1`, id).
		Scan(&weight, &evidence); err != nil {
		t.Fatalf("select from composes_weight view: %v", err)
	}
	if weight != "critical" || evidence != "INC-2026-014" {
		t.Fatalf("weight/evidence did not round-trip: weight=%q evidence=%q", weight, evidence)
	}
}

// TestExpandOnly_PriorTablesUntouched — the S02/S17/S18 tables are unaltered by the S19 migration.
func TestExpandOnly_PriorTablesUntouched(t *testing.T) {
	pool := startPropagationPostgres(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.layer (id, body, version) VALUES ('L1', '{"kind":"layer"}'::jsonb, 'L1')`); err != nil {
		t.Fatalf("S02 kernel.layer must still accept its original shape (expand-only): %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.link (id, body, version) VALUES ('K1', '{"kind":"link"}'::jsonb, 'K1')`); err != nil {
		t.Fatalf("S17 kernel.link must still accept its original shape (expand-only): %v", err)
	}
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.layer_activation (id, layer_id, layer_version, activation_threshold, body, version)
		 VALUES ('A1', 'l', 'v', 1, '{}'::jsonb, 'A1')`); err != nil {
		t.Fatalf("S18 kernel.layer_activation must still accept its original shape (expand-only): %v", err)
	}
}

// TestAgentRoleSelectOnly — the wall (CLAUDE.md §2): the agent role may SELECT the new table + the
// view but never INSERT — the new declared-truth table opens no write door.
func TestAgentRoleSelectOnly(t *testing.T) {
	pool := startPropagationPostgres(t)
	ctx := context.Background()
	if _, err := pool.Exec(ctx,
		"SET ROLE aidos_agent; SELECT id FROM kernel.composes_weight_admission LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on kernel.composes_weight_admission must succeed: %v", err)
	}
	if _, err := pool.Exec(ctx,
		"SET ROLE aidos_agent; SELECT link_id FROM kernel.composes_weight LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on kernel.composes_weight view must succeed: %v", err)
	}
	_, err := pool.Exec(ctx,
		`SET ROLE aidos_agent; INSERT INTO kernel.composes_weight_admission (id, link_id, link_version, weight, weight_evidence, body, version)
		 VALUES ('x', 'l', 'v', 'cosmetic', NULL, '{}'::jsonb, 'x'); RESET ROLE`)
	if err == nil {
		t.Fatalf("agent INSERT into kernel.composes_weight_admission must be refused by the wall")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission") &&
		!strings.Contains(strings.ToLower(err.Error()), "denied") {
		t.Fatalf("INSERT refused for the wrong reason: %v", err)
	}
}
