package connectorinfra_test

// Fixture mirror (N2: state → command → events), interpreted in Go — WRITTEN FIRST
// (RED→GREEN). reflects=dp23-connector-infra-fragments+webhook-async+tool-registry ·
// test_kind=workflow · cert_language=fixture · liveness=live · authority=below.
//
// Materialized source: tests/runtime/connectorInfra.fixture.md (the human-readable
// fixture, conceptually stored in the `mirrors` schema; persisted to Postgres at S06 —
// bootstrap exception). It is the LIEN PORTEUR: this test loads the
// inbound-webhook→async-op + tool-registry-route/refuse + four-fragment scenarios; if the
// fixture intention disappears the test breaks (no silent rot into a monster).
//
// DP23 — l'infra de l'app émise : (1) un webhook ENTRANT déclenche une operation ASYNC
// (réutilise S73/DP16, worker TS), (2) le routage Tool-Registry (set-membership pur,
// TOOL_NOT_REGISTERED), (3) les quatre fragments profile connectors. La fixture RÉUTILISE
// la mécanique S73 (Outbox/Sink/Dispatch) — elle ne forke pas l'outbox.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/connectorinfra"
)

// ── the S73 outbox/sink mocks (reused shape — DP16 OutboxWriter Write facet) ─────────

type mockOutbox struct {
	entries    []operation.OutboxEntry
	dispatched map[string]bool
}

func newMockOutbox() *mockOutbox { return &mockOutbox{dispatched: map[string]bool{}} }

func (o *mockOutbox) Write(e operation.OutboxEntry) { o.entries = append(o.entries, e) }

func (o *mockOutbox) Pending() []operation.OutboxEntry {
	out := make([]operation.OutboxEntry, 0, len(o.entries))
	for _, e := range o.entries {
		if e.Status == operation.OutboxPending {
			out = append(out, e)
		}
	}
	return out
}

func (o *mockOutbox) MarkDispatched(id string) {
	o.dispatched[id] = true
	for i := range o.entries {
		if o.entries[i].ID == id {
			o.entries[i].Status = operation.OutboxDispatched
		}
	}
}

func (o *mockOutbox) IsDispatched(id string) bool { return o.dispatched[id] }

type mockSink struct{ delivered []operation.Effect }

func (s *mockSink) Deliver(e operation.Effect) error {
	s.delivered = append(s.delivered, e)
	return nil
}

// ── inbound-webhook → async op (reuses S73/DP16) ────────────────────────────────────

// TestFixture_InboundWebhookTriggersAsyncOp — an inbound webhook (received at the
// Webhook-Gateway) DISPATCHES the target async operation's effect through the S73 outbox.
// The webhook is the EVENT (a queued message): unlike a cron op it fires immediately, no
// clock needed. The worker is the emitted TS worker (DP16 pattern); this Go function is
// the build-time realisation.
func TestFixture_InboundWebhookTriggersAsyncOp(t *testing.T) {
	// The target async op: a queue-triggered operation with one notification effect.
	op := operation.Operation{Name: "onPaymentReceived", Input: "PaymentEvent"}
	async := operation.Async{
		Trigger: operation.AsyncTrigger{Kind: operation.TriggerQueue},
		Effects: []operation.Effect{
			{
				Kind:   operation.TriggerNotification,
				Target: "ops@example.com",
				Payload: map[string]any{
					"subject": "Payment received",
					"body":    "A payment webhook arrived",
				},
			},
		},
	}
	webhook := connectorinfra.InboundWebhook{
		Source:    "stripe",
		Operation: "onPaymentReceived",
		Payload:   map[string]any{"event": "payment_intent.succeeded"},
	}

	outbox := newMockOutbox()
	sink := &mockSink{}
	events, err := connectorinfra.RealizeInboundWebhook(webhook, op, async, outbox, sink)
	if err != nil {
		t.Fatalf("RealizeInboundWebhook: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events = %d, want 1 (the inbound webhook dispatched the async op's effect)", len(events))
	}
	if events[0].Operation != "onPaymentReceived" {
		t.Fatalf("event operation = %q, want onPaymentReceived", events[0].Operation)
	}
	if events[0].Kind != operation.TriggerNotification {
		t.Fatalf("event kind = %q, want notification", events[0].Kind)
	}
	if events[0].Target != "ops@example.com" {
		t.Fatalf("event target = %q, want ops@example.com", events[0].Target)
	}
	wantID, err := operation.EffectID(async.Effects[0])
	if err != nil {
		t.Fatalf("EffectID: %v", err)
	}
	if events[0].EffectID != wantID {
		t.Fatalf("event effect_id = %q, want the S73 content-address %q", events[0].EffectID, wantID)
	}
	if len(sink.delivered) != 1 {
		t.Fatalf("deliveries = %d, want 1", len(sink.delivered))
	}
}

