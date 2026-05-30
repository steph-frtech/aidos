// Command store is the AIDOS Archive content-store MCP server.
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool)
// over the content-addressed append-only store. The Workbench and other agents
// call these tools; they never touch the archive tables directly. The store sits
// below the wall, but writes still flow through this one server.
//
// Tools (one per backend op):
//
//	store_put       — store bytes, return content hash
//	store_get       — read bytes by hash
//	store_set_head  — move a head key to a hash (appends a history row)
//	store_get_head  — read the current hash for a head key
//	store_history   — list a head key's moves, oldest-first
//
// Transport: stdio. DSN comes from AIDOS_ARCHIVE_DSN.
package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/contentstore"
)

// ── Tool I/O types (JSON-serialisable; bytes are base64 to stay transport-safe) ──

type putInput struct {
	DataBase64 string `json:"data_base64" jsonschema:"base64-encoded object bytes to store"`
}
type putOutput struct {
	Hash string `json:"hash" jsonschema:"the SHA-256 hex content hash the bytes were stored under"`
}

type getInput struct {
	Hash string `json:"hash" jsonschema:"the SHA-256 hex content hash to read"`
}
type getOutput struct {
	DataBase64 string `json:"data_base64" jsonschema:"base64-encoded bytes stored at the hash"`
}

type setHeadInput struct {
	Key  string `json:"key" jsonschema:"the head key (named pointer) to move"`
	Hash string `json:"hash" jsonschema:"the content hash the head should point at"`
}
type setHeadOutput struct {
	Key  string `json:"key"`
	Hash string `json:"hash"`
}

type getHeadInput struct {
	Key string `json:"key" jsonschema:"the head key to resolve"`
}
type getHeadOutput struct {
	Key  string `json:"key"`
	Hash string `json:"hash" jsonschema:"the content hash the head currently points at"`
}

type historyInput struct {
	Key string `json:"key" jsonschema:"the head key whose move history to list"`
}
type historyMove struct {
	Key        string  `json:"key"`
	Hash       string  `json:"hash"`
	ParentHash *string `json:"parent_hash" jsonschema:"the prior hash, or null for the first move"`
}
type historyOutput struct {
	Moves []historyMove `json:"moves" jsonschema:"head moves oldest-first"`
}

// server wires the MCP tool handlers to one Store.
type server struct {
	store *contentstore.Store
}

func (s *server) put(ctx context.Context, _ *mcp.CallToolRequest, in putInput) (*mcp.CallToolResult, putOutput, error) {
	raw, err := base64.StdEncoding.DecodeString(in.DataBase64)
	if err != nil {
		return nil, putOutput{}, fmt.Errorf("store_put: decode data_base64: %w", err)
	}
	h, err := s.store.Put(ctx, raw)
	if err != nil {
		return nil, putOutput{}, err
	}
	return nil, putOutput{Hash: h}, nil
}

func (s *server) get(ctx context.Context, _ *mcp.CallToolRequest, in getInput) (*mcp.CallToolResult, getOutput, error) {
	data, err := s.store.Get(ctx, in.Hash)
	if err != nil {
		return nil, getOutput{}, err
	}
	return nil, getOutput{DataBase64: base64.StdEncoding.EncodeToString(data)}, nil
}

func (s *server) setHead(ctx context.Context, _ *mcp.CallToolRequest, in setHeadInput) (*mcp.CallToolResult, setHeadOutput, error) {
	if err := s.store.SetHead(ctx, in.Key, in.Hash); err != nil {
		return nil, setHeadOutput{}, err
	}
	return nil, setHeadOutput{Key: in.Key, Hash: in.Hash}, nil
}

func (s *server) getHead(ctx context.Context, _ *mcp.CallToolRequest, in getHeadInput) (*mcp.CallToolResult, getHeadOutput, error) {
	h, err := s.store.GetHead(ctx, in.Key)
	if err != nil {
		return nil, getHeadOutput{}, err
	}
	return nil, getHeadOutput{Key: in.Key, Hash: h}, nil
}

func (s *server) history(ctx context.Context, _ *mcp.CallToolRequest, in historyInput) (*mcp.CallToolResult, historyOutput, error) {
	moves, err := s.store.History(ctx, in.Key)
	if err != nil {
		return nil, historyOutput{}, err
	}
	out := historyOutput{Moves: make([]historyMove, len(moves))}
	for i, m := range moves {
		out.Moves[i] = historyMove{Key: m.Key, Hash: m.Hash, ParentHash: m.ParentHash}
	}
	return nil, out, nil
}

// newMCPServer builds the MCP server and registers all five store tools against s.
func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-store", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "store_put", Description: "Store bytes by content hash (idempotent); returns the hash."}, s.put)
	mcp.AddTool(srv, &mcp.Tool{Name: "store_get", Description: "Read bytes by content hash."}, s.get)
	mcp.AddTool(srv, &mcp.Tool{Name: "store_set_head", Description: "Point a head key at a content hash; appends an append-only history row."}, s.setHead)
	mcp.AddTool(srv, &mcp.Tool{Name: "store_get_head", Description: "Resolve a head key to its current content hash."}, s.getHead)
	mcp.AddTool(srv, &mcp.Tool{Name: "store_history", Description: "List a head key's moves, oldest-first."}, s.history)
	return srv
}

func main() {
	dsn := os.Getenv("AIDOS_ARCHIVE_DSN")
	if dsn == "" {
		log.Fatal("store: AIDOS_ARCHIVE_DSN is required")
	}
	ctx := context.Background()
	st, err := contentstore.New(ctx, dsn)
	if err != nil {
		log.Fatalf("store: open content store: %v", err)
	}
	defer st.Close()

	srv := newMCPServer(&server{store: st})
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("store: run: %v", err)
	}
}
