// Package connectorinfra is the DP23 emitter of the EMITTED APP'S CONNECTOR-INFRA
// substrate fragments (ROADMAP-provisioning-deploy EPIC E, palette DP14 → fragments
// StackManifest) AND the realisation of an INBOUND webhook as an async operation. It is
// the connector-infra twin of datafragments (DP15, the data layer), asyncfragments (DP16,
// the async layer), observabilityfragments (DP17, the observability layer) and
// appservicefragments (DP18, the application-services layer) — the SAME pattern, profile
// `connectors`:
//
//   - SubstrateConnectorInfraFragments(projectID, env) → []ServiceFragment renders the FOUR
//     connector-infra fragments of the emitted app as DETERMINISTIC StackManifest data —
//     · MCP-Gateway        — the UNIQUE entry point of the emitted app's MCP tools (ADR 0009:
//     every op of the emitted app = one MCP tool reached through THIS gateway) ;
//     · Connector-Registry — the registry of the emitted app's DECLARED connectors (DP20:
//     connector.ConnectorSource records — interne/externe/IA/cloud) ;
//     · Tool-Registry      — the registry of the EXPOSED MCP tools (set-membership: a tool not
//     registered here is REFUSED at the gateway with TOOL_NOT_REGISTERED) ;
//     · Webhook-Gateway    — the entry of INBOUND webhooks (a webhook entrant ⇒ une operation
//     ASYNC, S73/DP16, worker TS).
//     Each fragment carries the DP14-measured/canonical image + internal port + named bind
//     volume + healthcheck + depends_on + profile `connectors` + project_id, ISOLATED per
//     project (the volume name + the bind device env-var carry a deterministic per-project
//     token — project A never reaches project B's gateway/registries — S55/S82, the wall §2).
//
//   - RouteTool(registry, toolName) → (Decision, *BlockReason) is the MCP-Gateway routing
//     decision: a PURE, fail-closed SET-MEMBERSHIP over the Tool-Registry's declared names.
//     A tool registered ⇒ routes (Admitted) ; a tool ABSENT ⇒ refused TOOL_NOT_REGISTERED.
//     ZÉRO LLM — the gateway never judges, it looks up the closed registry (déterminisme).
//
//   - RealizeInboundWebhook(webhook, op, async, outbox, sink) → []DispatchEvent is the
//     build-time realisation of an INBOUND webhook: it maps the webhook to its target async
//     operation, writes the op's effects to the S73 transactional outbox, then DISPATCHES
//     them (operation.Dispatch, S73) — REUSING the DP16 asyncfragments mechanics verbatim
//     (the worker EMITTED for the app is a TS worker, ADR 0040/S74). The inbound webhook is
//     the EVENT (a queued message): unlike a cron op it fires immediately, no clock needed.
//     EXACTLY-ONCE RELATIVE: a replayed webhook re-presents the same content-addressed effect
//     id, which operation.Dispatch suppresses — no observable duplicate.
//
// THE IMAGES ARE THE DP14 CONVENTION (front/web/lib/substrate-palette.ts, the GO/contract
// verdicts of the 2026-06-13 spike). The four connector-infra services are EMITTED from the
// app's own phase (built, not pinned to a registry image) — their image is EMPTY (the DP02
// convention: an EMITTED service carries no pinned registry image), exactly like
// appservicefragments' Better-Auth. The MCP-Gateway/registries/webhook-gateway are the
// emitted app's OWN code (a Go MCP SDK gateway, ADR 0009/0040), built alongside the server.
//
// REUSE, DON'T FORK (CLAUDE.md §6, ADR 0007). The ServiceFragment shape, the per-project
// isolation token motif and the CanonicalFragment/HashFragment oracles are the DP15
// datafragments package — reused verbatim. The inbound-webhook realisation REUSES the S73
// operation package (ValidateAsync / NewOutboxEntry / Dispatch / Outbox / Sink) and the DP16
// asyncfragments OutboxWriter facet + DispatchEvent shape — IMPORTED, never re-coined. The
// connector model (interne/externe/IA/cloud, kind connector|skill|mcp_server) is the DP20
// kernel/connector package — the Connector-Registry fragment is its substrate, not a fork.
// DP23 adds only: the FOUR connector-infra palette rows + the Tool-Registry routing + the
// inbound-webhook glue.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is PURE, TOTAL and DETERMINISTIC:
// no clock, no RNG, no map-order leak, no absolute path, NO LLM. The per-project token is
// records.Hash (S02, via datafragments.IsolationToken); the canonical fragment body is
// records.Canonicalize. Same (projectID, env) ⇒ byte-identical fragments, ×100 (the
// reproducibility mirror). The MCP-Gateway routing is a CLOSED set-membership over the
// Tool-Registry — "an LLM deciding whether a tool may route" would be a determinism gap; the
// rule is code, and the code is authoritative. The webhook realisation reuses the S73
// content-addressed idempotency key — same webhook ⇒ same effect id ⇒ exactly-once relative.
//
// THE WALL (CLAUDE.md §2). The Service AST is a DP02 above-the-line stack_manifest SOURCE;
// this package PROJECTS the connector-infra slice of it BELOW the line (a regenerable
// fragment for back/gen/<app>/, the composeemit input). It writes NO truth: no
// kernel/mirrors/fitness write (WritesTruth() is always false on every fragment). The MCP
// servers of the EMITTED app are DISTINCT from AIDOS's own MCP servers (ADR 0040: l'app émise
// reçoit SES PROPRES MCP+Skills) — routing a tool, registering a connector, receiving a
// webhook all act on the EMITTED app's substrate, NEVER the AIDOS truth-store (aucun GRANT de
// vérité). Freezing a connector/tool into the (emitted app's) kernel goes via the wall (idée
// → miroir → /goal → approbation humaine); this package only RENDERS the below-the-line
// fragments and routes/dispatches below the line.
package connectorinfra

