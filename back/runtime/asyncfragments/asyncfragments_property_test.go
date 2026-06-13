package asyncfragments_test

// Invariant mirror (rapid property test, ∀ N1) — WRITTEN FIRST (RED→GREEN).
// reflects=dp16-async-substrate-fragments+scheduled-realisation · test_kind=property ·
// cert_language=rapid · liveness=live · authority=above-the-line-source(stack_manifest)
// projected below + reuse of the S73 outbox.
//
// DP16 — the TWO async-substrate fragments (Windmill + NATS) + the scheduled
// realisation through the S73 outbox on an injected clock. The laws:
//
//   L1 byte-identique : ∀ (projectID, env) légaux, SubstrateAsyncFragments rend des
//      fragments dont le body canonique (records.Canonicalize) est BYTE-IDENTIQUE à
//      chaque appel — même projectID + même env ⇒ mêmes octets (déterminisme-first).
//   L2 palette close : EXACTEMENT 2 fragments (windmill, nats), chacun portant image +
//      port interne + volume bind + healthcheck + profile core + project_id — jamais
//      deviné, le jeu est clos. Windmill = role workflow (JAMAIS Temporal) ; nats = bus.
//   L3 pas de gate env : aucun fragment async n'est interdit par environnement (≠ DP15
//      doltgres) — seul un environnement HORS-ENSEMBLE échoue (UNKNOWN_ENVIRONMENT).
//   L4 isolation : project A ≠ project B ⇒ chaque fragment porte un project_id distinct
//      ET un nom de volume isolé ; A ne réutilise jamais l'octet de B.
//   L5 token partagé : le token d'isolation est CELUI de DP15 (datafragments.Isolation
//      Token), pas un schéma forké — même seed ⇒ même token sur les deux couches.
//   L6 planification déterministe : ∀ horloge injectée, RealizeScheduled est PUR — même
//      (op, async, now, état-outbox) ⇒ mêmes events (avant l'échéance : aucun ; à/après :
//      les mêmes dans le même ordre). Rejouer suit l'exactly-once relatif (0 doublon).
//   L7 le manifest émis est VALIDE (stackmanifest.Validate) une fois greffé sur un
//      server — DP16 ne fabrique aucune topologie illégale (ports uniques vs DP15).

import (
	"bytes"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/asyncfragments"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
	"pgregory.net/rapid"
)

func genProjectID(rt *rapid.T, label string) string {
	return rapid.StringMatching(`[a-z][a-z0-9-]{0,15}`).Draw(rt, label)
}

func genEnv(rt *rapid.T, label string) scope.Environment {
	envs := scope.Environments()
	return envs[rapid.IntRange(0, len(envs)-1).Draw(rt, label)]
}

func canonOf(t *testing.T, f asyncfragments.ServiceFragment) []byte {
	t.Helper()
	b, err := asyncfragments.CanonicalFragment(f)
	if err != nil {
		t.Fatalf("CanonicalFragment: %v", err)
	}
	return b
}

// TestL1ByteIdentique — same (projectID, env) ⇒ byte-identical fragments, ×100.
func TestL1ByteIdentique(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")

		a, errA := asyncfragments.SubstrateAsyncFragments(pid, env)
		b, errB := asyncfragments.SubstrateAsyncFragments(pid, env)
		if errA != nil || errB != nil {
			t.Fatalf("legal (%q,%q) must not error: %v / %v", pid, env, errA, errB)
		}
		if len(a) != len(b) {
			t.Fatalf("non-deterministic fragment count: %d vs %d", len(a), len(b))
		}
		for i := range a {
			if !bytes.Equal(canonOf(t, a[i]), canonOf(t, b[i])) {
				t.Fatalf("fragment %d not byte-identical across calls", i)
			}
		}
	})
}

// TestL2PaletteClose — exactly windmill + nats, each fully populated, closed roles.
func TestL2PaletteClose(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := genEnv(rt, "env")
		frags, err := asyncfragments.SubstrateAsyncFragments(pid, env)
		if err != nil {
			t.Fatalf("legal (%q,%q): %v", pid, env, err)
		}
		want := map[string]bool{"windmill": false, "nats": false}
		for _, f := range frags {
			if _, ok := want[f.Key]; !ok {
				t.Fatalf("unknown async fragment key %q (palette must be closed)", f.Key)
			}
			want[f.Key] = true
			if f.Service.Image == "" {
				t.Fatalf("%q: image required (DP14 measured/contract)", f.Key)
			}
			if f.Service.InternalPort == 0 {
				t.Fatalf("%q: internal port required", f.Key)
			}
			if f.Service.Healthcheck == "" {
				t.Fatalf("%q: healthcheck required", f.Key)
			}
			if f.Service.Profile != stackmanifest.ProfileCore {
				t.Fatalf("%q: async substrate is profile core, got %q", f.Key, f.Service.Profile)
			}
			if f.ProjectID != pid {
				t.Fatalf("%q: project_id %q, want %q", f.Key, f.ProjectID, pid)
			}
			if len(f.Volumes) == 0 {
				t.Fatalf("%q: a stateful async service must carry a bind volume", f.Key)
			}
			if !stackmanifest.IsKnownRole(f.Service.Role) {
				t.Fatalf("%q: role %q outside the closed DP02 set", f.Key, f.Service.Role)
			}
		}
		for k, seen := range want {
			if !seen {
				t.Fatalf("missing async fragment %q (the palette is fixed at two)", k)
			}
		}
	})
}

