// Package gateway is the S58 MCP-over-HTTP PASSERELLE — the deterministic routing
// core behind the project-scoped JSON-RPC/HTTP service that exposes EVERY existing
// AIDOS MCP tool (store · mirror-runner · changeset · dag · idea-intake · memory ·
// context · evolve · backtester · telemetry-reader · pact-verifier · mutation-runner ·
// project) over one HTTP surface (app-builder EPIC 2, ROADMAP S58).
//
// THE WALL IS APPLIED SERVER-SIDE (CLAUDE.md §2). The gateway does NOT widen what a
// caller may do — it narrows it. Each tool is classified, once, in a CLOSED registry,
// into exactly one disposition:
//
//   - BelowLine  — a below-the-line read/op (store_get, dag_heads, context_compile,
//     memory_recall, telemetry_query, pact_verify, …). It is FREE: the gateway routes
//     it straight through to the underlying handler (the HTTP honours the MCP).
//   - TruthWrite — an op that would move TRUTH above the line (the kernel/mirrors/
//     fitness zones the agent has NO GRANT to write, §2). The ONLY legal door is a
//     ChangeSet (idea → mirror → /goal → approval). The gateway REFUSES a direct
//     truth-write at the edge and returns an actionable BlockReason that names the
//     ChangeSet door — it never silently performs it.
//
// PROJECT SCOPE (S54/S55/S57). Every call carries the active (identity, project) scope
// (the S57 cookie + the S61 propagated identity). The gateway runs the SAME predicate
// the Postgres RLS enforces (back/runtime/projectwall.Classify) BEFORE dispatch: a call
// whose target project ≠ the active project, or whose claimed identity is forged, is
// refused with AGENT_CROSS_PROJECT_WRITE — the cross-tenant leak the roadmap names.
// Two refusals stack: cross-project FIRST (scope), then truth-write (zone).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Route is a PURE TOTAL function of
// (registry, scope, call). No clock, no rng, no I/O, no LLM — "pur routage, zéro LLM"
// (the S58 done-criterion). Same input ⇒ same RouteDecision (the reproducibility
// mirror pins it). The router is an ALGORITHM, not a prompt; the dispatch of an
// allowed call to its handler is a separate, side-effecting seam (the Dispatcher) the
// HTTP server wires — the routing decision itself touches nothing.
package gateway

import (
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
)

// Disposition is a tool's server-side wall classification — exactly two values (there
// is no third; the registry is exhaustive and the property mirror pins it).
type Disposition string

const (
	// DispositionBelowLine routes the call straight through (a below-the-line read/op).
	DispositionBelowLine Disposition = "below_line"
	// DispositionTruthWrite refuses the call at the edge: truth moves ONLY via a
	// ChangeSet (idea → mirror → /goal), never a direct gateway write.
	DispositionTruthWrite Disposition = "truth_write"
)

// Outcome is the router's verdict — three terminal states, deterministic.
type Outcome string

const (
	// OutcomeRoute means the call is allowed and must be dispatched to its handler.
	OutcomeRoute Outcome = "route"
	// OutcomeRefusedScope means the cross-project / forged-identity wall refused it.
	OutcomeRefusedScope Outcome = "refused_scope"
	// OutcomeRefusedTruthWrite means the truth-write wall refused it (use a ChangeSet).
	OutcomeRefusedTruthWrite Outcome = "refused_truth_write"
	// OutcomeUnknownTool means the tool is not in the closed registry (refused — the
	// gateway exposes ONLY the registered surface, never an arbitrary passthrough).
	OutcomeUnknownTool Outcome = "unknown_tool"
	// OutcomeRefusedMemoryDeclareTruth means the S30 MemoryFirewall refused a truth-write
	// whose INJECTED provenance is a raw MemoryItem (the direct Memory → Kernel shortcut,
	// KRD §119.1). It is MORE SPECIFIC than OutcomeRefusedTruthWrite: the call would not
	// just bypass the ChangeSet door, it would let a memory DECLARE truth. The gateway
	// surfaces the actionable MEMORY_CANNOT_DECLARE_TRUTH reason (the memory → idea →
	// mirror → /goal path), never the generic ChangeSet reason.
	OutcomeRefusedMemoryDeclareTruth Outcome = "refused_memory_declare_truth"
)

// BlockCode is the stable, machine-readable code of a refusal (the §2 BlockReason
// shape, shared across AIDOS block sites).
type BlockCode string

const (
	// CodeAgentCrossProjectWrite is re-exported from the project-aware wall (S55): a
	// call targeting another project or asserting a forged identity.
	CodeAgentCrossProjectWrite = BlockCode(projectwall.CodeAgentCrossProjectWrite)
	// CodeTruthWriteNeedsChangeset refuses a direct truth-write at the gateway: truth
	// moves only through a ChangeSet (idea → mirror → /goal → approval).
	CodeTruthWriteNeedsChangeset BlockCode = "GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET"
	// CodeUnknownTool refuses a call to a tool the gateway does not expose.
	CodeUnknownTool BlockCode = "GATEWAY_UNKNOWN_TOOL"
	// CodeMemoryCannotDeclareTruth re-exports the S30 MemoryFirewall code: a truth-write
	// whose injected provenance is a raw MemoryItem is refused at the gateway edge with
	// the actionable memory → idea → mirror → /goal reason (the firewall pure decider owns
	// the verdict; the gateway only widens its BlockReason to the gateway shape).
	CodeMemoryCannotDeclareTruth = BlockCode(blockreason.CodeMemoryCannotDeclareTruth)
)

