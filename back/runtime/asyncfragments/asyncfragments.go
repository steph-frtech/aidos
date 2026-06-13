// Package asyncfragments is the DP16 emitter of the ASYNC-SUBSTRATE service
// fragments (ROADMAP-provisioning-deploy, palette DP14 → fragments StackManifest)
// AND the realisation of a SCHEDULED operation through the S73 transactional
// outbox. It is the async twin of datafragments (DP15, the data layer):
//
//   - SubstrateAsyncFragments(projectID, env) → []ServiceFragment renders the TWO
//     async-layer services of the emitted app as DETERMINISTIC StackManifest data —
//     · Windmill — the workflow / jobs engine (role=workflow, profile core).
//     JAMAIS Temporal (contrainte dure, SPEC-stack-2026 : « Windmill reste le
//     moteur de workflows du slot ») — l'alternative Temporal est REFUSÉE.
//     · NATS — the message bus (role=bus, profile core).
//     Each fragment carries the DP14-measured image + internal port + named bind
//     volume + healthcheck + depends_on + profile + project_id, ISOLATED per project
//     (the volume name + the bind device env-var carry a deterministic per-project
//     token — project A never reaches project B's queue/jobs — S55/S82, the wall §2).
//
//   - RealizeScheduled(...) replays a PLANNED operation at its echeance on an
//     INJECTED clock (operation.Tick, S73 — never time.Now), then DISPATCHES its
//     effects through the S73 transactional OUTBOX (write the effect → dispatch →
//     ack), producing the deterministic sequence of dispatch events. The guarantee
//     is EXACTLY-ONCE RELATIVE: a replay after a crash re-presents the same
//     content-addressed effect id, which operation.Dispatch suppresses — no
//     observable duplicate. The async workers EMITTED for the app are TS workers
//     (ADR 0040, S74, relemit.EmitWorker) dispatching over NATS/Windmill; this Go
//     package is the BUILD-TIME realisation + the scheduler, NOT a runtime worker.
//
// THE IMAGES ARE THE DP14 MEASUREMENT (front/web/lib/substrate-palette.ts, the GO
// verdicts of the 2026-06-13 spike), engraved here — never re-discovered, never
// re-booted (the boot already happened; this package GRAVES the measured palette as
// fragments). Windmill's DP14 verdict is a registry-unavailability no-go (ghcr.io
// refused in the sandbox), NOT a service defect — its canonical contract (MODE
// server, port 8000, healthcheck GET /api/health) is the measured contract engraved
// here, and Windmill stays the slot's engine (Temporal refused).
//
// REUSE, DON'T FORK (CLAUDE.md §6, ADR 0007). The async/scheduled Operation AST, the
// Clock seam, the Tick scheduler, the Effect/EffectID idempotency key, the OutboxEntry
// /Outbox/Sink seams and the Dispatch dispatcher are ALL the S73 operation package —
// this package IMPORTS them, never re-coins them. The ServiceFragment shape, the
// per-project isolation token motif and the CanonicalFragment/HashFragment oracles
// are the DP15 datafragments package — reused verbatim. DP16 adds only: the TWO async
// palette rows + the build-time scheduled-realisation glue.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is PURE, TOTAL and
// DETERMINISTIC: no clock (the clock is INJECTED via operation.Clock), no RNG, no
// map-order leak, no absolute path. The per-project token is records.Hash (S02, via
// datafragments.IsolationToken); the canonical fragment body is records.Canonicalize.
// Same (projectID, env) ⇒ byte-identical fragments, ×100 (the reproducibility mirror).
// No LLM enters — the palette is a closed table, the scheduler is code, the isolation
// is a hash.
//
// THE WALL (CLAUDE.md §2). The Service AST is a DP02 above-the-line stack_manifest
// SOURCE; this package PROJECTS the async-substrate slice of it BELOW the line (a
// regenerable fragment for back/gen/<app>/, the composeemit input). It writes NO
// truth: no kernel/mirrors/fitness write. The scheduler/dispatcher write no truth —
// they read an injected clock and an injected outbox seam. A worker may not write
// truth (the emitted TS worker dispatches effects, it never touches the kernel).
package asyncfragments

import (
	"errors"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
)

// ServiceFragment is the DP15 projection value, reused verbatim (DP16 does not fork
// the fragment shape — same Key/ProjectID/Service/Volumes, same canonical oracles).
type ServiceFragment = datafragments.ServiceFragment

// The DECLARED, MEASURED images of the async-substrate palette — the DP14 GO/contract
// verdicts (front/web/lib/substrate-palette.ts), engraved above the line, never
// re-discovered. Windmill's image is its canonical ghcr.io image (the DP14 contract:
// registry-unavailability no-go, not a service defect; Windmill stays the slot's
// engine — Temporal refused). NATS measured GO (nats:2.10-alpine, /varz monitor).
const (
	windmillImage = "ghcr.io/windmill-labs/windmill:main" // DP14 contract: MODE=server, port 8000, GET /api/health — NEVER Temporal
	natsImage     = "nats:2.10-alpine"                    // DP14 GO: /varz monitor (server v2.10.29), port 4222 reachable
)

