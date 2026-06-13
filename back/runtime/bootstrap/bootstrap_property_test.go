package bootstrap_test

// Property mirror (∀ N1) for DP12 — the deterministic one-shot BOOTSTRAP
// emitter (ROADMAP-provisioning-deploy, on the DP10 measured GO + ADR 0067).
// reflects=runtime.bootstrap, test_kind=property, cert_language=rapid,
// liveness=live. Written FIRST and red (no non-test Go file → compile fail),
// then green — the red IS the /goal (CLAUDE.md §6, determinism-first §8).
//
// The laws (DP12 done-criteria):
//
//  1. DETERMINISM / REPLAY. Same (bundle, host state, secrets) → the same
//     ordered event sequence, every time — a PROJECTION, never a prompt.
//  2. DETERMINISTIC PORT RESOLUTION. Two resolutions of the SAME host state
//     yield the SAME free port; the resolved port is ≥ the base AND not in the
//     occupied set (ss ∪ docker ps) — first-free-≥-base, a pure rule.
//  3. CLOSED ORDERED SET. A successful sequence is EXACTLY the ten declared
//     kinds in the declared order; every emitted kind is in the closed set
//     (no monster), seqs are 1-based and contiguous.
//  4. MISSING SECRET FAILS CLOSED. A required secret absent from the store ⇒
//     MISSING_SECRET_AT_BOOT (actionable how_to_fix ≥ 1) and ZERO events —
//     never a partial start with a blank credential.
//  5. THE WALL — NO SECRET / NO HARDCODED ENDPOINT IN THE EMITTED SEQUENCE.
//     ∀ events: no localhost, no IP literal, no literal domain, no raw secret
//     value; the concrete .env + secrets live in the appliance at boot, never
//     in the projection (below the line).

import (
	"regexp"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/bootstrap"
	"github.com/steph-frtech/aidos/back/runtime/secretstore"
	"pgregory.net/rapid"
)

var ipLiteral = regexp.MustCompile(`\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`)

// drawHostState draws a host snapshot: a random set of occupied ports rendered
// as ss + docker ps lines (the observed state AS DATA).
func drawHostState(rt *rapid.T) bootstrap.HostState {
	n := rapid.IntRange(0, 8).Draw(rt, "nPorts")
	var ss, ps strings.Builder
	for i := 0; i < n; i++ {
		p := rapid.IntRange(1, 200).Draw(rt, "port")
		if rapid.Bool().Draw(rt, "viaSS") {
			ss.WriteString("LISTEN 0 128 0.0.0.0:")
			ss.WriteString(itoa(p))
			ss.WriteString(" \n")
		} else {
			ps.WriteString("0.0.0.0:")
			ps.WriteString(itoa(p))
			ps.WriteString("->")
			ps.WriteString(itoa(p))
			ps.WriteString("/tcp\n")
		}
	}
	return bootstrap.HostState{SSOutput: ss.String(), DockerPSOutput: ps.String()}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [8]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

// drawBundle draws a well-formed minimal bundle (server + datastore + edge),
// with a random number of declared connector scopes (the required-secret set).
func drawBundle(rt *rapid.T) stackmanifest.StackManifest {
	nScopes := rapid.IntRange(0, 3).Draw(rt, "nScopes")
	scopes := make([]string, 0, nScopes)
	for i := 0; i < nScopes; i++ {
		scopes = append(scopes, rapid.StringMatching(`[a-z]{2,8}`).Draw(rt, "scope"))
	}
	return stackmanifest.StackManifest{
		AppName: rapid.StringMatching(`[a-z][a-z0-9-]{0,10}`).Draw(rt, "app"),
		Services: []stackmanifest.Service{
			{Name: "server", Role: stackmanifest.RoleServer, InternalPort: 3000, Profile: stackmanifest.ProfileCore},
			{Name: "db", Role: stackmanifest.RoleDatastore, Image: "postgres:17", InternalPort: 5432, Profile: stackmanifest.ProfileCore},
			{Name: "edge", Role: stackmanifest.RoleObservability, Image: "traefik:v3", InternalPort: 80, Profile: stackmanifest.ProfileCore},
		},
		Network:         stackmanifest.Network{Name: "traefik_default", External: true},
		ConnectorScopes: scopes,
	}
}

// allPresent builds a SecretsState that satisfies every required secret of a
// bundle (so the bootstrap may proceed).
func allPresent(b stackmanifest.StackManifest) bootstrap.SecretsState {
	return bootstrap.SecretsState{Present: bootstrap.RequiredSecrets(b)}
}

// TestReplayIsDeterministic — law 1: same inputs → same sequence (the
// reproducibility mirror; determinism-first §6).
func TestReplayIsDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := drawBundle(rt)
		host := drawHostState(rt)
		secrets := allPresent(b)
		a, brA := bootstrap.EmitBootstrapSequence(b, host, secrets)
		c, brC := bootstrap.EmitBootstrapSequence(b, host, secrets)
		if (brA == nil) != (brC == nil) {
			t.Fatalf("non-deterministic block: %v vs %v", brA, brC)
		}
		if brA != nil {
			return // both blocked identically (no required secret missing here, defensive)
		}
		if a.Hash() != c.Hash() {
			t.Fatalf("non-deterministic sequence: %s vs %s", a.Hash(), c.Hash())
		}
	})
}

