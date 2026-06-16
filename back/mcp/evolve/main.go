// Command evolve is the AIDOS Runtime EvolutionSandbox MCP server (S42, KRD §66.1).
//
// It is the medium-loop capability door (ADR 0009: every backend op is an MCP tool)
// over the EvolutionSandbox. Every tool DEFERS to the pure runtime/evolve engine
// (Confine/Promote/Evolve) — it re-implements nothing. The server runs the §62 ②
// loop in QUARANTINE: it may emit only candidate branches (/branches/evolution),
// reports (/reports), ideas (/ideas/proposed), and it may NEVER write /kernel,
// /mirrors/above, /authority, /fitness. "L'évolution explore, elle ne gouverne pas."
//
// Tools (one per backend op):
//
//	evolve_run               — run the §62 ② loop over a cell within the sandbox,
//	                           returning the EvolutionRun (the candidate branch +
//	                           report + idea writes, each confined to can_write).
//	evolve_confine           — classify a write path against the sandbox zones
//	                           (the wall verdict — Allowed / Refused + BlockReason).
//	evolve_propose_promotion — record a PROMOTION PROPOSAL gated on
//	                           mirror_green ∧ out_of_sample_green ∧ authority_approval —
//	                           never the freeze itself (that door is the human /goal).
//	evolve_run_get           — read a recorded run by id (from the injected store).
//	evolve_run_list          — list recorded runs (from the injected store).
//
// THE WALL (CLAUDE.md §2/§8): this server carries the aidos CLI write-grant on
// ideas/dag (below the line) — it writes branches/reports/ideas ONLY through that
// grant, never the agent role, and it holds NO grant on kernel/mirrors/authority/
// fitness. A promotion is a PROPOSAL; the freeze is the separate human /goal.
//
// INJECTION SEAM: a deterministic in-memory store backs evolve_run_get/list so the
// Workbench can exercise the loop without a database. The sampler is a pure,
// deterministic function of (cell, seed) — the real generator (self-play /
// AlphaEvolve mutation) lives behind this seam, never coined in the loop shape.
//
// Transport: stdio.
package main

import (
	"context"
	"log"
	"os"
	"sync"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/evolve"
)

// ── Tool I/O types (JSON-serialisable) ──

type runInput struct {
	Cell   string `json:"cell" jsonschema:"the kernel cell (operation/policy id) to evolve — read-only, never invented"`
	Budget int    `json:"budget" jsonschema:"the search budget for this run"`
	Seed   int64  `json:"seed" jsonschema:"the deterministic seed — the run is replayable; never read from the ambient"`
	// Generator selects the EG04 search-strategy generator behind the frozen seam (EG04):
	// "" | "deterministic" (the fallback), "novelty" | "poet" | "mome" (the diversity /
	// stepping-stone generators). Whichever is chosen, it only PROPOSES — the deterministic
	// Promote gate disposes, and the run still emits only can_write (the wall is unchanged).
	Generator string `json:"generator,omitempty" jsonschema:"the EG04 generator behind the seam — deterministic | novelty | poet | mome (default deterministic)"`
}

type emittedOut struct {
	Zone string `json:"zone"`
	Path string `json:"path"`
}

type runOutput struct {
	RunID    string       `json:"run_id"`
	Cell     string       `json:"cell"`
	ParentID string       `json:"parent_id"`
	Variant  string       `json:"variant_id"`
	Niche    string       `json:"niche"`
	Emitted  []emittedOut `json:"emitted" jsonschema:"every emitted write is confined to can_write — the loop never governs"`
}

type confineInput struct {
	Path string `json:"path" jsonschema:"the write path to classify against the sandbox zones"`
}

type confineOutput struct {
	Verdict     string   `json:"verdict"`
	BlockCode   string   `json:"block_code,omitempty"`
	Explanation string   `json:"explanation,omitempty"`
	HowToFix    []string `json:"how_to_fix,omitempty"`
}