import (
	"encoding/json"
	"errors"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/asyncfragments"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
)

// ServiceFragment is ONE connector-infra substrate fragment: the DP02 Service AST slice
// plus its named bind volume(s) and the project it is isolated to. It is a PROJECTION value
// (below the line), NOT a kernel truth. It is structurally identical to
// datafragments.ServiceFragment (same field shape) so it grafts onto a manifest alongside
// the data/async/observability/app-service fragments and converts freely — DP23 reuses the
// shape, it only ATTACHES the WritesTruth oracle that pins the wall (the SAME discipline as
// appservicefragments.ServiceFragment).
type ServiceFragment struct {
	// Key is the stable palette key (mcp-gateway|connector-registry|tool-registry|
	// webhook-gateway) — the twin of the DP14 palette keys, never re-coined.
	Key string `json:"key"`
	// ProjectID is the project this fragment is isolated to (the wall §2 / S55).
	ProjectID string `json:"project_id"`
	// Service is the DP02 Service AST (image, role, internal port, profile, healthcheck,
	// depends_on) — a valid member of the closed role/profile sets.
	Service stackmanifest.Service `json:"service"`
	// Volumes are the named bind volume(s), isolated per project (the volume name and the
	// device env-var both carry the per-project token).
	Volumes []stackmanifest.Volume `json:"volumes"`
}

// WritesTruth reports whether this fragment carries a capability that writes AIDOS Kernel
// truth (kernel/mirrors/fitness). It is ALWAYS false: the connector-infra of the EMITTED app
// (its MCP-Gateway, registries, webhook-gateway) is a SERVICE OF THE BUILT APP — it never
// writes the AIDOS truth-store (the wall §2). The MCP servers of the emitted app are DISTINCT
// from AIDOS's own MCP servers (ADR 0040). The method exists so the mirror can ASSERT the
// invariant.
func (ServiceFragment) WritesTruth() bool { return false }

// DispatchEvent is the DP16 dispatch-trace value, reused verbatim — one observable step of
// the inbound-webhook realisation (the async op that fired, the content-addressed effect id,
// the effect's delivery kind and target).
type DispatchEvent = asyncfragments.DispatchEvent

