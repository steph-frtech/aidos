package storesrv

import (
	"context"
	"encoding/base64"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/archive/contentstore"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// startStore spins up a throwaway Postgres, applies the archive migration, and
// returns a wired MCP store handler backed by the real content store.
func startStore(t *testing.T) *server {
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
		t.Fatalf("connection string: %v", err)
	}

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool: %v", err)
	}
	defer pool.Close()
	migSQL, err := os.ReadFile("../../../migrations/archive_baseline.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	if _, err := pool.Exec(ctx, string(migSQL)); err != nil {
		t.Fatalf("apply migration: %v", err)
	}

	st, err := contentstore.New(ctx, dsn)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(st.Close)
	return &server{store: st}
}

// TestStoreTools exercises every MCP tool handler end-to-end against real
// Postgres: put → get round-trips; set_head/get_head/history reflect edits.
func TestStoreTools(t *testing.T) {
	s := startStore(t)
	ctx := context.Background()

	enc := func(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }

	// store_put "v1" then "v2"
	_, p1, err := s.put(ctx, nil, putInput{DataBase64: enc("v1")})
	if err != nil {
		t.Fatalf("put v1: %v", err)
	}
	_, p2, err := s.put(ctx, nil, putInput{DataBase64: enc("v2")})
	if err != nil {
		t.Fatalf("put v2: %v", err)
	}
	if p1.Hash == p2.Hash {
		t.Fatalf("distinct bytes produced same hash")
	}

	// store_get round-trips both.
	_, g1, err := s.get(ctx, nil, getInput{Hash: p1.Hash})
	if err != nil {
		t.Fatalf("get v1: %v", err)
	}
	raw1, _ := base64.StdEncoding.DecodeString(g1.DataBase64)
	if string(raw1) != "v1" {
		t.Fatalf("get v1: got %q", raw1)
	}

	// store_set_head doc → v1, then doc → v2.
	if _, _, err := s.setHead(ctx, nil, setHeadInput{Key: "doc", Hash: p1.Hash}); err != nil {
		t.Fatalf("set_head v1: %v", err)
	}
	if _, _, err := s.setHead(ctx, nil, setHeadInput{Key: "doc", Hash: p2.Hash}); err != nil {
		t.Fatalf("set_head v2: %v", err)
	}

	// store_get_head resolves to v2.
	_, gh, err := s.getHead(ctx, nil, getHeadInput{Key: "doc"})
	if err != nil {
		t.Fatalf("get_head: %v", err)
	}
	if gh.Hash != p2.Hash {
		t.Fatalf("get_head: got %q want %q", gh.Hash, p2.Hash)
	}

	// v1 still readable after the edit.
	if _, _, err := s.get(ctx, nil, getInput{Hash: p1.Hash}); err != nil {
		t.Fatalf("v1 unreadable after edit: %v", err)
	}

	// store_history lists both moves oldest-first with correct parents.
	_, hist, err := s.history(ctx, nil, historyInput{Key: "doc"})
	if err != nil {
		t.Fatalf("history: %v", err)
	}
	if len(hist.Moves) != 2 {
		t.Fatalf("history: want 2 moves, got %d", len(hist.Moves))
	}
	if hist.Moves[0].Hash != p1.Hash || hist.Moves[0].ParentHash != nil {
		t.Fatalf("first move wrong: %+v", hist.Moves[0])
	}
	if hist.Moves[1].Hash != p2.Hash || hist.Moves[1].ParentHash == nil || *hist.Moves[1].ParentHash != p1.Hash {
		t.Fatalf("second move wrong: %+v", hist.Moves[1])
	}
}
