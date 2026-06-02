package links_test

// Persistence mirror: reflects=kernel.link-migration, test_kind=integration, liveness=live.
//
// On a real Postgres (Testcontainers) with the S02 kernel-records baseline + the S17
// kernel.link migration applied:
//   - kernel.link exists as a content-addressed append-only table;
//   - a link serialized by SerializeLinkBody round-trips into the body jsonb and reads back
//     identically (content-addressed body ⊇ the §41 link {kind, from, to});
//   - the migration is expand-only (it adds a NEW table; the S02 kernel.truth is untouched);
//   - the agent role keeps SELECT-only on kernel.link (the wall) — INSERT is refused.
//
// This is the end-to-end proof the migration applies (the Atlas Pro `migrate lint` is not
// available; the AIDOS convention proves migrations via Testcontainers on `go test`).

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startLinkPostgres(t *testing.T) *pgxpool.Pool {
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

	// Apply the S02 baseline then the S17 link migration, in order (expand-only).
	for _, f := range []string{
		"../../migrations/kernel_records_baseline.sql",
		"../../migrations/kernel_link_baseline.sql",
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

// TestLinkRoundTrips — a serialized link round-trips through the body jsonb as a
// content-addressed row (id == version == Hash), with the pinned from/to refs intact.
func TestLinkRoundTrips(t *testing.T) {
	pool := startLinkPostgres(t)
	ctx := context.Background()

	l := links.Link{
		Kind: links.KindBinds,
		From: links.Ref{ID: "checkout-submit", Version: "v1"},
		To:   links.Ref{ID: "createOrder", Version: "v3"},
	}
	body, err := links.SerializeLinkBody(l)
	if err != nil {
		t.Fatalf("serialize: %v", err)
	}
	rec, err := records.NewRecord(records.KindLink, body)
	if err != nil {
		t.Fatalf("NewRecord: %v", err)
	}

	if _, err := pool.Exec(ctx,
		`INSERT INTO kernel.link (id, body, version) VALUES ($1, $2::jsonb, $3)`,
		rec.ID, string(rec.Body), rec.Version,
	); err != nil {
		t.Fatalf("insert link should succeed: %v", err)
	}

	var rawBody string
	if err := pool.QueryRow(ctx,
		"SELECT body::text FROM kernel.link WHERE id = $1", rec.ID).Scan(&rawBody); err != nil {
		t.Fatalf("select body: %v", err)
	}
	var got struct {
		LinkKind string    `json:"link_kind"`
		From     links.Ref `json:"from"`
		To       links.Ref `json:"to"`
	}
	if err := json.Unmarshal([]byte(rawBody), &got); err != nil {
		t.Fatalf("unmarshal stored body: %v", err)
	}
	if got.LinkKind != string(l.Kind) || got.From != l.From || got.To != l.To {
		t.Fatalf("link did not round-trip: got kind=%q from=%v to=%v want %+v", got.LinkKind, got.From, got.To, l)
	}
}

// TestAgentRoleSelectOnly — the wall (CLAUDE.md §2): the agent role may SELECT kernel.link
// but never INSERT — truth-writes flow through the aidos CLI writer role, not the agent. The
// S17 migration GRANTs SELECT + REVOKEs writes; this proves the new table inherits the wall
// (no write door was opened).
func TestAgentRoleSelectOnly(t *testing.T) {
	pool := startLinkPostgres(t)
	ctx := context.Background()

	// aidos_agent SELECT on the new table works (SELECT-only is the wall).
	if _, err := pool.Exec(ctx, "SET ROLE aidos_agent; SELECT id FROM kernel.link LIMIT 1; RESET ROLE"); err != nil {
		t.Fatalf("agent SELECT on kernel.link must succeed: %v", err)
	}
	// aidos_agent INSERT is refused — the new table did not open a write door.
	_, err := pool.Exec(ctx,
		`SET ROLE aidos_agent; INSERT INTO kernel.link (id, body, version) VALUES ('x', '{"kind":"link"}'::jsonb, 'x'); RESET ROLE`)
	if err == nil {
		t.Fatalf("agent INSERT into kernel.link must be refused by the wall")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "permission") &&
		!strings.Contains(strings.ToLower(err.Error()), "denied") {
		t.Fatalf("INSERT refused for the wrong reason: %v", err)
	}
}
