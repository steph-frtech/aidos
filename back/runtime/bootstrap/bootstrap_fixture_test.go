package bootstrap_test

// Fixture mirror (N2 state → command → events) for DP12 — the deterministic
// one-shot BOOTSTRAP emitter (ROADMAP-provisioning-deploy, on the DP10 measured
// GO + ADR 0067, reusing DP04 envemit / S91 secretstore / DP02 stackmanifest).
//
// reflects=runtime.bootstrap, test_kind=fixture, cert_language=fixture,
// liveness=live. Written FIRST and red (the bootstrap package has no non-test
// Go file yet → compile fail), then green — the red IS the /goal (CLAUDE.md §6).
//
// THE STATE → COMMAND → EVENTS contract (DP12 done-criteria). The command is
// `bootstrap` over an emitted bundle (a StackManifest) + the observed host
// state (ss + docker ps AS DATA) + the project's secret store. It is a PURE
// PROJECTION (never a real docker run — the execution stays gated like the DP10
// spike): EmitBootstrapSequence renders the CLOSED, ORDERED event set
//
//	network-created → volumes-created → env-materialized → secrets-checked →
//	ports-resolved → traefik-up → datastore-up → server-up → healthy →
//	urls-printed
//
// or a fail-closed BlockReason:
//
//	A nominal bundle + a clean host    -> the full ordered sequence, port 80
//	B a required secret missing        -> MISSING_SECRET_AT_BOOT (actionable)
//	C the base port occupied on the host -> the next free port, resolved purely
//	D the same (bundle, host, secrets) -> the byte-identical sequence (replay)
//
// Rows A, B and C ARE the done criteria; the wall: the concrete .env + secrets
// live in the appliance at boot (chmod 600, gitignored), NEVER in the emitted
// source / truth-store / git (below the line).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/bootstrap"
)

// nominalBundle is the DP12 representative emitted bundle: a traefik front, a
// postgres datastore, a server (the SPEC-stack-2026 minimal one-shot), one bind
// volume and one declared connector scope (so a secret is required at boot).
func nominalBundle() stackmanifest.StackManifest {
	return stackmanifest.StackManifest{
		AppName: "demo",
		Services: []stackmanifest.Service{
			{Name: "server", Role: stackmanifest.RoleServer, InternalPort: 3000, Profile: stackmanifest.ProfileCore, Healthcheck: "wget -q --spider http://localhost:3000/health", DependsOn: []string{"db"}},
			{Name: "db", Role: stackmanifest.RoleDatastore, Image: "postgres:17", InternalPort: 5432, Profile: stackmanifest.ProfileCore, Healthcheck: "pg_isready -U app"},
			{Name: "edge", Role: stackmanifest.RoleObservability, Image: "traefik:v3", InternalPort: 80, Profile: stackmanifest.ProfileCore},
		},
		Volumes:         []stackmanifest.Volume{{Name: "data", DeviceVar: "APP_DATA_PATH"}},
		Network:         stackmanifest.Network{Name: "traefik_default", External: true},
		ConnectorScopes: []string{"crm"},
	}
}

// cleanHost is the observed host snapshot with NO port in the bootstrap base
// range occupied — ss + docker ps AS DATA (DP10 spike convention).
func cleanHost() bootstrap.HostState {
	return bootstrap.HostState{
		SSOutput:       "State  Recv-Q Send-Q Local Address:Port\nLISTEN 0      128          0.0.0.0:22 \n",
		DockerPSOutput: "0.0.0.0:5433->5432/tcp\n",
	}
}

// presentSecrets carries the one secret the nominal bundle's connector scope
// declares it requires at boot — the boot may proceed.
func presentSecrets() bootstrap.SecretsState {
	return bootstrap.SecretsState{Present: []string{secretEnvVar("crm")}}
}

// secretEnvVar mirrors secretstore.EnvVar for the fixture's expectations.
func secretEnvVar(scope string) string { return "APP_SECRET_" + upper(scope) }

func upper(s string) string {
	out := []byte(s)
	for i, c := range out {
		if c >= 'a' && c <= 'z' {
			out[i] = c - 32
		}
	}
	return string(out)
}

// --- Row A: a nominal bundle + a clean host yields the full ordered sequence ---

func TestFixture_A_Nominal_yields_full_ordered_sequence(t *testing.T) {
	seq, br := bootstrap.EmitBootstrapSequence(nominalBundle(), cleanHost(), presentSecrets())
	if br != nil {
		t.Fatalf("row A: nominal bootstrap blocked unexpectedly: %s", blockreason.Render(*br))
	}
	want := []bootstrap.EventKind{
		bootstrap.EventNetworkCreated,
		bootstrap.EventVolumesCreated,
		bootstrap.EventEnvMaterialized,
		bootstrap.EventSecretsChecked,
		bootstrap.EventPortsResolved,
		bootstrap.EventTraefikUp,
		bootstrap.EventDatastoreUp,
		bootstrap.EventServerUp,
		bootstrap.EventHealthy,
		bootstrap.EventURLsPrinted,
	}
	if len(seq.Events) != len(want) {
		t.Fatalf("row A: got %d events, want the %d-member closed set: %+v", len(seq.Events), len(want), seq.Events)
	}
	for i, kind := range want {
		if seq.Events[i].Kind != kind {
			t.Fatalf("row A: event %d = %q, want %q (the ORDER is part of the contract)", i, seq.Events[i].Kind, kind)
		}
		if seq.Events[i].Seq != i+1 {
			t.Fatalf("row A: event %d carries seq %d, want %d (1-based, contiguous)", i, seq.Events[i].Seq, i+1)
		}
	}
	// the resolved port surfaces on ports-resolved (clean host → the base port).
	if seq.ResolvedPort != bootstrap.BasePort {
		t.Fatalf("row A: clean host must resolve the base port %d, got %d", bootstrap.BasePort, seq.ResolvedPort)
	}
}

