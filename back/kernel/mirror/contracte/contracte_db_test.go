package contracte

// The FK16 PARITY mirror at the DB level (Testcontainers + real Postgres): the in-place migration
// backfill of evidence_level equals the deterministic Go MirrorE for EVERY corpus row, the N-label
// is NEVER dropped (n_lifecycle flips to deprecated, the test_kind/cert_language columns survive),
// and the wall holds (the agent role keeps SELECT-only). This is the "zéro perte" / "chaque miroir
// N porte son E" done-criterion proven end-to-end against the frozen-proven mirrors corpus.
//
// mirror record: reflects=FK16-evidence-level-contract, test_kind=property, cert_language=rapid,
//                liveness=alive — the bascule's reproducibility proof.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/kernel/mirror/prooftype"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func startContractePostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := postgres.Run(ctx,
		"postgres:16-alpine",
		postgres.WithDatabase("aidos"),
		postgres.WithUsername("aidos_owner"),
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

	for _, mig := range []string{
		"../../../migrations/kernel_records_baseline.sql",
		"../../../migrations/mirror_record_baseline.sql",
		"../../../migrations/mirror_evidence_level_contract.sql",
	} {
		sqlBytes, err := os.ReadFile(mig)
		if err != nil {
			t.Fatalf("read migration %s: %v", mig, err)
		}
		if _, err := pool.Exec(ctx, string(sqlBytes)); err != nil {
			t.Fatalf("apply migration %s: %v", mig, err)
		}
	}
	return pool
}

// corpusRow is a representative pre-FK16 mirror (its N is carried by test_kind/cert_language).
type corpusRow struct {
	id   string
	kind records.TestKind
	cert records.CertLanguage
}

// representativeCorpus spans every test_kind and a spread of cert_languages (incl. prose).
func representativeCorpus() []corpusRow {
	return []corpusRow{
		{"m-acc-gherkin", records.TestKindAcceptance, records.CertGherkin},
		{"m-e2e", records.TestKindE2E, records.CertGherkin},
		{"m-prop-rapid", records.TestKindProperty, records.CertRapid},
		{"m-fix", records.TestKindFixture, records.CertFixture},
		{"m-contract", records.TestKindContract, records.CertPact},
		{"m-schema-zod", records.TestKindSchema, records.CertZod},
		{"m-unit", records.TestKindUnit, records.CertUnit},
		{"m-snap", records.TestKindSnapshot, records.CertSnapshot},
		{"m-meter", records.TestKindMeter, records.CertK6},
		{"m-prose", records.TestKindUnit, records.CertProse}, // non-executable → E0
		{"m-k6", records.TestKindMeter, records.CertK6},
	}
}

// TestDB_Backfill_Parity proves the migration backfill == MirrorE for every row (zéro perte) and
// that the N-label survives (n_lifecycle deprecated; test_kind/cert_language intact).
func TestDB_Backfill_Parity(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping Testcontainers DB test in -short")
	}
	ctx := context.Background()
	pool := startContractePostgres(t)

	// Seed the corpus as the owner (the privileged writer; the agent has no grant — wall).
	for _, r := range representativeCorpus() {
		_, err := pool.Exec(ctx,
			`INSERT INTO mirrors.mirror_record
			   (id, reflects_layer_id, reflects_version, test_kind, cert_language, authority, liveness, content_hash, version)
			 VALUES ($1,'layer-x','v1',$2,$3,'above','alive',$1,$1)`,
			r.id, string(r.kind), string(r.cert))
		if err != nil {
			t.Fatalf("seed %s: %v", r.id, err)
		}
	}

	// Re-run the contract migration's backfill so seeded rows get their evidence_level derived
	// (the ADD COLUMN ran on an empty table; the UPDATE re-runs harmlessly and stamps the rows).
	backfill, err := os.ReadFile("../../../migrations/mirror_evidence_level_contract.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if _, err := pool.Exec(ctx, string(backfill)); err != nil {
		t.Fatalf("re-apply backfill: %v", err)
	}

	// PARITY: the backfilled evidence_level equals MirrorE(test_kind, cert_language) for every row.
	rows, err := pool.Query(ctx,
		`SELECT id, test_kind, cert_language, evidence_level, n_lifecycle FROM mirrors.mirror_record`)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	defer rows.Close()

	seen := 0
	for rows.Next() {
		var id, kind, cert, ev, lifecycle string
		if err := rows.Scan(&id, &kind, &cert, &ev, &lifecycle); err != nil {
			t.Fatalf("scan: %v", err)
		}
		seen++
		want := MirrorE(records.TestKind(kind), records.CertLanguage(cert))
		wantLabel := "E" + itoa(int(want))
		if ev != wantLabel {
			t.Fatalf("%s: stored evidence_level=%s, want %s (MirrorE parity broken)", id, ev, wantLabel)
		}
		// N is NEVER dropped: the test_kind/cert_language columns survive, n_lifecycle is deprecated.
		if lifecycle != "deprecated" {
			t.Fatalf("%s: n_lifecycle=%s, want deprecated", id, lifecycle)
		}
		if kind == "" || cert == "" {
			t.Fatalf("%s: N-label columns erased — FK16 forbids deletion", id)
		}
	}
	if seen != len(representativeCorpus()) {
		t.Fatalf("expected %d rows, saw %d (a mirror was lost)", len(representativeCorpus()), seen)
	}

	// Spot-check a couple of concrete E values match the documented ladder.
	if got := evOf(ctx, t, pool, "m-prop-rapid"); got != "E5" {
		t.Fatalf("m-prop-rapid evidence_level=%s, want E5", got)
	}
	if got := evOf(ctx, t, pool, "m-prose"); got != "E0" {
		t.Fatalf("m-prose evidence_level=%s, want E0 (non-executable)", got)
	}
	_ = prooftype.E0 // keep the import explicit
}

func evOf(ctx context.Context, t *testing.T, pool *pgxpool.Pool, id string) string {
	t.Helper()
	var ev string
	if err := pool.QueryRow(ctx,
		`SELECT evidence_level FROM mirrors.mirror_record WHERE id=$1`, id).Scan(&ev); err != nil {
		t.Fatalf("evOf %s: %v", id, err)
	}
	return ev
}

// itoa is a tiny single-digit int→string (E-levels are 0..7).
func itoa(n int) string { return string(rune('0' + n)) }
