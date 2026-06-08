package operation

// ── The async / scheduled Operation node + the transactional outbox (S73) ────────
//
// S73 extends the Operation DSL (S10) with a THIRD dimension, neither a sync Step
// nor a plain mutate: an AsyncTrigger — the declared way an operation may run OUT OF
// BAND (at a cron echeance, off a queue, from an inbound webhook, or as a side-effect
// notification/email). Without it an emitted app can do no background work, no
// reminders, no outbound webhooks — a monster-adjacent omission if left silent
// (ROADMAP S73).
//
// THE CLOSED TRIGGER SET. A trigger's kind is one of four, invented by neither agent
// nor LLM (the same closed-grammar honesty as the six Step verbs):
//
//	cron · queue · webhook_out · notification
//
// THE EFFECT + THE OUTBOX. An async operation carries Effects[] — the side-effects it
// must perform on the world. An effect is NEVER fired inline; it is written to the
// OUTBOX in the same logical transaction as the state change (the classic
// transactional-outbox pattern), then dispatched by the dispatcher. The guarantee is
// EXACTLY-ONCE RELATIVE: at-least-once delivery + idempotent dispatch ⇒ no observable
// duplicate. The idempotency key is the effect's CONTENT-ADDRESSED id
// (records.Hash(Canonicalize(effect))), so a replayed effect collides with its prior
// dispatch and is suppressed.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The scheduler is CODE, never an LLM: it holds no
// real clock, no rng, no I/O — the clock is INJECTED (the Clock seam), so Tick(now) is
// a pure function (same (schedule, now) ⇒ same fired set). The async_property_test pins
// this. The outbox is reached only through the injected Outbox interface (a projection
// seam below the waterline) — the package stays PURE.
//
// THE WALL (CLAUDE.md §2). The scheduler/dispatcher write no truth: the async/scheduled
// Operation AST is a SOURCE row written only by the aidos CLI through an approved
// ChangeSet. The outbox is a runtime datastore table (a seam), never a kernel/mirrors
// /fitness schema. The emitted realisation (a TS worker + an outbox table, S74 target)
// is a later tooth — here the fixture passes mocks at each seam.

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// TriggerKind discriminates an AsyncTrigger. The closed set is the four async kinds.
type TriggerKind string

const (
	// TriggerCron — the operation fires at a wall-clock echeance (a scheduled job).
	TriggerCron TriggerKind = "cron"
	// TriggerQueue — the operation runs off a queued message (background work).
	TriggerQueue TriggerKind = "queue"
	// TriggerWebhookOut — the operation POSTs an outbound webhook to a subscriber.
	TriggerWebhookOut TriggerKind = "webhook_out"
	// TriggerNotification — the operation pushes a notification / sends an email.
	TriggerNotification TriggerKind = "notification"
)

// triggerKinds is the closed set of trigger kinds, in canonical order.
var triggerKinds = []TriggerKind{TriggerCron, TriggerQueue, TriggerWebhookOut, TriggerNotification}

// IsTriggerKind reports whether k is one of the four async trigger kinds. Exposed so
// the Workbench panel and any decoder never invent a trigger kind.
func IsTriggerKind(k string) bool {
	for _, tk := range triggerKinds {
		if string(tk) == k {
			return true
		}
	}
	return false
}

// TriggerKinds returns the four trigger kinds in canonical order.
func TriggerKinds() []TriggerKind { return append([]TriggerKind(nil), triggerKinds...) }

// AsyncTrigger declares HOW an operation runs out of band. For a cron trigger At is the
// echeance (RFC3339, compared against the injected Clock); for queue/webhook_out/
// notification At is empty (they fire on an event, not a clock). The grammar is closed:
// an unknown kind is a typed failure, never a silent default.
type AsyncTrigger struct {
	Kind TriggerKind `json:"kind"`
	At   string      `json:"at,omitempty"` // RFC3339 echeance for cron; empty otherwise
}

