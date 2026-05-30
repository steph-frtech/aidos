package contentstore_test

// Append-only wall mirror: reflects=S01-content-store-append-only,
// test_kind=invariant, liveness=live
//
// The agent role (aidos_agent) may INSERT/SELECT on content and history but is
// never granted UPDATE or DELETE there — content and history are append-only.
// This proves the destructive-write rejection in-database, not just in app code.

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/steph-frtech/aidos/back/archive/contentstore"
)

func TestAppendOnlyWall(t *testing.T) {
	adminPool, dsn := startPostgres(t)
	ctx := context.Background()

	// Seed one content row + one head/history move as the (privileged) owner.
	store, err := contentstore.New(ctx, dsn)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()
	h, err := store.Put(ctx, []byte("immutable"))
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	if err := store.SetHead(ctx, "k", h); err != nil {
		t.Fatalf("set head: %v", err)
	}

	// Give the least-privilege agent role a login so we can connect as it.
	if _, err := adminPool.Exec(ctx, "ALTER ROLE aidos_agent LOGIN PASSWORD 'agentpw'"); err != nil {
		t.Fatalf("alter role: %v", err)
	}

	// Build a DSN for the restricted role by swapping the userinfo.
	agentDSN := swapUserInfo(dsn, "aidos_agent", "agentpw")
	agentPool, err := pgxpool.New(ctx, agentDSN)
	if err != nil {
		t.Fatalf("agent pool: %v", err)
	}
	defer agentPool.Close()

	// The agent CAN insert + select (append-only is still writable forward).
	if _, err := agentPool.Exec(ctx,
		"INSERT INTO archive.content (hash, data) VALUES ($1, $2) ON CONFLICT DO NOTHING",
		contentstore.Hash([]byte("appended")), []byte("appended"),
	); err != nil {
		t.Fatalf("agent INSERT content should be allowed: %v", err)
	}

	// The agent CANNOT destroy content/history.
	destructive := []struct {
		name string
		sql  string
	}{
		{"UPDATE content", "UPDATE archive.content SET data = 'x' WHERE hash = $1"},
		{"DELETE content", "DELETE FROM archive.content WHERE hash = $1"},
		{"UPDATE history", "UPDATE archive.history SET hash = 'x' WHERE key = 'k'"},
		{"DELETE history", "DELETE FROM archive.history WHERE key = 'k'"},
	}
	for _, d := range destructive {
		t.Run(d.name, func(t *testing.T) {
			var execErr error
			if strings.Contains(d.sql, "$1") {
				_, execErr = agentPool.Exec(ctx, d.sql, h)
			} else {
				_, execErr = agentPool.Exec(ctx, d.sql)
			}
			if execErr == nil {
				t.Fatalf("%s must be rejected for the agent role, but it succeeded", d.name)
			}
			if !strings.Contains(strings.ToLower(execErr.Error()), "permission denied") {
				t.Fatalf("%s rejected for the wrong reason: %v", d.name, execErr)
			}
		})
	}
}

// swapUserInfo rewrites the userinfo of a postgres URL DSN.
func swapUserInfo(dsn, user, pass string) string {
	const scheme = "postgres://"
	rest := strings.TrimPrefix(dsn, scheme)
	at := strings.Index(rest, "@")
	if at < 0 {
		return dsn
	}
	return scheme + user + ":" + pass + "@" + rest[at+1:]
}
