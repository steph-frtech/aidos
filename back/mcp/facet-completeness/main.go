// Command facet-completeness is the AIDOS Mirror facet-aware completeness MCP server (FK04;
// ADR 0009: every backend op is an MCP tool).
//
// It is the capability door over FK04 (back/kernel/mirror/facetcomplete): the completeness law
// made FACET-AWARE (FKE-1.3 conséquence 5). It extends S12 ("vérité ↔ miroir vivant", over
// test_kind) to the whole octuor — for EVERY instantiated facet of EVERY layer, a living proof
// pair must exist. A required pair missing or divergent on ANY instantiated facet is a MONSTER
// (a security hole, a perf regression, a lossy migration, an unproven invariant), exactly like
// a missing functional test. The soft facet X is advisory (informs, never hard-blocks).
//
// One pure, write-nothing tool:
//
//	check — a cut (layers + their instantiated facets, mirrors + the facet each proves) → the
//	        facet-aware verdict: the S06 test_kind monsters (re-used) + the per-facet monsters
//	        + the soft-X advisories. COMPLETE iff no hard monster on either plane.
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING to kernel/mirrors/fitness. It READS a projection of
// `mirrors ⋈ kernel ⋈ facets` and reports — the verdict, never a write.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): check is a PURE function of the cut — no clock, no rng,
// no I/O, never an LLM. Same cut → same verdict (the FK04 done-criteria). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/facets"
	"github.com/steph-frtech/aidos/back/kernel/mirror/facetcomplete"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// ── check ──

// layerInput is one layer of the cut: its coordinates + the facets it instantiates (the
// letters F/I/S/B/R/V/M/X whose intent is declared and therefore demand a living pair).
type layerInput struct {
	LayerID string   `json:"layer_id" jsonschema:"the kernel layer id"`
	Version string   `json:"version" jsonschema:"the layer @version"`
	Kind    string   `json:"kind" jsonschema:"the kernel kind (operation|entity|policy|view|control|action|...)"`
	Facets  []string `json:"facets" jsonschema:"the facet letters this layer INSTANTIATES (F|I|S|B|R|V|M|X) — each demands a living proof pair"`
}

// mirrorInput is one mirror of the cut: which layer @version it reflects, the facet plane it
// proves, and whether it runs (liveness + cert_language decide if it counts).
type mirrorInput struct {
	MirrorID     string `json:"mirror_id" jsonschema:"the mirror id"`
	ReflectsID   string `json:"reflects_id" jsonschema:"the layer id this mirror reflects"`
	ReflectsVer  string `json:"reflects_version" jsonschema:"the layer @version this mirror reflects"`
	Facet        string `json:"facet" jsonschema:"the FK02 facet letter this mirror proves (F|I|S|B|R|V|M|X)"`
	TestKind     string `json:"test_kind" jsonschema:"the mirror test_kind (acceptance|e2e|property|fixture|contract|schema|unit|snapshot|meter)"`
	CertLanguage string `json:"cert_language" jsonschema:"the cert language (gherkin|rapid|fast-check|fixture|pact|...|prose). prose is NOT executable — it does not count."`
	Liveness     string `json:"liveness" jsonschema:"alive|dead — a dead mirror is a divergent pair (does not count)"`
}

type checkInput struct {
	Layers  []layerInput  `json:"layers" jsonschema:"the kernel layers + the facets each instantiates"`
	Mirrors []mirrorInput `json:"mirrors" jsonschema:"the mirrors + the facet plane each proves"`
}

type facetMonsterOut struct {
	Reason   string `json:"reason"`
	LayerID  string `json:"layer_id"`
	Version  string `json:"version"`
	Kind     string `json:"kind,omitempty"`
	Facet    string `json:"facet"`
	Advisory bool   `json:"advisory"`
}