// The DECLARED internal ports of the connector-infra palette. They are distinct from the
// DP15/DP16/DP17/DP18 substrate ports AND from the emitted server (3000) so a grafted
// manifest keeps unique internal ports (stackmanifest.Validate's DUPLICATE_INTERNAL_PORT
// law). The four gateway/registry services listen on the 39xx band (off every other layer).
const (
	mcpGatewayPort        = 3900 // the UNIQUE MCP entry point of the emitted app
	connectorRegistryPort = 3910 // the registry of declared connectors (DP20)
	toolRegistryPort      = 3920 // the registry of exposed MCP tools
	webhookGatewayPort    = 3930 // the inbound-webhook entry (⇒ async ops, S73)
)

// The DECLARED healthchecks (composeemit applies the boilerplate cadence; this is the
// command only) — each gateway/registry exposes a /health endpoint on its remapped port.
const (
	mcpGatewayHealth        = "wget -q --spider http://localhost:3900/health"
	connectorRegistryHealth = "wget -q --spider http://localhost:3910/health"
	toolRegistryHealth      = "wget -q --spider http://localhost:3920/health"
	webhookGatewayHealth    = "wget -q --spider http://localhost:3930/health"
)

// fragmentSpec is the DECLARED palette row — the closed table. The order of infraPalette is
// the canonical emission order (mcp-gateway, connector-registry, tool-registry,
// webhook-gateway), stable & deterministic.
type fragmentSpec struct {
	key          string
	role         stackmanifest.Role
	image        string
	internalPort int
	profile      stackmanifest.Profile
	healthcheck  string
	dependsOn    []string
}

// infraPalette is the CLOSED DP23 connector-infra substrate palette. Declared, never learned
// (§8) — extending it is an addendum + a /goal. All four carry profile `connectors` (the
// emitted app's connector substrate runs under its own compose profile, opt-in) and role
// `connector` (the DP02 closed role). All four are EMITTED from the app's own phase (built,
// not pinned) so their image is EMPTY (the DP02 convention). The MCP-Gateway is the entry
// point; the Webhook-Gateway depends on the bus (NATS) so an inbound webhook enqueues an
// async message (S73/DP16) — a deterministic edge.
var infraPalette = []fragmentSpec{
	{
		key:          "mcp-gateway",
		role:         stackmanifest.RoleConnector,
		image:        "", // EMITTED (built from the app's phase) — the Go MCP SDK gateway, ADR 0009/0040
		internalPort: mcpGatewayPort,
		profile:      stackmanifest.ProfileConnectors,
		healthcheck:  mcpGatewayHealth,
		// The gateway routes against the tool-registry — a deterministic edge.
		dependsOn: []string{"tool-registry"},
	},
	{
		key:          "connector-registry",
		role:         stackmanifest.RoleConnector,
		image:        "", // EMITTED — the registry of declared connectors (DP20)
		internalPort: connectorRegistryPort,
		profile:      stackmanifest.ProfileConnectors,
		healthcheck:  connectorRegistryHealth,
	},
	{
		key:          "tool-registry",
		role:         stackmanifest.RoleConnector,
		image:        "", // EMITTED — the registry of exposed MCP tools
		internalPort: toolRegistryPort,
		profile:      stackmanifest.ProfileConnectors,
		healthcheck:  toolRegistryHealth,
	},
	{
		key:          "webhook-gateway",
		role:         stackmanifest.RoleConnector,
		image:        "", // EMITTED — the inbound-webhook entry (⇒ async ops)
		internalPort: webhookGatewayPort,
		profile:      stackmanifest.ProfileConnectors,
		healthcheck:  webhookGatewayHealth,
		// An inbound webhook enqueues an async message on the bus (S73/DP16) — a deterministic edge.
		dependsOn: []string{"nats"},
	},
}

// Keys returns the closed connector-infra palette keys in canonical emission order (the
// Workbench legend + the mirror read this single source).
func Keys() []string {
	out := make([]string, 0, len(infraPalette))
	for _, s := range infraPalette {
		out = append(out, s.key)
	}
	return out
}

