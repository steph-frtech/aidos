// Package gatewaydispatch is the S59 gateway DISPATCHER — the side-effecting seam the pure
// router (back/runtime/gateway) deliberately leaves open. The gateway's Route is a pure
// total function that DECIDES whether a (scope, tool, target) call may proceed; this package
// EXECUTES a decided "route" by forwarding the call to its owning MCP server in-process,
// over an in-memory transport, and returning the backend's structured result.
//
// THE WALL IS UNCHANGED AND COMES FIRST (CLAUDE.md §2). Every Call runs reg.Route BEFORE
// any dispatch. A truth-write (kernel_write/mirror_write/fitness_write/stack.engrave_manifest)
// is refused with GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET and the backend is NEVER touched; a
// cross-project / forged call is refused with AGENT_CROSS_PROJECT_WRITE; an unknown tool is
// refused. Only an OutcomeRoute reaches a backend. The dispatcher widens nothing — it
// executes exactly what the router already allowed.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The dispatch is a pure lookup: route → owning server
// → in-memory CallTool. No LLM enters; the only impurity is the backend store's own I/O. The
// routing itself is the pure gateway function; this package adds the wiring, not a second
// decision. Same (scope, tool, args) over a pure backend ⇒ byte-identical result (the
// reproducibility mirror pins it).
//
// REUSE, NOT REINVENTION (S59 tranche-1 = changeset only). A backend is built by an injected
// StoreProvider factory, lazily, on first use. For a server the factory does not (yet) wire,
// it returns ErrServerNotDispatched and Call returns OutcomeRouteUndispatched with a nil
// result — the caller (the gateway HTTP front, the front SDK) falls back to its demo/twin
// projection, so wiring one server at a time is a STRICTLY ADDITIVE cutover with no
// regression on the un-wired ones.
package gatewaydispatch

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/hooks/promotion-gate/gate"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/gateway"
	"github.com/steph-frtech/aidos/back/runtime/projectwall"
)

// ErrServerNotDispatched is returned by a StoreProvider for a server the dispatcher does not
// wire in this tranche. It is NOT a fatal error: Call surfaces it as OutcomeRouteUndispatched
// (nil result) so the caller falls back to its demo/twin projection — no regression.
var ErrServerNotDispatched = errors.New("gatewaydispatch: server not dispatched in this tranche")

// OutcomeRouteUndispatched is the dispatcher-only outcome for a call the router ALLOWED
// (a real "route") but whose owning backend the StoreProvider declined to build
// (ErrServerNotDispatched). It is distinct from gateway.OutcomeRoute so the caller can tell
// "routed and executed" from "routed but not yet wired" and fall back deterministically.
const OutcomeRouteUndispatched = "route_undispatched"

// OutcomeRefusedPromotionGate is the dispatcher-only outcome for a /goal-flow kernel write
// refused by the S27 promotion-gate (hooks/promotion-gate/gate): a write tagged
// provenance=mirrored_idea that lacks a mirror_ref is blocked with NO_MIRROR_NO_KERNEL
// BEFORE any dispatch. This gate sits ABOVE the wall — the wall already refuses the raw
// kernel_write door (GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET); the promotion-gate ADDS the
// "no mirror, no kernel" check on the legitimate idea → mirror → /goal promotion path.
const OutcomeRefusedPromotionGate = "refused_promotion_gate"

// StoreProvider builds the in-process backend *mcp.Server for a named MCP server (e.g.
// "changeset"). It is the ONLY injection point: the dispatcher itself opens no store and
// knows no DSN. For a server outside this tranche it returns (nil, ErrServerNotDispatched).
// It is called lazily, at most once per server (the result is cached as a live session).
type StoreProvider func(ctx context.Context, server string) (*mcp.Server, error)

// backend bundles a connected in-memory client session with the server session that backs
// it, so Close can tear both down.
type backend struct {
	client *mcp.ClientSession
	server *mcp.ServerSession
}

// Dispatcher executes routed gateway calls against in-process MCP backends. It holds the
// pure registry (the wall), the StoreProvider factory, and a lazily-populated map of
// connected backends. Safe for concurrent use.
type Dispatcher struct {
	reg     *gateway.Registry
	factory StoreProvider

	mu       sync.Mutex
	backends map[string]*backend
}

// New builds a Dispatcher over a registry and a StoreProvider. The registry is the wall; the
// factory is the only door to a backend store. No I/O happens here — backends are built
// lazily on first dispatch.
func New(reg *gateway.Registry, factory StoreProvider) *Dispatcher {
	return &Dispatcher{
		reg:      reg,
		factory:  factory,
		backends: make(map[string]*backend),
	}
}

