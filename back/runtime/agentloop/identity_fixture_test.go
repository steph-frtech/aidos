// identity_fixture_test.go — BA18 (agentloop side): the RED fixture + fault-injection mirror
// for the loop PRESENTING its capability token. The pure derivation/verification lives in
// agentimpl (identity.go); HERE the loop side is proven: the loop derives the token it
// presents on every MCP call FROM ITS OWN AgentImplementation (PresentedToken), and a guard
// (ActAsIdentity) accepts the loop's action toward a server expecting a CoucheAgent@version
// ONLY when the loop's presented token binds it to EXACTLY that identity.
//
// THE FIXTURE (state → cmd → events), the roadmap verbatim:
//   - the loop's PresentedToken equals the token agentimpl mints for the loop's own impl
//     (the loop cannot mint a token for an identity it does not project);
//   - a call to a server expecting the loop's OWN identity is ACCEPTED;
//   - a call to a server expecting ANOTHER identity is REFUSED (AGENT_IDENTITY_UNVERIFIED) —
//     owner_agent is PROVEN by the token, not chain-declared;
//   - an EMPTY presented token (a loop with no resolved identity) is REFUSED fail-closed.
//
// Written RED first (PresentedToken / ActAsIdentity below do not exist yet): `go test` fails
// to COMPILE → that compile-red IS the /goal.
package agentloop

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// loopImpl is the confined projection the loop runs under; its content-hash IS the loop's
// identity (the token it presents binds it to this CoucheAgent@version).
func loopImpl(layerRef string) agentimpl.AgentImplementation {
	return agentimpl.AgentImplementation{
		LayerRef:       layerRef,
		Role:           "executor",
		Model:          "claude",
		Provider:       agentlayer.ProviderAnthropic,
		AllowedPaths:   []string{"apps/demo/"},
		ForbiddenPaths: agentimpl.WallForbiddenPaths(),
		ResourceLimits: agentlayer.ResourceLimits{MaxMemoryMB: 256, MaxCPUMillis: 1000, MaxWallSeconds: 30},
	}
}

// FIXTURE 1 — the loop presents the content-hash of its OWN impl: PresentedToken is exactly
// what agentimpl.MintToken derives from the loop's impl (the loop cannot present a token for
// an identity it does not project).
func TestFixture_LoopIdentity_PresentsOwnContentHash(t *testing.T) {
	impl := loopImpl("agent:builder@v1")
	in := DriveInput{Impl: impl}

	if got, want := PresentedToken(in), agentimpl.MintToken(impl); got != want {
		t.Fatalf("the loop must present the content-hash of its own impl; got %q want %q", got, want)
	}
}

// FIXTURE 2 — a call toward a server expecting the loop's OWN identity is ACCEPTED.
func TestFixture_LoopIdentity_ActAsOwnIdentityAccepted(t *testing.T) {
	impl := loopImpl("agent:builder@v1")
	in := DriveInput{Impl: impl}

	v := ActAsIdentity(in, impl.LayerRef)
	if !v.Verified {
		t.Fatalf("the loop acting as its own identity must verify; got %+v", v)
	}
	if v.Reason != nil {
		t.Fatalf("an accepted verdict carries no BlockReason; got %+v", v.Reason)
	}
}

// FIXTURE 3 (FAULT INJECTION) — a call toward a server expecting ANOTHER identity is REFUSED:
// the loop projecting agent:builder@v1 cannot act as agent:other@v9. The owner is proven by
// the token, not chain-declared.
func TestFixture_LoopIdentity_ActAsOtherIdentityRefused(t *testing.T) {
	impl := loopImpl("agent:builder@v1")
	in := DriveInput{Impl: impl}

	v := ActAsIdentity(in, "agent:other@v9")
	if v.Verified {
		t.Fatalf("the loop must NOT verify as an identity it does not project (no forgeable owner)")
	}
	if v.Reason == nil || v.Reason.Code != blockreason.CodeAgentIdentityUnverified {
		t.Fatalf("a wrong-identity refusal must be AGENT_IDENTITY_UNVERIFIED; got %+v", v.Reason)
	}
	if len(v.Reason.HowToFix) == 0 {
		t.Fatalf("the BlockReason must carry a non-empty how_to_fix (no prison)")
	}
}

// FIXTURE 4 — a loop with NO resolved identity (empty LayerRef ⇒ a token over an empty
// identity) cannot act as a non-empty identity: presenting a token bound to "" never
// authenticates as a real CoucheAgent@version.
func TestFixture_LoopIdentity_NoIdentityRefused(t *testing.T) {
	in := DriveInput{Impl: loopImpl("")}

	v := ActAsIdentity(in, "agent:builder@v1")
	if v.Verified {
		t.Fatalf("a loop with no resolved identity must NOT verify as a real identity (fail-closed)")
	}
	if v.Reason == nil || v.Reason.Code != blockreason.CodeAgentIdentityUnverified {
		t.Fatalf("refusal must carry AGENT_IDENTITY_UNVERIFIED; got %+v", v.Reason)
	}
}