// The DECLARED internal ports (the DP14 measured / contract listen ports). They are
// distinct from the DP15 data ports so a grafted manifest keeps unique internal ports
// (stackmanifest.Validate's DUPLICATE_INTERNAL_PORT law).
const (
	windmillPort = 8000 // DP14 Windmill contract: MODE=server listens on 8000
	natsPort     = 4222 // DP14 NATS measured listen port
)

// The DECLARED healthchecks (the DP14 measured / contract probes — composeemit applies
// the boilerplate cadence; this is the command only).
const (
	windmillHealth = "wget -q --spider http://localhost:8000/api/health" // DP14 contract: GET /api/health
	natsHealth     = "wget -q --spider http://localhost:8222/varz"       // DP14 measured: /varz monitor (HTTP 8222)
)

// fragmentSpec is the DECLARED palette row — the measured, closed table. The order of
// asyncPalette is the canonical emission order (windmill, nats), stable & deterministic.
type fragmentSpec struct {
	key          string
	role         stackmanifest.Role
	image        string
	internalPort int
	profile      stackmanifest.Profile
	healthcheck  string
	dependsOn    []string
}

// asyncPalette is the CLOSED DP16 async-substrate palette (the DP14 measurement /
// contract, engraved). Declared, never learned (§8) — extending it is an addendum + a
// /goal. Both services are profile CORE (an emitted app that does background work
// always runs its workflow engine + bus); both are project-isolated bind volumes.
var asyncPalette = []fragmentSpec{
	{
		key:          "windmill",
		role:         stackmanifest.RoleWorkflow, // the DP02 closed role — Windmill, NEVER Temporal
		image:        windmillImage,
		internalPort: windmillPort,
		profile:      stackmanifest.ProfileCore,
		healthcheck:  windmillHealth,
		// Windmill stores its job state in Postgres (the DP15 datastore) — a deterministic edge.
		dependsOn: []string{"postgres"},
	},
	{
		key:          "nats",
		role:         stackmanifest.RoleBus,
		image:        natsImage,
		internalPort: natsPort,
		profile:      stackmanifest.ProfileCore,
		healthcheck:  natsHealth,
	},
}

// Keys returns the closed async-substrate palette keys in canonical emission order
// (the Workbench legend + the mirror read this single source).
func Keys() []string {
	out := make([]string, 0, len(asyncPalette))
	for _, s := range asyncPalette {
		out = append(out, s.key)
	}
	return out
}

