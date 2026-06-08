// Command blob-attribute is the AIDOS Kernel BLOB / FILE attribute MCP server (S72; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over S72 (back/kernel/entities/blob): the blob/file attribute AST
// node that extends the entity type system with an upload (image / document / file) WITHOUT
// widening the closed scalar set. It content-addresses a blob node (the round-trip), validates
// an upload against the node's CLOSED MIME allow-list + size ceiling (refusing
// BLOB_MIME_REFUSED / BLOB_SIZE_REFUSED, never coercing), mints a PROJECT-SCOPED storage key,
// refuses a cross-project access (BLOB_CROSS_PROJECT, never served, never guessed), and emits
// the DETERMINISTIC upload/download handler (signed URLs).
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it validates, addresses, scopes
// and emits as VALUES, and writes NOTHING (a blob attribute is a SOURCE above the line; the
// bytes live in the per-project object-storage provider, never in the truth-store nor git;
// only the `aidos` CLI via an approved changeset writes the kernel). It reads what the caller
// pins; it never authors a blob into truth.
//
// Tools (one tool = one backend op):
//
//	blob_address          — content-address a blob node (the content-addressed round-trip)
//	blob_validate_upload  — validate an upload (MIME + size) → ok | BLOB_MIME_REFUSED / BLOB_SIZE_REFUSED
//	blob_storage_key      — mint the project-scoped storage key
//	blob_cross_project    — refuse a cross-project access → ok | BLOB_CROSS_PROJECT
//	blob_emit_handler     — emit the deterministic upload/download handler (signed URLs)
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no clock,
// no rng, no I/O, never an LLM. The hash REUSES records.Hash verbatim; the refusal REUSES
// blockreason; the handler is byte-stable. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/entities/blob"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// ── blob_address ──

type addressInput struct {
	Blob blob.BlobAttribute `json:"blob" jsonschema:"the blob/file attribute AST node (name, allowed_mime, max_bytes, required)"`
}

