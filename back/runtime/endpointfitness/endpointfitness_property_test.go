// endpointfitness_property_test.go — the DP08 invariant ∀ mirror (rapid, N1), WRITTEN FIRST
// and red (no non-test Go file in the package → compile fail IS the red).
//
// mirror record: reflects=DP08-endpoint-fitness, test_kind=property,
// cert_language=rapid, liveness=live
//
// THE LAWS (EMITTED_NO_HARDCODED_ENDPOINT — ROADMAP-provisioning-deploy DP08):
//
//  1. DETERMINISM — same emitted tree ⇒ same verdict, byte-identical canonical
//     bytes, same content address (the reproducibility mirror: même arbre →
//     même verdict).
//  2. DP07 ALWAYS PASSES — every module EmitConnectionsModule emits, for every
//     manifest inside the closed sets × every closed environment, scans GREEN:
//     an endpoint resolved via ResolveConnection NEVER trips the sensor.
//  3. RESOLVED ENDPOINTS ALWAYS PASS — any single ResolveConnection
//     EndpointPattern embedded in emitted-style source scans green (the
//     property of the done-criterion: « un endpoint résolu via
//     resolveConnection passe toujours »).
//  4. FAULT-INJECTION — injecting a hardcoded endpoint literal (URL with a
//     concrete host, an IPv4, a localhost, a concrete host:port) into a green
//     tree turns the verdict RED with a finding naming the injected file, and
//     the BlockReason EMITTED_NO_HARDCODED_ENDPOINT blocks the cut; REMOVING
//     the literal turns it green again (the sensor fires, then releases).
//  5. CLOSED REASONS — every finding carries a reason from the closed set
//     (no ad-hoc verdict vocabulary).
//  6. THE CUT IS BLOCKED — a red verdict yields a red archfit SensorVerdict,
//     and the S84 battery (selfcert.Certify) refuses green (anti-passthrough).
package endpointfitness

import (
	"bytes"
	"fmt"
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/buildloop/selfcert"
	"github.com/steph-frtech/aidos/back/runtime/connresolve"
	"pgregory.net/rapid"
)

// genName draws a service name inside the closed DP02 grammar (lowercase
// alphanumeric + dash, non-empty, starts alphanumeric).
func genName(t *rapid.T, label string) string {
	head := rapid.SampledFrom([]rune("abcdefghijklmnopqrstuvwxyz0123456789")).Draw(t, label+"-head")
	tail := rapid.StringOfN(rapid.SampledFrom([]rune("abcdefghijklmnopqrstuvwxyz0123456789-")), 0, 12, -1).Draw(t, label+"-tail")
	return string(head) + tail
}

// genManifest draws a StackManifest inside the closed sets (named services,
// known roles, declared internal ports).
func genManifest(t *rapid.T) stackmanifest.StackManifest {
	roles := stackmanifest.Roles()
	n := rapid.IntRange(1, 6).Draw(t, "n-services")
	services := make([]stackmanifest.Service, 0, n)
	seen := map[string]bool{}
	for i := 0; i < n; i++ {
		name := genName(t, fmt.Sprintf("svc-%d", i))
		if seen[name] {
			continue
		}
		seen[name] = true
		services = append(services, stackmanifest.Service{
			Name:         name,
			Role:         rapid.SampledFrom(roles).Draw(t, fmt.Sprintf("role-%d", i)),
			InternalPort: rapid.IntRange(1, 65535).Draw(t, fmt.Sprintf("port-%d", i)),
		})
	}
	return stackmanifest.StackManifest{
		AppName:  genName(t, "app"),
		Services: services,
		Network:  stackmanifest.Network{Name: "traefik_default", External: true},
	}
}