// buildFragment renders ONE async fragment for a project (pure, deterministic). The
// service name and the volume are isolated per project via the DP15 token (reused, not
// forked) — Windmill's job DB / NATS's stream store never bleed across projects.
func buildFragment(s fragmentSpec, projectID, token string) ServiceFragment {
	// The volume is the per-project, per-service named bind volume. The device is an
	// ENV-VAR REFERENCE (composeemit / SPEC-stack-2026 law: never a hardcoded path); the
	// var name carries the service + token so each project's bind is its own (isolation),
	// e.g. WINDMILL_<token>_DATA_PATH. The discipline mirrors datafragments verbatim.
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

// upperEnv folds a token to an UPPER-SNAKE env-var fragment (non-alphanumerics → '_'),
// the SAME discipline datafragments.upperEnv / composeemit.envVarImage use (a
// deterministic map). Kept local so the package is self-contained (the DP15 twin is
// unexported); both fold identically, so the env-var keys agree across the two layers.
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

// SubstrateAsyncFragments is the DP16 AUTHORITATIVE door: it renders the async palette
// (Windmill + NATS) for (projectID, env). Both are profile core and legal in EVERY
// environment (unlike DP15's doltgres, no async service is env-gated), so the function
// only fails-closed on an UNKNOWN environment (the DP06 motif, never guessed). Same
// (projectID, env) ⇒ byte-identical fragments.
func SubstrateAsyncFragments(projectID string, env scope.Environment) ([]ServiceFragment, error) {
	if !scope.IsKnownEnvironment(env) {
		return nil, &envbindings.Refusal{
			Code:    envbindings.CodeUnknownEnvironment,
			Message: "environment is outside the closed set (want prod|staging|dev|local|future_cloud — ADR 0065)",
		}
	}
	token := datafragments.IsolationToken(projectID)
	out := make([]ServiceFragment, 0, len(asyncPalette))
	for _, s := range asyncPalette {
		out = append(out, buildFragment(s, projectID, token))
	}
	return out, nil
}

// CanonicalFragment / HashFragment delegate to the DP15 oracles (records.Canonicalize /
// records.Hash, S02 reused — never forked). Re-exported so the DP16 mirror reads one
// byte-identity oracle, shared with the data layer.
var (
	CanonicalFragment = datafragments.CanonicalFragment
	HashFragment      = datafragments.HashFragment
)

// ── The scheduled-operation realisation (S73 outbox, injected clock) ─────────────────

// DispatchEvent is one observable step of a scheduled realisation: the operation that
// fired, the content-addressed effect id (the idempotency key), the effect's delivery
// kind and target. The sequence RealizeScheduled returns is the deterministic dispatch
// trace the fixture asserts (state → scheduled-cmd → events).
type DispatchEvent struct {
	Operation string                `json:"operation"`
	EffectID  string                `json:"effect_id"`
	Kind      operation.TriggerKind `json:"kind"`
	Target    string                `json:"target"`
}

// RealizeScheduled is the BUILD-TIME realisation of a PLANNED operation: it ticks the
// scheduler on an INJECTED clock (operation.Tick, S73 — never time.Now), and IFF the
// operation's cron echeance has arrived, writes each effect to the injected outbox seam
// (PENDING, in the would-be state transaction) then DISPATCHES it (operation.Dispatch,
// S73) through the injected Sink, returning the ordered dispatch events.
//
// Before the echeance it fires nothing (Tick returns no op) → no outbox write, no
// dispatch, zero events. At/after the echeance it writes-then-dispatches each effect.
//
// EXACTLY-ONCE RELATIVE. The outbox is the S73 seam: a replay after a crash re-presents
// the SAME content-addressed effect id, which operation.Dispatch suppresses (the id
// collides with the prior dispatch) — so calling RealizeScheduled twice on the same
// (already-dispatched) outbox delivers the effect ONCE observably. The events returned
// reflect the ACTUAL deliveries this call performed (a re-run returns no events for an
// already-dispatched effect — honest, never a phantom event).
//
// PURE over its seams: the clock, the outbox and the sink are injected; no real clock,
// no rng, no LLM (CLAUDE.md §6/§8). Same (op, async, clock, outbox-state) ⇒ same events.
func RealizeScheduled(op operation.Operation, async operation.Async, clock operation.Clock, outbox operation.Outbox, sink operation.Sink) ([]DispatchEvent, error) {
	// 1. The closed-grammar pre-flight: the async block must be well-formed (a cron
	//    trigger carries an echeance, every kind is in the closed set). A malformed block
	//    is a typed failure, never a silent fire.
	if err := operation.ValidateAsync(async); err != nil {
		return nil, err
	}

	// 2. The scheduler — pure on the INJECTED clock. A cron op fires iff now ≥ echeance.
	scheduled := []operation.ScheduledOp{{Name: op.Name, Trigger: async.Trigger}}
	fired, err := operation.Tick(scheduled, clock)
	if err != nil {
		return nil, err
	}
	if len(fired) == 0 {
		// Not yet due — nothing to write, nothing to dispatch, no events. The outbox is
		// untouched (the effect is only written WHEN the operation fires).
		return nil, nil
	}

	// 3. Write each effect to the outbox as PENDING — the transactional-outbox WRITE side
	//    (the effect can never exist without its state change). The outbox seam is the S73
	//    Outbox; we use the OutboxWriter facet so a write reaches the mock/real table.
	writer, ok := outbox.(OutboxWriter)
	if !ok {
		return nil, ErrOutboxNotWritable
	}
	for _, eff := range async.Effects {
		entry, err := operation.NewOutboxEntry(eff)
		if err != nil {
			return nil, err
		}
		writer.Write(entry)
	}

	// 4. Snapshot the PENDING entries BEFORE dispatch so the event trace lists exactly the
	//    effects this call actually delivers (an already-dispatched id is suppressed by
	//    Dispatch and must NOT appear as a phantom event).
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

// OutboxWriter is the WRITE facet of the S73 outbox seam: RealizeScheduled needs to add a
// PENDING entry (the transactional-outbox write side) which the read-only operation.Outbox
// interface does not expose. A real outbox implements both (the INSERT ... + the queries);
// the mock implements Write alongside the S73 Pending/MarkDispatched/IsDispatched. Keeping
// Write here (not in S73) avoids forking the S73 interface — DP16 adds, never mutates (§9).
type OutboxWriter interface {
	// Write appends a PENDING outbox entry (the INSERT in the state transaction).
	Write(e operation.OutboxEntry)
}

// ErrOutboxNotWritable — the injected outbox does not implement OutboxWriter, so the
// scheduled effect cannot be written (a misconfigured seam, never a silent drop).
var ErrOutboxNotWritable = errors.New("asyncfragments: outbox does not implement OutboxWriter (cannot write the scheduled effect)")
