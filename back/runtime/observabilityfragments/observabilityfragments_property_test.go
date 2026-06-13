package observabilityfragments_test

// Invariant mirror (rapid property test, ∀ N1) — WRITTEN FIRST (RED→GREEN).
// reflects=dp17-observability-substrate-fragments+emitted-instrumentation ·
// test_kind=property · cert_language=rapid · liveness=live ·
// authority=above-the-line-source(stack_manifest) projected below + reuse of S92.
//
// DP17 — the THREE observability-substrate fragments (OTel collector + SigNoz +
// GlitchTip) of the EMITTED app's EXPLOITATION observability, plus the EMITTED
// INSTRUMENTATION (a PURE projection of the Kernel: the @opentelemetry/* wiring
// the emitted TS app uses — DATA, never Go runtime code). The laws:
//
//   L1 byte-identique : ∀ (projectID, env) légaux, SubstrateObservabilityFragments
//      rend des fragments dont le body canonique (records.Canonicalize) est
//      BYTE-IDENTIQUE à chaque appel — même projectID + même env ⇒ mêmes octets
//      (déterminisme-first). Idem pour l'instrumentation émise.
//   L2 palette close : EXACTEMENT 3 fragments (otel-collector, signoz, glitchtip),
//      chacun portant image + port interne + volume bind + healthcheck + profile
//      OBSERVABILITY + project_id — jamais deviné, le jeu est clos. otel-collector =
//      role observability ; signoz = role observability ; glitchtip = role
//      errortracking ; glitchtip depends_on postgres + valkey (DP14 mesuré).
//   L3 pas de gate env : aucun fragment observabilité n'est interdit par
//      environnement — seul un environnement HORS-ENSEMBLE échoue (UNKNOWN_ENVIRONMENT).
//   L4 isolation : project A ≠ project B ⇒ chaque fragment porte un project_id
//      distinct ET un nom de volume isolé ; A ne réutilise jamais l'octet de B.
//   L5 token partagé : le token d'isolation est CELUI de DP15 (datafragments.
//      IsolationToken), pas un schéma forké — même seed ⇒ même token sur les couches.
//   L6 LA PROPRIÉTÉ CAPITALE — l'ops-observabilité N'ÉCRIT AUCUNE VÉRITÉ : aucun
//      fragment ne porte une capacité d'écriture-vérité (kernel/mirrors/fitness) ;
//      l'instrumentation émise est PURE et READ-ONLY sur la réalité. WritesTruth()
//      est TOUJOURS false (∀ fragment, ∀ instrumentation). Le RealityMirror (E12)
//      reste l'unique on-ramp Kernel — observabilité d'EXPLOITATION ≠ senseur Kernel.
//   L7 le manifest émis est VALIDE (stackmanifest.Validate) une fois greffé sur un
//      server avec les fragments DP15/DP16 — ports internes uniques (collision
//      signoz/glitchtip levée), rôles/profils connus, ≥1 server.
//   L8 instrumentation = fonction pure du Kernel : l'endpoint OTLP pointe le
//      fragment SigNoz/otel-collector du MÊME projet, le DSN GlitchTip le fragment
//      GlitchTip du MÊME projet ; aucun secret/URL en dur (réf env-var), même
//      (projectID, env) ⇒ même instrumentation byte-identique.

import (
	"bytes"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/asyncfragments"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
	"github.com/steph-frtech/aidos/back/runtime/observabilityfragments"
	"pgregory.net/rapid"
)

func genProjectID(rt *rapid.T, label string) string {
	return rapid.StringMatching(`[a-z][a-z0-9-]{0,15}`).Draw(rt, label)
}

func genEnv(rt *rapid.T, label string) scope.Environment {
	envs := scope.Environments()
	return envs[rapid.IntRange(0, len(envs)-1).Draw(rt, label)]
}

func canonOf(t *testing.T, f observabilityfragments.ServiceFragment) []byte {
	t.Helper()
	b, err := observabilityfragments.CanonicalFragment(f)
	if err != nil {
		t.Fatalf("CanonicalFragment: %v", err)
	}
	return b
}

// TestL1ByteIdentique — same (projectID, env) ⇒ byte-identical fragments, ×100.
func TestL1ByteIdentique(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")

		a, errA := observabilityfragments.SubstrateObservabilityFragments(pid, env)
		b, errB := observabilityfragments.SubstrateObservabilityFragments(pid, env)
		if errA != nil || errB != nil {
			t.Fatalf("legal (%q,%q) must not error: %v / %v", pid, env, errA, errB)
		}
		if len(a) != len(b) {
			t.Fatalf("non-deterministic fragment count: %d vs %d", len(a), len(b))
		}
		for i := range a {
			if !bytes.Equal(canonOf(t, a[i]), canonOf(t, b[i])) {
				t.Fatalf("fragment %d not byte-identical across calls", i)
			}
		}
	})
}