// TestL3NoEnvGate — no async fragment is env-gated; every legal env yields 2 fragments,
// only an out-of-set env fails closed.
func TestL3NoEnvGate(t *testing.T) {
	for _, env := range scope.Environments() {
		frags, err := asyncfragments.SubstrateAsyncFragments("proj", env)
		if err != nil {
			t.Fatalf("env %q must not gate any async service: %v", env, err)
		}
		if len(frags) != 2 {
			t.Fatalf("env %q: async fragments = %d, want 2", env, len(frags))
		}
	}
	_, err := asyncfragments.SubstrateAsyncFragments("proj", scope.Environment("nowhere"))
	var ref *envbindings.Refusal
	if !envbindings.AsRefusal(err, &ref) || ref.Code != envbindings.CodeUnknownEnvironment {
		t.Fatalf("out-of-set env must fail closed with UNKNOWN_ENVIRONMENT, got %v", err)
	}
}

// TestL4Isolation — project A ≠ project B ⇒ distinct project_id + distinct volume names
// ⇒ byte-distinct fragments (the anti-collision frontier).
func TestL4Isolation(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		a := genProjectID(rt, "a")
		b := genProjectID(rt, "b")
		if a == b {
			return
		}
		env := genEnv(rt, "env")
		fa, _ := asyncfragments.SubstrateAsyncFragments(a, env)
		fb, _ := asyncfragments.SubstrateAsyncFragments(b, env)
		if len(fa) != len(fb) {
			t.Fatalf("same palette size expected: %d vs %d", len(fa), len(fb))
		}
		for i := range fa {
			if fa[i].ProjectID == fb[i].ProjectID {
				t.Fatalf("fragment %q: project_id must differ between A=%q B=%q", fa[i].Key, a, b)
			}
			for _, va := range fa[i].Volumes {
				for _, vb := range fb[i].Volumes {
					if va.Name == vb.Name {
						t.Fatalf("fragment %q: volume %q shared across projects (isolation breach)", fa[i].Key, va.Name)
					}
				}
			}
			if bytes.Equal(canonOf(t, fa[i]), canonOf(t, fb[i])) {
				t.Fatalf("fragment %q: A and B canonical bytes must differ (isolation)", fa[i].Key)
			}
		}
	})
}

// TestL5SharedIsolationToken — DP16 reuses the EXACT DP15 token (no forked scheme): the
// async volume name carries datafragments.IsolationToken(projectID).
func TestL5SharedIsolationToken(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		token := datafragments.IsolationToken(pid)
		frags, err := asyncfragments.SubstrateAsyncFragments(pid, scope.EnvDev)
		if err != nil {
			t.Fatalf("dev: %v", err)
		}
		for _, f := range frags {
			found := false
			for _, v := range f.Volumes {
				if v.Name == f.Key+"-"+token {
					found = true
				}
			}
			if !found {
				t.Fatalf("fragment %q: volume must carry the shared DP15 token %q", f.Key, token)
			}
		}
	})
}

// ── L6 deterministic scheduling on the injected clock + replay (exactly-once) ────────

// schedOutbox is a tiny in-package writable outbox double for the property checks.
type schedOutbox struct {
	entries    []operation.OutboxEntry
	dispatched map[string]bool
}

func newSchedOutbox() *schedOutbox { return &schedOutbox{dispatched: map[string]bool{}} }

func (o *schedOutbox) Write(e operation.OutboxEntry) { o.entries = append(o.entries, e) }
func (o *schedOutbox) Pending() []operation.OutboxEntry {
	out := make([]operation.OutboxEntry, 0, len(o.entries))
	for _, e := range o.entries {
		if e.Status == operation.OutboxPending {
			out = append(out, e)
		}
	}
	return out
}
func (o *schedOutbox) MarkDispatched(id string) {
	o.dispatched[id] = true
	for i := range o.entries {
		if o.entries[i].ID == id {
			o.entries[i].Status = operation.OutboxDispatched
		}
	}
}
func (o *schedOutbox) IsDispatched(id string) bool { return o.dispatched[id] }

type schedSink struct{ n int }

func (s *schedSink) Deliver(operation.Effect) error { s.n++; return nil }

