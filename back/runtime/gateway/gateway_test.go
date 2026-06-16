package gateway_test

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
)

// TestEveryServerExposed asserts the completeness done-criterion: EVERY one of the 14
// MCP servers the roadmap names has ≥1 tool exposed by the gateway (no server is left
// headless). A monster (a named server with zero tools) reddens this.
func TestEveryServerExposed(t *testing.T) {
	reg := gateway.DefaultRegistry()
	byServer := map[string]int{}
	for _, tl := range reg.Tools() {
		byServer[tl.Server]++
	}
	for _, s := range gateway.GatewayServers() {
		if byServer[s] == 0 {
			t.Errorf("server %q exposes no tool — the gateway is incomplete", s)
		}
	}
}

func TestRouteBelowLine(t *testing.T) {
	reg := gateway.DefaultRegistry()
	d := reg.Route(gateway.Call{
		Scope:  projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"},
		Tool:   "store_get",
		Target: projectwall.Target{ProjectID: "proj-a"},
	})
	if d.Outcome != gateway.OutcomeRoute {
		t.Fatalf("below-the-line store_get not routed: %v", d.Outcome)
	}
	if d.Tool == nil || d.Tool.Name != "store_get" {
		t.Fatalf("routed tool wrong: %+v", d.Tool)
	}
}

func TestRouteUnknownTool(t *testing.T) {
	reg := gateway.DefaultRegistry()
	d := reg.Route(gateway.Call{
		Scope:  projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"},
		Tool:   "definitely_not_a_tool",
		Target: projectwall.Target{ProjectID: "proj-a"},
	})
	if d.Outcome != gateway.OutcomeUnknownTool {
		t.Fatalf("unknown tool not refused: %v", d.Outcome)
	}
	if d.BlockReason == nil || d.BlockReason.Code != gateway.CodeUnknownTool {
		t.Fatalf("unknown-tool refusal without GATEWAY_UNKNOWN_TOOL: %+v", d.BlockReason)
	}
}

func TestRouteScopeBeforeTruthWrite(t *testing.T) {
	reg := gateway.DefaultRegistry()
	// A truth-write to the WRONG project must refuse on SCOPE first (the leak is a
	// scope leak before it is a zone violation).
	d := reg.Route(gateway.Call{
		Scope:  projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"},
		Tool:   "kernel_write",
		Target: projectwall.Target{ProjectID: "proj-b"},
	})
	if d.Outcome != gateway.OutcomeRefusedScope {
		t.Fatalf("expected scope refusal first, got %v", d.Outcome)
	}
}

func TestLookup(t *testing.T) {
	reg := gateway.DefaultRegistry()
	if _, ok := reg.Lookup("pact_verify"); !ok {
		t.Fatal("pact_verify must be exposed")
	}
	if _, ok := reg.Lookup("changeset_apply"); !ok {
		t.Fatal("changeset_apply must be exposed (the legal truth door)")
	}
	if _, ok := reg.Lookup("nope"); ok {
		t.Fatal("unknown tool must not resolve")
	}
}

// TestRouteProvisionStackToolsBelowLine: the DP13 provisioning tools the gateway now
// fronts are BELOW THE LINE — a same-project, same-identity call routes through (they
// re-emit/project, never write truth). Fault-injection: the gateway really routes them.
func TestRouteProvisionStackToolsBelowLine(t *testing.T) {
	reg := gateway.DefaultRegistry()
	scope := projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"}
	target := projectwall.Target{ProjectID: "proj-a"}
	for _, tool := range []string{"stack.emit", "stack.select_profile", "stack.bootstrap", "stack.resolve_ports", "stack.print_urls"} {
		d := reg.Route(gateway.Call{Scope: scope, Tool: tool, Target: target})
		if d.Outcome != gateway.OutcomeRoute {
			t.Fatalf("DP13 below-line tool %q not routed: %v", tool, d.Outcome)
		}
		if d.Tool == nil || d.Tool.Server != "provision" {
			t.Fatalf("DP13 tool %q routed to the wrong server: %+v", tool, d.Tool)
		}
	}
}