type promoteInput struct {
	VariantID         string  `json:"variant_id"`
	Niche             string  `json:"niche"`
	Mirror            string  `json:"mirror" jsonschema:"the deterministic Judge's verdict — green | red"`
	OutOfSample       string  `json:"out_of_sample" jsonschema:"the out-of-sample / walk-forward verdict — green | red"`
	AuthorityApproved bool    `json:"authority_approved"`
	Fitness           float64 `json:"fitness" jsonschema:"the anchored fitness reading — orders within a niche, never overrides the gate"`
}

type promoteOutput struct {
	Verdict      string `json:"verdict"`
	Niche        string `json:"niche,omitempty"`
	Proposal     bool   `json:"proposal"`
	WritesTruth  bool   `json:"writes_truth"`
	RequiresGoal string `json:"requires_goal,omitempty"`
	Reason       string `json:"reason,omitempty"`
}

type runGetInput struct {
	RunID string `json:"run_id"`
}

// coverageInput drives evolve_coverage (EG04): it measures, on a declared multi-niche cell,
// the gate-passing niche coverage of each EG04 generator vs the deterministic baseline. The
// cell's niches / approved set / out-of-sample floor are PASSED IN (read-only, never invented);
// the budget+seed make the measurement replayable.
type coverageInput struct {
	Cell                    string   `json:"cell" jsonschema:"the cell id — read-only, never invented"`
	Niches                  []string `json:"niches" jsonschema:"the cell's DECLARED behavioral niches (the coverage denominator)"`
	AuthorityApprovedNiches []string `json:"authority_approved_niches" jsonschema:"the subset the authority approved for promotion"`
	OutOfSampleThreshold    float64  `json:"out_of_sample_threshold" jsonschema:"the §87 out-of-sample fidelity floor"`
	Budget                  int      `json:"budget" jsonschema:"the search budget"`
	Seed                    int64    `json:"seed" jsonschema:"the deterministic seed — the measurement is replayable"`
}

// generatorCoverage is one row of the coverage report: a named EG04 generator and the number of
// distinct gate-passing niches it covered. WritesTruth is ALWAYS false (a generator never writes
// truth — it only proposes; the gate disposes; promotion is the human /goal).
type generatorCoverage struct {
	Name        string `json:"name"`
	Coverage    int    `json:"coverage"`
	WritesTruth bool   `json:"writes_truth"`
}

// coverageOutput is the EG04 coverage report: the deterministic baseline coverage and each
// generator's coverage measured by the SAME frozen gate. The generators only change WHAT is
// proposed; the gate (JudgeCandidate → Promote) is unchanged. A higher Coverage means the
// generator widened the MAP-Elites niche coverage — the EG04 win.
type coverageOutput struct {
	Cell       string              `json:"cell"`
	Baseline   int                 `json:"baseline" jsonschema:"the deterministic FixtureProposer's gate-passing niche coverage"`
	Generators []generatorCoverage `json:"generators" jsonschema:"each EG04 generator's gate-passing niche coverage — widens vs baseline"`
}

type runListOutput struct {
	RunIDs []string `json:"run_ids"`
}

// store is the injected, in-memory recorder of EvolutionRuns (the seam where the
// aidos CLI write-grant on dag would persist the branch/report rows). Deterministic.
type store struct {
	mu   sync.Mutex
	runs map[string]evolve.EvolutionRun
}

func newStore() *store { return &store{runs: map[string]evolve.EvolutionRun{}} }

func (s *store) put(id string, r evolve.EvolutionRun) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.runs[id] = r
}

func (s *store) get(id string) (evolve.EvolutionRun, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.runs[id]
	return r, ok
}

func (s *store) list() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	ids := make([]string, 0, len(s.runs))
	for id := range s.runs {
		ids = append(ids, id)
	}
	return ids
}

