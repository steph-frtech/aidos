// sandbox_fixture_test.go — BA17: the RED fixture + three-level fault-injection mirror for
// the OS/Postgres SANDBOX BINDING and the gated LLM exception.
//
// THE FIXTURE (state → cmd → events), the roadmap verbatim:
//   - a generated WRITE to a non-AllowedPaths path is refused by the FS boundary AND the
//     hook (zone) AND would miss the GRANT (defense in depth — three independent levels);
//   - an EGRESS to an undeclared host is refused at the boundary AND the gate;
//   - the LLM is isolated behind ONE ActionGenerator.GenerateAction(impl, transcript) with a
//     deterministic FAKE, and the provider HARD-STOPS streaming at the token cap.
//
// Written RED first (the types/funcs below do not exist yet): BindSandbox, Sandbox,
// FSBoundary/EgressBoundary/ExecBoundary, ResourceCaps, BoundaryDecision,
// SandboxLevel/SandboxLevels, ActionGenerator (renamed seam), GenerateAction, FakeGenerator,
// HardStop. `go test` fails to COMPILE → that compile-red IS the /goal.
package agentimpl

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// appImpl is the canonical confined projection the sandbox binds: its ONLY writable root is
// the app tree (the OS mirror of the PathAllowed allow-list); no egress, no exec by default.
func sandboxImpl() AgentImplementation {
	return AgentImplementation{
		LayerRef:            "agent:builder@v1",
		Role:                "executor",
		Model:               "claude",
		Provider:            agentlayer.ProviderAnthropic,
		Temperature:         0,
		MaxTurns:            8,
		Seed:                "deadbeef",
		AllowedPaths:        []string{"apps/demo/"},        // the app tree — the ONLY writable root
		ForbiddenPaths:      WallForbiddenPaths(),          // always carries the wall
		AllowedNetworkHosts: []string{"api.anthropic.com"}, // the one declared egress host
		AllowedExec:         []string{"go"},                // the one declared exec
		ResourceLimits:      agentlayer.ResourceLimits{MaxMemoryMB: 512, MaxCPUMillis: 2000, MaxWallSeconds: 60},
		MaxConcurrency:      1,
	}
}

// ── Level 1: the FS boundary mirrors the PathAllowed allow-list at the OS root ───────────

func TestBindSandbox_WritableRoot_IsTheAppTree(t *testing.T) {
	sb := BindSandbox(sandboxImpl())

	// The app tree is writable (covered by AllowedPaths, below the waterline, outside Forbidden).
	if d := sb.FS.MayWrite("apps/demo/src/main.go"); !d.Allowed {
		t.Fatalf("app-tree write must be allowed by the FS boundary, got deny %v", d.BlockReason)
	}
	// A path OUTSIDE the app tree is refused by the FS boundary (default-deny — confinement).
	d := sb.FS.MayWrite("/etc/passwd")
	if d.Allowed {
		t.Fatal("a write outside the app tree must be refused by the FS boundary (level 1)")
	}
	if d.BlockReason == nil || d.BlockReason.Code != blockreason.CodeAgentPathNotAllowed {
		t.Fatalf("FS-boundary deny must carry AGENT_PATH_NOT_ALLOWED, got %v", d.BlockReason)
	}
}