// TestFixture_A_EveryKind_is_in_the_closed_set guards the completeness of the
// emitted kinds against the declared closed enum (no monster kind).
func TestFixture_A_EveryKind_is_in_the_closed_set(t *testing.T) {
	seq, br := bootstrap.EmitBootstrapSequence(nominalBundle(), cleanHost(), presentSecrets())
	if br != nil {
		t.Fatalf("nominal bootstrap blocked: %s", blockreason.Render(*br))
	}
	for _, e := range seq.Events {
		if !bootstrap.IsKnownKind(e.Kind) {
			t.Fatalf("emitted event kind %q is outside the closed set %v", e.Kind, bootstrap.Kinds())
		}
	}
	if got := len(bootstrap.Kinds()); got != 10 {
		t.Fatalf("the bootstrap event set is CLOSED at 10, got %d", got)
	}
}

// --- Row B: a missing required secret is a fail-closed BlockReason ---

func TestFixture_B_MissingSecret_blocks_at_boot(t *testing.T) {
	// the connector scope `crm` requires APP_SECRET_CRM, but the store has none.
	seq, br := bootstrap.EmitBootstrapSequence(nominalBundle(), cleanHost(), bootstrap.SecretsState{})
	if br == nil {
		t.Fatal("row B: a required secret missing at boot MUST be blocked, never started with a blank credential")
	}
	if br.Code != blockreason.CodeMissingSecretAtBoot {
		t.Fatalf("row B: block code = %q, want MISSING_SECRET_AT_BOOT", br.Code)
	}
	if len(br.HowToFix) == 0 {
		t.Fatal("row B: a BlockReason with an empty how_to_fix is a prison (KRD §44.5)")
	}
	if len(seq.Events) != 0 {
		t.Fatalf("row B: a blocked bootstrap emits NO event, got %d", len(seq.Events))
	}
}

// --- Row C: an occupied base port is resolved DETERMINISTICALLY (never a prompt) ---

func TestFixture_C_OccupiedPort_resolves_next_free_deterministically(t *testing.T) {
	// the host has the base port (and the next two) occupied — ss + docker ps.
	busy := bootstrap.HostState{
		SSOutput:       "LISTEN 0 128 0.0.0.0:80 \nLISTEN 0 128 0.0.0.0:81 \n",
		DockerPSOutput: "0.0.0.0:82->80/tcp\n",
	}
	seq, br := bootstrap.EmitBootstrapSequence(nominalBundle(), busy, presentSecrets())
	if br != nil {
		t.Fatalf("row C: bootstrap blocked unexpectedly: %s", blockreason.Render(*br))
	}
	if bootstrap.BasePort != 80 {
		t.Skip("base port changed — adjust the fixture's occupied set")
	}
	if seq.ResolvedPort != 83 {
		t.Fatalf("row C: base 80,81,82 occupied → must resolve 83 (first free ≥ base), got %d", seq.ResolvedPort)
	}
	// the ports-resolved event detail names the resolved port.
	var found bool
	for _, e := range seq.Events {
		if e.Kind == bootstrap.EventPortsResolved {
			found = true
			if e.Detail == "" {
				t.Fatal("row C: ports-resolved event must carry the resolved port in its detail")
			}
		}
	}
	if !found {
		t.Fatal("row C: the sequence must contain a ports-resolved event")
	}
}

// --- Row D: replay — the same (bundle, host, secrets) yields the same sequence ---

func TestFixture_D_Replay_is_byte_identical(t *testing.T) {
	a, brA := bootstrap.EmitBootstrapSequence(nominalBundle(), cleanHost(), presentSecrets())
	b, brB := bootstrap.EmitBootstrapSequence(nominalBundle(), cleanHost(), presentSecrets())
	if brA != nil || brB != nil {
		t.Fatalf("row D: replay blocked: %v %v", brA, brB)
	}
	if a.Hash() != b.Hash() {
		t.Fatalf("row D: same (bundle, host, secrets) must yield the byte-identical sequence:\n %s\n %s", a.Hash(), b.Hash())
	}
}

// TestFixture_RequiredSecretsAreDerivedFromTheBundle pins that the required
// secret set is DERIVED from the manifest's connector scopes (DP04 envemit
// motif reused), never invented — the missing-key set-difference is honest.
func TestFixture_RequiredSecretsAreDerivedFromTheBundle(t *testing.T) {
	got := bootstrap.RequiredSecrets(nominalBundle())
	if len(got) != 1 || got[0] != secretEnvVar("crm") {
		t.Fatalf("required secrets = %v, want exactly [%s] (one per declared connector scope)", got, secretEnvVar("crm"))
	}
	// a bundle with no connector scope requires no secret.
	bare := nominalBundle()
	bare.ConnectorScopes = nil
	if got := bootstrap.RequiredSecrets(bare); len(got) != 0 {
		t.Fatalf("a bundle with no connector scope requires no secret, got %v", got)
	}
}