// server wires the MCP tool handlers to the pure evolve engine + the injected store.
type server struct {
	store   *store
	sampler evolve.Sampler
	// selfPlay arms the EG03 self-play Proposer behind the frozen seam (the gated LLM
	// exception, §6). When false (the default), the deterministic sampler is the sole producer.
	selfPlay bool
	// proposer is the INJECTED self-play Proposer used when selfPlay is armed. Production
	// injects ClaudeProposer (real CLI + deterministic fallback); the hermetic tests inject
	// FixtureProposer so they never touch the network. Nil ⇒ self-play disabled.
	proposer evolve.Proposer
}

// deterministicSampler is the injected, pure sampler used when no real generator is
// wired: it returns a stable parent + a green-evidence variant keyed off the cell.
// The real self-play / AlphaEvolve generator (EG03) lives behind this seam — see
// selfPlaySamplerFor below, which plugs evolve.NewSelfPlaySampler (the self-play
// Proposer) into this exact seam. The wall (CLAUDE.md §2) is unchanged either way:
// the sampler only PROPOSES; the deterministic Promote gate disposes.
func deterministicSampler(cell string, seed int64) (string, evolve.Variant, evolve.Evidence) {
	return "parent-" + cell, evolve.Variant{ID: "var-" + cell, Niche: cell + "/baseline"},
		evolve.Evidence{Mirror: evolve.MirrorGreen, OutOfSample: evolve.OutOfSampleGreen, AuthorityApproved: false, Fitness: 0.5}
}

// defaultCellFor builds a minimal, HONEST Cell view for a cell id when the self-play
// sampler is wired: a single declared+approved baseline niche (the loop never invents a
// niche the cell does not declare). A real deployment reads the cell's declared niches
// from the kernel projection; here the MCP keeps the conservative baseline so the seam is
// exercisable without a DB.
func defaultCellFor(cellID string) evolve.Cell {
	niche := cellID + "/baseline"
	return evolve.Cell{
		ID:                      cellID,
		Niches:                  []string{niche},
		AuthorityApprovedNiches: []string{niche},
		OutOfSampleThreshold:    0.55,
	}
}

// selfPlaySamplerFor is the EG03 wiring: it plugs the INJECTED self-play Proposer into the
// frozen Sampler seam for the given cell. The IA is confined to PROPOSING; the deterministic
// promotion-gate re-judges every variant. In production the proposer is ClaudeProposer (the
// REAL CLI generator WITH a deterministic FixtureProposer fallback); the hermetic tests inject
// FixtureProposer directly so they NEVER touch the network.
func selfPlaySamplerFor(cellID string, budget int, proposer evolve.Proposer) evolve.Sampler {
	return evolve.NewSelfPlaySampler(defaultCellFor(cellID), proposer, budget)
}

// selfPlayEnabled reports whether the real self-play generator is wired (env-gated, so the
// default + the hermetic tests stay on the deterministic sampler). AIDOS_EVOLVE_SELFPLAY=1
// arms the EG03 generator behind the seam (the gated LLM exception, §6).
func selfPlayEnabled() bool { return os.Getenv("AIDOS_EVOLVE_SELFPLAY") == "1" }

// generatorByName maps an EG04 generator name to its DETERMINISTIC Proposer behind the frozen
// seam. These are SEARCH STRATEGIES (Novelty-Search / POET / MOME), NOT LLMs — seeded, no
// network. An unknown / empty name yields nil (the caller falls back to the deterministic
// sampler). Boids/ACO/PSO are deliberately ABSENT (ADR 0089: pedigree, never coded).
func generatorByName(name string) evolve.Proposer {
	switch name {
	case "novelty":
		return evolve.NoveltySearchProposer
	case "poet":
		return evolve.POETProposer
	case "mome":
		return evolve.MOMEProposer
	default:
		return nil
	}
}

// eg04Generators is the closed, ordered set of EG04 generator names the coverage report
// measures (Boids/ACO/PSO are NOT here — ADR 0089). Ordered for a deterministic report.
var eg04Generators = []string{"novelty", "poet", "mome"}

