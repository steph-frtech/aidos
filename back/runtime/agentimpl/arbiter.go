// arbiter.go — the determinism-first ARBITER of a governed build-agent (BA12). It encodes
// the determinism-first SKILL mapping table IN CODE — the SKILL's prose becomes
// authoritative code — so the loop refuses an LLM action wherever a DETERMINISTIC TOOL
// already does the job. The mandate (CLAUDE.md §6/§8): whatever can be a deterministic
// pure function MUST be code, never an agent/LLM; the LLM is the gated exception, only for
// irreducible generation/judgment.
//
// THE MAPPING TABLE (transcribed verbatim from the SKILL / CLAUDE.md §6):
//
//	diff      → jj / Myers (a diff is a diff algorithm, never an "LLM diff agent")
//	search    → rg
//	format    → biome / gofmt / go-arch-lint
//	codegen   → S34 emitters (deterministic emitters over LLM generation)
//	validate  → kernel validators
//
// INTENT BY STRUCTURE, NEVER BY LABEL (gap D1). The intent is classified from the action's
// STRUCTURE — its tool name + args — NEVER from a model-supplied DisplayedIntent label. An
// action whose tool is `bash git diff` is STRUCTURALLY a diff and routes to the
// deterministic differ, whatever intent it claims. Re-labelling the displayed intent CANNOT
// change Arbitrate's verdict — only the structure can (the property mirror pins this). This
// closes the leak where an agent could escape the determinism gate by mislabelling.
//
// DETERMINISM-FIRST WINS (gap D3). If a deterministic tool exists for the structure,
// Arbitrate NEVER returns LLMGated — the code wins and the agent defers. LLMGated is the
// RESIDUAL: only a structure with no deterministic tool (irreducible generation) is gated
// to the LLM. ArbitrateGated turns this into the wall verdict the loop calls: an action
// that REQUESTS the LLM where a deterministic tool exists is a determinism gap that BLOCKS,
// carrying the S13 BlockReason AGENT_DETERMINISM_GAP.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): Arbitrate is itself a PURE, TOTAL function of its
// input — structural matching over the tool name + args, no DB, no clock, no rng, no I/O,
// NO live LLM. Same input ⇒ same verdict (the reproducibility mirror arbiter_property_test.go
// pins it). The classifier that enforces determinism-first is itself deterministic — it
// would be a self-contradiction otherwise.
package agentimpl

import "github.com/steph-frtech/aidos/back/runtime/blockreason"

// AgentAction is the STRUCTURE of one action the loop is about to take: the tool it would
// invoke (Tool) and that tool's arguments (Args). DisplayedIntent is the model-supplied
// label — it is carried for the panel/telemetry but is NEVER read by Arbitrate (the
// determinism gap D1 is closed by ignoring it). RequestedLLM is the loop's signal that it
// would route this action to the LLM (used by ArbitrateGated to detect the gap).
type AgentAction struct {
	Tool            string   `json:"tool"`
	Args            []string `json:"args"`
	DisplayedIntent string   `json:"displayed_intent,omitempty"`
	RequestedLLM    bool     `json:"requested_llm,omitempty"`
}

// VerdictKind is the closed outcome of Arbitrate: a deterministic tool routes the action,
// or the action is gated to the LLM (the residual, irreducible-generation case).
type VerdictKind string

const (
	// VerdictDeterministicTool — a deterministic tool exists for the action's structure;
	// the action MUST use it (the code wins). Verdict.Tool names which one.
	VerdictDeterministicTool VerdictKind = "DeterministicTool"
	// VerdictLLMGated — no deterministic tool exists for the structure; the action is the
	// gated LLM exception (irreducible generation/judgment).
	VerdictLLMGated VerdictKind = "LLMGated"
)

// The deterministic tool families — the codomain of the SKILL mapping table. These are
// stable identifiers, NOT the concrete binary (the loop binds the binary): the arbiter
// names the FAMILY the structure belongs to.
const (
	ToolDiff     = "diff"     // jj / Myers / structural-AST differ
	ToolSearch   = "search"   // rg
	ToolFormat   = "format"   // biome / gofmt / go-arch-lint
	ToolCodegen  = "codegen"  // S34 emitters
	ToolValidate = "validate" // kernel validators
)

