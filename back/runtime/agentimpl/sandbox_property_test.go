// sandbox_property_test.go — BA17: the reproducibility + invariant mirror for the sandbox
// binding and the gated LLM exception. Same input ⇒ same verdict (determinism-first), and
// the three-level defense-in-depth invariant holds for EVERY truth-zone target.
package agentimpl

import (
	"context"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"pgregory.net/rapid"
)

func propImpl() AgentImplementation {
	return AgentImplementation{
		LayerRef:            "agent:builder@v1",
		Model:               "claude",
		Provider:            agentlayer.ProviderAnthropic,
		AllowedPaths:        []string{"apps/demo/"},
		ForbiddenPaths:      WallForbiddenPaths(),
		AllowedNetworkHosts: []string{"api.anthropic.com"},
		AllowedExec:         []string{"go"},
		ResourceLimits:      agentlayer.ResourceLimits{MaxMemoryMB: 256, MaxCPUMillis: 1000, MaxWallSeconds: 30},
	}
}

// REPRODUCIBILITY: BindSandbox + every boundary decision is a pure function of input —
// same target ⇒ same verdict, repeatedly (no clock/rng/I/O).
func TestProp_Sandbox_Deterministic(t *testing.T) {
	impl := propImpl()
	rapid.Check(t, func(t *rapid.T) {
		target := rapid.String().Draw(t, "target")
		host := rapid.String().Draw(t, "host")
		cmd := rapid.String().Draw(t, "cmd")

		sb1 := BindSandbox(impl)
		sb2 := BindSandbox(impl)

		if sb1.FS.MayWrite(target).Allowed != sb2.FS.MayWrite(target).Allowed {
			t.Fatalf("FS.MayWrite non-deterministic for %q", target)
		}
		if sb1.Egress.MayReach(host).Allowed != sb2.Egress.MayReach(host).Allowed {
			t.Fatalf("Egress.MayReach non-deterministic for %q", host)
		}
		if sb1.Exec.MayRun(cmd).Allowed != sb2.Exec.MayRun(cmd).Allowed {
			t.Fatalf("Exec.MayRun non-deterministic for %q", cmd)
		}
		if sb1.GrantWouldDeny(target) != sb2.GrantWouldDeny(target) {
			t.Fatalf("GrantWouldDeny non-deterministic for %q", target)
		}
	})
}

// INVARIANT: the FS boundary mirrors PathAllowed EXACTLY (the OS mirror of the allow-list).
func TestProp_FSBoundary_MirrorsPathAllowed(t *testing.T) {
	impl := propImpl()
	sb := BindSandbox(impl)
	rapid.Check(t, func(t *rapid.T) {
		target := rapid.String().Draw(t, "target")
		want := PathAllowed(impl, target).Allowed
		got := sb.FS.MayWrite(target).Allowed
		if want != got {
			t.Fatalf("FS boundary must mirror PathAllowed for %q: want %v got %v", target, want, got)
		}
	})
}

// INVARIANT (defense in depth): EVERY truth-zone write is refused at all three levels — the
// FS boundary, the gate/hook (zone), AND the Postgres GRANT backstop. A target above the
// waterline can NEVER pass any level (the wall holds three times over).
func TestProp_TruthZoneWrite_RefusedAtThreeLevels(t *testing.T) {
	impl := propImpl()
	sb := BindSandbox(impl)
	zones := WallForbiddenPaths()
	rapid.Check(t, func(t *rapid.T) {
		z := zones[rapid.IntRange(0, len(zones)-1).Draw(t, "zoneIdx")]
		// A separator-safe suffix: a truth zone is "kernel"/"back/kernel/" — appending a
		// path segment ("/foo", ".truth") stays above the waterline; a bare alpha suffix
		// ("kernelA") would NOT be the zone (the wall matches the schema/prefix, not an
		// arbitrary string). The OS write target is always a path under the zone.
		seg := rapid.SampledFrom([]string{"", "/foo", "/a/b.go", ".truth", "/x"}).Draw(t, "seg")
		target := z + seg

		if sb.FS.MayWrite(target).Allowed {
			t.Fatalf("level 1 (FS) must refuse truth-zone target %q", target)
		}
		if sb.GateWrite(target).Allowed {
			t.Fatalf("level 1' (gate/hook zone) must refuse truth-zone target %q", target)
		}
		if !sb.GrantWouldDeny(target) {
			t.Fatalf("level 3 (GRANT) must deny truth-zone target %q", target)
		}
		v := sb.CheckWrite(target)
		if v.Allowed {
			t.Fatalf("combined verdict must refuse truth-zone target %q", target)
		}
		if len(v.DeniedLevels) < 3 {
			t.Fatalf("truth-zone target %q must be denied at >= 3 levels, got %v", target, v.DeniedLevels)
		}
	})
}