// TestRouteStackEngraveIsTruthWrite: the fenced stack.engrave_manifest door is refused
// at the edge with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET — a StackManifest is above-the-
// line truth, it never moves through a direct provisioning write.
func TestRouteStackEngraveIsTruthWrite(t *testing.T) {
	reg := gateway.DefaultRegistry()
	d := reg.Route(gateway.Call{
		Scope:  projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"},
		Tool:   "stack.engrave_manifest",
		Target: projectwall.Target{ProjectID: "proj-a"},
	})
	if d.Outcome != gateway.OutcomeRefusedTruthWrite {
		t.Fatalf("stack.engrave_manifest not refused as a truth-write: %v", d.Outcome)
	}
	if d.BlockReason == nil || d.BlockReason.Code != gateway.CodeTruthWriteNeedsChangeset {
		t.Fatalf("stack.engrave_manifest refusal without GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET: %+v", d.BlockReason)
	}
}

// TestRouteRealityIngestToolsBelowLine: the ADR 0081 reality-ingest server the gateway
// now fronts is BELOW THE LINE — a same-project, same-identity call routes through (its
// tools detect/ingest/render a prod divergence into a DRAFT idea, never a kernel write).
// Fault-injection: the gateway really routes the prod→kernel on-ramp's tools, so `/learn`
// has its door (the capability ceases to be dormant — ADR 0081, issue A).
func TestRouteRealityIngestToolsBelowLine(t *testing.T) {
	reg := gateway.DefaultRegistry()
	scope := projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"}
	target := projectwall.Target{ProjectID: "proj-a"}
	for _, tool := range []string{"detect_divergence", "ingest_divergence", "render_idea_text"} {
		d := reg.Route(gateway.Call{Scope: scope, Tool: tool, Target: target})
		if d.Outcome != gateway.OutcomeRoute {
			t.Fatalf("reality-ingest below-line tool %q not routed: %v", tool, d.Outcome)
		}
		if d.Tool == nil || d.Tool.Server != "reality-ingest" {
			t.Fatalf("reality-ingest tool %q routed to the wrong server: %+v", tool, d.Tool)
		}
	}
}

// ── S30 MemoryFirewall, WIRED at the gateway (the kernel-write trigger) ──
//
// The gateway is the live PreToolUse seam for a truth-write attempt. When the harness
// INJECTS a provenance onto a kernel_write, the gateway DEFERS to the S30 firewall pure
// decider (firewall.CheckKernelWrite) BEFORE the generic truth-write refusal. These tests
// prove the hook fires in BOTH senses at the WIRING point — the binary's own double-sense
// is in back/hooks/memory-firewall/main_test.go; here we prove the gateway feeds it right.

// RED (fault injection) — a kernel_write whose INJECTED provenance is a raw MemoryItem is
// BLOCKED with the SPECIFIC MEMORY_CANNOT_DECLARE_TRUTH reason (a memory tried to declare
// truth), not the generic ChangeSet refusal. This is the guarded property being violated:
// the direct Memory → Kernel edge. If the wiring were absent this would fall through to the
// generic truth-write refusal and the SPECIFIC code would never surface — the hook would be
// dead at this seam.
func TestRoute_MemoryProvenanceKernelWrite_BlockedAtGateway(t *testing.T) {
	reg := gateway.DefaultRegistry()
	d := reg.Route(gateway.Call{
		Scope:      projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"},
		Tool:       "kernel_write",
		Target:     projectwall.Target{ProjectID: "proj-a"},
		Provenance: "memory", // INJECTED by the harness — the forbidden shortcut.
	})
	if d.Outcome != gateway.OutcomeRefusedMemoryDeclareTruth {
		t.Fatalf("a memory-provenance kernel_write must be refused by the MemoryFirewall, got %v", d.Outcome)
	}
	if d.BlockReason == nil || d.BlockReason.Code != gateway.CodeMemoryCannotDeclareTruth {
		t.Fatalf("expected MEMORY_CANNOT_DECLARE_TRUTH, got %+v", d.BlockReason)
	}
	joined := strings.Join(d.BlockReason.HowToFix, " | ")
	if !strings.Contains(joined, "memory_to_contextpack_to_idea_to_mirror_to_goal_to_kernel") {
		t.Errorf("the block reason must name the full legal flow, got %v", d.BlockReason.HowToFix)
	}
}