// Effect is one side-effect an async operation performs on the world: a target + a
// payload. It is written to the outbox (never fired inline). Its content-addressed id
// (ID below) is the idempotency key the dispatcher dedupes on.
type Effect struct {
	Kind    TriggerKind    `json:"kind"`    // the effect's delivery channel (mirrors the trigger set)
	Target  string         `json:"target"`  // the destination (an email addr, a webhook URL, a topic)
	Payload map[string]any `json:"payload"` // the effect's body (resolved values, never selectors)
}

// Async is the optional async block of an Operation (KRD §24.3 extension, S73): the
// trigger + the declared effects. An operation with no Async block is a plain sync
// operation (S10) — the extension is purely additive, no prior contract shifts.
type Async struct {
	Trigger AsyncTrigger `json:"trigger"`
	Effects []Effect     `json:"effects"`
}

// ── Errors (typed, never silent) ────────────────────────────────────────────────

var (
	// ErrUnknownTriggerKind — an AsyncTrigger carried a kind outside the closed set.
	ErrUnknownTriggerKind = errors.New("operation: unknown async trigger kind")
	// ErrCronMissingEcheance — a cron trigger had no `at` echeance (a cron with no
	// clock to compare against can never be due).
	ErrCronMissingEcheance = errors.New("operation: cron trigger missing echeance")
)

// ValidateAsync shape-checks an Async block: the trigger kind is in the closed set, a
// cron trigger carries a non-empty echeance, and every effect carries a known kind. A
// well-formed block returns nil; a malformed one returns a typed error (surfaced as a
// BlockReason by BlockAsync).
func ValidateAsync(a Async) error {
	if !IsTriggerKind(string(a.Trigger.Kind)) {
		return fmt.Errorf("%w: %q", ErrUnknownTriggerKind, a.Trigger.Kind)
	}
	if a.Trigger.Kind == TriggerCron && a.Trigger.At == "" {
		return ErrCronMissingEcheance
	}
	for _, e := range a.Effects {
		if !IsTriggerKind(string(e.Kind)) {
			return fmt.Errorf("%w: effect %q", ErrUnknownTriggerKind, e.Kind)
		}
	}
	return nil
}

// EffectID is the CONTENT-ADDRESSED idempotency key of an effect: the SHA-256 of its
// canonical JSON body, REUSING records.Hash/Canonicalize verbatim (the same address it
// would land under in the content store). Two byte-identical effects share an id, so a
// replay collides with its prior dispatch — the exactly-once-relative key.
func EffectID(e Effect) (string, error) {
	body, err := json.Marshal(effectBody(e))
	if err != nil {
		return "", fmt.Errorf("operation: marshal effect: %w", err)
	}
	canon, err := records.Canonicalize(body)
	if err != nil {
		return "", fmt.Errorf("operation: canonicalize effect: %w", err)
	}
	return records.Hash(canon), nil
}

// effectBody is the canonical, key-sorted view EffectID hashes over. payload keys are
// sorted by records.Canonicalize; the wrapper fixes the top-level field order.
func effectBody(e Effect) map[string]any {
	return map[string]any{
		"kind":    string(e.Kind),
		"target":  e.Target,
		"payload": e.Payload,
	}
}

// ── The Clock seam (injected — the scheduler is pure) ───────────────────────────

// Clock is the injected time source the scheduler reads. It is a SEAM (like the S10
// Deps): the package never calls time.Now(); the fixture passes a FixedClock so Tick is
// a pure function of (schedule, injected-now). Determinism-first (CLAUDE.md §6).
type Clock interface {
	// Now returns the current instant as an RFC3339 string (compared lexically-safe via
	// parseRFC3339 below). A real clock wraps time.Now().UTC(); the mock returns a fixed
	// instant.
	Now() string
}

// FixedClock is a deterministic Clock returning a fixed RFC3339 instant — the test
// double the fixture injects so scheduling is reproducible.
type FixedClock struct{ At string }

// Now returns the fixed instant.
func (c FixedClock) Now() string { return c.At }