// TestFixture_InboundWebhookReplayNeverDuplicates — replaying the SAME inbound webhook on
// the SAME outbox delivers the effect ONCE observably (exactly-once relative, S73).
func TestFixture_InboundWebhookReplayNeverDuplicates(t *testing.T) {
	op := operation.Operation{Name: "onPaymentReceived"}
	async := operation.Async{
		Trigger: operation.AsyncTrigger{Kind: operation.TriggerQueue},
		Effects: []operation.Effect{
			{Kind: operation.TriggerNotification, Target: "ops@example.com", Payload: map[string]any{"x": 1}},
		},
	}
	webhook := connectorinfra.InboundWebhook{Source: "stripe", Operation: "onPaymentReceived"}

	outbox := newMockOutbox()
	sink := &mockSink{}

	events1, err := connectorinfra.RealizeInboundWebhook(webhook, op, async, outbox, sink)
	if err != nil {
		t.Fatalf("realise #1: %v", err)
	}
	if len(events1) != 1 || len(sink.delivered) != 1 {
		t.Fatalf("first realisation: events=%d delivered=%d, want 1/1", len(events1), len(sink.delivered))
	}

	events2, err := connectorinfra.RealizeInboundWebhook(webhook, op, async, outbox, sink)
	if err != nil {
		t.Fatalf("realise #2 (replay): %v", err)
	}
	if len(events2) != 0 {
		t.Fatalf("replay events = %d, want 0 (the redelivery is suppressed)", len(events2))
	}
	if len(sink.delivered) != 1 {
		t.Fatalf("observable deliveries after replay = %d, want 1 (exactly-once relative)", len(sink.delivered))
	}
}

// TestFixture_WebhookForWrongOperationRefused — an inbound webhook naming an operation
// that does NOT match the target async op is refused (never fires the wrong op).
func TestFixture_WebhookForWrongOperationRefused(t *testing.T) {
	op := operation.Operation{Name: "onPaymentReceived"}
	async := operation.Async{Trigger: operation.AsyncTrigger{Kind: operation.TriggerQueue}}
	webhook := connectorinfra.InboundWebhook{Source: "stripe", Operation: "somethingElse"}

	_, err := connectorinfra.RealizeInboundWebhook(webhook, op, async, newMockOutbox(), &mockSink{})
	if err == nil {
		t.Fatal("a webhook for a non-matching operation must be refused, never fire the wrong op")
	}
}

// ── tool-registry route / refuse (set-membership pur) ───────────────────────────────

// TestFixture_RegisteredToolRoutes — a tool registered at the Tool-Registry routes
// through the MCP-Gateway (Admitted, no BlockReason).
func TestFixture_RegisteredToolRoutes(t *testing.T) {
	registry := connectorinfra.NewToolRegistry("proj", []string{"create_invoice", "list_payments"})
	dec, br := connectorinfra.RouteTool(registry, "create_invoice")
	if !dec.Admitted {
		t.Fatal("a registered tool must route")
	}
	if br != nil {
		t.Fatalf("a registered tool must carry no BlockReason; got %+v", br)
	}
}