// genHardcoded draws one literal from the canonical hardcoded-endpoint pool —
// the fault the sensor MUST catch.
func genHardcoded(t *rapid.T) string {
	port := rapid.IntRange(10, 65535).Draw(t, "leak-port")
	octet := func(label string) int { return rapid.IntRange(0, 255).Draw(t, label) }
	switch rapid.IntRange(0, 3).Draw(t, "leak-kind") {
	case 0: // URL with a concrete IPv4 host
		return fmt.Sprintf("https://%d.%d.%d.%d:%d", octet("a"), octet("b"), octet("c"), octet("d"), port)
	case 1: // localhost endpoint
		return fmt.Sprintf("localhost:%d", port)
	case 2: // bare IPv4
		return fmt.Sprintf("%d.%d.%d.%d", octet("a2"), octet("b2"), octet("c2"), octet("d2"))
	default: // concrete dotted host:port (the /data/dockers domain leak)
		return fmt.Sprintf("%s.sagedesk.fr:%d", genName(t, "leak-host"), port)
	}
}

// Law 1 — determinism: same tree ⇒ same verdict, same canonical bytes, same address.
func TestProperty_SameTreeSameVerdict(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genManifest(t)
		env := rapid.SampledFrom(scope.Environments()).Draw(t, "env")
		module, err := connresolve.EmitConnectionsModule(m, env)
		if err != nil {
			t.Fatalf("EmitConnectionsModule: %v", err)
		}
		files := map[string]string{
			"gen/app/connections." + string(env) + ".ts": string(module),
		}
		if rapid.Bool().Draw(t, "with-leak") {
			files[LeakPath] = LeakSource
		}
		v1, err := Sense(files)
		if err != nil {
			t.Fatalf("Sense #1: %v", err)
		}
		v2, err := Sense(files)
		if err != nil {
			t.Fatalf("Sense #2: %v", err)
		}
		if !reflect.DeepEqual(v1, v2) {
			t.Fatalf("non-deterministic verdict:\n#1 %#v\n#2 %#v", v1, v2)
		}
		c1, err := Canonical(v1)
		if err != nil {
			t.Fatalf("Canonical #1: %v", err)
		}
		c2, err := Canonical(v2)
		if err != nil {
			t.Fatalf("Canonical #2: %v", err)
		}
		if !bytes.Equal(c1, c2) {
			t.Fatalf("canonical bytes diverge:\n#1 %s\n#2 %s", c1, c2)
		}
		a1, err := Address(v1)
		if err != nil {
			t.Fatalf("Address #1: %v", err)
		}
		a2, err := Address(v2)
		if err != nil {
			t.Fatalf("Address #2: %v", err)
		}
		if a1 != a2 {
			t.Fatalf("address diverges: %s vs %s", a1, a2)
		}
	})
}

// Law 2 — the DP07 emitted module always passes, for every closed environment.
func TestProperty_EmittedConnectionsModuleAlwaysGreen(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genManifest(t)
		for _, env := range scope.Environments() {
			module, err := connresolve.EmitConnectionsModule(m, env)
			if err != nil {
				t.Fatalf("EmitConnectionsModule(%s): %v", env, err)
			}
			path := "gen/app/connections." + string(env) + ".ts"
			findings := ScanSource(path, string(module))
			if len(findings) != 0 {
				t.Fatalf("DP07 module for env %s tripped the sensor: %+v\nmodule:\n%s", env, findings, module)
			}
		}
	})
}

// Law 3 — an endpoint resolved via ResolveConnection always passes.
func TestProperty_ResolvedEndpointAlwaysPasses(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genManifest(t)
		env := rapid.SampledFrom(scope.Environments()).Draw(t, "env")
		for _, svc := range m.Services {
			res, err := connresolve.ResolveConnection(svc, env)
			if err != nil {
				t.Fatalf("ResolveConnection: %v", err)
			}
			src := "// Code generated by AIDOS — DO NOT EDIT.\nexport const endpoint = \"" + res.EndpointPattern + "\";\n"
			findings := ScanSource("gen/app/endpoint.ts", src)
			if len(findings) != 0 {
				t.Fatalf("resolved endpoint %q tripped the sensor: %+v", res.EndpointPattern, findings)
			}
		}
	})
}