// THE THREE-LEVEL FAULT INJECTION — a generated write to a non-AllowedPaths path is refused
// at EVERY level: the FS boundary (1), the hook deny-list (3 below in code: zone), and would
// miss the GRANT (the level-3 Postgres backstop — asserted via GrantWouldDeny).
func TestBindSandbox_NonAllowedWrite_DefenseInDepth(t *testing.T) {
	sb := BindSandbox(sandboxImpl())
	target := "back/kernel/truth.go" // a TRUTH zone — above the waterline AND outside the app tree

	// LEVEL 1 — the FS boundary (the OS mirror of the allow-list) refuses.
	if d := sb.FS.MayWrite(target); d.Allowed {
		t.Fatal("level 1 (FS boundary) must refuse a write outside the writable root")
	}
	// LEVEL 1' — the gate (the single composed verdict the hook also consults) refuses on the
	// ZONE axis (a kernel write is above the waterline) AND the PATH axis (outside AllowedPaths).
	if dec := sb.GateWrite(target); dec.Allowed {
		t.Fatal("the gate/hook (zone+path) must refuse a write to a truth zone")
	}
	// LEVEL 3 — the Postgres GRANT backstop: the aidos_agent role has NO write GRANT on the
	// truth zone, so even past the FS+hook the write WOULD miss the GRANT. GrantWouldDeny is a
	// PURE predicate over the canonical role posture (the migration is the truth; this asserts
	// the binding KNOWS the role is SELECT-only above the line — the fail-closed backstop).
	if !sb.GrantWouldDeny(target) {
		t.Fatal("level 3 (Postgres GRANT) must deny: aidos_agent has no write grant on a truth zone")
	}
	// The sandbox's combined verdict names all three failed levels (defense in depth proven).
	verdict := sb.CheckWrite(target)
	if verdict.Allowed {
		t.Fatal("the sandbox combined write verdict must refuse a non-AllowedPaths truth-zone write")
	}
	if len(verdict.DeniedLevels) < 3 {
		t.Fatalf("defense in depth: expected the write refused at >= 3 levels (fs, hook, grant), got %v", verdict.DeniedLevels)
	}
}

// ── Level 2: the egress boundary mirrors EgressAllowed, refused at boundary AND gate ─────

func TestBindSandbox_UndeclaredEgress_DefenseInDepth(t *testing.T) {
	sb := BindSandbox(sandboxImpl())

	// The declared host is reachable at the boundary AND the gate.
	if d := sb.Egress.MayReach("api.anthropic.com"); !d.Allowed {
		t.Fatalf("declared host must be reachable at the egress boundary, got %v", d.BlockReason)
	}
	// An UNDECLARED host (fail-closed): refused at the boundary (level 1) AND at the gate.
	host := "evil.example.com"
	d := sb.Egress.MayReach(host)
	if d.Allowed {
		t.Fatal("an undeclared host must be refused at the egress boundary (fail-closed)")
	}
	if d.BlockReason == nil || d.BlockReason.Code != blockreason.CodeAgentEgressNotAllowed {
		t.Fatalf("egress-boundary deny must carry AGENT_EGRESS_NOT_ALLOWED, got %v", d.BlockReason)
	}
	if dec := sb.GateEgress(host); dec.Allowed {
		t.Fatal("the gate must ALSO refuse an undeclared egress host (defense in depth)")
	}
	verdict := sb.CheckEgress(host)
	if verdict.Allowed {
		t.Fatal("the sandbox combined egress verdict must refuse an undeclared host")
	}
	if len(verdict.DeniedLevels) < 2 {
		t.Fatalf("expected egress refused at >= 2 levels (boundary, gate), got %v", verdict.DeniedLevels)
	}
}

// ── Level: the exec boundary mirrors ExecAllowed (fail-closed) ───────────────────────────

func TestBindSandbox_ExecAllowList(t *testing.T) {
	sb := BindSandbox(sandboxImpl())
	if d := sb.Exec.MayRun("go"); !d.Allowed {
		t.Fatalf("declared exec must be allowed, got %v", d.BlockReason)
	}
	d := sb.Exec.MayRun("rm")
	if d.Allowed {
		t.Fatal("an undeclared command must be refused by the exec boundary (fail-closed)")
	}
	if d.BlockReason == nil || d.BlockReason.Code != blockreason.CodeAgentExecNotAllowed {
		t.Fatalf("exec deny must carry AGENT_EXEC_NOT_ALLOWED, got %v", d.BlockReason)
	}
}

// ── The cgroup/ulimit descriptor mirrors the declared ResourceLimits ─────────────────────