func (s *server) evolveRun(_ context.Context, _ *mcp.CallToolRequest, in runInput) (*mcp.CallToolResult, runOutput, error) {
	// The sampler is the frozen seam (EG02). By default it is the deterministic fallback;
	// when self-play is armed (EG03), a per-cell self-play Proposer is plugged in; when an
	// EG04 generator is named (novelty | poet | mome), that DETERMINISTIC search strategy is
	// plugged into the SAME seam. Whichever — the generator only PROPOSES, the deterministic
	// Promote gate disposes, and the harness is invariant to which (EG02). No LLM in EG04.
	sampler := s.sampler
	if gen := generatorByName(in.Generator); gen != nil {
		sampler = selfPlaySamplerFor(in.Cell, in.Budget, gen)
	} else if s.selfPlay && s.proposer != nil {
		sampler = selfPlaySamplerFor(in.Cell, in.Budget, s.proposer)
	}
	run := evolve.Evolve(in.Cell, in.Budget, in.Seed, sampler)
	runID := "run-" + run.Variant.ID
	s.store.put(runID, run)

	out := runOutput{
		RunID:    runID,
		Cell:     run.Cell,
		ParentID: run.ParentID,
		Variant:  run.Variant.ID,
		Niche:    run.Variant.Niche,
	}
	for _, w := range run.Emitted {
		out.Emitted = append(out.Emitted, emittedOut{Zone: w.Zone, Path: w.Path})
	}
	return nil, out, nil
}

func (s *server) evolveConfine(_ context.Context, _ *mcp.CallToolRequest, in confineInput) (*mcp.CallToolResult, confineOutput, error) {
	res := evolve.Confine(evolve.WriteAttempt{Path: in.Path})
	out := confineOutput{Verdict: string(res.Verdict)}
	if res.BlockReason != nil {
		out.BlockCode = string(res.BlockReason.Code)
		out.Explanation = res.BlockReason.Explanation
		out.HowToFix = res.BlockReason.HowToFix
	}
	return nil, out, nil
}

func (s *server) evolveProposePromotion(_ context.Context, _ *mcp.CallToolRequest, in promoteInput) (*mcp.CallToolResult, promoteOutput, error) {
	v := evolve.Variant{ID: in.VariantID, Niche: in.Niche}
	e := evolve.Evidence{
		Mirror:            evolve.MirrorStatus(in.Mirror),
		OutOfSample:       evolve.OutOfSampleStatus(in.OutOfSample),
		AuthorityApproved: in.AuthorityApproved,
		Fitness:           in.Fitness,
	}
	res := evolve.Promote(v, e)
	out := promoteOutput{Verdict: string(res.Verdict), Reason: res.Reason}
	if res.Proposal != nil {
		out.Niche = res.Proposal.Niche
		out.Proposal = res.Proposal.Proposal
		out.WritesTruth = res.Proposal.WritesTruth
		out.RequiresGoal = res.Proposal.RequiresGoal
	}
	return nil, out, nil
}

func (s *server) evolveRunGet(_ context.Context, _ *mcp.CallToolRequest, in runGetInput) (*mcp.CallToolResult, runOutput, error) {
	run, ok := s.store.get(in.RunID)
	if !ok {
		return nil, runOutput{}, nil
	}
	out := runOutput{RunID: in.RunID, Cell: run.Cell, ParentID: run.ParentID, Variant: run.Variant.ID, Niche: run.Variant.Niche}
	for _, w := range run.Emitted {
		out.Emitted = append(out.Emitted, emittedOut{Zone: w.Zone, Path: w.Path})
	}
	return nil, out, nil
}

func (s *server) evolveRunList(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, runListOutput, error) {
	return nil, runListOutput{RunIDs: s.store.list()}, nil
}

