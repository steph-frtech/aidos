package temporal_test

// Persistence mirror: reflects=kernel.truth-temporal-migration + mirror_record-cert-language,
// test_kind=integration, liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline + the S06
// mirror-record baseline + the S50 temporal-invariant migration applied:
//   - kernel.truth carries a NULLABLE `temporal` jsonb fragment (existing rows untouched);
//   - a temporal invariant serialized by SerializeBody round-trips into the body jsonb and
//     a temporal fragment round-trips into the column and reads back identically;
//   - the temporal clock + mirror CHECK constraints reject out-of-enum values at the DB
//     (defense in depth alongside the pure temporal.Validate);
//   - the S06 mirrors.mirror_record.cert_language CHECK is WIDENED — statechart and tla+
//     are now accepted (the temporal mirror forms); a still-unknown value is rejected;
//   - the agent role keeps SELECT-only on kernel.truth + mirrors.mirror_record (the wall) —
//     INSERT/UPDATE of the temporal fragment is refused.

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/temporal"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startTemporalPostgres(t *testing.T) *pgxpool.Pool {
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

	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/mirror_record_baseline.sql",
		"../../migrations/kernel_temporal_invariant_baseline.sql",
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

func sampleInvariant() temporal.TemporalInvariant {
	return temporal.TemporalInvariant{
		Property:   "payment_captured implies order_confirmed within 5 minutes",
		Antecedent: "payment_captured",
		Consequent: "order_confirmed",
		Relation:   temporal.RelationWithin,
		Bound:      "5m",
		Clock:      temporal.ClockSystem,
		Tolerance:  "10s",
		Mirror:     temporal.MirrorStatechart,
	}
}

// TestTemporalFragmentRoundTrips — a serialized temporal invariant round-trips through the
// body jsonb as a content-addressed row, and a temporal fragment round-trips through the
// nullable `temporal` column.
func TestTemporalFragmentRoundTrips(t *testing.T) {
	pool := startTemporalPostgres(t)
	ctx := context.Background()

	inv := sampleInvariant()
	body, err := temporal.SerializeBody(inv)
	if err != nil {
		t.Fatalf("serialize: %v", err)
	}
	rec, err := records.NewRecord(records.KindTruth, body)
	if err != nil {
		t.Fatalf("NewRecord: %v", err)
	}
	fragment, err := json.Marshal(inv)
	if err != nil {
		t.Fatalf("marshal fragment: %v", err)
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.truth (id, body, version, temporal) VALUES ($1, $2::jsonb, $3, $4::jsonb)`,
		rec.ID, string(rec.Body), rec.Version, string(fragment),
	); err != nil {
		t.Fatalf("insert temporal truth should succeed: %v", err)
	}

	var rawFragment string
	if err := pool.QueryRow(ctx,
		"SELECT temporal::text FROM kernel.truth WHERE id = $1", rec.ID).Scan(&rawFragment); err != nil {
		t.Fatalf("select temporal fragment: %v", err)
	}
	var got temporal.TemporalInvariant
	if err := json.Unmarshal([]byte(rawFragment), &got); err != nil {
		t.Fatalf("unmarshal stored fragment: %v", err)
	}
	if got.Property != inv.Property || got.Clock != inv.Clock || got.Tolerance != inv.Tolerance || got.Mirror != inv.Mirror {
		t.Fatalf("temporal fragment did not round-trip: got %+v want %+v", got, inv)
	}
}

// TestTemporalClockMirrorCheck — the clock + mirror CHECK constraints reject an out-of-enum
// value at the DB (defense in depth). A NULL temporal fragment is allowed (existing rows).
func TestTemporalClockMirrorCheck(t *testing.T) {
	pool := startTemporalPostgres(t)
	ctx := context.Background()

	// NULL temporal fragment accepted (the expand-only nullable column).
	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.truth (id, body, version) VALUES ('plain', '{"kind":"truth"}'::jsonb, 'plain')`); err != nil {
		t.Fatalf("a truth with NULL temporal fragment must be accepted: %v", err)
	}

	// out-of-enum clock rejected.
	bad := `{"clock":"ntp","mirror":"statechart"}`
	_, err := pool.Exec(ctx,
		`INSERT INTO kernel.truth (id, body, version, temporal) VALUES ('badclock', '{"kind":"truth"}'::jsonb, 'badclock', $1::jsonb)`, bad)
	if err == nil {
		t.Fatalf("an out-of-enum clock must be refused by the CHECK constraint")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "check") && !strings.Contains(strings.ToLower(err.Error()), "constraint") {
		t.Fatalf("out-of-enum clock refused for the wrong reason: %v", err)
	}

	// out-of-enum mirror rejected.
	bad = `{"clock":"system","mirror":"graphviz"}`
	_, err = pool.Exec(ctx,
		`INSERT INTO kernel.truth (id, body, version, temporal) VALUES ('badmirror', '{"kind":"truth"}'::jsonb, 'badmirror', $1::jsonb)`, bad)
	if err == nil {
		t.Fatalf("an out-of-enum mirror must be refused by the CHECK constraint")
	}
}

// TestMirrorCertLanguageWidened — the S06 cert_language CHECK now admits statechart + tla+
// (the temporal mirror forms), while a still-unknown value is rejected.
func TestMirrorCertLanguageWidened(t *testing.T) {
	pool := startTemporalPostgres(t)
	ctx := context.Background()

	insert := func(id, cert string) error {
		_, err := pool.Exec(ctx,
			`INSERT INTO mirrors.mirror_record
			   (id, reflects_layer_id, reflects_version, test_kind, cert_language, authority, liveness, content_hash, version)
			 VALUES ($1, 'L', 'v1', 'fixture', $2, 'above', 'alive', $1, $1)`, id, cert)
		return err
	}

	// statechart + tla+ now accepted (widened in by S50).
	for _, cert := range []string{"statechart", "tla+"} {
		if err := insert("ok-"+cert, cert); err != nil {
			t.Fatalf("cert_language %q must be accepted after S50 widening: %v", cert, err)
		}
	}
	// a still-unknown cert_language is rejected.
	if err := insert("bad-uml", "uml"); err == nil {
		t.Fatalf("an unknown cert_language must still be refused by the CHECK constraint")
	}
}

// TestAgentRoleSelectOnly — the wall (CLAUDE.md §2): the agent role may SELECT kernel.truth
// but never UPDATE the temporal fragment.
func TestAgentRoleSelectOnly(t *testing.T) {
	pool := startTemporalPostgres(t)
	ctx := context.Background()

	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent; SELECT id FROM kernel.truth LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on kernel.truth must succeed: %v", err)
	}
	_, err := pool.Exec(ctx,
		`SET ROLE aidos_agent; UPDATE kernel.truth SET temporal = '{"clock":"system","mirror":"statechart"}'::jsonb; RESET ROLE`)
	if err == nil {
		t.Fatalf("agent UPDATE of the temporal fragment must be refused by the wall")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission") && !strings.Contains(strings.ToLower(err.Error()), "denied") {
		t.Fatalf("UPDATE refused for the wrong reason: %v", err)
	}
}
