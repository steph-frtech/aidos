// Package memorysrv is the AIDOS Archive `/brain` memory-adapter MCP server, exposed as a
// LIBRARY (S59 dispatcher reuse). It is the single capability door (ADR 0009: every backend
// op is an MCP tool) over the memory adapter — write a MemoryItem and RECALL it by
// similarity over pgvector, across the four indexable KRD memories
// (episodic/semantic/procedural/structural). The Workbench and other agents call these
// tools; they never touch brain.memory_item directly.
//
// Tools (one tool = one backend op):
//
//	memory_write   — append a MemoryItem (content-addressed), return its id
//	memory_recall  — recall the nearest memories by similarity, kind/branch-filtered, top-k
//	memory_get     — read one MemoryItem by id (for rendering)
//
// CONTEXT FUEL, NEVER TRUTH: this server reaches NOTHING above the wall. The store is below
// the waterline (the agent role holds SELECT + INSERT on brain.memory_item, no
// UPDATE/DELETE — memory is append-only). The MemoryFirewall promotion flow (§119.1) is a
// separate concern.
//
// INJECTION SEAM: the server is constructed with whichever memory.Store backend is
// configured — a deterministic MockStore (no DB, used by tests and the Workbench mock
// toggle) or a PgxStore over pgvector (the runtime). The Embedder is injected into the
// store, not here. By default it is the deterministic HashEmbedder, so recall is
// reproducible; the runtime would inject a real model instead.
//
// DETERMINISM-FIRST (CLAUDE.md §6): the content-addressed id, the similarity scoring and
// the append-only write are the pure memory functions; this server only persists an
// already-decided write and renders the recalled hits.
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this
// SAME server in-process: it builds the memory *mcp.Server via NewServer and dispatches a
// routed below-the-line memory_* call to it over an in-memory transport. Extracting the
// handlers here (rather than the old package-main) lets BOTH the standalone stdio binary
// (back/mcp/memory) and the dispatcher construct identical behaviour — no duplicated logic,
// no twin (reuse, don't reinvent — CLAUDE.md §0).
package memorysrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/brain/memory"
)

// ── Tool I/O types (JSON-serialisable) ──

type writeInput struct {
	Kind          string   `json:"kind" jsonschema:"one of episodic|semantic|procedural|structural"`
	Content       string   `json:"content" jsonschema:"the remembered claim (embedding source + fuel)"`
	Provenance    string   `json:"provenance" jsonschema:"who/what engendered the memory"`
	ValidityScope string   `json:"validity_scope" jsonschema:"where the memory holds (optional)"`
	ExpiresAt     string   `json:"expires_at" jsonschema:"ISO date the memory expires (optional)"`
	Confidence    float64  `json:"confidence" jsonschema:"recalled certainty 0..1 — never buys a path to the kernel"`
	Taint         []string `json:"taint" jsonschema:"provenance-quality markers: unverified|stale|user_claim|incident_derived|external_source"`
	Branch        string   `json:"branch" jsonschema:"the DAG branch the memory was captured on"`
}
type writeOutput struct {
	ID string `json:"id" jsonschema:"the content-addressed id the memory was appended under"`
}

type recallInput struct {
	Query  string `json:"query" jsonschema:"the recall query text (embedded and matched by similarity)"`
	Kind   string `json:"kind" jsonschema:"optional kind filter; empty = any"`
	Branch string `json:"branch" jsonschema:"optional branch filter; empty = any"`
	K      int    `json:"k" jsonschema:"max number of hits to return"`
}
type hitOut struct {
	ID         string   `json:"id"`
	Kind       string   `json:"kind"`
	Content    string   `json:"content"`
	Provenance string   `json:"provenance"`
	Taint      []string `json:"taint"`
	Branch     string   `json:"branch"`
	Confidence float64  `json:"confidence"`
	Score      float64  `json:"score" jsonschema:"similarity score (1 - cosine distance); higher = nearer"`
}
type recallOutput struct {
	Hits []hitOut `json:"hits" jsonschema:"nearest memories, ordered by score descending"`
}

type getInput struct {
	ID string `json:"id" jsonschema:"the content-addressed id of the memory to read"`
}
type getOutput struct {
	Hit hitOut `json:"hit"`
}

// server wires the MCP tool handlers to one memory.Store. It is unexported: callers
// construct the configured *mcp.Server via NewServer and never touch the handlers directly.
type server struct {
	store memory.Store
}

func toHit(it memory.MemoryItem, score float64) hitOut {
	taint := make([]string, len(it.Taint))
	for i, t := range it.Taint {
		taint[i] = string(t)
	}
	return hitOut{
		ID: it.ID, Kind: string(it.Kind), Content: it.Content, Provenance: it.Provenance,
		Taint: taint, Branch: it.Branch, Confidence: it.Confidence, Score: score,
	}
}

func (s *server) write(ctx context.Context, _ *mcp.CallToolRequest, in writeInput) (*mcp.CallToolResult, writeOutput, error) {
	taint := make([]memory.Taint, len(in.Taint))
	for i, t := range in.Taint {
		taint[i] = memory.Taint(t)
	}
	id, err := s.store.Write(ctx, memory.WriteInput{
		Kind: memory.Kind(in.Kind), Content: in.Content, Provenance: in.Provenance,
		ValidityScope: in.ValidityScope, ExpiresAt: in.ExpiresAt, Confidence: in.Confidence,
		Taint: taint, Branch: in.Branch,
	})
	if err != nil {
		return nil, writeOutput{}, err
	}
	return nil, writeOutput{ID: id}, nil
}

func (s *server) recall(ctx context.Context, _ *mcp.CallToolRequest, in recallInput) (*mcp.CallToolResult, recallOutput, error) {
	hits, err := s.store.Recall(ctx, memory.RecallQuery{
		QueryText: in.Query, Kind: memory.Kind(in.Kind), Branch: in.Branch, K: in.K,
	})
	if err != nil {
		return nil, recallOutput{}, err
	}
	out := recallOutput{Hits: make([]hitOut, len(hits))}
	for i, h := range hits {
		out.Hits[i] = toHit(h.Item, h.Score)
	}
	return nil, out, nil
}

func (s *server) get(ctx context.Context, _ *mcp.CallToolRequest, in getInput) (*mcp.CallToolResult, getOutput, error) {
	it, err := s.store.Get(ctx, in.ID)
	if err != nil {
		return nil, getOutput{}, err
	}
	return nil, getOutput{Hit: toHit(it, 0)}, nil
}

// NewServer builds the configured memory *mcp.Server over a single memory.Store. It
// registers the three capability-door tools (write/recall/get) — identical behaviour
// whether driven by the standalone stdio binary or the S59 gateway dispatcher over an
// in-memory transport. The Store carries its own injected Embedder (the deterministic
// HashEmbedder by default).
func NewServer(store memory.Store) *mcp.Server {
	s := &server{store: store}
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-memory", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "memory_write", Description: "Append a MemoryItem (content-addressed, append-only); returns its id."}, s.write)
	mcp.AddTool(srv, &mcp.Tool{Name: "memory_recall", Description: "Recall the nearest memories by similarity, kind/branch-filtered, top-k."}, s.recall)
	mcp.AddTool(srv, &mcp.Tool{Name: "memory_get", Description: "Read one MemoryItem by content-addressed id."}, s.get)
	return srv
}
