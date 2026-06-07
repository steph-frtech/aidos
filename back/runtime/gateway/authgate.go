// authgate.go — the S61 AUTHENTICATION GATE wired UPSTREAM of the S58 router. It is the
// composition seam where the auth core (back/runtime/authn, layer 0) runs BEFORE the
// project-scope/truth-zone walls (Route). The ordering IS the defense:
//
//	authentication (layer 0) → scope (layer 1, projectwall) → zone (layer 1, registry)
//	                                                        ↘ RLS (layer 2, Postgres)
//
// An UNAUTHENTICATED call is refused before Route runs — it reaches NO project data (the
// property done-criterion). Auth is NEVER gateway-only: the resolved principal's identity
// is the SAME value SET LOCAL app.identity gives the RLS (authn.Principal.GUCs), so a
// gateway bug cannot widen what the RLS sees (the two layers redden independently).
//
// gateway imports authn (a leaf); authn never imports gateway (no cycle). DETERMINISM:
// AuthenticatedRoute is pure — same (principal, call) ⇒ same decision.
package gateway

import "github.com/steph-frtech/aidos/back/runtime/authn"

// CodeUnauthenticated re-exports authn's code so the gateway's block surface is one set
// (the panel/SDK enumerate gateway codes; UNAUTHENTICATED is one of them now).
const CodeUnauthenticated = BlockCode(authn.CodeUnauthenticated)

// AuthenticatedRoute runs the authentication gate, then the router. The order is the wall:
//
//  1. UNAUTHENTICATED — an anonymous principal is refused with UNAUTHENTICATED, BEFORE
//     the tool is even looked up. The decision's Tool is nil and no data is touched.
//  2. otherwise the resolved principal's identity is propagated into the call's scope
//     (overriding any client-asserted identity — the gateway trusts the VERIFIED session,
//     never the request body), and the call proceeds to Route (scope then zone).
//
// The principal carries the verified session/JWT subject (Auth.js front → verified by the
// gateway). PURE: no clock, rng, I/O or LLM. Same input ⇒ same RouteDecision.
func (r *Registry) AuthenticatedRoute(p authn.Principal, call Call) RouteDecision {
	// The disposition of the targeted tool decides nothing about authentication (an
	// anonymous caller is refused for any tool); we resolve it only to keep the gate's
	// signature symmetric with the authn core. An unknown tool still authenticates first.
	disp := authn.DispositionBelowLine
	if t, ok := r.Lookup(call.Tool); ok && t.Disposition == DispositionTruthWrite {
		disp = authn.DispositionTruthWrite
	}
	if d := authn.Authenticate(p, disp); d.Outcome == authn.OutcomeUnauthenticated {
		return RouteDecision{
			Outcome:     OutcomeUnauthenticated,
			BlockReason: fromAuthn(d.BlockReason),
		}
	}
	// Propagate the VERIFIED identity into the scope — the request body never sets it.
	call.Scope.Identity = p.Identity
	return r.Route(call)
}

// OutcomeUnauthenticated is the gate's terminal refusal — an anonymous call, refused
// upstream of routing (reaches no data).
const OutcomeUnauthenticated Outcome = "unauthenticated"

// fromAuthn adapts authn's BlockReason into the gateway shape (the code is identical;
// this only widens the type). Total.
func fromAuthn(b *authn.BlockReason) *BlockReason {
	if b == nil {
		return nil
	}
	return &BlockReason{
		Code:        BlockCode(b.Code),
		Severity:    b.Severity,
		Explanation: b.Explanation,
		HowToFix:    b.HowToFix,
	}
}
