// identity_property_test.go — BA18 (agentloop side): the reproducibility + invariant mirror
// for the loop's presented identity. Same loop input ⇒ same presented token
// (determinism-first), and the binding invariant: the loop's token authenticates it against
// EXACTLY its own impl's LayerRef and no other (owner_agent is not forgeable from the loop
// side either).
package agentloop

import (
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"pgregory.net/rapid"
)

// REPRODUCIBILITY: PresentedToken is a pure function of the loop's impl — same impl ⇒ same
// token, repeatedly (no clock/rng/I/O).
func TestProp_LoopIdentity_PresentDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		ref := rapid.StringMatching(`[a-z]+:[a-z]+@v[0-9]+`).Draw(t, "ref")
		in := DriveInput{Impl: loopImpl(ref)}
		t1 := PresentedToken(in)
		t2 := PresentedToken(in)
		if t1 != t2 {
			t.Fatalf("PresentedToken is non-deterministic for %q: %q != %q", ref, t1, t2)
		}
		if len(t1) != 64 {
			t.Fatalf("the presented token must be a 64-hex content-hash; got len %d", len(t1))
		}
	})
}

// INVARIANT: the loop verifies against its OWN LayerRef and is REFUSED for every other — the
// presented token binds the process to EXACTLY one CoucheAgent@version (the done-criterion:
// "a call is accepted only if the token binds the process to that CoucheAgent@version").
func TestProp_LoopIdentity_ActsAsExactlyOneIdentity(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		mine := rapid.StringMatching(`[a-z]+:[a-z]+@v[0-9]+`).Draw(t, "mine")
		other := rapid.StringMatching(`[a-z]+:[a-z]+@v[0-9]+`).Draw(t, "other")

		in := DriveInput{Impl: loopImpl(mine)}

		if v := ActAsIdentity(in, mine); !v.Verified {
			t.Fatalf("the loop must verify as its own LayerRef %q", mine)
		}

		if other != mine {
			v := ActAsIdentity(in, other)
			if v.Verified {
				t.Fatalf("the loop projecting %q must NOT act as %q (no forgeable owner)", mine, other)
			}
			if v.Reason == nil || v.Reason.Code != blockreason.CodeAgentIdentityUnverified {
				t.Fatalf("wrong-identity refusal must be AGENT_IDENTITY_UNVERIFIED; got %+v", v.Reason)
			}
		}
	})
}

// INVARIANT (consistency with agentimpl): the loop side and the server side agree — what the
// loop PRESENTS (PresentedToken) is exactly what a server EXPECTS (agentimpl.MintTokenFor) for
// the loop's identity, so the round-trip always verifies.
func TestProp_LoopIdentity_PresentMatchesServerExpectation(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		ref := rapid.StringMatching(`[a-z]+:[a-z]+@v[0-9]+`).Draw(t, "ref")
		in := DriveInput{Impl: loopImpl(ref)}

		presented := PresentedToken(in)
		expected := agentimpl.MintTokenFor(ref)
		if presented != expected {
			t.Fatalf("the loop's presented token %q must equal the server's expected token %q", presented, expected)
		}
	})
}
