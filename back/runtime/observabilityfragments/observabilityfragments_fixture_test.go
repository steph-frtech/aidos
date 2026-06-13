package observabilityfragments_test

// observabilityfragments_fixture_test.go — the ACCEPTANCE (Godog-class,
// state→command→events) mirror for DP17 (ROADMAP-provisioning-deploy, palette DP14).
// It proves the headline done-criteria as deterministic Given/When/Then fixtures (the
// CLAUDE.md §6 bootstrap exception: the mirrors Postgres schema persists this later;
// the test IS the red→green proof now). DETERMINISTIC: no clock, no RNG.
//
//	Given un projet émis « shop »
//	When  on émet les fragments d'observabilité d'exploitation
//	Then  trois services (OTel collector + SigNoz + GlitchTip, profile observability)
//	      sont émis ; l'app s'instrumente avec @opentelemetry/* → SigNoz et ses erreurs
//	      → GlitchTip ; ET — propriété capitale — AUCUN de ces fragments / de cette
//	      instrumentation n'écrit la moindre vérité (le RealityMirror E12 reste l'unique
//	      on-ramp Kernel).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/observabilityfragments"
)

// Given a project / When emitting / Then the three observability services exist with
// the measured contracts, profile observability.
func TestFixture_AppEmitsObservabilitySubstrate(t *testing.T) {
	const app = "shop"
	frags, err := observabilityfragments.SubstrateObservabilityFragments(app, scope.EnvProd)
	if err != nil {
		t.Fatalf("prod observability fragments: %v", err)
	}
	if len(frags) != 3 {
		t.Fatalf("want 3 observability fragments, got %d", len(frags))
	}
	byKey := map[string]observabilityfragments.ServiceFragment{}
	for _, f := range frags {
		byKey[f.Key] = f
	}

	// OTel collector — the OTLP ingest the emitted app exports to (4317 gRPC).
	otel := byKey["otel-collector"]
	if otel.Service.Image != "otel/opentelemetry-collector-contrib:latest" {
		t.Fatalf("otel-collector image: got %q", otel.Service.Image)
	}
	if otel.Service.InternalPort != 4317 {
		t.Fatalf("otel-collector OTLP gRPC port: want 4317, got %d", otel.Service.InternalPort)
	}
	if otel.Service.Role != stackmanifest.RoleObservability {
		t.Fatalf("otel-collector role: want observability, got %q", otel.Service.Role)
	}

	// SigNoz — traces/metrics/logs, volume /var/lib/signoz isolated per project.
	signoz := byKey["signoz"]
	if signoz.Service.Image != "signoz/signoz:latest" {
		t.Fatalf("signoz image: got %q", signoz.Service.Image)
	}
	if len(signoz.Volumes) == 0 {
		t.Fatalf("signoz must carry a per-project bind volume (/var/lib/signoz)")
	}

	// GlitchTip — error tracking, depends on postgres + valkey, distinct port.
	gt := byKey["glitchtip"]
	if gt.Service.Image != "glitchtip/glitchtip:latest" {
		t.Fatalf("glitchtip image: got %q", gt.Service.Image)
	}
	if gt.Service.Role != stackmanifest.RoleErrorTracking {
		t.Fatalf("glitchtip role: want errortracking, got %q", gt.Service.Role)
	}
	if gt.Service.InternalPort == signoz.Service.InternalPort {
		t.Fatalf("glitchtip must NOT collide with signoz on internal port %d", gt.Service.InternalPort)
	}
	deps := map[string]bool{}
	for _, d := range gt.Service.DependsOn {
		deps[d] = true
	}
	if !deps["postgres"] || !deps["valkey"] {
		t.Fatalf("glitchtip depends_on: want postgres+valkey, got %v", gt.Service.DependsOn)
	}

	// All three carry profile observability.
	for _, f := range frags {
		if f.Service.Profile != stackmanifest.ProfileObservability {
			t.Fatalf("%q profile: want observability, got %q", f.Key, f.Service.Profile)
		}
	}
}

// Given a project / When projecting its instrumentation / Then the emitted TS app
// wires @opentelemetry/* → SigNoz (via the collector) and its errors → GlitchTip — as
// DATA (env-var references, no hardcoded URL/secret), TS only (ADR 0040).
func TestFixture_AppInstrumentsWithOTelToSigNozErrorsToGlitchTip(t *testing.T) {
	const app = "shop"
	instr, err := observabilityfragments.EmittedInstrumentation(app, scope.EnvProd)
	if err != nil {
		t.Fatalf("emitted instrumentation: %v", err)
	}
	if instr.OTLPTarget != "otel-collector" {
		t.Fatalf("OTLP target: want otel-collector, got %q", instr.OTLPTarget)
	}
	if instr.DashboardTarget != "signoz" {
		t.Fatalf("dashboard target: want signoz, got %q", instr.DashboardTarget)
	}
	if instr.ErrorTarget != "glitchtip" {
		t.Fatalf("error target: want glitchtip, got %q", instr.ErrorTarget)
	}
	if instr.OTLPEndpointVar != "OTEL_EXPORTER_OTLP_ENDPOINT" {
		t.Fatalf("OTLP endpoint must be an env-var reference, got %q", instr.OTLPEndpointVar)
	}
	if instr.ErrorDSNVar != "GLITCHTIP_DSN" {
		t.Fatalf("error DSN must be an env-var reference, got %q", instr.ErrorDSNVar)
	}
	hasNodeSDK := false
	for _, p := range instr.Packages {
		if p == "@opentelemetry/sdk-node" {
			hasNodeSDK = true
		}
	}
	if !hasNodeSDK {
		t.Fatalf("instrumentation must import @opentelemetry/sdk-node (ADR 0040 TS), got %v", instr.Packages)
	}
}

// THE CAPITAL FIXTURE — end-to-end, NO truth is written by exploitation observability.
// Neither a fragment nor the emitted instrumentation carries a write-truth capability;
// the instrumentation is read-only on reality. The RealityMirror (E12) is the ONLY
// Kernel on-ramp.
func TestFixture_OpsObservabilityWritesNoTruth(t *testing.T) {
	const app = "shop"
	frags, err := observabilityfragments.SubstrateObservabilityFragments(app, scope.EnvProd)
	if err != nil {
		t.Fatalf("fragments: %v", err)
	}
	for _, f := range frags {
		if f.WritesTruth() {
			t.Fatalf("fragment %q must write NO truth (the wall §2)", f.Key)
		}
		for _, cap := range f.Capabilities() {
			if observabilityfragments.IsTruthWriteCapability(cap) {
				t.Fatalf("fragment %q carries truth-write capability %q (forbidden)", f.Key, cap)
			}
		}
	}
	instr, err := observabilityfragments.EmittedInstrumentation(app, scope.EnvProd)
	if err != nil {
		t.Fatalf("instrumentation: %v", err)
	}
	if instr.WritesTruth() {
		t.Fatalf("emitted instrumentation must write NO truth (the wall §2)")
	}
	if !instr.ReadOnlyReality {
		t.Fatalf("emitted instrumentation must be read-only on reality")
	}
	// A truth-write capability is correctly DETECTED when present (the predicate is not
	// vacuously false) — fault-injection of the oracle itself.
	if !observabilityfragments.IsTruthWriteCapability("write:kernel") {
		t.Fatalf("IsTruthWriteCapability must catch write:kernel (else the wall guard is dead)")
	}
	if observabilityfragments.IsTruthWriteCapability("observe:store-traces") {
		t.Fatalf("IsTruthWriteCapability must NOT flag a read-only observe capability")
	}
}