// BlockReason is the actionable refusal shape (CLAUDE.md §2: code, severity,
// explanation, how_to_fix[]).
type BlockReason struct {
	Code        BlockCode `json:"code"`
	Severity    string    `json:"severity"`
	Explanation string    `json:"explanation"`
	HowToFix    []string  `json:"how_to_fix"`
}

// Tool is a registered MCP tool the gateway exposes: which server publishes it and its
// wall disposition. The registry is the single source of truth for "what may the HTTP
// surface do" — closed, ordered, content-addressable.
type Tool struct {
	// Name is the MCP tool name (e.g. "store_get"), the JSON-RPC method the HTTP edge
	// dispatches on.
	Name string `json:"name"`
	// Server is the owning MCP server (one of the 13 S58 names), for routing + display.
	Server string `json:"server"`
	// Disposition is the tool's server-side wall classification.
	Disposition Disposition `json:"disposition"`
}

// Call is a single gateway request: the active scope, the tool, and the target the
// call acts on (its project + an optionally-asserted identity). The router never reads
// the params themselves (it routes, it does not interpret) — the target project is the
// scope dimension the wall checks.
type Call struct {
	// Scope is the active (identity, project) pair (S57 cookie + S61 identity).
	Scope projectwall.Scope `json:"scope"`
	// Tool is the MCP tool name being invoked.
	Tool string `json:"tool"`
	// Target is the project + claimed identity the call acts on (the wall dimension).
	Target projectwall.Target `json:"target"`
	// Provenance is the INJECTED provenance kind of a truth-write attempt — the predicate
	// the S30 MemoryFirewall reads to refuse the direct Memory → Kernel shortcut (KRD
	// §119.1). It is set by the HARNESS/gateway front, never by the caller's params (the
	// firewall never reaches into the kernel/mirrors schemas to learn it — that would be a
	// truth read). The zero value "" means "no provenance was injected": on a below-the-line
	// call it is irrelevant; on a truth-write it is treated as unknown ⇒ fail closed. Carries
	// firewall.ProvenanceKind values ("memory" | "mirrored_idea" | "").
	Provenance string `json:"provenance,omitempty"`
}

// RouteDecision is the pure router output. On OutcomeRoute, Tool names the dispatch
// target; on a refusal, BlockReason carries the actionable §2 reason. Deterministic.
type RouteDecision struct {
	Outcome     Outcome      `json:"outcome"`
	Tool        *Tool        `json:"tool,omitempty"`
	BlockReason *BlockReason `json:"block_reason,omitempty"`
}

// Registry is the CLOSED set of tools the gateway exposes, keyed by name. Built once
// from DefaultTools(); the router consults it and nothing else.
type Registry struct {
	byName map[string]Tool
}

// NewRegistry builds a registry from a tool slice. A duplicate name is the LAST wins
// only if dispositions agree; a conflicting duplicate panics at construction (a build
// bug, never a runtime surprise). Pure given its input.
func NewRegistry(tools []Tool) *Registry {
	byName := make(map[string]Tool, len(tools))
	for _, t := range tools {
		if prev, ok := byName[t.Name]; ok && prev.Disposition != t.Disposition {
			panic("gateway: conflicting disposition for tool " + t.Name)
		}
		byName[t.Name] = t
	}
	return &Registry{byName: byName}
}

// Lookup returns the registered tool and whether it exists. Pure.
func (r *Registry) Lookup(name string) (Tool, bool) {
	t, ok := r.byName[strings.TrimSpace(name)]
	return t, ok
}

// Tools returns every registered tool, sorted by name (deterministic order — the HTTP
// surface lists the same way everywhere). Pure.
func (r *Registry) Tools() []Tool {
	out := make([]Tool, 0, len(r.byName))
	for _, t := range r.byName {
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Server != out[j].Server {
			return out[i].Server < out[j].Server
		}
		return out[i].Name < out[j].Name
	})
	return out
}

