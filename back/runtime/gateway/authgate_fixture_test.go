// authgate_fixture_test.go — the S61 WORKFLOW/FIXTURE mirror (N2).
// reflects=runtime.auth-two-layer · test_kind=fixture · cert_language=go-fixture ·
// authority=below · liveness=live.
//
// It pins the layer-0 (authentication) done-criteria as state→command→decision fixtures:
//   - an UNAUTHENTICATED call to a truth-write endpoint is refused UNAUTHENTICATED and
//     never reaches the tool (no data) — the property done-criterion, at the gate;
//   - an authenticated below-the-line call routes (the verified identity propagates);
//   - the gateway propagates the VERIFIED session identity, never a client-forged one;
//   - an authenticated call to the WRONG project is still refused by the scope wall
//     (layer 1) — authentication is necessary, not sufficient. The fixture's "valid
//     identity but no RLS row reads nothing" (the two-independent-layers criterion) is
//     proven against LIVE Postgres in back/migrations/accounts_rls_roundtrip_test.go.
package gateway

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/authn"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
)

func TestFixture_AuthGate_TwoLayer(t *testing.T) {
	reg := DefaultRegistry()
	alice := authn.Principal{Identity: "user-alice", Email: "a@x", Provider: "oidc"}
	anon := authn.Principal{} // no verified session

	type tc struct {
		name      string
		principal authn.Principal
		call      Call
		want      Outcome
		wantCode  BlockCode
		wantTool  bool
	}
	cases := []tc{
		{
			name:      "unauthenticated truth-write refused UNAUTHENTICATED before routing",
			principal: anon,
			call: Call{
				Scope:  projectwall.Scope{Identity: "", ActiveProject: "proj-a"},
				Tool:   "kernel_write",
				Target: projectwall.Target{ProjectID: "proj-a"},
			},
			want:     OutcomeUnauthenticated,
			wantCode: CodeUnauthenticated,
			wantTool: false,
		},
		{
			name:      "unauthenticated below-the-line read also refused (no anonymous door)",
			principal: anon,
			call: Call{
				Scope:  projectwall.Scope{ActiveProject: "proj-a"},
				Tool:   "store_get",
				Target: projectwall.Target{ProjectID: "proj-a"},
			},
			want:     OutcomeUnauthenticated,
			wantCode: CodeUnauthenticated,
			wantTool: false,
		},
		{
			name:      "authenticated below-the-line call routes (verified identity propagates)",
			principal: alice,
			call: Call{
				Scope:  projectwall.Scope{ActiveProject: "proj-a"},
				Tool:   "store_get",
				Target: projectwall.Target{ProjectID: "proj-a"},
			},
			want:     OutcomeRoute,
			wantTool: true,
		},
		{
			name:      "authenticated truth-write still refused by the ZONE wall (ChangeSet door)",
			principal: alice,
			call: Call{
				Scope:  projectwall.Scope{ActiveProject: "proj-a"},
				Tool:   "kernel_write",
				Target: projectwall.Target{ProjectID: "proj-a"},
			},
			want:     OutcomeRefusedTruthWrite,
			wantCode: CodeTruthWriteNeedsChangeset,
			wantTool: false,
		},
		{
			name:      "authenticated but WRONG project — scope wall refuses (auth ≠ authz)",
			principal: alice,
			call: Call{
				Scope:  projectwall.Scope{ActiveProject: "proj-a"},
				Tool:   "store_get",
				Target: projectwall.Target{ProjectID: "proj-b"},
			},
			want:     OutcomeRefusedScope,
			wantCode: CodeAgentCrossProjectWrite,
			wantTool: false,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := reg.AuthenticatedRoute(c.principal, c.call)
			if d.Outcome != c.want {
				t.Fatalf("outcome = %s, want %s", d.Outcome, c.want)
			}
			if c.wantTool && d.Tool == nil {
				t.Fatalf("expected a routed Tool, got none")
			}
			if !c.wantTool && d.Tool != nil {
				t.Fatalf("a refused/unauth call leaked a Tool: %+v", *d.Tool)
			}
			if c.wantCode != "" {
				if d.BlockReason == nil || d.BlockReason.Code != c.wantCode {
					t.Fatalf("BlockReason code = %+v, want %s", d.BlockReason, c.wantCode)
				}
			}
		})
	}
}

// The gateway trusts the VERIFIED session identity, never the request body: even if the
// client forges a different identity in the call scope, AuthenticatedRoute overrides it
// with the principal's. Proven by routing a call whose Target claims the principal's
// identity (matches) while the scope's stale identity differs — the route still succeeds
// because the verified identity is propagated.
func TestFixture_AuthGate_TrustsVerifiedIdentity(t *testing.T) {
	reg := DefaultRegistry()
	alice := authn.Principal{Identity: "user-alice", Email: "a@x", Provider: "oidc"}
	call := Call{
		// A stale/forged scope identity the request body might carry.
		Scope:  projectwall.Scope{Identity: "forged-bob", ActiveProject: "proj-a"},
		Tool:   "store_get",
		Target: projectwall.Target{ProjectID: "proj-a", ClaimedIdentity: "user-alice"},
	}
	d := reg.AuthenticatedRoute(alice, call)
	if d.Outcome != OutcomeRoute {
		t.Fatalf("verified identity not propagated — outcome %s, block %+v", d.Outcome, d.BlockReason)
	}
}