type testKindMonsterOut struct {
	Reason          string `json:"reason"`
	LayerID         string `json:"layer_id,omitempty"`
	Version         string `json:"version,omitempty"`
	Kind            string `json:"kind,omitempty"`
	MissingTestKind string `json:"missing_test_kind,omitempty"`
	MirrorID        string `json:"mirror_id,omitempty"`
}

type checkOutput struct {
	OK               bool                 `json:"ok"`
	Verdict          string               `json:"verdict"`
	TestKindMonsters []testKindMonsterOut `json:"test_kind_monsters"`
	FacetMonsters    []facetMonsterOut    `json:"facet_monsters"`
	Advisory         []facetMonsterOut    `json:"advisory"`
	HardMonsterCount int                  `json:"hard_monster_count"`
}

func check(_ context.Context, _ *mcp.CallToolRequest, in checkInput) (*mcp.CallToolResult, checkOutput, error) {
	layers := make([]facetcomplete.FacetLayer, 0, len(in.Layers))
	for _, l := range in.Layers {
		insts := make([]facets.Instance, 0, len(l.Facets))
		for _, f := range l.Facets {
			insts = append(insts, facets.Instance{Facet: facets.Facet(f), HasIntent: true})
		}
		layers = append(layers, facetcomplete.FacetLayer{
			Layer:  records.Layer{LayerID: l.LayerID, Version: l.Version, Kind: l.Kind},
			Facets: facets.FacetSet{KernelID: l.LayerID, Instances: insts},
		})
	}
	mirrors := make([]facetcomplete.FacetMirror, 0, len(in.Mirrors))
	for _, m := range in.Mirrors {
		mirrors = append(mirrors, facetcomplete.FacetMirror{
			Mirror: records.Mirror{
				MirrorID:     m.MirrorID,
				Reflects:     records.LayerRef{LayerID: m.ReflectsID, Version: m.ReflectsVer},
				TestKind:     records.TestKind(m.TestKind),
				CertLanguage: records.CertLanguage(m.CertLanguage),
				Liveness:     records.Liveness(m.Liveness),
			},
			Facet: facets.Facet(m.Facet),
		})
	}

	res := facetcomplete.ComputeFacetCompleteness(layers, mirrors)

	out := checkOutput{
		OK:               true,
		Verdict:          string(res.Verdict),
		TestKindMonsters: []testKindMonsterOut{},
		FacetMonsters:    []facetMonsterOut{},
		Advisory:         []facetMonsterOut{},
		HardMonsterCount: len(res.Facet) + len(res.TestKind),
	}
	for _, m := range res.TestKind {
		out.TestKindMonsters = append(out.TestKindMonsters, testKindMonsterOut{
			Reason: string(m.Reason), LayerID: m.LayerID, Version: m.Version, Kind: m.Kind,
			MissingTestKind: string(m.MissingTestKind), MirrorID: m.MirrorID,
		})
	}
	for _, m := range res.Facet {
		out.FacetMonsters = append(out.FacetMonsters, facetMonsterOut{
			Reason: string(m.Reason), LayerID: m.LayerID, Version: m.Version, Kind: m.Kind,
			Facet: string(m.Facet), Advisory: m.Advisory,
		})
	}
	for _, m := range res.Advisory {
		out.Advisory = append(out.Advisory, facetMonsterOut{
			Reason: string(m.Reason), LayerID: m.LayerID, Version: m.Version, Kind: m.Kind,
			Facet: string(m.Facet), Advisory: m.Advisory,
		})
	}
	return nil, out, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-facet-completeness", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "check", Description: "FK04 (facet-aware completeness): given a cut (layers + the facets each INSTANTIATES, mirrors + the facet each proves), return the verdict — the S06 test_kind monsters + the per-facet monsters (a missing/divergent proof pair on ANY instantiated facet = monster: a security hole, a perf regression, a lossy migration, an unproven invariant) + the soft-X advisories. COMPLETE iff no hard monster. PURE; writes nothing (the wall)."}, check)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("facet-completeness: run: %w", err))
	}
}
