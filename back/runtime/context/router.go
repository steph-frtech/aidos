package context

import (
	"encoding/json"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Compile is the ContextRouter (KRD §144) — the PURE deterministic pipeline that compiles the
// minimal, branch-aware ContextPack for a red goal from a read-only ContextGraph view. It is a
// total function of (goal, branch, graph): no DB, no clock, no rng, no I/O, no LLM. Same
// (goal, branch, graph) ⇒ byte-identical pack and identical Hash.
//
// The algorithm (§144), in order:
//
//  1. red ← goal.RedSet                       (REUSED from S22, NEVER recomputed here)
//  2. affected_layers ← the red layers that exist on `branch`, in the goal's bounded context,
//     and are load-bearing (a node from another branch never leaks; a cosmetic sibling below
//     the activation threshold is excluded with reason cosmetic-below-threshold)
//  3. active_kernel.mirrors ← the mirrors in the goal's BC (the red ones define the stop
//     condition; the others are the load-bearing invariants); a neighbor-BC mirror is excluded
//     (cross-BC)
//  4. active_kernel.contracts ← the goal-BC contracts PLUS a neighbor BC's crossed PUBLIC
//     contract; an internal (non-public) neighbor contract is excluded (cross-BC)
//  5. memory ← records with scope overlap AND confidence ≥ repeated AND not stale AND approved;
//     everything else excluded with its reason (stale / out-of-scope / unapproved /
//     cosmetic-below-threshold)
//  6. boundaries ← {bounded_context, allowed_paths, forbidden_paths = /kernel/** /mirror/**}
//     (the wall rendered as a boundary, on EVERY pack)
//  7. stop_condition ← the canonical non-empty condition (§143)
//  8. emit ContextPack + Hash (content-addressed over the canonical encoding, S01/S02 scheme)
func Compile(goal Goal, branch string, graph ContextGraph) ContextPack {
	pack := ContextPack{
		Goal:   goal.ID,
		Branch: branch,
		Boundaries: Boundaries{
			BoundedContext: goal.BoundedContext,
			AllowedPaths:   append([]string(nil), goal.AllowedPaths...),
			ForbiddenPaths: append([]string(nil), wallForbiddenPaths...),
		},
		StopCondition: stopCondition,
	}

	var excluded []Excluded

	// ── 2. affected_layers — the red layers, branch-fenced, BC-fenced, load-bearing ──
	var affected []string
	for _, l := range graph.Layers {
		// Project-aware (S55): a node from ANOTHER project never enters the cut — the outer
		// scope, checked first. A pack of project A contains zero nodes of project B.
		if crossProject(goal.Project, l.Project) {
			excluded = append(excluded, Excluded{ID: l.ID, Reason: ReasonCrossProject})
			continue
		}
		// Branch-aware: a node from another branch never enters the cut, never leaks (§143).
		if l.Branch != "" && l.Branch != branch {
			continue
		}
		// Minimality: only nodes load-bearing for the red-set (S22, reused).
		if !inSet(goal.RedSet, l.ID) {
			continue
		}
		// Bounded-context-aware (§145): a neighbor BC never appears as internal layers.
		if l.BoundedContext != "" && l.BoundedContext != goal.BoundedContext {
			excluded = append(excluded, Excluded{ID: l.ID, Reason: ReasonCrossBC})
			continue
		}
		// A cosmetic sibling below the activation threshold is excluded (§144, §112).
		if !l.LoadBearing {
			excluded = append(excluded, Excluded{ID: l.ID, Reason: ReasonCosmeticBelowThreshold})
			continue
		}
		affected = append(affected, l.ID)
	}
	// Also surface red-set layers that belong to a neighbor BC even if only declared on the
	// layer list — already handled above. Mark any explicitly cross-BC non-red layer the graph
	// carries (e.g. billing:invoice-internals) as excluded cross-BC for the Excluded panel.
	for _, l := range graph.Layers {
		if inSet(goal.RedSet, l.ID) {
			continue
		}
		// Project fence first (S55): a neighbor-project layer is excluded cross-project, never
		// surfaced as a cosmetic same-BC sibling.
		if crossProject(goal.Project, l.Project) {
			excluded = append(excluded, Excluded{ID: l.ID, Reason: ReasonCrossProject})
			continue
		}
		if l.Branch != "" && l.Branch != branch {
			continue
		}
		if l.BoundedContext != "" && l.BoundedContext != goal.BoundedContext {
			excluded = append(excluded, Excluded{ID: l.ID, Reason: ReasonCrossBC})
			continue
		}
		// Same-BC node not in the red-set is not load-bearing for THIS goal — cosmetic.
		excluded = append(excluded, Excluded{ID: l.ID, Reason: ReasonCosmeticBelowThreshold})
	}
	sort.Strings(affected)
	pack.AffectedLayers = affected

	// ── 3. active_kernel.mirrors — red mirrors define the stop condition; neighbor-BC out ──
	var mirrors []string
	for _, m := range graph.Mirrors {
		if crossProject(goal.Project, m.Project) {
			excluded = append(excluded, Excluded{ID: m.ID, Reason: ReasonCrossProject})
			continue
		}
		if m.BoundedContext != "" && m.BoundedContext != goal.BoundedContext {
			excluded = append(excluded, Excluded{ID: m.ID, Reason: ReasonCrossBC})
			continue
		}
		mirrors = append(mirrors, m.ID)
	}
	sort.Strings(mirrors)
	pack.ActiveKernel.Mirrors = mirrors
	pack.ActiveKernel.Invariants = []string{}

	// ── 4. active_kernel.contracts — goal-BC contracts + neighbor crossed PUBLIC contract ──
	var contracts []string
	for _, c := range graph.Contracts {
		// Project isolation is the OUTER scope (S55): a neighbor-project contract NEVER crosses,
		// not even a PUBLIC one — PUBLIC crosses a bounded-context boundary WITHIN a project.
		if crossProject(goal.Project, c.Project) {
			excluded = append(excluded, Excluded{ID: c.ID, Reason: ReasonCrossProject})
			continue
		}
		if c.BoundedContext == "" || c.BoundedContext == goal.BoundedContext {
			contracts = append(contracts, c.ID)
			continue
		}
		// A neighbor bounded context crosses the boundary ONLY via its PUBLIC contract (§145).
		if c.Public {
			contracts = append(contracts, c.ID)
			continue
		}
		excluded = append(excluded, Excluded{ID: c.ID, Reason: ReasonCrossBC})
	}
	sort.Strings(contracts)
	pack.ActiveKernel.Contracts = contracts

	// ── 5. memory — scope overlap ∧ confidence ≥ repeated ∧ not stale ∧ approved (§119.3) ──
	var lessons, incidents, glossary []string
	for _, r := range graph.Memory {
		// Project fence first (S55): a neighbor-project memory record never enters the pack,
		// regardless of confidence/approval/scope — the outer scope.
		if crossProject(goal.Project, r.Project) {
			excluded = append(excluded, Excluded{ID: r.ID, Reason: ReasonCrossProject})
			continue
		}
		// Stale → forbidden (§119.3). Checked first so a stale record is tagged `stale`.
		if r.Stale {
			excluded = append(excluded, Excluded{ID: r.ID, Reason: ReasonStale})
			continue
		}
		// Unapproved → forbidden (§119.3).
		if !r.Approved {
			excluded = append(excluded, Excluded{ID: r.ID, Reason: ReasonUnapproved})
			continue
		}
		// Out-of-scope (different bounded context) → forbidden (§119.3).
		if r.Scope != "" && r.Scope != goal.BoundedContext {
			excluded = append(excluded, Excluded{ID: r.ID, Reason: ReasonOutOfScope})
			continue
		}
		// Below the activation threshold (confidence < repeated) → excluded cosmetic (§144).
		if r.Confidence.rank() < ConfidenceRepeated.rank() {
			excluded = append(excluded, Excluded{ID: r.ID, Reason: ReasonCosmeticBelowThreshold})
			continue
		}
		switch r.Kind {
		case MemoryIncident:
			incidents = append(incidents, r.ID)
		case MemoryGlossary:
			glossary = append(glossary, r.ID)
		default:
			lessons = append(lessons, r.ID)
		}
	}
	sort.Strings(lessons)
	sort.Strings(incidents)
	sort.Strings(glossary)
	pack.Memory = PackMemory{RelevantLessons: lessons, RecentIncidents: incidents, GlossaryTerms: glossary}

	// ── skills + tools (the §149 gestures/tools the goal may use) ──
	pack.Skills = append([]string(nil), graph.Skills...)
	pack.Tools = append([]string(nil), graph.Tools...)
	sort.Strings(pack.Skills)
	sort.Strings(pack.Tools)

	// Excluded, sorted for a stable, byte-identical pack (determinism, no map-iteration leak).
	sort.SliceStable(excluded, func(i, j int) bool {
		if excluded[i].ID != excluded[j].ID {
			return excluded[i].ID < excluded[j].ID
		}
		return excluded[i].Reason < excluded[j].Reason
	})
	pack.Excluded = excluded

	// ── 8. content-addressing — Hash over the canonical encoding (S01/S02 scheme, not forked) ──
	pack.Hash = hashPack(pack)
	return pack
}

// hashPack computes the content hash of the pack over its canonical encoding, reusing the
// S01/S02 records.Canonicalize + records.Hash scheme (key-sorted JSON → SHA-256 hex) so the
// pack lands under the same address scheme as every other content-addressed artifact. The
// Hash field itself is zeroed before hashing (a value never hashes itself). Same pack content
// ⇒ identical hash (§143, content-addressed + reproducible).
func hashPack(p ContextPack) string {
	p.Hash = ""
	raw, err := json.Marshal(p)
	if err != nil {
		// json.Marshal of this fixed value-shape cannot fail; defensively return empty.
		return ""
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return ""
	}
	return records.Hash(canon)
}