// Verdict is Arbitrate's typed result: the Kind (DeterministicTool | LLMGated), the Tool
// family on a DeterministicTool verdict (empty when LLMGated), and the S13 BlockReason —
// always nil from Arbitrate itself (Arbitrate classifies; ArbitrateGated decides the
// block). The BlockReason field is kept so the verdict and the gate share one shape.
type Verdict struct {
	Kind        VerdictKind              `json:"kind"`
	Tool        string                   `json:"tool,omitempty"`
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// first returns the first arg lowercased, or "" — the structural head of the action.
func first(args []string) string {
	if len(args) == 0 {
		return ""
	}
	return args[0]
}

// nth returns args[i] or "" — a bounds-safe positional read.
func nth(args []string, i int) string {
	if i < 0 || i >= len(args) {
		return ""
	}
	return args[i]
}

// classify is the pure structural classifier: it maps an action's STRUCTURE (tool + args)
// to a deterministic tool family, or "" when no deterministic tool exists (the residual
// LLM case). It reads ONLY Tool and Args — NEVER DisplayedIntent (gap D1). It is a fixed
// decision tree, total over every input.
func classify(a AgentAction) string {
	switch a.Tool {
	case "bash", "shell", "sh":
		head := first(a.Args)
		switch head {
		case "rg", "ripgrep", "grep", "ag", "ack":
			return ToolSearch
		case "gofmt", "biome", "prettier", "go-arch-lint", "depguard", "dependency-cruiser":
			return ToolFormat
		case "git", "jj":
			// git/jj are diffs ONLY when the sub-command is a diff (`git diff`, `jj diff`);
			// other git sub-commands are not classified by this arbiter.
			if nth(a.Args, 1) == "diff" {
				return ToolDiff
			}
			return ""
		case "go":
			// `go fmt` is a format; other go sub-commands are not arbitrated here.
			if nth(a.Args, 1) == "fmt" {
				return ToolFormat
			}
			return ""
		default:
			return ""
		}
	case "aidos":
		head := first(a.Args)
		switch head {
		case "project", "emit", "codegen", "materialize":
			return ToolCodegen
		case "check", "validate":
			return ToolValidate
		case "diff":
			return ToolDiff
		default:
			return ""
		}
	default:
		return ""
	}
}

// Arbitrate is the PURE, TOTAL determinism-first verdict: does a deterministic tool exist
// for this action's STRUCTURE? It classifies the intent from (Tool, Args) ONLY — NEVER from
// the model-supplied DisplayedIntent — and:
//
//   - returns VerdictDeterministicTool with the routed Tool family when the structure maps
//     to a deterministic tool (the code wins; LLMGated is impossible here);
//   - returns VerdictLLMGated (Tool == "") otherwise — the residual, irreducible-generation
//     case.
//
// Re-labelling the DisplayedIntent CANNOT change the verdict (gap D1); if a deterministic
// tool exists for the structure, Arbitrate NEVER returns LLMGated (gap D3). Same input ⇒
// same verdict; no DB, no clock, no rng, no I/O, no LLM. The SKILL's prose is now code.
func Arbitrate(a AgentAction) Verdict {
	if tool := classify(a); tool != "" {
		return Verdict{Kind: VerdictDeterministicTool, Tool: tool}
	}
	return Verdict{Kind: VerdictLLMGated}
}

// ArbitrateGated is the wall form the loop calls: it returns a BlockReason IFF the action
// is a DETERMINISM GAP — the loop would route it to the LLM (RequestedLLM) where a
// deterministic tool EXISTS for the structure. That is an agent doing what a pure function
// could (CLAUDE.md §6/§8) and it BLOCKS, carrying the S13 AGENT_DETERMINISM_GAP. Otherwise
// it returns nil:
//
//   - an action using its deterministic tool (RequestedLLM == false) is fine;
//   - a genuinely generative action (no deterministic tool) requesting the LLM is the gated
//     exception, NOT a gap — it is allowed.
//
// The verdict is computed from the STRUCTURE (via Arbitrate), never the displayed label —
// re-labelling cannot turn a gap into a non-gap. Pure, total, deterministic.
func ArbitrateGated(a AgentAction) *blockreason.BlockReason {
	v := Arbitrate(a)
	if a.RequestedLLM && v.Kind == VerdictDeterministicTool {
		br := blockreason.For(blockreason.CodeAgentDeterminismGap)
		return &br
	}
	return nil
}
