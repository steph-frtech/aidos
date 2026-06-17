// Package anatomysrv is the AIDOS Kernel ANATOMY MCP server (FKE — the 1-for-1 reading around
// the wall; ADR 0009: every backend op is an MCP tool), exposed as a LIBRARY (S59 dispatcher
// reuse).
//
// It is the capability door over back/kernel/mirror/anatomy — the SIX mirror-pairs each kernel
// carries (spec↔doc, behaviour↔results, scénarios↔tests, modèle↔projection, contrat↔code,
// evidence-attendue↔observée) and the deterministic VOYANT (🟢/🔴/🟡) COMPUTED per pair (never
// declared, §8). Three PURE, write-nothing tools call the EXISTING anatomy engine (they never
// reimplement it):
//
//	anatomy_pairs   — the six closed mirror-pair kinds, canonical order — the set the panel renders.
//	anatomy_voyant  — the PURE truth-table of ONE pair (declared × proven → green|red|amber).
//	anatomy_build   — a kernel id + the six pair states → the full anatomy (six ordered pairs, the
//	                  overall voyant = worst-of-six, the counts), content-addressed. The read the
//	                  /v3/anatomie lens renders (ADR 0092: the Go engine is the SINGLE live source
//	                  — the lib/v2/anatomy TS twin becomes the demo fallback only).
//
// THE WALL (CLAUDE.md §2): this server WRITES NOTHING to kernel/mirrors/fitness. It READS a
// kernel's pair-state and returns a projection — a red voyant is a SIGNAL the runner surfaces;
// acting on it goes idea → mirror → /goal (WroteKernel always false).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the VOYANT is a calcul (the judge), never an LLM. Every
// tool is a PURE function of its input — no clock, no rng, no I/O. Same state → same anatomy.
// Every tool's I/O is a JSON OBJECT (no json.RawMessage), so the S59 gateway dispatches all
// three synchronously over the in-memory transport (the byte-array transport scar is avoided).
//
// WHY A LIBRARY (S59). The gateway dispatcher (back/runtime/gatewaydispatch) reuses this SAME
// server in-process; the standalone stdio binary (back/mcp/anatomy) and the dispatcher construct
// identical behaviour from one source — no duplicated logic, no twin (CLAUDE.md §0).
package anatomysrv

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/mirror/anatomy"
)

// ── anatomy_pairs ──

type pairsInput struct{}

type pairsOutput struct {
	OK    bool     `json:"ok"`
	Pairs []string `json:"pairs"`
}

func pairs(_ context.Context, _ *mcp.CallToolRequest, _ pairsInput) (*mcp.CallToolResult, pairsOutput, error) {
	out := pairsOutput{OK: true, Pairs: []string{}}
	for _, k := range anatomy.PairKinds() {
		out.Pairs = append(out.Pairs, string(k))
	}
	return nil, out, nil
}

// ── anatomy_voyant ──

type voyantInput struct {
	Declared string `json:"declared" jsonschema:"the DECLARED side state (declared|absent)"`
	Proven   string `json:"proven" jsonschema:"the PROVEN side state (pass|fail|pending|absent)"`
}

type voyantOutput struct {
	OK     bool   `json:"ok"`
	Voyant string `json:"voyant"`
}

// voyant runs the EXISTING anatomy.ComputeVoyant (the §8 truth-table, the judge is a calcul):
// declared∧pass→green, declared∧fail→red, else amber. TOTAL; writes nothing (the wall).
func voyant(_ context.Context, _ *mcp.CallToolRequest, in voyantInput) (*mcp.CallToolResult, voyantOutput, error) {
	v := anatomy.ComputeVoyant(anatomy.DeclaredState(in.Declared), anatomy.ProvenState(in.Proven))
	return nil, voyantOutput{OK: true, Voyant: string(v)}, nil
}

// ── anatomy_build ──

type pairStateIn struct {
	Kind     string `json:"kind" jsonschema:"one of the six mirror-pairs (spec_doc|behavior_results|scenarios_tests|model_projection|contract_code|evidence)"`
	Declared string `json:"declared" jsonschema:"the DECLARED side state (declared|absent)"`
	Proven   string `json:"proven" jsonschema:"the PROVEN side state (pass|fail|pending|absent)"`
}