// TestL6DeterministicScheduling — RealizeScheduled is PURE on the injected clock: the
// SAME now yields the SAME events twice; before the echeance no events, at/after the
// echeance the same single dispatch event. The scheduler is code, never an LLM.
func TestL6DeterministicScheduling(t *testing.T) {
	op, async := operation.SendReminder() // echeance 2026-06-08T09:00:00Z
	rapid.Check(t, func(rt *rapid.T) {
		// Draw a clock instant from a fixed close set straddling the echeance.
		instants := []string{
			"2026-06-08T08:00:00Z", // before
			"2026-06-08T08:59:59Z", // just before
			"2026-06-08T09:00:00Z", // exactly at
			"2026-06-08T09:00:01Z", // just after
			"2026-06-09T00:00:00Z", // long after
		}
		now := instants[rapid.IntRange(0, len(instants)-1).Draw(rt, "now")]
		clock := operation.FixedClock{At: now}

		ev1, err1 := asyncfragments.RealizeScheduled(op, async, clock, newSchedOutbox(), &schedSink{})
		ev2, err2 := asyncfragments.RealizeScheduled(op, async, clock, newSchedOutbox(), &schedSink{})
		if err1 != nil || err2 != nil {
			t.Fatalf("RealizeScheduled errored: %v / %v", err1, err2)
		}
		if len(ev1) != len(ev2) {
			t.Fatalf("non-deterministic event count at now=%q: %d vs %d", now, len(ev1), len(ev2))
		}
		for i := range ev1 {
			if ev1[i] != ev2[i] {
				t.Fatalf("non-deterministic event %d at now=%q: %+v vs %+v", i, now, ev1[i], ev2[i])
			}
		}
		// The schedule predicate: due ⇔ now ≥ echeance.
		due, err := operation.Due(async.Trigger.At, now)
		if err != nil {
			t.Fatalf("Due: %v", err)
		}
		if due && len(ev1) != 1 {
			t.Fatalf("at/after echeance (now=%q) want 1 dispatch event, got %d", now, len(ev1))
		}
		if !due && len(ev1) != 0 {
			t.Fatalf("before echeance (now=%q) want 0 events, got %d", now, len(ev1))
		}
	})
}

// TestL6ReplayExactlyOnce — realising on the SAME outbox twice past the echeance never
// duplicates an observable delivery (exactly-once relative).
func TestL6ReplayExactlyOnce(t *testing.T) {
	op, async := operation.SendReminder()
	at := operation.FixedClock{At: "2026-06-08T09:00:00Z"}
	outbox := newSchedOutbox()
	sink := &schedSink{}

	if _, err := asyncfragments.RealizeScheduled(op, async, at, outbox, sink); err != nil {
		t.Fatalf("realise #1: %v", err)
	}
	if sink.n != 1 {
		t.Fatalf("first realisation delivered %d, want 1", sink.n)
	}
	// Replay N times on the same (already-dispatched) outbox — always 0 new deliveries.
	for i := 0; i < 5; i++ {
		ev, err := asyncfragments.RealizeScheduled(op, async, at, outbox, sink)
		if err != nil {
			t.Fatalf("replay #%d: %v", i, err)
		}
		if len(ev) != 0 {
			t.Fatalf("replay #%d emitted %d phantom events, want 0", i, len(ev))
		}
	}
	if sink.n != 1 {
		t.Fatalf("observable deliveries after 5 replays = %d, want 1 (exactly-once relative)", sink.n)
	}
}

// TestL7GraftedManifestValid — the async fragments grafted onto a minimal server (with
// the DP15 data fragments) form a VALID StackManifest: unique internal ports (async
// ports distinct from data ports), known roles/profiles, ≥1 server.
func TestL7GraftedManifestValid(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		pid := genProjectID(rt, "pid")
		env := scope.EnvDev
		async, err := asyncfragments.SubstrateAsyncFragments(pid, env)
		if err != nil {
			t.Fatalf("async dev: %v", err)
		}
		data, err := datafragments.SubstrateDataFragments(pid, env)
		if err != nil {
			t.Fatalf("data dev: %v", err)
		}
		m := stackmanifest.StackManifest{
			AppName: "graft-" + pid + "x",
			Services: []stackmanifest.Service{
				{Name: "app", Role: stackmanifest.RoleServer, Image: "node:22-alpine", InternalPort: 3000, Profile: stackmanifest.ProfileCore},
			},
			Network: stackmanifest.Network{Name: "traefik_default", External: true},
		}
		for _, f := range append(append([]asyncfragments.ServiceFragment{}, data...), async...) {
			m.Services = append(m.Services, f.Service)
			m.Volumes = append(m.Volumes, f.Volumes...)
		}
		if err := stackmanifest.Validate(m); err != nil {
			t.Fatalf("grafted manifest (data+async) must be valid: %v", err)
		}
	})
}

// TestCanonicalIsRecordsCanonical — CanonicalFragment delegates to records.Canonicalize
// (S02 reused, never forked): re-canonicalising is a fixpoint.
func TestCanonicalIsRecordsCanonical(t *testing.T) {
	frags, err := asyncfragments.SubstrateAsyncFragments("proj", scope.EnvDev)
	if err != nil {
		t.Fatalf("dev: %v", err)
	}
	for _, f := range frags {
		b := canonOf(t, f)
		again, err := records.Canonicalize(b)
		if err != nil {
			t.Fatalf("re-canonicalise: %v", err)
		}
		if !bytes.Equal(b, again) {
			t.Fatalf("%q: canonical form is not a records.Canonicalize fixpoint", f.Key)
		}
	}
}