type addressOutput struct {
	OK    bool                     `json:"ok"`
	ID    string                   `json:"id,omitempty"`
	Body  string                   `json:"body,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func address(_ context.Context, _ *mcp.CallToolRequest, in addressInput) (*mcp.CallToolResult, addressOutput, error) {
	if err := blob.ValidateShape(in.Blob); err != nil {
		br := blob.BlockUpload(err)
		return nil, addressOutput{OK: false, Block: &br}, nil
	}
	id, err := blob.ID(in.Blob)
	if err != nil {
		br := blob.BlockUpload(err)
		return nil, addressOutput{OK: false, Block: &br}, nil
	}
	body, _ := blob.Body(in.Blob)
	return nil, addressOutput{OK: true, ID: id, Body: string(body)}, nil
}

// ── blob_validate_upload ──

type validateInput struct {
	Blob   blob.BlobAttribute `json:"blob" jsonschema:"the blob attribute the upload is validated against"`
	Upload blob.Upload        `json:"upload" jsonschema:"the candidate upload (mime, size)"`
}

type validateOutput struct {
	OK    bool                     `json:"ok"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func validate(_ context.Context, _ *mcp.CallToolRequest, in validateInput) (*mcp.CallToolResult, validateOutput, error) {
	if err := blob.ValidateUpload(in.Blob, in.Upload); err != nil {
		br := blob.BlockUpload(err)
		return nil, validateOutput{OK: false, Block: &br}, nil
	}
	return nil, validateOutput{OK: true}, nil
}

// ── blob_storage_key ──

type keyInput struct {
	ProjectID   string             `json:"project_id" jsonschema:"the owning project id (namespaces the key)"`
	Entity      string             `json:"entity" jsonschema:"the owning entity name"`
	Blob        blob.BlobAttribute `json:"blob" jsonschema:"the blob attribute"`
	ContentHash string             `json:"content_hash" jsonschema:"the SHA-256 of the object bytes"`
}

type keyOutput struct {
	OK    bool                     `json:"ok"`
	Key   string                   `json:"key,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func storageKey(_ context.Context, _ *mcp.CallToolRequest, in keyInput) (*mcp.CallToolResult, keyOutput, error) {
	key, err := blob.StorageKey(in.ProjectID, in.Entity, in.Blob, in.ContentHash)
	if err != nil {
		br := blob.BlockUpload(err)
		return nil, keyOutput{OK: false, Block: &br}, nil
	}
	return nil, keyOutput{OK: true, Key: key}, nil
}

// ── blob_cross_project ──

type crossInput struct {
	Key       string `json:"key" jsonschema:"the project-scoped storage key"`
	ProjectID string `json:"project_id" jsonschema:"the project attempting the access"`
}

type crossOutput struct {
	OK    bool                     `json:"ok"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func crossProject(_ context.Context, _ *mcp.CallToolRequest, in crossInput) (*mcp.CallToolResult, crossOutput, error) {
	if err := blob.CrossProjectAccess(in.Key, in.ProjectID); err != nil {
		br := blob.BlockUpload(err)
		return nil, crossOutput{OK: false, Block: &br}, nil
	}
	return nil, crossOutput{OK: true}, nil
}

// ── blob_emit_handler ──

type emitInput struct {
	ProjectID string             `json:"project_id" jsonschema:"the owning project id (scopes the emitted handler)"`
	Entity    string             `json:"entity" jsonschema:"the owning entity name"`
	Blob      blob.BlobAttribute `json:"blob" jsonschema:"the blob attribute to emit a handler for"`
}

type emitOutput struct {
	OK         bool                     `json:"ok"`
	Path       string                   `json:"path,omitempty"`
	Target     string                   `json:"target,omitempty"`
	SourceHash string                   `json:"source_hash,omitempty"`
	Code       string                   `json:"code,omitempty"`
	Block      *blockreason.BlockReason `json:"block,omitempty"`
}

func emitHandler(_ context.Context, _ *mcp.CallToolRequest, in emitInput) (*mcp.CallToolResult, emitOutput, error) {
	a, br := blob.EmitHandler(in.ProjectID, in.Entity, in.Blob)
	if br != nil {
		return nil, emitOutput{OK: false, Block: br}, nil
	}
	return nil, emitOutput{OK: true, Path: a.Path, Target: a.Target, SourceHash: a.SourceHash, Code: string(a.Bytes)}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-blob-attribute", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "blob_address", Description: "S72: content-address a blob/file attribute node (id = Hash(Canonicalize(body))) — the content-addressed round-trip. PURE, writes nothing (the wall)."}, address)
	mcp.AddTool(srv, &mcp.Tool{Name: "blob_validate_upload", Description: "S72: validate an upload against the node's CLOSED MIME allow-list + size ceiling → ok, or BLOB_MIME_REFUSED / BLOB_SIZE_REFUSED (never coerced). PURE, writes nothing."}, validate)
	mcp.AddTool(srv, &mcp.Tool{Name: "blob_storage_key", Description: "S72: mint the PROJECT-SCOPED object-storage key (<project>/<entity>/<attr>/<hash>) — namespaced so a blob of A is unreachable from B. PURE, writes nothing."}, storageKey)
	mcp.AddTool(srv, &mcp.Tool{Name: "blob_cross_project", Description: "S72: refuse a cross-project access of a storage key → ok, or BLOB_CROSS_PROJECT (a blob of A is inaccessible from B, never served, never guessed). PURE, writes nothing."}, crossProject)
	mcp.AddTool(srv, &mcp.Tool{Name: "blob_emit_handler", Description: "S72: emit the DETERMINISTIC upload/download handler (signed URLs, baked-in MIME+size validation, project-scoped key) for a blob node — byte-stable. PURE, writes nothing."}, emitHandler)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("blob-attribute: run: %w", err))
	}
}