// Law 4 — fault-injection: inject a hardcoded endpoint → RED naming the file
// and the cut is blocked; remove it → GREEN again.
func TestProperty_FaultInjectionRedThenGreen(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		m := genManifest(t)
		env := rapid.SampledFrom(scope.Environments()).Draw(t, "env")
		module, err := connresolve.EmitConnectionsModule(m, env)
		if err != nil {
			t.Fatalf("EmitConnectionsModule: %v", err)
		}
		green := map[string]string{
			"gen/app/connections." + string(env) + ".ts": string(module),
		}
		leak := genHardcoded(t)
		injected := map[string]string{}
		for k, v := range green {
			injected[k] = v
		}
		injected["gen/app/leak.ts"] = "// fault injection\nexport const LEAK = \"" + leak + "\";\n"

		red, err := Sense(injected)
		if err != nil {
			t.Fatalf("Sense(injected): %v", err)
		}
		if red.State != StateRed {
			t.Fatalf("sensor stayed %s on injected hardcoded endpoint %q", red.State, leak)
		}
		var named bool
		for _, f := range red.Findings {
			if f.File == "gen/app/leak.ts" {
				named = true
			}
		}
		if !named {
			t.Fatalf("red verdict does not name the injected file: %+v", red.Findings)
		}
		br := Block(red)
		if br == nil || br.Code != CodeEmittedNoHardcodedEndpoint {
			t.Fatalf("red verdict must block the cut with EMITTED_NO_HARDCODED_ENDPOINT, got %+v", br)
		}
		if len(br.HowToFix) == 0 {
			t.Fatalf("a BlockReason with an empty how_to_fix is a prison: %+v", br)
		}

		// retirer le littéral → vert.
		back, err := Sense(green)
		if err != nil {
			t.Fatalf("Sense(green): %v", err)
		}
		if back.State != StateGreen {
			t.Fatalf("sensor stayed %s after removing the literal: %+v", back.State, back.Findings)
		}
		if Block(back) != nil {
			t.Fatalf("a green verdict must not block the cut")
		}
	})
}

// Law 5 — closed reasons: every finding's reason is a member of the closed set.
func TestProperty_FindingReasonsClosed(t *testing.T) {
	known := map[Reason]bool{}
	for _, r := range Reasons() {
		known[r] = true
	}
	rapid.Check(t, func(t *rapid.T) {
		leak := genHardcoded(t)
		src := "export const LEAK = \"" + leak + "\";\n"
		for _, f := range ScanSource("gen/app/leak.ts", src) {
			if !known[f.Reason] {
				t.Fatalf("finding reason %q is outside the closed set %v", f.Reason, Reasons())
			}
		}
	})
}

// Law 6 — the S84 cut is blocked: a red endpoint verdict reddens the archfit
// sensor and selfcert.Certify refuses green (added to the auto-certification).
func TestProperty_RedVerdictBlocksTheS84Cut(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		leak := genHardcoded(t)
		files := map[string]string{
			"gen/app/leak.ts": "export const LEAK = \"" + leak + "\";\n",
		}
		verdict := SensorArchFit(files)
		if verdict.Kind != selfcert.SensorArchFit {
			t.Fatalf("sensor verdict kind = %s, want archfit", verdict.Kind)
		}
		if verdict.State != selfcert.SensorRed {
			t.Fatalf("archfit sensor stayed %s on hardcoded endpoint %q", verdict.State, leak)
		}
		battery := selfcert.Certify(append(otherSixGreen(), verdict))
		if battery.Green {
			t.Fatalf("the S84 battery let a hardcoded endpoint through — the cut was not blocked")
		}
		if battery.BlockReason == nil {
			t.Fatalf("a red battery must carry its BlockReason")
		}
	})
}

// otherSixGreen builds the six non-archfit sensors green (the fixture frame
// the DP08 sensor is judged inside).
func otherSixGreen() []selfcert.SensorVerdict {
	var out []selfcert.SensorVerdict
	for _, k := range selfcert.SensorKinds() {
		if k == selfcert.SensorArchFit {
			continue
		}
		out = append(out, selfcert.SensorVerdict{Kind: k, State: selfcert.SensorGreen})
	}
	return out
}