// GREEN (the legal flow is NOT falsely blocked by S30) — a kernel_write whose injected
// provenance is a properly-MIRRORED idea passes the MemoryFirewall gate (CheckKernelWrite →
// nil): the firewall raises NO false block on the legal path. CRITICAL: this proves the
// wiring does not break the legitimate flow. The write is STILL refused (truth never goes
// direct — it needs a ChangeSet), but with the GENERIC reason, never the memory one. The
// outcome is OutcomeRefusedTruthWrite, NOT OutcomeRefusedMemoryDeclareTruth.
func TestRoute_MirroredIdeaProvenanceKernelWrite_NotFalselyBlockedByFirewall(t *testing.T) {
	reg := gateway.DefaultRegistry()
	d := reg.Route(gateway.Call{
		Scope:      projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"},
		Tool:       "kernel_write",
		Target:     projectwall.Target{ProjectID: "proj-a"},
		Provenance: "mirrored_idea", // the S27 legal path — the firewall must not block it.
	})
	if d.Outcome == gateway.OutcomeRefusedMemoryDeclareTruth {
		t.Fatalf("the MemoryFirewall must NOT block the mirrored-idea path — false block on the legal flow")
	}
	if d.Outcome != gateway.OutcomeRefusedTruthWrite {
		t.Fatalf("a mirrored-idea kernel_write still needs a ChangeSet (generic truth-write refusal), got %v", d.Outcome)
	}
	if d.BlockReason == nil || d.BlockReason.Code != gateway.CodeTruthWriteNeedsChangeset {
		t.Fatalf("expected GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET on the legal-provenance path, got %+v", d.BlockReason)
	}
}

// FAIL-CLOSED — a kernel_write whose injected provenance is unknown ("?", unparseable) is
// blocked by the firewall (CheckKernelWrite blocks anything that is not mirrored_idea). An
// unverifiable truth-write does not pass (anti-passthrough, KRD §82).
func TestRoute_UnknownProvenanceKernelWrite_FailsClosed(t *testing.T) {
	reg := gateway.DefaultRegistry()
	d := reg.Route(gateway.Call{
		Scope:      projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"},
		Tool:       "kernel_write",
		Target:     projectwall.Target{ProjectID: "proj-a"},
		Provenance: "garbage-not-a-known-kind",
	})
	if d.Outcome != gateway.OutcomeRefusedMemoryDeclareTruth {
		t.Fatalf("an unknown-provenance kernel_write must fail closed via the MemoryFirewall, got %v", d.Outcome)
	}
	if d.BlockReason == nil || d.BlockReason.Code != gateway.CodeMemoryCannotDeclareTruth {
		t.Fatalf("expected MEMORY_CANNOT_DECLARE_TRUTH on fail-closed, got %+v", d.BlockReason)
	}
}

// REGRESSION GUARD — a kernel_write with NO injected provenance (the zero value, every
// pre-S30-wiring caller) keeps the UNCHANGED generic truth-write refusal. The S30 layer is
// strictly ADDITIVE: it engages only when a provenance was injected, never widening or
// narrowing the existing no-provenance path.
func TestRoute_NoProvenanceKernelWrite_GenericTruthWriteRefusalUnchanged(t *testing.T) {
	reg := gateway.DefaultRegistry()
	d := reg.Route(gateway.Call{
		Scope:  projectwall.Scope{Identity: "alice", ActiveProject: "proj-a"},
		Tool:   "kernel_write",
		Target: projectwall.Target{ProjectID: "proj-a"},
		// Provenance omitted — zero value, no harness injection.
	})
	if d.Outcome != gateway.OutcomeRefusedTruthWrite {
		t.Fatalf("a no-provenance kernel_write must keep the generic truth-write refusal, got %v", d.Outcome)
	}
	if d.BlockReason == nil || d.BlockReason.Code != gateway.CodeTruthWriteNeedsChangeset {
		t.Fatalf("expected GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET, got %+v", d.BlockReason)
	}
}

func TestDefaultToolsReproducible(t *testing.T) {
	a := gateway.DefaultTools()
	b := gateway.DefaultTools()
	if len(a) != len(b) {
		t.Fatalf("non-reproducible tool count: %d != %d", len(a), len(b))
	}
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("tool %d differs across calls: %+v != %+v", i, a[i], b[i])
		}
	}
}
