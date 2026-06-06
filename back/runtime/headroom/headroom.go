// headroom.go — HR03: the `headroom` SIDECAR ADAPTER behind the HR02 ContextCompressor port
// (ADR 0035), and the GATE-INVARIANCE theorem the loop relies on.
//
// WHAT HR03 ADDS over HR02 (the port + the byte-lossless ReferenceCompressor):
//
//  1. SidecarCompressor — a SECOND implementation of the SAME ContextCompressor interface that
//     speaks to the `chopratejas/headroom` tool as a SIDECAR over its MCP (the capability door,
//     ADR 0009). The adapter is REPLACEABLE (CLAUDE.md §3): the tool is an adapter, never truth.
//     Its concrete I/O lives in back/mcp/headroom; this package holds the in-process adapter and
//     a DETERMINISTIC fake sidecar (FakeSidecar) so the contract is provable without the binary.
//
//  2. The GATE-INVARIANCE mirror (the HR03 done-criterion). The whole point of HR04 wiring the
//     compressor into agentloop.Drive BEFORE GenerateAction is that it must change NOTHING the
//     gate decides. We prove it here: an action is DERIVED from the carrier facts of the
//     LLM-input prompt (DeriveAction, a pure extractor); because retrieve∘compress preserves the
//     carrier facts (HR02), the DERIVED ACTION is byte-identical, so agentimpl.GateAction returns
//     the SAME verdict on the compressed-then-retrieved prompt as on the original. Compression is
//     the determinism-first GATED exception: it is never authoritative — the gate verdict is
//     invariant to it (CLAUDE.md §6/§8).
//
// THE WALL (CLAUDE.md §2). Everything here is PURE / read-only and below the line: the adapter
// reads a prompt and returns a Compacted + Handle; the gate-invariance theorem only COMPOSES the
// (pure) HR02 compressor and the (pure) agentimpl.GateAction. No DB, no truth-write, no clock,
// no rng. The sidecar is the ONLY I/O surface and it lives in the MCP package, never here.
//
// DETERMINISM-FIRST. The adapter contract is byte-lossless and reproducible exactly like the
// reference; the FakeSidecar delegates to the deterministic ReferenceCompressor so the property
// mirror (headroom_property_test.go) certifies the adapter against the SAME invariants — and the
// gate-invariance theorem makes the determinism-first guarantee explicit: the gate never defers
// to the compression.
package headroom

import (
	"strings"

	rctx "github.com/steph-frtech/aidos/back/runtime/context"
)

// Sidecar is the minimal capability the `headroom` tool exposes to the adapter, over its MCP.
// It is exactly the HR02 port shape — compress an LLM-input prompt to a reversible (Compacted,
// Handle), and retrieve the original from a Handle — so the adapter is a thin, total pass-through
// and the contract is the SAME one the property mirror certifies. The production Sidecar speaks
// to the binary over stdio (back/mcp/headroom); FakeSidecar is the deterministic double.
type Sidecar interface {
	Compress(prompt string) (rctx.Compacted, rctx.Handle)
	Retrieve(handle rctx.Handle) string
}

// SidecarCompressor is the HR03 adapter: a ContextCompressor (the HR02 port) backed by a
// Sidecar. It is REPLACEABLE — swap the Sidecar (the binary, a fake, a future tool) without
// touching the loop, which only sees the port. The adapter adds no logic of its own; it forwards
// to the sidecar, so the byte-lossless / reproducible / carrier-fact invariants hold verbatim.
type SidecarCompressor struct {
	Side Sidecar
}

// Compress forwards to the sidecar — the adapter is a total pass-through of the port contract.
func (a SidecarCompressor) Compress(prompt string) (rctx.Compacted, rctx.Handle) {
	return a.Side.Compress(prompt)
}

// Retrieve forwards to the sidecar — total, byte-lossless, exactly inverse to Compress.
func (a SidecarCompressor) Retrieve(handle rctx.Handle) string {
	return a.Side.Retrieve(handle)
}

// statically assert the adapter satisfies the HR02 port (it IS a ContextCompressor).
var _ rctx.ContextCompressor = SidecarCompressor{}

// FakeSidecar is the DETERMINISTIC double for the `headroom` binary (the BA17-style fake): it
// delegates to the byte-lossless ReferenceCompressor, so the adapter is provable end-to-end with
// no sidecar process. Pure data (no fields) — a VALUE FakeSidecar satisfies Sidecar.
type FakeSidecar struct{}