// evolveCoverage measures the EG04 win (ADR 0009 capability door): for a declared multi-niche
// cell it reports the DETERMINISTIC baseline's gate-passing niche coverage and each EG04
// generator's coverage, measured by the SAME frozen gate (evolve.NicheCoverage → JudgeCandidate
// → Promote). The generators only change WHAT is proposed; the Judge=mirror is untouched. A
// higher coverage means the generator widened the MAP-Elites niche coverage — without changing
// the promotion-gate. DETERMINISTIC (same inputs → same report); HERMETIC (search strategies,
// no LLM, no network). It writes NO truth — WritesTruth is always false.
func (s *server) evolveCoverage(_ context.Context, _ *mcp.CallToolRequest, in coverageInput) (*mcp.CallToolResult, coverageOutput, error) {
	cell := evolve.Cell{
		ID:                      in.Cell,
		Niches:                  in.Niches,
		AuthorityApprovedNiches: in.AuthorityApprovedNiches,
		OutOfSampleThreshold:    in.OutOfSampleThreshold,
	}
	out := coverageOutput{
		Cell:     in.Cell,
		Baseline: evolve.NicheCoverage(cell, evolve.FixtureProposer, in.Budget, in.Seed),
	}
	for _, name := range eg04Generators {
		gen := generatorByName(name)
		out.Generators = append(out.Generators, generatorCoverage{
			Name:        name,
			Coverage:    evolve.NicheCoverage(cell, gen, in.Budget, in.Seed),
			WritesTruth: false, // a generator never writes truth — it only proposes; the gate disposes.
		})
	}
	return nil, out, nil
}

// newMCPServer builds the MCP server and registers the evolve tools.
func newMCPServer(s *server) *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-evolve", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "evolve_run", Description: "Run the §62 ② medium loop over a cell within the EvolutionSandbox; returns the EvolutionRun (branch/report/idea writes, each confined to can_write — the loop never governs)."}, s.evolveRun)
	mcp.AddTool(srv, &mcp.Tool{Name: "evolve_confine", Description: "Classify a write path against the sandbox zones — Allowed under can_write, else Refused with SANDBOX_WRITE_ESCAPES_ZONE."}, s.evolveConfine)
	mcp.AddTool(srv, &mcp.Tool{Name: "evolve_propose_promotion", Description: "Record a PROMOTION PROPOSAL gated on mirror_green ∧ out_of_sample_green ∧ authority_approval — never the freeze itself (the door is the human /goal)."}, s.evolveProposePromotion)
	mcp.AddTool(srv, &mcp.Tool{Name: "evolve_run_get", Description: "Read a recorded EvolutionRun by id."}, s.evolveRunGet)
	mcp.AddTool(srv, &mcp.Tool{Name: "evolve_run_list", Description: "List recorded EvolutionRun ids."}, s.evolveRunList)
	mcp.AddTool(srv, &mcp.Tool{Name: "evolve_coverage", Description: "Measure the EG04 win: gate-passing MAP-Elites niche coverage of each deterministic generator (novelty | poet | mome) vs the deterministic baseline, by the SAME frozen gate (the generators widen coverage without changing the promotion-gate or the Judge=mirror). Hermetic: search strategies, no LLM."}, s.evolveCoverage)
	return srv
}

func newServer() *server {
	return &server{store: newStore(), sampler: deterministicSampler}
}

// newServerWithSelfPlay builds a server with the EG03 self-play generator armed behind the
// frozen seam, injecting the given Proposer (production: ClaudeProposer = real CLI +
// deterministic fallback; tests: FixtureProposer = hermetic). The deterministic sampler
// remains the fallback authority (used when the Proposer yields nothing).
func newServerWithSelfPlay(proposer evolve.Proposer) *server {
	return &server{store: newStore(), sampler: deterministicSampler, selfPlay: true, proposer: proposer}
}

func main() {
	s := newServer()
	if selfPlayEnabled() {
		// Production arms the REAL self-play generator (the gated LLM exception, §6): the
		// claude CLI with a deterministic FixtureProposer fallback.
		s = newServerWithSelfPlay(evolve.ClaudeProposer)
	}
	srv := newMCPServer(s)
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("evolve: run: %v", err)
	}
}