// Call routes then dispatches a single gateway request. The CONTRACT:
//
//	result  — the backend tool's structured output marshalled to json.RawMessage, on a
//	          successful dispatch (outcome "route"); nil on every refusal AND on
//	          route_undispatched.
//	br      — the actionable §2 BlockReason on a refusal (refused_truth_write /
//	          refused_scope / unknown_tool); nil otherwise.
//	outcome — one of: "route" (dispatched & executed), "route_undispatched" (allowed but the
//	          backend is not wired in this tranche), "refused_truth_write", "refused_scope",
//	          "unknown_tool".
//	err     — a transport/backend execution error (the route decision itself never errors;
//	          err is non-nil only when a wired backend's CallTool fails or returns IsError).
//
// args is the backend tool's arguments as a decoded OBJECT (map[string]any), NOT a
// json.RawMessage: a RawMessage ([]byte) makes the go-sdk infer the transport-facing input
// schema as a byte-array, so a real HTTP `args:{object}` payload is REFUSED at input
// validation before the handler ever runs (the S59 scar — a unit test calling Call in-Go is
// green while the real HTTP path 0-rows). A map[string]any announces an object schema, so the
// object reaches the backend (the HTTP integration mirror pins this).
//
// THE WALL COMES FIRST. reg.Route runs before any dispatch; a non-route outcome returns
// immediately and the backend is NEVER built or touched (the truth-write test pins this:
// the factory is unreachable for kernel/mirror/fitness writes).
func (d *Dispatcher) Call(ctx context.Context, scope projectwall.Scope, tool string, args map[string]any) (result map[string]any, br *gateway.BlockReason, outcome string, err error) {
	// 0. PROMOTION-GATE — ABOVE the wall (S27, KRD §116/§119.1). It fires ONLY on the
	// /goal-flow kernel-write shape (schema=kernel ∧ provenance=mirrored_idea, the injected
	// promotion path). It DEFERS to the pure core gate.Evaluate (which defers to
	// ideas.Promote) — it does not re-implement the predicate, no LLM enters (determinism-
	// first, §6/§8). A mirror-less / non-harvested promotion is REFUSED with
	// NO_MIRROR_NO_KERNEL BEFORE any dispatch — the backend is NEVER touched. A legitimate
	// mirrored promotion PASSES to the wall (which still independently governs the raw
	// kernel_write door): the gate ADDS a check, it widens nothing. A call without the
	// /goal-flow shape is not the gate's concern (Evaluate allows a non-kernel schema).
	if ev, ok := promotionGateEvent(tool, args); ok {
		if dgate := gate.Evaluate(ev); dgate.Verdict == gate.VerdictDeny {
			return nil, toGatewayBlockReason(dgate.BlockReason), OutcomeRefusedPromotionGate, nil
		}
	}

	// 1. WALL FIRST — the pure router decides. The target's project is the active project
	// (a same-project below-the-line call; a foreign active project is a scope refusal).
	dec := d.reg.Route(gateway.Call{
		Scope:  scope,
		Tool:   tool,
		Target: projectwall.Target{ProjectID: scope.ActiveProject},
	})
	if dec.Outcome != gateway.OutcomeRoute {
		// refused_truth_write / refused_scope / unknown_tool — never dispatched.
		return nil, dec.BlockReason, string(dec.Outcome), nil
	}

	// 2. ROUTED — obtain (lazily) the owning backend session. An un-wired server is NOT an
	// error: surface route_undispatched so the caller falls back to demo (no regression).
	session, err := d.sessionFor(ctx, dec.Tool.Server)
	if errors.Is(err, ErrServerNotDispatched) {
		return nil, nil, OutcomeRouteUndispatched, nil
	}
	if err != nil {
		return nil, nil, string(gateway.OutcomeRoute), fmt.Errorf("gatewaydispatch: connect %q: %w", dec.Tool.Server, err)
	}

	// 3. DISPATCH — forward the call to the backend tool over the in-memory transport and
	// return its structured output. Arguments pass through as a decoded object (the router
	// does not interpret params; nor does the dispatcher) — the SDK marshals the map to the
	// JSON object the backend's input schema expects.
	res, err := session.CallTool(ctx, &mcp.CallToolParams{Name: tool, Arguments: argsOrEmpty(args)})
	if err != nil {
		return nil, nil, string(gateway.OutcomeRoute), fmt.Errorf("gatewaydispatch: call %q: %w", tool, err)
	}
	if res.IsError {
		return nil, nil, string(gateway.OutcomeRoute), fmt.Errorf("gatewaydispatch: backend tool %q reported an error: %s", tool, textOf(res))
	}
	out, err := toResultMap(res.StructuredContent)
	if err != nil {
		return nil, nil, string(gateway.OutcomeRoute), fmt.Errorf("gatewaydispatch: encode result of %q: %w", tool, err)
	}
	return out, nil, string(gateway.OutcomeRoute), nil
}