// INVARIANT (fail-closed egress): any host NOT in the declared allow-list is refused at the
// boundary AND the gate.
func TestProp_UndeclaredEgress_FailClosed(t *testing.T) {
	impl := propImpl()
	sb := BindSandbox(impl)
	rapid.Check(t, func(t *rapid.T) {
		host := rapid.StringMatching(`[a-z][a-z0-9.]{0,20}`).Draw(t, "host")
		if host == "" {
			return // an empty host is "no egress" (the gate skips the axis), not an undeclared host
		}
		declared := false
		for _, h := range impl.AllowedNetworkHosts {
			if h == host {
				declared = true
			}
		}
		if declared {
			return // declared hosts are allowed; this invariant is about the undeclared ones
		}
		if sb.Egress.MayReach(host).Allowed {
			t.Fatalf("undeclared host %q must be refused at the boundary", host)
		}
		if sb.GateEgress(host).Allowed {
			t.Fatalf("undeclared host %q must be refused at the gate", host)
		}
	})
}

// REPRODUCIBILITY (the gated LLM exception): the deterministic fake returns the same reply
// for the same turn index, and HardStop is a pure predicate.
func TestProp_GenerateAction_Deterministic(t *testing.T) {
	impl := propImpl()
	rapid.Check(t, func(t *rapid.T) {
		replies := rapid.SliceOfN(rapid.StringMatching(`[a-z ]{0,20}`), 1, 4).Draw(t, "replies")
		gen := FakeGenerator{Replies: replies}
		r1, e1 := gen.GenerateAction(context.Background(), impl, Transcript{})
		r2, e2 := gen.GenerateAction(context.Background(), impl, Transcript{})
		if (e1 == nil) != (e2 == nil) {
			t.Fatal("GenerateAction error path non-deterministic")
		}
		if e1 == nil && r1.Text != r2.Text {
			t.Fatalf("GenerateAction non-deterministic: %q vs %q", r1.Text, r2.Text)
		}
	})
}

func TestProp_HardStop_Monotone(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		cap := rapid.IntRange(0, 1000).Draw(t, "cap")
		emitted := rapid.IntRange(0, 2000).Draw(t, "emitted")
		got := HardStop(emitted, cap)
		// A zero cap means no cap: never stop. A positive cap: stop iff emitted >= cap.
		want := cap > 0 && emitted >= cap
		if got != want {
			t.Fatalf("HardStop(%d,%d)=%v want %v", emitted, cap, got, want)
		}
	})
}

// INVARIANT: every boundary deny carries its canonical, actionable BlockReason (no prison).
func TestProp_BoundaryDenies_AreActionable(t *testing.T) {
	impl := propImpl()
	sb := BindSandbox(impl)
	checks := []struct {
		br   *blockreason.BlockReason
		want blockreason.Code
	}{
		{sb.FS.MayWrite("/etc/x").BlockReason, blockreason.CodeAgentPathNotAllowed},
		{sb.Egress.MayReach("nope.test").BlockReason, blockreason.CodeAgentEgressNotAllowed},
		{sb.Exec.MayRun("rm").BlockReason, blockreason.CodeAgentExecNotAllowed},
	}
	for _, c := range checks {
		if c.br == nil || c.br.Code != c.want {
			t.Fatalf("boundary deny must carry %s, got %v", c.want, c.br)
		}
		if len(c.br.HowToFix) == 0 {
			t.Fatalf("a BlockReason with no how_to_fix is a prison (code %s)", c.want)
		}
	}
}