func (FakeSidecar) Compress(prompt string) (rctx.Compacted, rctx.Handle) {
	return rctx.ReferenceCompressor{}.Compress(prompt)
}
func (FakeSidecar) Retrieve(handle rctx.Handle) string {
	return rctx.ReferenceCompressor{}.Retrieve(handle)
}

var _ Sidecar = FakeSidecar{}

// ── The gate-invariance link: deriving an action's STRUCTURE from the LLM-input prompt ──
//
// The loop generates the next action from the prompt; the gate (agentimpl.GateAction) reads the
// STRUCTURE of that action (Tool/Args/Target/Server/…), never the prompt text. To prove the gate
// is invariant to compression we make the derivation EXPLICIT and DETERMINISTIC: DeriveAction
// extracts the structural action from the carrier facts present in the prompt. Because
// retrieve∘compress preserves those carrier facts (HR02), DeriveAction yields the SAME action on
// the original and the compressed-then-retrieved prompt — hence the gate verdict is invariant.
//
// This is a PURE extractor (no LLM): it stands in for "the loop reads the prompt and proposes a
// structurally-determined action". The carrier facts are the load-bearing tokens the HR02 mirror
// already proves survive (the allowed paths, the wall/forbidden paths, the bound tool, …).

// carrierMarkers are the prompt tokens DeriveAction reads to recover the action's structure —
// the same load-bearing facts the HR02 fidelity check pins. Each maps a prompt marker to a field
// of the structural action. Declared (above the line), never inferred.
const (
	markerAllowedPaths = "allowed_paths:" // → the action's write Target (confinement)
	markerTool         = "tool:"          // → the bound MCP (server, tool) capacity pair
	markerSkill        = "skill:"         // → the bound skill
	markerHost         = "host:"          // → the egress host
	markerExec         = "exec:"          // → the subprocess
)

// DeriveAction extracts the STRUCTURAL agentimpl-shaped action the loop would propose from the
// LLM-input prompt, by reading its carrier facts. PURE and TOTAL: a prompt missing a marker
// simply yields the zero value for that field (the gate then skips that axis). The result is the
// exact input shape agentimpl.GateAction evaluates — proving the gate's invariance reduces to
// proving DeriveAction is invariant under retrieve∘compress, which holds because the markers ARE
// carrier facts (HR02). We return the field tuple (not the agentimpl.Action type) to keep this
// package free of the gate's heavier dependency graph; the property mirror assembles the
// agentimpl.Action from these fields and calls the real GateAction.
type DerivedAction struct {
	Target string
	Server string
	Tool   string
	Skill  string
	Host   string
	Exec   string
}

// DeriveAction parses the carrier markers out of the prompt into a DerivedAction. Deterministic
// AND WHITESPACE-ROBUST: it scans the prompt as a stream of whitespace-delimited tokens, not
// line-wise — so it reads the SAME markers from the original prompt and from its
// retrieve∘compress form (which is Normalize'd: newlines collapse to single spaces, ADR 0035 §2).
// This is the crux of the gate-invariance theorem: the HR02 port preserves the carrier facts but
// NOT the layout, so the derivation must depend only on the facts, never on the layout. The first
// value after each marker token wins (the prompt renders each fact once in its boundaries block);
// "tool:" carries a "server/tool" pair split on the first '/'.
func DeriveAction(prompt string) DerivedAction {
	var d DerivedAction
	toks := strings.Fields(prompt)
	for i, tok := range toks {
		next := func() string {
			if i+1 < len(toks) {
				return strings.TrimRight(toks[i+1], ",")
			}
			return ""
		}
		switch tok {
		case markerAllowedPaths:
			if d.Target == "" {
				d.Target = next()
			}
		case markerTool:
			if d.Server == "" && d.Tool == "" {
				v := next()
				if j := strings.IndexByte(v, '/'); j >= 0 {
					d.Server, d.Tool = v[:j], v[j+1:]
				} else {
					d.Tool = v
				}
			}
		case markerSkill:
			if d.Skill == "" {
				d.Skill = next()
			}
		case markerHost:
			if d.Host == "" {
				d.Host = next()
			}
		case markerExec:
			if d.Exec == "" {
				d.Exec = next()
			}
		}
	}
	return d
}