// Due reports whether an echeance has arrived relative to now (both RFC3339). It is the
// scheduling predicate: a cron operation is due ⇔ now ≥ echeance. Pure and total — a
// malformed timestamp yields (false, error), never a panic.
func Due(echeance, now string) (bool, error) {
	et, err := parseRFC3339(echeance)
	if err != nil {
		return false, fmt.Errorf("operation: echeance %q: %w", echeance, err)
	}
	nt, err := parseRFC3339(now)
	if err != nil {
		return false, fmt.Errorf("operation: now %q: %w", now, err)
	}
	return !nt.Before(et), nil
}

// ── The Scheduler (Tick) — pure on the injected clock ───────────────────────────

// ScheduledOp pairs an operation name with its cron trigger for the scheduler. The
// scheduler holds a set of these and, on each Tick, returns the names of the ones whose
// echeance has arrived. Names are content-stable and the result is SORTED so Tick is a
// pure function (same input ⇒ same ordered output).
type ScheduledOp struct {
	Name    string
	Trigger AsyncTrigger
}

// Tick returns the names of the scheduled operations whose cron echeance has arrived at
// the injected clock's Now(), in sorted order. It is PURE: no real clock, no rng, no
// I/O — the determinism-first reproducibility mirror pins same (schedule, now) ⇒ same
// fired set. A non-cron trigger never fires on a Tick (it fires on its event, not the
// clock). A malformed echeance is skipped with the error returned (totality, never a
// silent fire).
func Tick(scheduled []ScheduledOp, clock Clock) ([]string, error) {
	now := clock.Now()
	fired := make([]string, 0, len(scheduled))
	for _, s := range scheduled {
		if s.Trigger.Kind != TriggerCron {
			continue
		}
		due, err := Due(s.Trigger.At, now)
		if err != nil {
			return nil, fmt.Errorf("operation: tick %q: %w", s.Name, err)
		}
		if due {
			fired = append(fired, s.Name)
		}
	}
	sort.Strings(fired)
	return fired, nil
}

// ── The transactional Outbox (exactly-once relative) ────────────────────────────

// OutboxStatus is the lifecycle of an outbox entry. An entry is written PENDING in the
// state transaction, then moved to DISPATCHED by the dispatcher once the effect reaches
// the world. The set is closed.
type OutboxStatus string

const (
	// OutboxPending — written, not yet dispatched (the crash-window state).
	OutboxPending OutboxStatus = "pending"
	// OutboxDispatched — delivered to the world and acknowledged.
	OutboxDispatched OutboxStatus = "dispatched"
)

// OutboxEntry is one row of the transactional outbox: the content-addressed effect id
// (the idempotency key), the effect, and its status. The id is what the dispatcher
// dedupes on — a replayed effect carries the same id and is suppressed.
type OutboxEntry struct {
	ID     string       `json:"id"`
	Effect Effect       `json:"effect"`
	Status OutboxStatus `json:"status"`
}

// NewOutboxEntry builds a PENDING outbox entry from an effect, content-addressing it.
// This is the WRITE side of the pattern: the operation calls this inside its state
// transaction so the effect can never exist without its state change (atomicity).
func NewOutboxEntry(e Effect) (OutboxEntry, error) {
	id, err := EffectID(e)
	if err != nil {
		return OutboxEntry{}, err
	}
	return OutboxEntry{ID: id, Effect: e, Status: OutboxPending}, nil
}

// Outbox is the injected datastore seam the dispatcher reads/writes (the wall: the
// real outbox is a Postgres table reached via sqlc/pgx; the fixture passes an
// in-memory mock). The package never touches a DB directly — determinism-first.
type Outbox interface {
	// Pending returns the entries still awaiting dispatch (status == pending), in a
	// deterministic order (the real query is ORDER BY created_at, id; the mock is
	// insertion-ordered).
	Pending() []OutboxEntry
	// MarkDispatched moves an entry to DISPATCHED by its content-addressed id. It is
	// idempotent: marking an already-dispatched id is a no-op (the at-least-once ack).
	MarkDispatched(id string)
	// IsDispatched reports whether an effect id has already been dispatched — the
	// dedup the dispatcher consults before delivering (the exactly-once-relative gate).
	IsDispatched(id string) bool
}