// TestL1InstrumentationByteIdentique — the emitted instrumentation is byte-identical
// across calls (a pure projection of the Kernel).
func TestL1InstrumentationByteIdentique(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")
		a, errA := observabilityfragments.EmittedInstrumentation(pid, env)
		b, errB := observabilityfragments.EmittedInstrumentation(pid, env)
		if errA != nil || errB != nil {
			t.Fatalf("legal (%q,%q) must not error: %v / %v", pid, env, errA, errB)
		}
		ca, err := observabilityfragments.CanonicalInstrumentation(a)
		if err != nil {
			t.Fatalf("CanonicalInstrumentation a: %v", err)
		}
		cb, err := observabilityfragments.CanonicalInstrumentation(b)
		if err != nil {
			t.Fatalf("CanonicalInstrumentation b: %v", err)
		}
		if !bytes.Equal(ca, cb) {
			t.Fatalf("emitted instrumentation not byte-identical across calls")
		}
	})
}

// TestL2PaletteClose — exactly otel-collector + signoz + glitchtip, each fully
// populated, profile observability, closed roles.
func TestL2PaletteClose(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")
		frags, err := observabilityfragments.SubstrateObservabilityFragments(pid, env)
		if err != nil {
			t.Fatalf("legal (%q,%q): %v", pid, env, err)
		}
		want := map[string]bool{"otel-collector": false, "signoz": false, "glitchtip": false}
		for _, f := range frags {
			if _, ok := want[f.Key]; !ok {
				t.Fatalf("unknown observability fragment key %q (palette must be closed)", f.Key)
			}
			want[f.Key] = true
			if f.Service.Image == "" {
				t.Fatalf("%q: image required (DP14 measured)", f.Key)
			}
			if f.Service.InternalPort == 0 {
				t.Fatalf("%q: internal port required", f.Key)
			}
			if f.Service.Healthcheck == "" {
				t.Fatalf("%q: healthcheck required", f.Key)
			}
			if f.Service.Profile != stackmanifest.ProfileObservability {
				t.Fatalf("%q: observability substrate is profile observability, got %q", f.Key, f.Service.Profile)
			}
			if f.ProjectID != pid {
				t.Fatalf("%q: project_id %q, want %q", f.Key, f.ProjectID, pid)
			}
			if len(f.Volumes) == 0 {
				t.Fatalf("%q: a stateful observability service must carry a bind volume", f.Key)
			}
			if !stackmanifest.IsKnownRole(f.Service.Role) {
				t.Fatalf("%q: role %q outside the closed DP02 set", f.Key, f.Service.Role)
			}
		}
		for k, seen := range want {
			if !seen {
				t.Fatalf("missing observability fragment %q (the palette is fixed at three)", k)
			}
		}
	})
}

// TestL2Roles — otel-collector + signoz carry role observability ; glitchtip carries
// role errortracking ; glitchtip depends_on postgres + valkey (DP14 measured).
func TestL2Roles(t *testing.T) {
	frags, err := observabilityfragments.SubstrateObservabilityFragments("proj", scope.EnvDev)
	if err != nil {
		t.Fatalf("dev: %v", err)
	}
	byKey := map[string]observabilityfragments.ServiceFragment{}
	for _, f := range frags {
		byKey[f.Key] = f
	}
	if byKey["otel-collector"].Service.Role != stackmanifest.RoleObservability {
		t.Fatalf("otel-collector must be role observability, got %q", byKey["otel-collector"].Service.Role)
	}
	if byKey["signoz"].Service.Role != stackmanifest.RoleObservability {
		t.Fatalf("signoz must be role observability, got %q", byKey["signoz"].Service.Role)
	}
	if byKey["glitchtip"].Service.Role != stackmanifest.RoleErrorTracking {
		t.Fatalf("glitchtip must be role errortracking, got %q", byKey["glitchtip"].Service.Role)
	}
	deps := map[string]bool{}
	for _, d := range byKey["glitchtip"].Service.DependsOn {
		deps[d] = true
	}
	if !deps["postgres"] || !deps["valkey"] {
		t.Fatalf("glitchtip must depend_on postgres + valkey (DP14 measured), got %v", byKey["glitchtip"].Service.DependsOn)
	}
}