// Route is the deterministic, total routing decision. The order of checks IS the wall
// (server-side, §2):
//
//  1. unknown tool      → refused (the gateway exposes only its closed surface);
//  2. cross-project /   → refused with AGENT_CROSS_PROJECT_WRITE (scope FIRST, the
//     forged identity      same predicate the RLS enforces — projectwall.Classify);
//  3. memory→truth      → refused with MEMORY_CANNOT_DECLARE_TRUTH when a truth-write
//     shortcut (S30)       carries an INJECTED memory provenance (the S30 MemoryFirewall,
//     a STRICTLY MORE SPECIFIC refusal than the generic zone gate —
//     it names the memory → idea → mirror → /goal door, not just
//     "use a ChangeSet"). Deferred to the pure firewall decider;
//  4. truth-write       → refused with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET (zone);
//  5. below-the-line    → OutcomeRoute (dispatch to the handler — HTTP honours MCP).
//
// PURE: no clock, no rng, no I/O, no LLM. Same (registry, call) ⇒ same decision.
func (r *Registry) Route(call Call) RouteDecision {
	tool, ok := r.Lookup(call.Tool)
	if !ok {
		return RouteDecision{Outcome: OutcomeUnknownTool, BlockReason: unknownToolReason(call.Tool)}
	}
	// SCOPE first: a cross-project or forged-identity call is refused regardless of
	// disposition (a truth-write to the wrong project is a scope leak before it is a
	// zone violation). The gateway runs the SAME wall the Postgres RLS enforces.
	if d := projectwall.Classify(call.Scope, call.Target); d.Verdict == projectwall.VerdictDeny {
		return RouteDecision{Outcome: OutcomeRefusedScope, BlockReason: fromProjectWall(d.BlockReason)}
	}
	// ZONE: a truth-write never goes direct. ADDITIVE S30 layer FIRST within the zone — if
	// the harness INJECTED a memory provenance onto this truth-write, the MemoryFirewall
	// owns a more specific refusal (a MemoryItem trying to DECLARE truth, not merely bypass
	// the ChangeSet). DETERMINISM-FIRST (§6/§8): the gateway DEFERS to the pure decider
	// firewall.CheckKernelWrite — it does not re-implement the verdict. The firewall is
	// consulted ONLY when a provenance was injected (Provenance != ""), so every existing
	// no-provenance caller keeps the generic GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET refusal
	// unchanged (the wall ADDS a guardrail, removes none — §5 meta-loop).
	if tool.Disposition == DispositionTruthWrite {
		if call.Provenance != "" {
			if br := firewall.CheckKernelWrite(firewall.ProvenanceKind(call.Provenance)); br != nil {
				return RouteDecision{
					Outcome:     OutcomeRefusedMemoryDeclareTruth,
					BlockReason: fromFirewall(br),
				}
			}
			// A mirrored-idea provenance passes THIS gate (CheckKernelWrite → nil): the
			// firewall raises no false block on the legal path. The write STILL never goes
			// direct — it falls through to the generic truth-write refusal below (truth
			// moves only via a ChangeSet). The S30 layer narrows nothing for the legal path.
		}
		return RouteDecision{Outcome: OutcomeRefusedTruthWrite, BlockReason: truthWriteReason(tool)}
	}
	// Below the line: route it through.
	return RouteDecision{Outcome: OutcomeRoute, Tool: &tool}
}

// fromFirewall widens the S30 firewall's blockreason.BlockReason into the gateway shape
// (the code is identical; this only adapts the type so the HTTP edge speaks one schema).
// Total.
func fromFirewall(b *blockreason.BlockReason) *BlockReason {
	if b == nil {
		return nil
	}
	return &BlockReason{
		Code:        BlockCode(b.Code),
		Severity:    string(b.Severity),
		Explanation: b.Explanation,
		HowToFix:    b.HowToFix,
	}
}

// fromProjectWall adapts the project-aware wall's BlockReason into the gateway shape
// (the codes are identical; this only widens the type). Total.
func fromProjectWall(b *projectwall.BlockReason) *BlockReason {
	if b == nil {
		return nil
	}
	return &BlockReason{
		Code:        BlockCode(b.Code),
		Severity:    b.Severity,
		Explanation: b.Explanation,
		HowToFix:    b.HowToFix,
	}
}

func unknownToolReason(name string) *BlockReason {
	return &BlockReason{
		Code:     CodeUnknownTool,
		Severity: "error",
		Explanation: "Refus de la passerelle : l'outil « " + strings.TrimSpace(name) +
			" » n'est pas exposé. La passerelle n'expose qu'un registre FERMÉ d'outils MCP — jamais un passthrough arbitraire.",
		HowToFix: []string{
			"Vérifiez le nom de l'outil — la liste exposée est consultable via gateway_tools.",
			"Un nouvel outil s'ajoute au registre côté serveur (DefaultTools), jamais par appel.",
		},
	}
}

func truthWriteReason(t Tool) *BlockReason {
	return &BlockReason{
		Code:     CodeTruthWriteNeedsChangeset,
		Severity: "error",
		Explanation: "Refus de la passerelle : l'outil « " + t.Name + " » (serveur " + t.Server +
			") écrirait de la VÉRITÉ au-dessus de la ligne. La vérité ne bouge QUE par un ChangeSet (idée → miroir → /goal → approbation, CLAUDE.md §2) — jamais par une écriture directe à la passerelle.",
		HowToFix: []string{
			"Ouvrez une idée (idea_capture), dérivez son miroir, ouvrez un /goal.",
			"Empaquetez le delta de vérité dans un ChangeSet (changeset_open) ; appliquez-le par la porte changeset_apply.",
			"La passerelle laisse passer les opérations below-the-line ; elle n'est jamais la porte de la vérité.",
		},
	}
}