// TestFixture_UnregisteredToolRefused — a tool NOT registered is refused with the
// TOOL_NOT_REGISTERED actionable BlockReason (fail-closed, the wall is not a prison).
func TestFixture_UnregisteredToolRefused(t *testing.T) {
	registry := connectorinfra.NewToolRegistry("proj", []string{"create_invoice"})
	dec, br := connectorinfra.RouteTool(registry, "drop_database")
	if dec.Admitted {
		t.Fatal("an unregistered tool must be refused (fail-closed)")
	}
	if br == nil {
		t.Fatal("a refusal must carry a BlockReason (the wall is not a prison, §44.5)")
	}
	if br.Code != blockreason.CodeToolNotRegistered {
		t.Fatalf("refusal code = %q, want TOOL_NOT_REGISTERED", br.Code)
	}
	if dec.Code != blockreason.CodeToolNotRegistered {
		t.Fatalf("decision code = %q, want TOOL_NOT_REGISTERED", dec.Code)
	}
	if len(br.HowToFix) == 0 {
		t.Fatal("the BlockReason must carry a resolution path")
	}
}

// ── the four connector-infra fragments (profile connectors) ─────────────────────────

// TestFixture_ConnectorInfraPaletteIsFour — the closed palette is exactly four
// fragments, the entry points of the EMITTED app's own MCP/connector substrate, DISTINCT
// from AIDOS's own MCP servers. Each is profile connectors and project-isolated.
func TestFixture_ConnectorInfraPaletteIsFour(t *testing.T) {
	frags, err := connectorinfra.SubstrateConnectorInfraFragments("proj", scope.EnvProd)
	if err != nil {
		t.Fatalf("prod must not error: %v", err)
	}
	if len(frags) != 4 {
		t.Fatalf("connector-infra palette = %d, want 4", len(frags))
	}
	want := map[string]stackmanifest.Role{
		"mcp-gateway":        stackmanifest.RoleConnector,
		"connector-registry": stackmanifest.RoleConnector,
		"tool-registry":      stackmanifest.RoleConnector,
		"webhook-gateway":    stackmanifest.RoleConnector,
	}
	for _, f := range frags {
		role, ok := want[f.Key]
		if !ok {
			t.Fatalf("unknown connector-infra fragment key %q (palette must be closed)", f.Key)
		}
		if f.Service.Role != role {
			t.Fatalf("%q: role %q, want %q", f.Key, f.Service.Role, role)
		}
		if f.Service.Profile != stackmanifest.ProfileConnectors {
			t.Fatalf("%q: profile %q, want connectors", f.Key, f.Service.Profile)
		}
		if f.Service.InternalPort == 0 || f.Service.Healthcheck == "" {
			t.Fatalf("%q: must carry port+healthcheck", f.Key)
		}
		if f.ProjectID != "proj" {
			t.Fatalf("%q: project_id = %q, want proj", f.Key, f.ProjectID)
		}
		if len(f.Volumes) == 0 {
			t.Fatalf("%q: must carry a bind volume", f.Key)
		}
		if f.WritesTruth() {
			t.Fatalf("%q: an emitted infra fragment never writes AIDOS truth (the wall §2)", f.Key)
		}
	}
}

// TestFixture_KeysAreTheClosedSet — Keys() is the single source of the four palette keys
// in canonical emission order (the Workbench legend + the mirror read it).
func TestFixture_KeysAreTheClosedSet(t *testing.T) {
	keys := connectorinfra.Keys()
	want := []string{"mcp-gateway", "connector-registry", "tool-registry", "webhook-gateway"}
	if len(keys) != len(want) {
		t.Fatalf("Keys() = %v, want %v", keys, want)
	}
	for i := range want {
		if keys[i] != want[i] {
			t.Fatalf("Keys()[%d] = %q, want %q", i, keys[i], want[i])
		}
	}
}