type buildInput struct {
	KernelID string        `json:"kernel_id" jsonschema:"the kernel whose anatomy to read"`
	States   []pairStateIn `json:"states" jsonschema:"the raw state of the six mirror-pairs"`
}

type faceOut struct {
	Side  string `json:"side"`
	State string `json:"state"`
}

type pairOut struct {
	Kind     string  `json:"kind"`
	Declared faceOut `json:"declared"`
	Proven   faceOut `json:"proven"`
	Voyant   string  `json:"voyant"`
}

type countsOut struct {
	Green int `json:"green"`
	Red   int `json:"red"`
	Amber int `json:"amber"`
}

type buildOutput struct {
	OK       bool      `json:"ok"`
	KernelID string    `json:"kernel_id,omitempty"`
	Pairs    []pairOut `json:"pairs,omitempty"`
	Overall  string    `json:"overall,omitempty"`
	Counts   countsOut `json:"counts"`
	Hash     string    `json:"hash,omitempty"`
	Error    string    `json:"error,omitempty"`
}

// build runs the EXISTING anatomy.Build (it never re-derives the pairs/voyants): the six ordered
// pairs around the wall + the overall (worst-of-six) + the counts, content-addressed. An
// incomplete/invalid state is refused with the typed error (no anatomy). PURE; writes nothing.
func build(_ context.Context, _ *mcp.CallToolRequest, in buildInput) (*mcp.CallToolResult, buildOutput, error) {
	states := make([]anatomy.PairState, 0, len(in.States))
	for _, s := range in.States {
		states = append(states, anatomy.PairState{
			Kind:     anatomy.PairKind(s.Kind),
			Declared: anatomy.DeclaredState(s.Declared),
			Proven:   anatomy.ProvenState(s.Proven),
		})
	}
	a, err := anatomy.Build(in.KernelID, states)
	if err != nil {
		return nil, buildOutput{OK: false, Error: err.Error()}, nil
	}
	out := buildOutput{
		OK:       true,
		KernelID: a.KernelID,
		Pairs:    make([]pairOut, 0, len(a.Pairs)),
		Overall:  string(a.Overall),
		Counts:   countsOut{Green: a.Counts.Green, Red: a.Counts.Red, Amber: a.Counts.Amber},
		Hash:     a.Hash(),
	}
	for _, p := range a.Pairs {
		out.Pairs = append(out.Pairs, pairOut{
			Kind:     string(p.Kind),
			Declared: faceOut{Side: string(p.Declared.Side), State: string(p.Declared.State)},
			Proven:   faceOut{Side: string(p.Proven.Side), State: string(p.Proven.State)},
			Voyant:   string(p.Voyant),
		})
	}
	return nil, out, nil
}

// NewServer builds the configured ANATOMY *mcp.Server and registers the three pure tools —
// identical behaviour whether driven by the standalone stdio binary or the S59 gateway
// dispatcher over an in-memory transport. It takes no deps: every tool is a pure projection over
// the EXISTING back/kernel/mirror/anatomy engine.
func NewServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-anatomy", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "anatomy_pairs", Description: "FKE: the six closed mirror-pair kinds (spec_doc · behavior_results · scenarios_tests · model_projection · contract_code · evidence) in canonical order — the set the /v3/anatomie panel renders, never invented. PURE; writes nothing."}, pairs)
	mcp.AddTool(srv, &mcp.Tool{Name: "anatomy_voyant", Description: "FKE (§8 the judge is a calcul): the PURE truth-table of one mirror-pair — declared∧pass→green, declared∧fail→red, everything else→amber. RED is carried ONLY by a machine failure under a declared side. TOTAL; writes nothing."}, voyant)
	mcp.AddTool(srv, &mcp.Tool{Name: "anatomy_build", Description: "FKE: a kernel id + the six pair states → the full anatomy (the six ordered pairs around the wall, the overall voyant = worst-of-six, the per-voyant counts), content-addressed. The read the /v3/anatomie lens renders. An incomplete/invalid state is refused. PURE; writes nothing (the wall)."}, build)
	return srv
}
