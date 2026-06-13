// fixture.go — the disposable GOVERNED implementation the spike measures against.
// ImplFixture wraps a valid agentimpl.AgentImplementation bound to EXACTLY the two
// probed connectors' capabilities (postgres-ro: store.query ; slack: slack.list_channels
// + slack.post_message) and the slack.com egress host — nothing more. It is the EXISTING
// governed surface the matrix gates against; the spike adds NO new wall, only A2 + A3.
package dp19connectorgov

import (
	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
)

// ImplFixture is the disposable governed projection the matrix measures. It is content-
// addressed by its LayerRef back to a (fictional) CoucheAgent@version — never a truth.
type ImplFixture struct {
	Impl agentimpl.AgentImplementation
}

// GovernedImpl builds the disposable, VALID governed implementation: bound to exactly the
// two connectors' capabilities + slack.com egress, carrying the wall in ForbiddenPaths
// (the projection always carries the wall — agentimpl.WallForbiddenPaths). Unbound tools
// and un-allowed hosts are therefore refused by the EXISTING enforcers, fail-closed.
// Pure, total — same call ⇒ same impl.
func GovernedImpl() ImplFixture {
	impl := agentimpl.AgentImplementation{
		LayerRef:    "CoucheAgent:dp19-connector-governance@spike",
		Role:        "connector-governance-spike",
		Objectif:    "prouver que la gouvernance des connecteurs tient avec le mur existant",
		Provider:    agentlayer.ProviderAnthropic,
		Model:       "claude-opus-4-8",
		Temperature: 0,
		MaxTurns:    1,
		// CAPACITY axis — exactly the two connectors' bound capabilities (nothing else).
		Tools: []agentimpl.ResolvedTool{
			{Server: "store", Tool: "query"},         // postgres-ro READ
			{Server: "slack", Tool: "list_channels"}, // slack READ
			{Server: "slack", Tool: "post_message"},  // slack WRITE
		},
		// CONFINEMENT/EGRESS axis — exactly the external connector's host.
		AllowedNetworkHosts: []string{"slack.com"},
		// The app tree the agent may write (below the line) + the wall (always carried).
		AllowedPaths:   []string{"back/gen/", "front/web/"},
		ForbiddenPaths: agentimpl.WallForbiddenPaths(),
	}
	return ImplFixture{Impl: impl}
}

// Valid reports whether the governed implementation passes agentimpl.Validate — the
// spike measures against a VALID projection (a bad fixture would mask a real verdict).
func (f ImplFixture) Valid() error {
	return agentimpl.Validate(f.Impl)
}
