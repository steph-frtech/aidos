// identity.go — BA18 (agentloop side): the loop PRESENTS its capability token. The pure
// token derivation/verification lives in agentimpl (identity.go); HERE the loop binds itself
// to its OWN identity. On every MCP call the loop will present PresentedToken(in) — the
// content-hash of the AgentImplementation it runs under (its CoucheAgent@version). A server
// re-derives the expected token for the identity it is asked to act for and accepts the call
// ONLY when the two match (agentimpl.VerifyToken). ActAsIdentity is the loop-side guard that
// proves, before the loop attempts to act as some CoucheAgent@version, that its presented
// token binds it to EXACTLY that identity — so owner_agent is PROVEN, never chain-declared.
//
// THE WALL (CLAUDE.md §2): the writer's identity is proven. The loop cannot mint a token for
// an identity it does not project (the token is the content-hash of its own confined impl),
// and cannot act as another CoucheAgent@version (the hash differs ⇒ VerifyToken refuses).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): PresentedToken and ActAsIdentity are PURE, TOTAL
// functions — they delegate to agentimpl's pure hashing/compare; no DB, clock, rng, or I/O.
// This is a hashing+equality problem — code, never an LLM. The reproducibility mirror
// (identity_property_test.go) pins same input ⇒ same token.
package agentloop

import "github.com/steph-frtech/aidos/back/runtime/agentimpl"

// PresentedToken is the capability token the loop presents on EVERY MCP call: the content-hash
// of the AgentImplementation it runs under (its CoucheAgent@version via LayerRef). It is what
// the loop offers as proof of identity; a server verifies it with agentimpl.VerifyToken. PURE
// and TOTAL — same impl ⇒ same token. The loop cannot present a token for an identity it does
// not project, because the hash is derived from its own governed, content-addressed impl.
func PresentedToken(in DriveInput) agentimpl.CapabilityToken {
	return agentimpl.MintToken(in.Impl)
}

// ActAsIdentity is the loop-side guard run before the loop attempts to act as a given
// CoucheAgent@version (expectedLayerRef) toward an MCP server: it verifies the loop's OWN
// presented token binds it to EXACTLY that identity. The done-criterion descended to the loop:
// a call is accepted ONLY if the token binds the process to that CoucheAgent@version. A loop
// projecting agent:builder@v1 cannot act as agent:other@v9 (the hashes differ), and a loop
// with no resolved identity (empty LayerRef) cannot act as any real identity — both refused
// fail-closed with AGENT_IDENTITY_UNVERIFIED. PURE and TOTAL (delegates to agentimpl).
func ActAsIdentity(in DriveInput, expectedLayerRef string) agentimpl.IdentityVerdict {
	return agentimpl.VerifyToken(PresentedToken(in), expectedLayerRef)
}