// sessionFor returns the connected client session for a server, building and connecting the
// backend lazily on first use (the factory is consulted at most once per server). An
// in-memory transport pair links a fresh ServerSession to the ClientSession the dispatcher
// keeps. Concurrency-safe.
func (d *Dispatcher) sessionFor(ctx context.Context, server string) (*mcp.ClientSession, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if b, ok := d.backends[server]; ok {
		return b.client, nil
	}
	backendServer, err := d.factory(ctx, server)
	if err != nil {
		return nil, err
	}
	if backendServer == nil {
		return nil, ErrServerNotDispatched
	}
	clientT, serverT := mcp.NewInMemoryTransports()
	ss, err := backendServer.Connect(ctx, serverT, nil)
	if err != nil {
		return nil, fmt.Errorf("gatewaydispatch: server connect: %w", err)
	}
	client := mcp.NewClient(&mcp.Implementation{Name: "aidos-gateway-dispatch", Version: "v0.1.0"}, nil)
	clientSess, err := client.Connect(ctx, clientT, nil)
	if err != nil {
		_ = ss.Close()
		return nil, fmt.Errorf("gatewaydispatch: client connect: %w", err)
	}
	d.backends[server] = &backend{client: clientSess, server: ss}
	return clientSess, nil
}

// Close tears down every connected backend session (client then server). Idempotent.
func (d *Dispatcher) Close() {
	d.mu.Lock()
	defer d.mu.Unlock()
	for name, b := range d.backends {
		if b.client != nil {
			_ = b.client.Close()
		}
		if b.server != nil {
			_ = b.server.Close()
		}
		delete(d.backends, name)
	}
}

// argsOrEmpty hands the decoded arguments object to the SDK. An empty/absent map becomes nil
// so the SDK substitutes an empty JSON object (its own default); a non-empty map passes
// through and the SDK marshals it to the JSON object the backend's input schema expects.
func argsOrEmpty(args map[string]any) any {
	if len(args) == 0 {
		return nil
	}
	return args
}

// toResultMap normalises a backend's StructuredContent (after the in-memory JSON round-trip
// it is typically a map[string]any) into a map[string]any. A nil structured content returns
// nil so the caller sees "no structured result". Anything else is round-tripped through JSON
// (a struct backend result decodes to its object form).
func toResultMap(v any) (map[string]any, error) {
	if v == nil {
		return nil, nil
	}
	if m, ok := v.(map[string]any); ok {
		return m, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	return m, nil
}

// textOf flattens a result's text content for an error message (best-effort).
func textOf(res *mcp.CallToolResult) string {
	for _, c := range res.Content {
		if tc, ok := c.(*mcp.TextContent); ok {
			return tc.Text
		}
	}
	return "(no text content)"
}

// promotionGateEvent recognises the /goal-flow kernel-write shape in a call's args and, if
// present, builds the promotion-gate Event the pure core evaluates. The gate fires ONLY when
// BOTH schema=="kernel" AND provenance=="mirrored_idea" (ideas.ProvenanceMirroredIdea) — the
// legitimate idea → mirror → /goal promotion path the /goal flow injects. Any other call
// (no schema tag, a below-the-line op, a raw forged write with no provenance) returns ok=false
// so the gate stays out of the way and the wall governs alone. PURE: a deterministic read of
// the args map, no I/O, no clock, never panics. It reads only the INJECTED fields
// (idea_status, idea_id, mirror_ref) — it never reaches into the mirrors schema (the wall, §2).
func promotionGateEvent(tool string, args map[string]any) (gate.Event, bool) {
	if str(args, "schema") != "kernel" {
		return gate.Event{}, false
	}
	// ProvenanceMirroredIdea is the discriminator the memory-firewall also keys on (the
	// legal Memory→Kernel-adjacent path); the promotion-gate owns the mirror-presence check.
	if str(args, "provenance") != string(ideasProvenanceMirroredIdea) {
		return gate.Event{}, false
	}
	return gate.Event{
		Tool:       tool,
		Schema:     "kernel",
		IdeaStatus: str(args, "idea_status"),
		IdeaID:     str(args, "idea_id"),
		MirrorRef:  str(args, "mirror_ref"),
	}, true
}

// ideasProvenanceMirroredIdea is the provenance discriminator of the legal idea → mirror →
// /goal path (mirrored against archive/brain/firewall.ProvenanceMirroredIdea). A literal,
// not an import of the firewall, to keep the dispatcher's dependency surface to the gate
// core only — the value is pinned by the firewall's own property mirror.
const ideasProvenanceMirroredIdea = "mirrored_idea"

// str reads a string field from a decoded args object; missing or non-string yields "".
// PURE, total.
func str(args map[string]any, key string) string {
	if v, ok := args[key].(string); ok {
		return v
	}
	return ""
}

// toGatewayBlockReason widens the promotion-gate's blockreason.BlockReason (the §44.5 shape)
// into the gateway BlockReason the HTTP edge returns — the codes are identical, this only
// adapts the type (the same pattern as fromProjectWall in the gateway package). Total: a nil
// reason yields nil.
func toGatewayBlockReason(b *blockreason.BlockReason) *gateway.BlockReason {
	if b == nil {
		return nil
	}
	return &gateway.BlockReason{
		Code:        gateway.BlockCode(b.Code),
		Severity:    string(b.Severity),
		Explanation: b.Explanation,
		HowToFix:    b.HowToFix,
	}
}
