// honoemit_property_test.go — the S87 INVARIANT mirror (the reproducibility + purity
// properties), rapid (the frozen Go property slot). It pins the two done-criteria a
// fixture cannot: "même Kernel → scaffold byte-identique" (byte-stability over arbitrary
// specs/manifests) AND "le programme Pulumi/TS émis est FN02-pur" (no module-scope mutable
// binding in any emitted module). Same input → same output, on every run and machine.
package honoemit

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"pgregory.net/rapid"
)

// genServerSpec draws an arbitrary projectable ServerSpec: a non-empty project + ≥ 1 op
// with distinct names, each randomly sync or async (an async op gets a valid trigger).
func genServerSpec(t *rapid.T) ServerSpec {
	project := rapid.StringMatching(`[a-z][a-z0-9]{0,7}`).Draw(t, "project")
	n := rapid.IntRange(1, 5).Draw(t, "nops")
	ops := make([]Op, 0, n)
	seen := map[string]bool{}
	triggers := operation.TriggerKinds()
	for i := 0; i < n; i++ {
		name := rapid.StringMatching(`[a-z][a-zA-Z0-9]{0,9}`).Draw(t, "opname")
		if seen[name] {
			continue
		}
		seen[name] = true
		op := Op{Name: name}
		if rapid.Bool().Draw(t, "async") {
			op.Async = true
			tk := triggers[rapid.IntRange(0, len(triggers)-1).Draw(t, "trig")]
			op.Trigger = operation.AsyncTrigger{Kind: tk}
			if tk == operation.TriggerCron {
				op.Trigger.At = "2026-01-01T00:00:00Z"
			}
		}
		ops = append(ops, op)
	}
	if len(ops) == 0 {
		ops = append(ops, Op{Name: "op"})
	}
	return ServerSpec{Project: project, Ops: ops}
}

// shuffledSpec returns the same spec with ops in a DIFFERENT slice order — the emitter must
// be invariant to input order (canonical name order owns the bytes).
func shuffledSpec(s ServerSpec) ServerSpec {
	if len(s.Ops) < 2 {
		return s
	}
	out := append([]Op(nil), s.Ops...)
	out[0], out[len(out)-1] = out[len(out)-1], out[0]
	return ServerSpec{Project: s.Project, Ops: out}
}

// TestProp_ServerByteIdentical — same Kernel cut → byte-identical server + worker, twice and
// under input-order permutation. The reproducibility mirror (S87 done-criterion).
func TestProp_ServerByteIdentical(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genServerSpec(t)

		a1, br := EmitServer(spec)
		if br != nil {
			t.Fatalf("EmitServer refused a projectable spec: %s", br.Explanation)
		}
		a2, _ := EmitServer(shuffledSpec(spec))
		if string(a1.Bytes) != string(a2.Bytes) {
			t.Fatalf("server not byte-identical under input-order permutation")
		}
		if a1.OutputHash != a2.OutputHash || a1.SourceHash != a2.SourceHash {
			t.Fatalf("server hashes diverged: out %s/%s src %s/%s", a1.OutputHash, a2.OutputHash, a1.SourceHash, a2.SourceHash)
		}

		w1, br := EmitWorker(spec)
		if br != nil {
			t.Fatalf("EmitWorker refused: %s", br.Explanation)
		}
		w2, _ := EmitWorker(shuffledSpec(spec))
		if string(w1.Bytes) != string(w2.Bytes) {
			t.Fatalf("worker not byte-identical under input-order permutation")
		}
	})
}

// TestProp_EmittedServerFN02Pure — no emitted module carries a MODULE-SCOPE mutable binding
// (`let`/`var` at column 0): the FN02 purity mandate (ADR 0036/0040). All mutable state lives
// inside a function body (handlers, the worker loop), never at module scope.
func TestProp_EmittedServerFN02Pure(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		spec := genServerSpec(t)
		for _, art := range mustEmitAll(t, spec) {
			for _, line := range strings.Split(string(art.Bytes), "\n") {
				if strings.HasPrefix(line, "let ") || strings.HasPrefix(line, "var ") {
					t.Fatalf("module-scope mutable binding in %s: %q", art.Target, line)
				}
			}
		}
	})
}

func mustEmitAll(t *rapid.T, spec ServerSpec) []Artifact {
	srv, br := EmitServer(spec)
	if br != nil {
		t.Fatalf("EmitServer refused: %s", br.Explanation)
	}
	wrk, br := EmitWorker(spec)
	if br != nil {
		t.Fatalf("EmitWorker refused: %s", br.Explanation)
	}
	return []Artifact{srv, wrk}
}

// genManifest draws an arbitrary projectable StackManifest: an app + a role=server + 0..3
// other services with distinct names and distinct internal ports.
func genManifest(t *rapid.T) StackManifest {
	app := rapid.StringMatching(`[a-z][a-z0-9]{0,7}`).Draw(t, "app")
	svcs := []Service{{Name: "server", Role: RoleServer, Image: "img:latest", InternalPort: 3000}}
	roles := ServiceRoles()
	port := 4000
	extra := rapid.IntRange(0, 3).Draw(t, "extra")
	for i := 0; i < extra; i++ {
		name := rapid.StringMatching(`svc[0-9]`).Draw(t, "svc")
		role := roles[rapid.IntRange(0, len(roles)-1).Draw(t, "role")]
		svcs = append(svcs, Service{Name: name + "_" + role.toS(i), Role: role, Image: "i:latest", InternalPort: port})
		port++
	}
	return StackManifest{App: app, Services: svcs, Network: Network{Name: "traefik_default", External: true}}
}

func (r ServiceRole) toS(i int) string {
	return string(r) + string(rune('a'+i))
}

// TestProp_PulumiByteIdentical_AndPure — same StackManifest → byte-identical Pulumi/TS
// program, and the program is FN02-pure (no module-scope mutable binding). Both S87
// done-criteria for the IaC target.
func TestProp_PulumiByteIdentical_AndPure(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genManifest(t)
		a1, br := EmitPulumiProgram(m)
		if br != nil {
			t.Fatalf("EmitPulumiProgram refused a projectable manifest: %s", br.Explanation)
		}
		// permute service order — the emitter is invariant (canonical name order owns bytes).
		m2 := m
		if len(m.Services) >= 2 {
			sv := append([]Service(nil), m.Services...)
			sv[0], sv[len(sv)-1] = sv[len(sv)-1], sv[0]
			m2 = StackManifest{App: m.App, Services: sv, Network: m.Network}
		}
		a2, _ := EmitPulumiProgram(m2)
		if string(a1.Bytes) != string(a2.Bytes) {
			t.Fatalf("pulumi program not byte-identical under service-order permutation")
		}
		for _, line := range strings.Split(string(a1.Bytes), "\n") {
			if strings.HasPrefix(line, "let ") || strings.HasPrefix(line, "var ") {
				t.Fatalf("module-scope mutable binding in pulumi program: %q", line)
			}
		}
	})
}