func TestBindSandbox_ResourceCaps_MirrorTheKnobs(t *testing.T) {
	impl := sandboxImpl()
	sb := BindSandbox(impl)
	if sb.Caps.MaxMemoryMB != impl.ResourceLimits.MaxMemoryMB ||
		sb.Caps.MaxCPUMillis != impl.ResourceLimits.MaxCPUMillis ||
		sb.Caps.MaxWallSeconds != impl.ResourceLimits.MaxWallSeconds {
		t.Fatalf("resource caps must mirror the declared ResourceLimits, got %+v", sb.Caps)
	}
	// Fail-closed: an empty AllowedExec ⇒ no subprocess; an empty AllowedNetworkHosts ⇒ no egress.
	bare := BindSandbox(AgentImplementation{LayerRef: "x@1", Model: "m", Provider: agentlayer.ProviderAnthropic, ForbiddenPaths: WallForbiddenPaths()})
	if d := bare.Exec.MayRun("go"); d.Allowed {
		t.Fatal("a bare projection (empty AllowedExec) must refuse EVERY command")
	}
	if d := bare.Egress.MayReach("api.anthropic.com"); d.Allowed {
		t.Fatal("a bare projection (empty AllowedNetworkHosts) must refuse EVERY host")
	}
	if d := bare.FS.MayWrite("apps/demo/x.go"); d.Allowed {
		t.Fatal("a bare projection (empty AllowedPaths) must refuse EVERY path")
	}
	// The binding records the Postgres role it runs under (the level-3 backstop's identity).
	if sb.Role != PostgresAgentRole {
		t.Fatalf("the sandbox must run under the aidos_agent role, got %q", sb.Role)
	}
}

// ── The gated LLM exception: ActionGenerator + deterministic fake + streaming hard-stop ──

func TestGenerateAction_DeterministicFake(t *testing.T) {
	impl := sandboxImpl()
	gen := FakeGenerator{Replies: []string{"action-1", "action-2"}}
	tr := Transcript{System: "you are a governed build agent", Turns: []string{}}

	got1, err := gen.GenerateAction(context.Background(), impl, tr)
	if err != nil {
		t.Fatalf("fake GenerateAction must not error: %v", err)
	}
	// Determinism: same (impl, transcript) ⇒ same reply (the fake reads its scripted slice).
	got1b, _ := gen.GenerateAction(context.Background(), impl, tr)
	if got1.Text != got1b.Text {
		t.Fatalf("GenerateAction must be deterministic for the same input: %q vs %q", got1.Text, got1b.Text)
	}
	if got1.Text != "action-1" {
		t.Fatalf("fake must return the first scripted reply, got %q", got1.Text)
	}
	// The seam type is an ActionGenerator (renamed to avoid the agentlayer.Provider collision).
	var _ ActionGenerator = gen
}

// THE STREAMING HARD-STOP: the provider cancels the stream the moment the token count
// crosses the declared cap (gap G3). HardStop is a PURE predicate over (emitted, cap).
func TestHardStop_AtTokenCap(t *testing.T) {
	// Under the cap: keep streaming.
	if HardStop(99, 100) {
		t.Fatal("must NOT hard-stop while emitted < cap")
	}
	// At the cap: stop.
	if !HardStop(100, 100) {
		t.Fatal("must hard-stop the instant emitted == cap")
	}
	// Over the cap: stop.
	if !HardStop(101, 100) {
		t.Fatal("must hard-stop when emitted > cap")
	}
	// A zero/absent cap means NO cap (the impl declares no token cap) — never hard-stop.
	if HardStop(1_000_000, 0) {
		t.Fatal("a zero cap means no cap — must not hard-stop")
	}
}

// A capped fake that streams replies and hard-stops at the token cap proves the seam wires
// the hard-stop: a reply that would exceed the cap is TRUNCATED at the boundary.
func TestFakeGenerator_StreamHardStops(t *testing.T) {
	impl := sandboxImpl()
	// cap the stream at 5 tokens; the scripted reply is longer.
	gen := FakeGenerator{Replies: []string{"a b c d e f g h"}, TokenCap: 5}
	got, err := gen.GenerateAction(context.Background(), impl, Transcript{})
	if err != nil {
		t.Fatalf("capped fake must not error: %v", err)
	}
	if got.Tokens > 5 {
		t.Fatalf("the stream must hard-stop at the cap (5), emitted %d", got.Tokens)
	}
	if !got.Truncated {
		t.Fatal("a reply that crosses the token cap must be marked Truncated (hard-stopped)")
	}
}