// TestL3NoEnvGate — no observability fragment is env-gated; every legal env yields 3
// fragments, only an out-of-set env fails closed.
func TestL3NoEnvGate(t *testing.T) {
	for _, env := range scope.Environments() {
		frags, err := observabilityfragments.SubstrateObservabilityFragments("proj", env)
		if err != nil {
			t.Fatalf("env %q must not gate any observability service: %v", env, err)
		}
		if len(frags) != 3 {
			t.Fatalf("env %q: observability fragments = %d, want 3", env, len(frags))
		}
	}
	_, err := observabilityfragments.SubstrateObservabilityFragments("proj", scope.Environment("nowhere"))
	var ref *envbindings.Refusal
	if !envbindings.AsRefusal(err, &ref) || ref.Code != envbindings.CodeUnknownEnvironment {
		t.Fatalf("out-of-set env must fail closed with UNKNOWN_ENVIRONMENT, got %v", err)
	}
}

// TestL4Isolation — project A ≠ project B ⇒ distinct project_id + distinct volume
// names ⇒ byte-distinct fragments (the anti-collision frontier).
func TestL4Isolation(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		a := genProjectID(rt, "a")
		b := genProjectID(rt, "b")
		if a == b {
			return
		}
		env := genEnv(rt, "env")
		fa, _ := observabilityfragments.SubstrateObservabilityFragments(a, env)
		fb, _ := observabilityfragments.SubstrateObservabilityFragments(b, env)
		if len(fa) != len(fb) {
			t.Fatalf("same palette size expected: %d vs %d", len(fa), len(fb))
		}
		for i := range fa {
			if fa[i].ProjectID == fb[i].ProjectID {
				t.Fatalf("fragment %q: project_id must differ between A=%q B=%q", fa[i].Key, a, b)
			}
			for _, va := range fa[i].Volumes {
				for _, vb := range fb[i].Volumes {
					if va.Name == vb.Name {
						t.Fatalf("fragment %q: volume %q shared across projects (isolation breach)", fa[i].Key, va.Name)
					}
				}
			}
			if bytes.Equal(canonOf(t, fa[i]), canonOf(t, fb[i])) {
				t.Fatalf("fragment %q: A and B canonical bytes must differ (isolation)", fa[i].Key)
			}
		}
	})
}

// TestL5SharedIsolationToken — DP17 reuses the EXACT DP15 token (no forked scheme):
// the observability volume name carries datafragments.IsolationToken(projectID).
func TestL5SharedIsolationToken(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		token := datafragments.IsolationToken(pid)
		frags, err := observabilityfragments.SubstrateObservabilityFragments(pid, scope.EnvDev)
		if err != nil {
			t.Fatalf("dev: %v", err)
		}
		for _, f := range frags {
			found := false
			for _, v := range f.Volumes {
				if v.Name == f.Key+"-"+token {
					found = true
				}
			}
			if !found {
				t.Fatalf("fragment %q: volume must carry the shared DP15 token %q", f.Key, token)
			}
		}
	})
}

// TestL6CapitalNoTruthWrite — THE CAPITAL PROPERTY: ops-observability writes NO
// truth. No fragment carries a write-truth capability; the emitted instrumentation
// is read-only on reality. WritesTruth() is ALWAYS false. The RealityMirror (E12)
// is the only Kernel on-ramp — exploitation observability ≠ Kernel sensor.
func TestL6CapitalNoTruthWrite(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")
		frags, err := observabilityfragments.SubstrateObservabilityFragments(pid, env)
		if err != nil {
			t.Fatalf("legal (%q,%q): %v", pid, env, err)
		}
		for _, f := range frags {
			if f.WritesTruth() {
				t.Fatalf("fragment %q claims a write-truth capability — the wall §2 (ops observability writes NO kernel/mirrors/fitness)", f.Key)
			}
			// Belt-and-braces: no fragment may carry a write scope on a truth schema.
			for _, cap := range f.Capabilities() {
				if observabilityfragments.IsTruthWriteCapability(cap) {
					t.Fatalf("fragment %q carries truth-write capability %q (forbidden by the wall)", f.Key, cap)
				}
			}
		}
		instr, err := observabilityfragments.EmittedInstrumentation(pid, env)
		if err != nil {
			t.Fatalf("EmittedInstrumentation: %v", err)
		}
		if instr.WritesTruth() {
			t.Fatalf("emitted instrumentation claims a write-truth capability — it must be read-only on reality (the wall §2)")
		}
		if !instr.ReadOnlyReality {
			t.Fatalf("emitted instrumentation must be read-only on reality (it observes, it never mutates truth)")
		}
		for _, cap := range instr.Capabilities() {
			if observabilityfragments.IsTruthWriteCapability(cap) {
				t.Fatalf("emitted instrumentation carries truth-write capability %q (forbidden)", cap)
			}
		}
	})
}