// Sink is the injected delivery seam — where a dispatched effect actually reaches the
// world (an SMTP client, an HTTP POST, a queue publish). The fixture's mock records the
// observable deliveries so the no-duplicate scenario can assert the count stays 1.
type Sink interface {
	// Deliver sends the effect to the world. A real Sink does the SMTP/HTTP; the mock
	// appends to a delivered log. Returns an error on a transport failure (the entry
	// stays PENDING and is retried — at-least-once).
	Deliver(e Effect) error
}

// Dispatch runs the dispatcher over the outbox: for every PENDING entry, if its id is
// NOT already dispatched, deliver the effect through the Sink and mark it DISPATCHED;
// if its id IS already dispatched (the at-least-once redelivery), SUPPRESS the delivery
// (no second observable effect). It returns the number of effects actually DELIVERED
// this run (a re-run over an already-dispatched outbox delivers 0).
//
// THE GUARANTEE (exactly-once RELATIVE). A write-then-crash leaves a PENDING entry that
// this run picks up and delivers (at-least-once: never lost). A crash AFTER delivery but
// BEFORE the ack leaves the id marked dispatched (or redelivered as PENDING) — either
// way IsDispatched suppresses the duplicate, so the observable delivery count is exactly
// one. The dispatcher is PURE over its seams: no clock, no rng, no LLM (CLAUDE.md §6/§8).
func Dispatch(outbox Outbox, sink Sink) (int, error) {
	delivered := 0
	for _, entry := range outbox.Pending() {
		if outbox.IsDispatched(entry.ID) {
			// At-least-once redelivery of an already-dispatched effect: suppress (the
			// content-addressed id collides with the prior dispatch).
			outbox.MarkDispatched(entry.ID)
			continue
		}
		if err := sink.Deliver(entry.Effect); err != nil {
			// Transport failure: leave the entry PENDING (retried next run) and stop —
			// never mark an undelivered effect dispatched (would silently drop it).
			return delivered, fmt.Errorf("operation: dispatch %q: %w", entry.ID, err)
		}
		outbox.MarkDispatched(entry.ID)
		delivered++
	}
	return delivered, nil
}

// ── BlockReason (the wall vocabulary) ───────────────────────────────────────────

// BlockAsync turns a typed async error into an actionable BlockReason (KRD §44.5), the
// same shape the wall/completeness use — REUSING the blockreason package (S13), with a
// non-empty how_to_fix path. It follows the blob package's local-code pattern (S72):
// the code string is local to this step, not a new entry in the global closed enum
// (which would need its own ChangeSet/ADR).
func BlockAsync(cause error) blockreason.BlockReason {
	code := "ASYNC_INVALID_TRIGGER"
	switch {
	case errors.Is(cause, ErrUnknownTriggerKind):
		code = "ASYNC_UNKNOWN_TRIGGER_KIND"
	case errors.Is(cause, ErrCronMissingEcheance):
		code = "ASYNC_CRON_MISSING_ECHEANCE"
	}
	return blockreason.BlockReason{
		Code:        blockreason.Code(code),
		Severity:    blockreason.SeverityBlocking,
		Explanation: "Le bloc async/planifié de l'operation est mal formé : " + cause.Error() + ".",
		HowToFix: []string{
			"trigger.kind : choisissez un kind dans l'ensemble fermé { cron, queue, webhook_out, notification } — jamais inventé.",
			"cron.at : pour un trigger cron, déclarez une échéance RFC3339 (l'horloge injectée la compare).",
			"rerun aidos check : rejouez la fixture async une fois le bloc corrigé — le scheduler est du code, jamais un LLM.",
		},
	}
}
