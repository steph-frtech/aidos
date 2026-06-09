// Command erasure is the AIDOS Runtime/Archive GDPR EXPORT & ERASURE MCP server (S116; ADR
// 0009: every backend op is an MCP tool).
//
// It is the capability door over the S116 erasure layer (back/runtime/erasure): GDPR data-
// subject rights on the append-only truth-store — export (Art. 20) and erasure (Art. 17) — on
// TWO plans: the AIDOS account (hard delete of an account + all its projects' data, beyond the
// S53 soft-delete) and the EMITTED app (the data-subject rights of the BUILT app's end-users,
// the S103 "tout PII oubliable" made concrete). The append-only/right-to-erasure tension is
// reconciled by CRYPTO-SHREDDING + TOMBSTONE: the key/PII is destroyed, the append-only
// structure preserved (the phase hash stays valid), the decision recorded (§9).
//
// THE WALL (CLAUDE.md §2): every tool returns a VALUE, never a truth write. Selection/export/
// erasure are deterministic reads/transforms; landing the tombstoned rows is a below-the-line
// archive write. The PII never enters the kernel; the decision is appended, not edited.
//
// Tools (one tool = one backend op):
//
//	erasure_select       — the deterministic scoped query: every PII cell of a subject in scope
//	erasure_export       — GDPR Art. 20: render ALL of a person's data (plaintext)
//	erasure_erase        — GDPR Art. 17: crypto-shred + tombstone, return the recorded decision
//	erasure_phase_hash   — the structural phase hash (invariant under erasure — append-only proof)
//	erasure_pii_visible  — does ANY query still return the subject's PII? (cross-project/-plan)
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input. Same input →
// same output. The reproducibility mirrors (erasure_property_test.go + lib/erasure.test.ts) pin
// it. Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/steph-frtech/aidos/back/runtime/erasure"
)

// ── shared scope + cell envelopes ──

type scopeInput struct {
	Plan    string `json:"plan" jsonschema:"the erasure plan: account|app"`
	Subject string `json:"subject" jsonschema:"the person whose data: an account id (account) or an app end-user id (app)"`
	Project string `json:"project,omitempty" jsonschema:"restrict to one project (account plan)"`
	App     string `json:"app,omitempty" jsonschema:"restrict to one emitted app (app plan)"`
}

func (s scopeInput) scope() erasure.Scope {
	return erasure.Scope{Plan: erasure.Plan(s.Plan), Subject: s.Subject, Project: s.Project, App: s.App}
}

type cellInput struct {
	Plan      string         `json:"plan" jsonschema:"the cell's plan: account|app"`
	Subject   string         `json:"subject" jsonschema:"the cell's subject id"`
	Project   string         `json:"project" jsonschema:"the cell's project scope"`
	App       string         `json:"app,omitempty" jsonschema:"the cell's emitted-app scope (app plan)"`
	RowID     string         `json:"row_id" jsonschema:"the append-only row id (never deleted)"`
	Structure string         `json:"structure" jsonschema:"the non-PII structural projection of the row"`
	Pii       []piiCellInput `json:"pii" jsonschema:"the cell's PII fields, encrypted at rest"`
}

type piiCellInput struct {
	Path       string `json:"path" jsonschema:"the PII field path (e.g. email)"`
	Ciphertext string `json:"ciphertext" jsonschema:"the encrypted PII value"`
	KeyID      string `json:"key_id" jsonschema:"the per-subject key id (crypto-shredding destroys it)"`
	Plaintext  string `json:"plaintext,omitempty" jsonschema:"the decrypted value (drives export; never persisted)"`
}

func (c cellInput) cell() erasure.Cell {
	pii := make([]erasure.PiiCipher, 0, len(c.Pii))
	for _, p := range c.Pii {
		pii = append(pii, erasure.PiiCipher{Path: p.Path, Ciphertext: p.Ciphertext, KeyID: p.KeyID, Plaintext: p.Plaintext})
	}
	return erasure.Cell{Plan: erasure.Plan(c.Plan), Subject: c.Subject, Project: c.Project, App: c.App, RowID: c.RowID, Structure: c.Structure, Pii: pii}
}

func cells(in []cellInput) []erasure.Cell {
	out := make([]erasure.Cell, 0, len(in))
	for _, c := range in {
		out = append(out, c.cell())
	}
	return out
}

// ── erasure_select ──

