// Command prooftype is the AIDOS Mirror E0-E7 proof-typing MCP server (FK05; ADR 0009: every
// backend op is an MCP tool).
//
// It is the capability door over FK05 (back/kernel/mirror/prooftype): the EXPAND half of the
// E0-E7 migration (KRD FKE-16). It declares the N0-N5 → E0-E7 mapping as a pure function and the
// additive, E-typed proof contract a kernel carries — the *expand* step (compatible with the
// build-in-progress; it adds E-typing ALONGSIDE the N-levels, modifies no existing N-typed
// mirror). The added types E4 (security: gosec/gitleaks/evals-injection), E6 (runtime+rollback)
// and E7 (formal) are reached only via the right facet / formal-cap flag.
//
// Two pure, write-nothing tools:
//
//	map_n_to_e — an N-level → its inherent E set (the closed FKE-16 mapping line).
//	tag        — a KernelProof (N-label + instantiated facets + formal flag) → the DOUBLE-LABELLED
//	             EvidenceTag: the PRESERVED N alongside the DERIVED E contract (FromN, FromFacets,
//	             Required). This is how a kernel "affiche son evidence E-typée" with "zéro miroir N
//	             existant modifié".
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING to kernel/mirrors/fitness. It READS an N-label (set by
// S06 at the legal door) + a facet-set (set by FK02) and DERIVES the E contract — the schema
// switch is FK16's job, gated by a changeset.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): both tools are PURE functions — no clock, no rng, no I/O,
// never an LLM. Same input → same output (the FK05 done-criteria). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/prooftype"
)

// ── map_n_to_e ──

type mapInput struct {
	NLevel string `json:"n_level" jsonschema:"an N-level (N0|N1|N2|N3|N4|N5) — the legacy proof-level label"`
}

type eLevelOut struct {
	Level int    `json:"level"`
	Name  string `json:"name"`
}

type mapOutput struct {
	OK       bool        `json:"ok"`
	NLevel   string      `json:"n_level"`
	Evidence []eLevelOut `json:"evidence"`
}

func mapNToE(_ context.Context, _ *mcp.CallToolRequest, in mapInput) (*mcp.CallToolResult, mapOutput, error) {
	es := prooftype.MapNToE(prooftype.NLevel(in.NLevel))
	out := mapOutput{OK: true, NLevel: in.NLevel, Evidence: []eLevelOut{}}
	for _, e := range es {
		out.Evidence = append(out.Evidence, eLevelOut{Level: int(e), Name: e.Name()})
	}
	return nil, out, nil
}

// ── tag ──

type tagInput struct {
	NLevel         string   `json:"n_level" jsonschema:"the legacy N-label the kernel's mirror carries (N0..N5) — preserved verbatim"`
	Facets         []string `json:"facets" jsonschema:"the facet letters the kernel INSTANTIATES (F|I|S|B|R|V|M|X) — S adds E4, R/V add E6, I/B add E5, M adds E1; X (soft) adds nothing"`
	RequiresFormal bool     `json:"requires_formal" jsonschema:"true iff the invariant is a formal cap (catastrophic ∧ unsampleable, the rare T2) — only then is E7 required"`
}

type contractOut struct {
	NLevel     string      `json:"n_level"`
	FromN      []eLevelOut `json:"from_n"`
	FromFacets []eLevelOut `json:"from_facets"`
	Required   []eLevelOut `json:"required"`
}

type tagOutput struct {
	OK bool        `json:"ok"`
	N  string      `json:"n"`
	E  contractOut `json:"e"`
}

func toEOut(es []prooftype.ELevel) []eLevelOut {
	out := make([]eLevelOut, 0, len(es))
	for _, e := range es {
		out = append(out, eLevelOut{Level: int(e), Name: e.Name()})
	}
	return out
}

func tag(_ context.Context, _ *mcp.CallToolRequest, in tagInput) (*mcp.CallToolResult, tagOutput, error) {
	fs := make([]facets.Facet, 0, len(in.Facets))
	for _, f := range in.Facets {
		fs = append(fs, facets.Facet(f))
	}
	t := prooftype.Tag(prooftype.KernelProof{
		NLevel:         prooftype.NLevel(in.NLevel),
		Facets:         fs,
		RequiresFormal: in.RequiresFormal,
	})
	out := tagOutput{
		OK: true,
		N:  string(t.N),
		E: contractOut{
			NLevel:     string(t.E.NLevel),
			FromN:      toEOut(t.E.FromN),
			FromFacets: toEOut(t.E.FromFacets),
			Required:   toEOut(t.E.Required),
		},
	}
	return nil, out, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-prooftype", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "map_n_to_e", Description: "FK05 (E0-E7 expand): given an N-level (N0..N5), return the closed FKE-16 evidence set it inherently requires (N0/N2/N3→E3, N1→E5, N4→E1,E2, N5→E3,E4). PURE; writes nothing (the wall)."}, mapNToE)
	mcp.AddTool(srv, &mcp.Tool{Name: "tag", Description: "FK05 (double-étiquetage additif): given a KernelProof (N-label + instantiated facets + formal flag), return the EvidenceTag — the PRESERVED N alongside the DERIVED E-typed contract (FromN base mapping + FromFacets-added E4/E6/E5/E1 + E7 iff formal). The N is untouched (zéro miroir N modifié). PURE; writes nothing (the wall)."}, tag)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("prooftype: run: %w", err))
	}
}
