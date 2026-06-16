// Command memory is the AIDOS Archive `/brain` memory-adapter MCP server (S31; ADR 0009).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) over the memory
// adapter — write a MemoryItem and RECALL it by similarity over pgvector, across the four indexable
// KRD memories (episodic/semantic/procedural/structural). The Workbench and other agents call these
// tools; they never touch brain.memory_item directly.
//
// CONTEXT FUEL, NEVER TRUTH: this server reaches NOTHING above the wall. The store is below the
// waterline (the agent role holds SELECT + INSERT on brain.memory_item, no UPDATE/DELETE — memory
// is append-only). The MemoryFirewall promotion flow (§119.1) is a separate concern.
//
// The tools (memory_write/recall/get) + the determinism rationale now live in the reusable library
// back/mcp/memory/memorysrv (extracted at S59 so the gateway dispatcher reuses the SAME server
// in-process — reuse, don't reinvent, CLAUDE.md §0). This binary is the thin stdio entrypoint: it
// builds the configured store (a deterministic in-memory MockStore when AIDOS_ARCHIVE_DSN is empty,
// otherwise a PgxStore over pgvector), injects the deterministic HashEmbedder, builds the server, and
// runs it over stdio.
package main

import (
	"context"
	"log"
	"os"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/brain/memory"
	"github.com/steph-frtech/aidos/back/mcp/memory/memorysrv"
)

// embedderSeed is the fixed seed for the deterministic HashEmbedder (ADR 0025) — recall is
// reproducible under it. The runtime would inject a real model instead.
const embedderSeed uint64 = 31

// newStore builds the configured backend: PgxStore over pgvector when AIDOS_ARCHIVE_DSN is set,
// otherwise the deterministic in-memory MockStore (proving the injection seam end to end). The
// Embedder (deterministic HashEmbedder by default) is injected into the store here.
func newStore(ctx context.Context) (memory.Store, func(), error) {
	emb := memory.NewHashEmbedder(seedFromEnv())
	dsn := os.Getenv("AIDOS_ARCHIVE_DSN")
	if dsn == "" {
		return memory.NewMockStore(emb), func() {}, nil
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, nil, err
	}
	return memory.NewPgxStore(pool, emb), pool.Close, nil
}

func seedFromEnv() uint64 {
	if s := os.Getenv("AIDOS_MEMORY_SEED"); s != "" {
		if v, err := strconv.ParseUint(s, 10, 64); err == nil {
			return v
		}
	}
	return embedderSeed
}

func main() {
	ctx := context.Background()
	store, closeFn, err := newStore(ctx)
	if err != nil {
		log.Fatalf("memory: open store: %v", err)
	}
	defer closeFn()

	srv := memorysrv.NewServer(store)
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("memory: run: %v", err)
	}
}