// TestL7GraftedManifestValid — the observability fragments grafted onto a minimal
// server WITH the DP15 data + DP16 async fragments form a VALID StackManifest:
// unique internal ports (the signoz/glitchtip collision is lifted), known
// roles/profiles, ≥1 server.
func TestL7GraftedManifestValid(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := scope.EnvDev
		obs, err := observabilityfragments.SubstrateObservabilityFragments(pid, env)
		if err != nil {
			t.Fatalf("observability dev: %v", err)
		}
		data, err := datafragments.SubstrateDataFragments(pid, env)
		if err != nil {
			t.Fatalf("data dev: %v", err)
		}
		async, err := asyncfragments.SubstrateAsyncFragments(pid, env)
		if err != nil {
			t.Fatalf("async dev: %v", err)
		}
		m := stackmanifest.StackManifest{
			AppName: "graft-" + pid + "x",
			Services: []stackmanifest.Service{
				{Name: "app", Role: stackmanifest.RoleServer, Image: "node:22-alpine", InternalPort: 3000, Profile: stackmanifest.ProfileCore},
			},
			Network: stackmanifest.Network{Name: "traefik_default", External: true},
		}
		all := append([]observabilityfragments.ServiceFragment{}, obs...)
		for _, f := range data {
			all = append(all, observabilityfragments.ServiceFragment(f))
		}
		for _, f := range async {
			all = append(all, observabilityfragments.ServiceFragment(f))
		}
		for _, f := range all {
			m.Services = append(m.Services, f.Service)
			m.Volumes = append(m.Volumes, f.Volumes...)
		}
		if err := stackmanifest.Validate(m); err != nil {
			t.Fatalf("grafted manifest (data+async+observability) must be valid: %v", err)
		}
	})
}

// TestL8InstrumentationIsPureProjection — the emitted instrumentation points the
// OTLP exporter at the observability fragments of the SAME project (no secret/URL in
// the clear — env-var references), and the error tracker at the GlitchTip fragment.
func TestL8InstrumentationIsPureProjection(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")
		instr, err := observabilityfragments.EmittedInstrumentation(pid, env)
		if err != nil {
			t.Fatalf("EmittedInstrumentation: %v", err)
		}
		if instr.ProjectID != pid {
			t.Fatalf("instrumentation project_id %q, want %q", instr.ProjectID, pid)
		}
		// The OTLP endpoint reference must name the otel-collector service of the stack.
		if !strings.Contains(instr.OTLPEndpointVar, "OTEL") {
			t.Fatalf("OTLP endpoint must be an env-var reference (got %q), never a hardcoded URL", instr.OTLPEndpointVar)
		}
		// The error DSN must be an env-var reference (a secret, never in the clear).
		if !strings.Contains(instr.ErrorDSNVar, "GLITCHTIP") && !strings.Contains(instr.ErrorDSNVar, "SENTRY") {
			t.Fatalf("error DSN must be an env-var reference to GlitchTip (got %q)", instr.ErrorDSNVar)
		}
		// The instrumentation is TS (@opentelemetry/*, ADR 0040) — NEVER a Go package.
		if len(instr.Packages) == 0 {
			t.Fatalf("instrumentation must declare its @opentelemetry/* packages (ADR 0040, TS)")
		}
		for _, p := range instr.Packages {
			if !strings.HasPrefix(p, "@opentelemetry/") && !strings.HasPrefix(p, "@sentry/") {
				t.Fatalf("instrumentation package %q is not a TS OTel/error package (ADR 0040: emitted app is TS, never Go)", p)
			}
		}
	})
}

// TestCanonicalIsRecordsCanonical — CanonicalFragment delegates to
// records.Canonicalize (S02 reused, never forked): re-canonicalising is a fixpoint.
func TestCanonicalIsRecordsCanonical(t *testing.T) {
	frags, err := observabilityfragments.SubstrateObservabilityFragments("proj", scope.EnvDev)
	if err != nil {
		t.Fatalf("dev: %v", err)
	}
	for _, f := range frags {
		b := canonOf(t, f)
		again, err := records.Canonicalize(b)
		if err != nil {
			t.Fatalf("re-canonicalise: %v", err)
		}
		if !bytes.Equal(b, again) {
			t.Fatalf("%q: canonical form is not a records.Canonicalize fixpoint", f.Key)
		}
	}
}