type selectInput struct {
	Scope scopeInput  `json:"scope" jsonschema:"the deterministic scope (plan + subject + optional project/app)"`
	Cells []cellInput `json:"cells" jsonschema:"the candidate PII cells"`
}
type selectOutput struct {
	Selected []erasure.Cell `json:"selected"`
}

func selectCells(_ context.Context, _ *mcp.CallToolRequest, in selectInput) (*mcp.CallToolResult, selectOutput, error) {
	return nil, selectOutput{Selected: erasure.Select(in.Scope.scope(), cells(in.Cells))}, nil
}

// ── erasure_export ──

type exportOutput struct {
	Rows []erasure.ExportRow `json:"rows"`
}

func exportData(_ context.Context, _ *mcp.CallToolRequest, in selectInput) (*mcp.CallToolResult, exportOutput, error) {
	return nil, exportOutput{Rows: erasure.Export(in.Scope.scope(), cells(in.Cells))}, nil
}

// ── erasure_erase ──

type eraseInput struct {
	Scope   scopeInput  `json:"scope" jsonschema:"the deterministic scope to erase within"`
	Cells   []cellInput `json:"cells" jsonschema:"the candidate PII cells"`
	WhenRef string      `json:"when_ref,omitempty" jsonschema:"an injected deterministic reference for the decision (never a wall-clock read)"`
}
type eraseOutput struct {
	Result erasure.ErasureResult `json:"result"`
}

func erase(_ context.Context, _ *mcp.CallToolRequest, in eraseInput) (*mcp.CallToolResult, eraseOutput, error) {
	return nil, eraseOutput{Result: erasure.Erase(in.Scope.scope(), cells(in.Cells), in.WhenRef)}, nil
}

// ── erasure_phase_hash ──

type phaseHashInput struct {
	Cells []cellInput `json:"cells" jsonschema:"the store cells to hash (the structural phase digest)"`
}
type phaseHashOutput struct {
	Hash string `json:"hash"`
}

func phaseHash(_ context.Context, _ *mcp.CallToolRequest, in phaseHashInput) (*mcp.CallToolResult, phaseHashOutput, error) {
	return nil, phaseHashOutput{Hash: erasure.PhaseHash(cells(in.Cells))}, nil
}

// ── erasure_pii_visible ──

type piiVisibleInput struct {
	Subject string      `json:"subject" jsonschema:"the subject to scan for"`
	Cells   []cellInput `json:"cells" jsonschema:"the store cells to scan (cross-project, cross-plan)"`
}
type piiVisibleOutput struct {
	Visible bool `json:"visible"`
}

func piiVisible(_ context.Context, _ *mcp.CallToolRequest, in piiVisibleInput) (*mcp.CallToolResult, piiVisibleOutput, error) {
	return nil, piiVisibleOutput{Visible: erasure.PiiVisible(in.Subject, cells(in.Cells))}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-erasure", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "erasure_select", Description: "S116: the deterministic SCOPED QUERY — every PII cell of a subject in scope (plan+subject, optionally project/app), in canonical order. The single selection path export and erasure share. Pure, no LLM."}, selectCells)
	mcp.AddTool(srv, &mcp.Tool{Name: "erasure_export", Description: "S116 / GDPR Art. 20: render ALL of a person's data in plaintext, in canonical order — 'un export rend toutes les données d'une personne'. A shredded cell exports nothing (irrecoverable). Pure."}, exportData)
	mcp.AddTool(srv, &mcp.Tool{Name: "erasure_erase", Description: "S116 / GDPR Art. 17: crypto-shred + tombstone the scoped PII (key destroyed, ciphertext → Tombstone), PRESERVING the append-only structure (the phase hash stays valid). Returns the RECORDED, content-addressed ErasureDecision (§9 — never a silent edit). Writes no truth (a VALUE). Pure."}, erase)
	mcp.AddTool(srv, &mcp.Tool{Name: "erasure_phase_hash", Description: "S116: the STRUCTURAL phase hash (shape + non-PII columns + PII tombstone markers). It is INVARIANT under erasure — the append-only / DAG-integrity proof. Pure, deterministic."}, phaseHash)
	mcp.AddTool(srv, &mcp.Tool{Name: "erasure_pii_visible", Description: "S116: does ANY query still return the subject's PII? Scans every cell CROSS-PROJECT and CROSS-PLAN. After erasure it MUST be false for the erased subject. Pure."}, piiVisible)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatalf("aidos-erasure MCP server: %v", err)
	}
}
