package main

import (
	"fmt"
	"io"

	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
)

// gateway.go wires the S117 SURFACE-COMPLETION verbs (goal/grill/spike/harvest/trim/
// init) — the gestures CLAUDE.md promises — as REAL sub-commands routed over the S58
// passerelle (back/runtime/gateway). The done-criterion (S117): "compléter la surface
// CLI (goal/grill/spike/harvest/trim/init comme vraies sous-commandes sur la
// passerelle)".
//
// THE WALL IS THE GATEWAY'S, APPLIED IDENTICALLY (CLAUDE.md §2). Each verb resolves a
// gateway tool and runs the SAME deterministic gateway.Route the HTTP edge runs. The
// CLI does NOT widen what a caller may do — a below-the-line tool ROUTES, a direct
// truth-write is REFUSED with the ChangeSet-pointing BlockReason. `aidos goal` routes
// to changeset_open (the legal truth door — it PROPOSES a ChangeSet, it does not write
// truth); `aidos trim` routes to idea_capture (it DELETES NOTHING — it opens an idea);
// a crafted `kernel-write`/`mirror-write`/`fitness-write` verb is refused.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): runGatewayVerb is a pure function of
// (verb, args, stdout) → exit code — the routing decision is gateway.Route, a pure
// total function (no clock, no rng, no I/O, no LLM). Same verb ⇒ byte-identical output.
//
// READ-ONLY HERE (the bootstrap surface, like check/diff/impact/stable). This step
// wires the verbs to the ROUTING decision and renders it deterministically; the
// side-effecting dispatch to a live handler is the gateway HTTP server's seam (S58),
// reached when a live (identity, project) scope + an idea/project operand are passed.
// The verb proves the wall holds NOW and is replayable; the live dispatch is a later
// tooth that does not change this surface (OpenQuestion OQ-S117-1, a by-design forward
// dependency — consistent with check/diff/impact/stable).

// verbToTool is the CLOSED map from a surface-completion verb to the gateway tool it
// routes over. Every value is a tool the S58 registry exposes (DefaultTools), so the
// CLI can never route to a tool the gateway does not classify. DECLARED, never guessed.
var verbToTool = map[Verb]string{
	VerbGoal:    "changeset_open", // the ChangeSet door — the only legal path truth moves.
	VerbGrill:   "idea_grill",
	VerbSpike:   "idea_spike",
	VerbHarvest: "idea_harvest",
	VerbTrim:    "idea_capture", // /trim PROPOSES via an idea; it deletes nothing.
	VerbInit:    "project_create",
}

// directTruthWriteVerbs maps the crafted "I'll move truth directly" verbs a naïve or
// hostile caller might type to the fenced truth-zone tools the gateway refuses. These
// are NOT in the contract registry (they are not legitimate sub-commands) — they exist
// only so the CLI surfaces the SAME ChangeSet-pointing refusal the gateway returns,
// proving the wall is not bypassable through a CLI hole.
var directTruthWriteVerbs = map[string]string{
	"kernel-write":  "kernel_write",
	"mirror-write":  "mirror_write",
	"fitness-write": "fitness_write",
}

// gatewayToolFor returns the gateway tool a surface-completion verb routes to.
func gatewayToolFor(v Verb) (string, bool) {
	t, ok := verbToTool[v]
	return t, ok
}

// cliScope is the deterministic, replayable scope the CLI uses to exercise the routing
// decision in this bootstrap surface: a single active (identity, project) acting on
// itself. Same scope ⇒ same routing decision (no cross-project refusal in the happy
// path). A live invocation will carry the real S57 cookie + S61 identity; until then
// the verb proves the ZONE wall (truth-write vs below-line) deterministically.
func cliScope() (projectwall.Scope, projectwall.Target) {
	const id, proj = "cli", "cli-demo"
	return projectwall.Scope{Identity: id, ActiveProject: proj},
		projectwall.Target{ProjectID: proj, ClaimedIdentity: id}
}

// runGatewayVerb handles a surface-completion verb: it resolves the gateway tool, runs
// the deterministic gateway.Route, and renders the decision. With NO operand it still
// runs the route over the canonical scope (the routing is the behaviour — the verb
// proves the wall holds and is replayable). Returns exitOK on a routed (below-line)
// call and exitUsage on a refusal (the CLI never silently performs a refused call).
func runGatewayVerb(v Verb, args []string, stdout io.Writer) int {
	tool, ok := gatewayToolFor(v)
	if !ok {
		// Not a gateway verb — defensive; the dispatcher only calls this for the six.
		c, _ := lookup(string(v))
		renderContract(stdout, c)
		return exitOK
	}
	c, _ := lookup(string(v))
	fmt.Fprintf(stdout, "aidos %s — %s\n", v, c.Purpose)
	fmt.Fprintf(stdout, "  passerelle: route vers l'outil MCP « %s »\n", tool)

	scope, target := cliScope()
	dec := gateway.DefaultRegistry().Route(gateway.Call{Scope: scope, Tool: tool, Target: target})
	return renderRouteDecision(stdout, dec)
}

// runDirectTruthWrite handles a crafted truth-zone write verb: it routes the fenced
// tool through the gateway, which REFUSES it, and the CLI surfaces the ChangeSet-
// pointing BlockReason — never silently performing it. Returns a non-OK code.
func runDirectTruthWrite(verb string, stdout io.Writer) int {
	tool := directTruthWriteVerbs[verb]
	fmt.Fprintf(stdout, "aidos %s — tentative d'ecriture DIRECTE de verite (%s)\n", verb, tool)
	scope, target := cliScope()
	dec := gateway.DefaultRegistry().Route(gateway.Call{Scope: scope, Tool: tool, Target: target})
	return renderRouteDecision(stdout, dec)
}

// renderRouteDecision prints the gateway's RouteDecision deterministically and maps it
// to an exit code: route ⇒ exitOK, any refusal ⇒ exitUsage. The BlockReason (code +
// explanation + how_to_fix) is rendered verbatim so the CLI refusal and the HTTP edge
// refusal are the SAME actionable message (the wall is one wall).
func renderRouteDecision(w io.Writer, dec gateway.RouteDecision) int {
	switch dec.Outcome {
	case gateway.OutcomeRoute:
		fmt.Fprintf(w, "  outcome   : route (la passerelle honore l'appel — below-the-line)\n")
		if dec.Tool != nil {
			fmt.Fprintf(w, "  serveur   : %s\n", dec.Tool.Server)
		}
		fmt.Fprintln(w, "  note      : la decision de routage est calculee (pur routage, zero LLM) ; le dispatch vivant vers le handler est le seam HTTP S58.")
		return exitOK
	default:
		fmt.Fprintf(w, "  outcome   : %s (refuse par la passerelle)\n", dec.Outcome)
		if dec.BlockReason != nil {
			b := dec.BlockReason
			fmt.Fprintf(w, "  code      : %s\n", b.Code)
			fmt.Fprintf(w, "  severite  : %s\n", b.Severity)
			fmt.Fprintf(w, "  raison    : %s\n", b.Explanation)
			for i, fix := range b.HowToFix {
				fmt.Fprintf(w, "  fix[%d]    : %s\n", i, fix)
			}
		}
		return exitUsage
	}
}