// TestPortResolutionIsDeterministicAndFree — law 2.
func TestPortResolutionIsDeterministicAndFree(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		host := drawHostState(rt)
		p1 := bootstrap.ResolvePort(host)
		p2 := bootstrap.ResolvePort(host)
		if p1 != p2 {
			t.Fatalf("port resolution is not deterministic: %d vs %d (must be a pure rule, never a prompt)", p1, p2)
		}
		if p1 < bootstrap.BasePort {
			t.Fatalf("resolved port %d < base %d", p1, bootstrap.BasePort)
		}
		occupied := bootstrap.OccupiedFrom(host)
		if occupied[p1] {
			t.Fatalf("resolved port %d is occupied (ss ∪ docker ps) — resolution must pick a FREE port", p1)
		}
		// first-free-≥-base: every port in [base, p1) is occupied.
		for p := bootstrap.BasePort; p < p1; p++ {
			if !occupied[p] {
				t.Fatalf("port %d is free but resolution skipped to %d — must pick the FIRST free ≥ base", p, p1)
			}
		}
	})
}

// TestSuccessIsTheClosedOrderedSet — law 3.
func TestSuccessIsTheClosedOrderedSet(t *testing.T) {
	want := bootstrap.OrderedKinds()
	rapid.Check(t, func(rt *rapid.T) {
		b := drawBundle(rt)
		host := drawHostState(rt)
		seq, br := bootstrap.EmitBootstrapSequence(b, host, allPresent(b))
		if br != nil {
			t.Fatalf("a satisfied bundle must bootstrap, got block %q", br.Code)
		}
		if len(seq.Events) != len(want) {
			t.Fatalf("got %d events, want the %d-member closed ordered set", len(seq.Events), len(want))
		}
		for i, e := range seq.Events {
			if e.Kind != want[i] {
				t.Fatalf("event %d = %q, want %q (the order is part of the contract)", i, e.Kind, want[i])
			}
			if !bootstrap.IsKnownKind(e.Kind) {
				t.Fatalf("event kind %q is outside the closed set", e.Kind)
			}
			if e.Seq != i+1 {
				t.Fatalf("event %d carries seq %d, want %d", i, e.Seq, i+1)
			}
		}
	})
}

// TestMissingSecretFailsClosed — law 4.
func TestMissingSecretFailsClosed(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := drawBundle(rt)
		required := bootstrap.RequiredSecrets(b)
		if len(required) == 0 {
			return // nothing to omit
		}
		// omit a random required secret.
		drop := rapid.IntRange(0, len(required)-1).Draw(rt, "drop")
		present := make([]string, 0, len(required)-1)
		for i, s := range required {
			if i != drop {
				present = append(present, s)
			}
		}
		host := drawHostState(rt)
		seq, br := bootstrap.EmitBootstrapSequence(b, host, bootstrap.SecretsState{Present: present})
		if br == nil {
			t.Fatalf("a missing required secret (%s) MUST fail closed", required[drop])
		}
		if br.Code != blockreason.CodeMissingSecretAtBoot {
			t.Fatalf("missing secret block = %q, want MISSING_SECRET_AT_BOOT", br.Code)
		}
		if len(br.HowToFix) == 0 {
			t.Fatal("an empty how_to_fix is a prison (KRD §44.5)")
		}
		if len(seq.Events) != 0 {
			t.Fatalf("a blocked bootstrap emits ZERO event, got %d", len(seq.Events))
		}
	})
}

// TestWallNoSecretNoHardcodedEndpoint — law 5: the projection leaks no secret
// value and no hardcoded endpoint.
func TestWallNoSecretNoHardcodedEndpoint(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		b := drawBundle(rt)
		// give each required secret a concrete (real-looking) VALUE, present in a
		// store: the projection must never echo the value, only the env-var name.
		store, _ := secretstore.NewWithSealer(secretstore.DeriveKey("dp12"), secretstore.NewFixedSealer("dp12"))
		values := map[string]string{}
		for _, scope := range b.ConnectorScopes {
			val := "S3CR3T-" + scope + "-abcdef0123456789"
			_ = store.Set("demo", scope, val)
			values[secretstore.EnvVar(scope)] = val
		}
		host := drawHostState(rt)
		seq, br := bootstrap.EmitBootstrapSequence(b, host, allPresent(b))
		if br != nil {
			t.Fatalf("must bootstrap: %q", br.Code)
		}
		for _, e := range seq.Events {
			text := string(e.Kind) + " " + e.Detail
			low := strings.ToLower(text)
			if strings.Contains(low, "localhost") {
				t.Fatalf("event %q leaks a hardcoded localhost: %q", e.Kind, e.Detail)
			}
			if ipLiteral.MatchString(e.Detail) {
				t.Fatalf("event %q leaks an IP literal: %q", e.Kind, e.Detail)
			}
			for _, dom := range []string{"sagedesk", ".fr", ".com", ".io", ".net"} {
				if strings.Contains(low, dom) {
					t.Fatalf("event %q leaks a literal domain %q: %q", e.Kind, dom, e.Detail)
				}
			}
			for _, val := range values {
				if val != "" && strings.Contains(e.Detail, val) {
					t.Fatalf("event %q leaks a raw secret VALUE: %q", e.Kind, e.Detail)
				}
			}
		}
	})
}
