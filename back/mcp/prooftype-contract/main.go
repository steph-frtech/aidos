// Command prooftype-contract is the AIDOS Mirror E0-E7 CONTRACT-bascule MCP server (FK16; ADR
// 0009: every backend op is an MCP tool).
//
// It is the capability door over FK16 (back/kernel/mirror/contracte): the CONTRACT half of the
// E0-E7 migration (KRD FKE-16) — the LAST step of the FK track. FK05 (the prooftype MCP) was the
// EXPAND; this server is the *contract*: it re-labels the existing N-typed mirror corpus to E0-E7
// WITHOUT LOSS (each mirror carries its derived E + its preserved, now-Deprecated N).
//
// Three pure, write-nothing tools:
//
//	mirror_e   — a (test_kind, cert_language) → the E-level the mirror's proof ATTAINS (the closed
//	             FK16 derivation: prose→E0; else MAX(CertToE, KindToE)).
//	relabel    — a corpus of N-typed mirrors → the E-typed re-labelling: each tag carries its
//	             preserved N, its derived E, and the N lifecycle now Deprecated. NoLoss is computed.
//	histogram  — a re-labelled corpus → the E0..E7 count histogram (the panel read-model).
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING to kernel/mirrors/fitness. The actual schema switch (the
// evidence_level column, the n_lifecycle deprecation) is an EXPAND-CONTRACT Postgres migration
// (mirror_evidence_level_contract.sql) applied by the privileged `aidos` writer role through an
// approved ChangeSet, GATED BY DataTruthScope. This server only DERIVES the re-labelling.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function — no clock, no rng, no I/O,
// never an LLM. Same input → same output (the FK16 done-criteria). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/mirror/contracte"
	"github.com/steph-frtech/aidos/back/kernel/mirror/prooftype"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// ── mirror_e ──

type mirrorEInput struct {
	TestKind     string `json:"test_kind" jsonschema:"the nature of the proof (acceptance|e2e|property|fixture|contract|schema|unit|snapshot|meter)"`
	CertLanguage string `json:"cert_language" jsonschema:"the language the mirror is written in (gherkin|xstate|fast-check|rapid|zod|pact|type-check|k6|fixture|snapshot|unit|prose) — prose is non-executable → E0"`
}

type mirrorEOutput struct {
	OK    bool   `json:"ok"`
	Level int    `json:"level"`
	Name  string `json:"name"`
}

func mirrorE(_ context.Context, _ *mcp.CallToolRequest, in mirrorEInput) (*mcp.CallToolResult, mirrorEOutput, error) {
	e := contracte.MirrorE(records.TestKind(in.TestKind), records.CertLanguage(in.CertLanguage))
	return nil, mirrorEOutput{OK: true, Level: int(e), Name: e.Name()}, nil
}

// ── relabel ──

type mirrorInDTO struct {
	MirrorID     string `json:"mirror_id"`
	TestKind     string `json:"test_kind"`
	CertLanguage string `json:"cert_language"`
	N            string `json:"n" jsonschema:"the legacy N-label (N0..N5) — preserved verbatim, never deleted"`
}

type relabelInput struct {
	Corpus []mirrorInDTO `json:"corpus" jsonschema:"the existing N-typed mirror corpus to re-label to E"`
}

type tagDTO struct {
	MirrorID   string `json:"mirror_id"`
	N          string `json:"n"`
	NLifecycle string `json:"n_lifecycle"`
	E          int    `json:"e"`
	EName      string `json:"e_name"`
}

type relabelOutput struct {
	OK     bool     `json:"ok"`
	NoLoss bool     `json:"no_loss"`
	Tags   []tagDTO `json:"tags"`
}

func relabel(_ context.Context, _ *mcp.CallToolRequest, in relabelInput) (*mcp.CallToolResult, relabelOutput, error) {
	corpus := make([]contracte.MirrorIn, 0, len(in.Corpus))
	for _, m := range in.Corpus {
		corpus = append(corpus, contracte.MirrorIn{
			MirrorID:     m.MirrorID,
			TestKind:     records.TestKind(m.TestKind),
			CertLanguage: records.CertLanguage(m.CertLanguage),
			N:            prooftype.NLevel(m.N),
		})
	}
	tags := contracte.Relabel(corpus)
	out := relabelOutput{OK: true, NoLoss: contracte.NoLoss(corpus, tags), Tags: make([]tagDTO, 0, len(tags))}
	for _, t := range tags {
		out.Tags = append(out.Tags, tagDTO{
			MirrorID:   t.MirrorID,
			N:          string(t.N),
			NLifecycle: string(t.NLifecycle),
			E:          int(t.E),
			EName:      t.EName,
		})
	}
	return nil, out, nil
}

// ── histogram ──

type histInput struct {
	Corpus []mirrorInDTO `json:"corpus" jsonschema:"the N-typed mirror corpus to re-label then count by E"`
}

type histBucket struct {
	Level int    `json:"level"`
	Name  string `json:"name"`
	Count int    `json:"count"`
}

type histOutput struct {
	OK      bool         `json:"ok"`
	Buckets []histBucket `json:"buckets"`
}

func histogram(_ context.Context, _ *mcp.CallToolRequest, in histInput) (*mcp.CallToolResult, histOutput, error) {
	corpus := make([]contracte.MirrorIn, 0, len(in.Corpus))
	for _, m := range in.Corpus {
		corpus = append(corpus, contracte.MirrorIn{
			MirrorID:     m.MirrorID,
			TestKind:     records.TestKind(m.TestKind),
			CertLanguage: records.CertLanguage(m.CertLanguage),
			N:            prooftype.NLevel(m.N),
		})
	}
	tags := contracte.Relabel(corpus)
	h := contracte.EHistogram(tags)
	out := histOutput{OK: true, Buckets: make([]histBucket, 0, 8)}
	for _, e := range contracte.ELevels() {
		out.Buckets = append(out.Buckets, histBucket{Level: int(e), Name: e.Name(), Count: h[e]})
	}
	return nil, out, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-prooftype-contract", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "mirror_e", Description: "FK16 (E0-E7 contract): given a mirror's (test_kind, cert_language), return the E-level its proof ATTAINS (prose→E0; else MAX of CertToE and KindToE). PURE; writes nothing (the wall)."}, mirrorE)
	mcp.AddTool(srv, &mcp.Tool{Name: "relabel", Description: "FK16 (the bascule): re-label an N-typed mirror corpus to E0-E7 WITHOUT LOSS — each tag carries its preserved N, its derived E, and the N lifecycle now Deprecated. no_loss is computed. PURE; writes nothing (the schema switch is the gated migration)."}, relabel)
	mcp.AddTool(srv, &mcp.Tool{Name: "histogram", Description: "FK16: re-label a corpus then count mirrors per E-level (E0..E7) — the /proof-levels E-panel read-model. PURE; writes nothing."}, histogram)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("prooftype-contract: run: %w", err))
	}
}