// buildFragment renders ONE connector-infra fragment for a project (pure, deterministic).
// The service name and the volume are isolated per project via the DP15 token (reused, not
// forked) — project A's gateway/registry state never bleeds into project B.
func buildFragment(s fragmentSpec, projectID, token string) ServiceFragment {
	// The volume is the per-project, per-service named bind volume. The device is an ENV-VAR
	// REFERENCE (composeemit / SPEC-stack-2026 law: never a hardcoded path); the var name
	// carries the service + token so each project's bind is its own (isolation), e.g.
	// MCP_GATEWAY_<token>_DATA_PATH. The discipline mirrors datafragments verbatim.
	deviceVar := upperEnv(s.key) + "_" + upperEnv(token) + "_DATA_PATH"
	vol := stackmanifest.Volume{
		Name:      s.key + "-" + token,
		DeviceVar: deviceVar,
	}
	return ServiceFragment{
		Key:       s.key,
		ProjectID: projectID,
		Service: stackmanifest.Service{
			Name:         s.key,
			Role:         s.role,
			Image:        s.image,
			InternalPort: s.internalPort,
			Profile:      s.profile,
			Healthcheck:  s.healthcheck,
			DependsOn:    append([]string(nil), s.dependsOn...),
		},
		Volumes: []stackmanifest.Volume{vol},
	}
}

// upperEnv folds a token to an UPPER-SNAKE env-var fragment (non-alphanumerics → '_'), the
// SAME discipline datafragments.upperEnv / composeemit.envVarImage use (a deterministic
// map). Kept local so the package is self-contained; all layers fold identically, so the
// env-var keys agree across DP15/DP16/DP17/DP18/DP23.
func upperEnv(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z':
			out = append(out, r-('a'-'A'))
		case r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			out = append(out, r)
		default:
			out = append(out, '_')
		}
	}
	return string(out)
}

// SubstrateConnectorInfraFragments is the DP23 AUTHORITATIVE door: it renders the
// connector-infra palette (MCP-Gateway + Connector-Registry + Tool-Registry +
// Webhook-Gateway) for (projectID, env). All four carry profile connectors and are legal in
// EVERY environment (no infra fragment is env-gated — unlike DP15's doltgres), so the
// function only fails-closed on an UNKNOWN environment (the DP06 motif, never guessed). Same
// (projectID, env) ⇒ byte-identical fragments.
func SubstrateConnectorInfraFragments(projectID string, env scope.Environment) ([]ServiceFragment, error) {
	if !scope.IsKnownEnvironment(env) {
		return nil, &envbindings.Refusal{
			Code:    envbindings.CodeUnknownEnvironment,
			Message: "environment is outside the closed set (want prod|staging|dev|local|future_cloud — ADR 0065)",
		}
	}
	token := datafragments.IsolationToken(projectID)
	out := make([]ServiceFragment, 0, len(infraPalette))
	for _, s := range infraPalette {
		out = append(out, buildFragment(s, projectID, token))
	}
	return out, nil
}

// fragmentBody is the canonical JSON record body of a fragment (the projection shape
// canonicalised below the line — never a kernel record kind). It mirrors the DP15/DP18 body
// shape so a fragment's address is computed the same way across layers.
type fragmentBody struct {
	Key       string                 `json:"key"`
	ProjectID string                 `json:"project_id"`
	Service   stackmanifest.Service  `json:"service"`
	Volumes   []stackmanifest.Volume `json:"volumes"`
}

// CanonicalFragment returns the S02-canonical bytes of a fragment (records.Canonicalize over
// the body — keys sorted, no insignificant whitespace). Same fragment ⇒ same bytes, always
// (the byte-identity oracle of the mirror). It REUSES the S02 scheme, never forked — the same
// body shape datafragments/appservicefragments canonicalise.
func CanonicalFragment(f ServiceFragment) ([]byte, error) {
	raw, err := json.Marshal(fragmentBody{
		Key:       f.Key,
		ProjectID: f.ProjectID,
		Service:   f.Service,
		Volumes:   f.Volumes,
	})
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// HashFragment is the content address of a fragment (records.Hash(CanonicalFragment) — S02
// reused, never forked). Same fragment ⇒ same address on any machine; the isolation token
// makes project A's address differ from project B's.
func HashFragment(f ServiceFragment) (string, error) {
	canon, err := CanonicalFragment(f)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// ── The Tool-Registry routing (MCP-Gateway, set-membership, fail-closed) ─────────────

// ToolRegistry is the EMITTED app's registry of EXPOSED MCP tools — the closed set of tool
// names the MCP-Gateway will route. It is the substrate behind the tool-registry fragment.
// It is a PROJECTION value (below the line), isolated per project; it writes no truth.
type ToolRegistry struct {
	// ProjectID is the project this registry is isolated to (the wall §2 / S55).
	ProjectID string `json:"project_id"`
	// Tools is the set of REGISTERED tool names (the closed exposure set). A tool not here is
	// not exposed — RouteTool refuses it FAIL-CLOSED.
	Tools map[string]struct{} `json:"-"`
}

// NewToolRegistry builds a Tool-Registry for a project from the declared tool names. A nil or
// empty list yields an empty registry — which refuses EVERY tool (fail-closed: nothing is
// exposed by default). Pure, deterministic.
func NewToolRegistry(projectID string, names []string) ToolRegistry {
	set := make(map[string]struct{}, len(names))
	for _, n := range names {
		set[n] = struct{}{}
	}
	return ToolRegistry{ProjectID: projectID, Tools: set}
}

// Decision is RouteTool's verdict: admitted or refused, with the DP23 BlockReason code on a
// refusal. There are exactly two outcomes — the SAME fail-closed SHAPE as
// connectorenforce.Decision (the DP21 axis), here tool-registry-scoped.
type Decision struct {
	// Admitted is true IFF the tool is registered (the MCP-Gateway routes it).
	Admitted bool `json:"admitted"`
	// Code is the refusal code on a deny; empty on an admission (the closed DP23 set).
	Code blockreason.Code `json:"code,omitempty"`
}

// RouteTool is the PURE, TOTAL, fail-closed MCP-Gateway routing decision: it routes an MCP
// tool IFF its name is a member of the Tool-Registry's declared names. A registered tool ⇒
// (Admitted, nil) ; an UNREGISTERED tool ⇒ (refused, TOOL_NOT_REGISTERED). An EMPTY registry
// refuses EVERY tool (nothing is exposed by default — fail-closed). It returns (Decision,
// *BlockReason): the BlockReason is nil on an admission and the canonical actionable reason
// on a refusal (the wall is not a prison, §44.5). ZÉRO LLM — the gateway looks up the closed
// registry, it never judges (déterminisme-first, §6/§8). Same (registry, toolName) ⇒ same
// verdict (the property mirror pins it).
func RouteTool(registry ToolRegistry, toolName string) (Decision, *blockreason.BlockReason) {
	if _, ok := registry.Tools[toolName]; ok {
		return Decision{Admitted: true}, nil
	}
	br := blockreason.For(blockreason.CodeToolNotRegistered)
	return Decision{Admitted: false, Code: blockreason.CodeToolNotRegistered}, &br
}

// ── The inbound-webhook realisation (⇒ async op, S73/DP16 reused) ────────────────────

// InboundWebhook is one webhook RECEIVED at the Webhook-Gateway: its source (the external
// system that POSTed it), the emitted app's operation it targets, and the payload. It is a
// runtime command (below the line), NOT a truth — the realisation maps it to the target
// async operation and dispatches the op's effects.
type InboundWebhook struct {
	// Source is the external system that POSTed the webhook (stripe, github, …) — audit only.
	Source string `json:"source"`
	// Operation is the emitted app's async operation this webhook targets. It MUST match the
	// realised operation's name (never fire the wrong op — fail-closed).
	Operation string `json:"operation"`
	// Payload is the webhook body (resolved values) — carried to the worker as context.
	Payload map[string]any `json:"payload,omitempty"`
}

// ErrWebhookOperationMismatch — the inbound webhook names an operation that does NOT match
// the realised async operation: the realisation refuses it rather than fire the wrong op
// (fail-closed, never a silent mis-route).
var ErrWebhookOperationMismatch = errors.New("connectorinfra: inbound webhook operation does not match the realised async operation")

// RealizeInboundWebhook is the BUILD-TIME realisation of an INBOUND webhook: the webhook is
// the EVENT (a queued message), so the target async operation fires immediately (no clock —
// unlike a cron op). It writes the operation's effects to the injected S73 outbox (PENDING,
// in the would-be state transaction) then DISPATCHES them (operation.Dispatch, S73) through
// the injected Sink, returning the ordered dispatch events. The async workers EMITTED for the
// app are TS workers (ADR 0040/S74) dispatching over NATS/Windmill; this Go function is the
// build-time realisation + the gateway mapping, NOT a runtime worker.
//
// It REUSES the DP16 asyncfragments mechanics verbatim — the OutboxWriter facet, the S73
// Outbox/Sink/Dispatch, the content-addressed effect id — it does NOT fork the outbox. The
// only DP23-specific glue is: (a) the webhook→operation MATCH (fail-closed: the webhook must
// name the realised op), and (b) firing on the event rather than the clock.
//
// EXACTLY-ONCE RELATIVE. A replayed webhook re-presents the SAME content-addressed effect id,
// which operation.Dispatch suppresses (the id collides with the prior dispatch) — so
// realising the same webhook twice on the same outbox delivers the effect ONCE observably.
// The events returned reflect the ACTUAL deliveries this call performed (a re-run returns no
// events for an already-dispatched effect — honest, never a phantom event).
//
// PURE over its seams: the outbox and the sink are injected; no real clock, no rng, no LLM
// (CLAUDE.md §6/§8). Same (webhook, op, async, outbox-state) ⇒ same events.
func RealizeInboundWebhook(webhook InboundWebhook, op operation.Operation, async operation.Async, outbox operation.Outbox, sink operation.Sink) ([]DispatchEvent, error) {
	// 1. The webhook must name the realised operation (fail-closed — never fire the wrong op).
	if webhook.Operation != op.Name {
		return nil, ErrWebhookOperationMismatch
	}

	// 2. The closed-grammar pre-flight: the async block must be well-formed (every effect kind
	//    is in the closed set). A malformed block is a typed failure, never a silent fire.
	if err := operation.ValidateAsync(async); err != nil {
		return nil, err
	}

	// 3. Write each effect to the outbox as PENDING — the transactional-outbox WRITE side (the
	//    effect can never exist without its state change). The outbox seam is the S73 Outbox; we
	//    use the DP16 OutboxWriter facet so a write reaches the mock/real table.
	writer, ok := outbox.(asyncfragments.OutboxWriter)
	if !ok {
		return nil, asyncfragments.ErrOutboxNotWritable
	}
	for _, eff := range async.Effects {
		entry, err := operation.NewOutboxEntry(eff)
		if err != nil {
			return nil, err
		}
		writer.Write(entry)
	}

	// 4. Snapshot the PENDING entries BEFORE dispatch so the event trace lists exactly the
	//    effects this call actually delivers (an already-dispatched id is suppressed by Dispatch
	//    and must NOT appear as a phantom event).
	var willDeliver []operation.OutboxEntry
	for _, entry := range outbox.Pending() {
		if !outbox.IsDispatched(entry.ID) {
			willDeliver = append(willDeliver, entry)
		}
	}

	// 5. Dispatch — the S73 dispatcher: at-least-once delivery + content-addressed dedup ⇒
	//    exactly-once relative. A replay re-presenting an already-dispatched id is suppressed.
	if _, err := operation.Dispatch(outbox, sink); err != nil {
		return nil, err
	}

	// 6. The deterministic event trace of the effects ACTUALLY delivered this call.
	events := make([]DispatchEvent, 0, len(willDeliver))
	for _, entry := range willDeliver {
		events = append(events, DispatchEvent{
			Operation: op.Name,
			EffectID:  entry.ID,
			Kind:      entry.Effect.Kind,
			Target:    entry.Effect.Target,
		})
	}
	return events, nil
}
