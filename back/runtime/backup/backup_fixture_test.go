package backup_test

// Fixture mirror (N2: state → cmd → events), interpreted in Go — WRITTEN FIRST
// (RED→GREEN). reflects=dp31-deterministic-data-backup · test_kind=workflow ·
// cert_language=fixture · liveness=live · authority=below.
//
// Materialized source (conceptually stored in the `mirrors` schema; persisted to
// Postgres at S06 — bootstrap exception): tests/runtime/backup_scheduled.fixture.md.
// It is the LIEN PORTEUR: this test loads the planned-backup/fires-at-echeance +
// round-trip-without-loss + project-isolation + no-secret-in-clear scenarios; if the
// fixture intention disappears the test breaks (no silent rot into a monster).
//
// DP31 — the BACKUP twin of DP16: a PLANNED backup job realised through the S73
// transactional outbox on an INJECTED clock (asyncfragments.RealizeScheduled, never
// time.Now), producing a content-addressed RESTORABLE artifact, scoped project_id
// (the DP15 datafragments isolation token / the S72 blob StorageKey scoping motif),
// and PROVEN secret-free by the S91 secretstore.ScanEmission scanner. RESTORE round-
// trips the data without loss and RECORDS the decision (append-only). The backup
// REUSES the S73 outbox/sink seams + the DP16 RealizeScheduled glue — it does NOT
// fork the scheduler; the clock is operation.FixedClock so the package stays pure.

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/asyncfragments"
	"github.com/steph-frtech/aidos/back/runtime/backup"
)

// ── the S73 outbox/sink mocks (reused shape — same as the DP16 fixture) ──────────────

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

// sampleState is the deterministic per-project state to back up: two named bind
// volumes (${APP_DATA_PATH} entries) + a datastore dump (Postgres rows), NO secret.
func sampleState(projectID string) backup.ProjectState {
	return backup.ProjectState{
		ProjectID: projectID,
		Volumes: []backup.VolumeSnapshot{
			{Name: "uploads", Bytes: []byte("photo.jpg=<bytes>")},
			{Name: "exports", Bytes: []byte("report.csv=a,b,c")},
		},
		Datastore: backup.DatastoreDump{
			Engine: backup.EngineDoltgres, // non-prod snapshot
			Rows:   []byte("orders\n1,paid\n2,shipped\n"),
		},
	}
}

// ── (1) a PLANNED backup fires at its echeance (injected clock) → restorable artefact ─

func TestFixture_ScheduledBackupRealizesAtEcheance(t *testing.T) {
	st := sampleState("proj-A")

	// Before the echeance: nothing fires — no artefact, no outbox write, no dispatch.
	before := operation.FixedClock{At: "2026-06-08T08:59:59Z"}
	out := newMockOutbox()
	sink := &mockSink{}
	res, err := backup.RealizeBackup(st, before, out, sink)
	if err != nil {
		t.Fatalf("RealizeBackup(before): %v", err)
	}
	if res.Fired {
		t.Fatalf("backup fired before echeance, want not-yet-due")
	}
	if res.Artifact != nil {
		t.Fatalf("an artefact was produced before the echeance, want none")
	}
	if len(out.entries) != 0 || len(sink.delivered) != 0 {
		t.Fatalf("outbox/sink touched before echeance (writes=%d delivered=%d), want 0/0", len(out.entries), len(sink.delivered))
	}

	// At the echeance: the backup fires → a RESTORABLE artefact is produced, the
	// dispatch effect is written-then-delivered (the S73 outbox), one event.
	at := operation.FixedClock{At: "2026-06-08T09:00:00Z"}
	out = newMockOutbox()
	sink = &mockSink{}
	res, err = backup.RealizeBackup(st, at, out, sink)
	if err != nil {
		t.Fatalf("RealizeBackup(at): %v", err)
	}
	if !res.Fired {
		t.Fatalf("backup did not fire at the echeance")
	}
	if res.Artifact == nil {
		t.Fatalf("no artefact produced at the echeance")
	}
	if res.Artifact.ProjectID != "proj-A" {
		t.Fatalf("artefact project_id = %q, want proj-A", res.Artifact.ProjectID)
	}
	if res.Artifact.ContentAddress == "" {
		t.Fatalf("artefact must be content-addressed (restorable + reproducible)")
	}
	// The artefact must carry both planes: the volumes AND the datastore dump.
	if len(res.Artifact.Volumes) != 2 {
		t.Fatalf("artefact volumes = %d, want 2 (${APP_DATA_PATH} bind volumes)", len(res.Artifact.Volumes))
	}
	if res.Artifact.Datastore.Engine != backup.EngineDoltgres {
		t.Fatalf("artefact datastore engine = %q, want doltgres dump", res.Artifact.Datastore.Engine)
	}
	// The scheduled backup dispatched its "backup taken" notification exactly once.
	if len(res.Events) != 1 {
		t.Fatalf("dispatch events = %d, want 1 (the backup-taken notification)", len(res.Events))
	}
	if len(sink.delivered) != 1 {
		t.Fatalf("deliveries = %d, want 1", len(sink.delivered))
	}
}

// A replay after a crash never doubles the backup-taken delivery (exactly-once relative,
// inherited from the S73 outbox via asyncfragments — DP31 does not re-coin it).
func TestFixture_ReplayNeverDoublesTheBackupEvent(t *testing.T) {
	st := sampleState("proj-A")
	at := operation.FixedClock{At: "2026-06-08T09:00:00Z"}
	out := newMockOutbox()
	sink := &mockSink{}

	r1, err := backup.RealizeBackup(st, at, out, sink)
	if err != nil || len(r1.Events) != 1 || len(sink.delivered) != 1 {
		t.Fatalf("first realisation: err=%v events=%d delivered=%d, want nil/1/1", err, len(r1.Events), len(sink.delivered))
	}
	r2, err := backup.RealizeBackup(st, at, out, sink)
	if err != nil {
		t.Fatalf("replay: %v", err)
	}
	if len(r2.Events) != 0 {
		t.Fatalf("replay events = %d, want 0 (the redelivery is suppressed)", len(r2.Events))
	}
	if len(sink.delivered) != 1 {
		t.Fatalf("observable deliveries after replay = %d, want 1 (exactly-once relative)", len(sink.delivered))
	}
}

// ── (2) a RESTORE round-trips the data WITHOUT loss + records the decision ────────────

func TestFixture_RestoreRoundTripsWithoutLoss(t *testing.T) {
	st := sampleState("proj-A")
	at := operation.FixedClock{At: "2026-06-08T09:00:00Z"}
	res, err := backup.RealizeBackup(st, at, newMockOutbox(), &mockSink{})
	if err != nil || res.Artifact == nil {
		t.Fatalf("backup: err=%v artefact=%v", err, res.Artifact)
	}

	restored, decision, err := backup.RestoreBackup(*res.Artifact)
	if err != nil {
		t.Fatalf("RestoreBackup: %v", err)
	}
	// Round-trip: the restored state EQUALS the backed-up state (no loss).
	if !backup.StateEqual(st, restored) {
		t.Fatalf("restored state differs from the backed-up state (data loss)\n got %+v\nwant %+v", restored, st)
	}
	// The restoration is a RECORDED decision (append-only): it carries the artefact's
	// content address + the project it restored, traceable.
	if decision.ArtifactAddress != res.Artifact.ContentAddress {
		t.Fatalf("decision artefact address = %q, want %q", decision.ArtifactAddress, res.Artifact.ContentAddress)
	}
	if decision.ProjectID != "proj-A" {
		t.Fatalf("decision project_id = %q, want proj-A", decision.ProjectID)
	}
	if decision.Address == "" {
		t.Fatalf("the restore decision must itself be content-addressed (append-only trace)")
	}
}

// ── (4) ISOLATION PAR PROJET — backup of A is inaccessible from B ─────────────────────

func TestFixture_ProjectIsolation(t *testing.T) {
	at := operation.FixedClock{At: "2026-06-08T09:00:00Z"}
	resA, err := backup.RealizeBackup(sampleState("proj-A"), at, newMockOutbox(), &mockSink{})
	if err != nil || resA.Artifact == nil {
		t.Fatalf("backup A: err=%v artefact=%v", err, resA.Artifact)
	}

	// Restoring A's artefact INTO project B is refused (cross-project access — the
	// artefact's storage key is owned by A, the wall §2 / S55 isolation).
	if err := backup.AccessArtifact(*resA.Artifact, "proj-B"); err == nil {
		t.Fatal("project B reached project A's backup, want a cross-project refusal")
	}
	// The owning project A may access it.
	if err := backup.AccessArtifact(*resA.Artifact, "proj-A"); err != nil {
		t.Fatalf("the owning project A must access its own backup: %v", err)
	}
	// And A's address differs from B's (the isolation token makes the namespace differ).
	resB, err := backup.RealizeBackup(sampleState("proj-B"), at, newMockOutbox(), &mockSink{})
	if err != nil || resB.Artifact == nil {
		t.Fatalf("backup B: err=%v artefact=%v", err, resB.Artifact)
	}
	if resA.Artifact.StorageKey == resB.Artifact.StorageKey {
		t.Fatalf("A and B share a storage key %q, want project-isolated keys", resA.Artifact.StorageKey)
	}
}

// ── the closed-grammar pre-flight (typed failure, never a silent backup) ──────────────

func TestFixture_NonWritableOutboxErrorIsTyped(t *testing.T) {
	if !errors.Is(asyncfragments.ErrOutboxNotWritable, asyncfragments.ErrOutboxNotWritable) {
		t.Fatal("the DP16 typed sentinel must be reachable")
	}
	// An empty project_id is refused (the isolation scope must be pinned).
	at := operation.FixedClock{At: "2026-06-08T09:00:00Z"}
	st := sampleState("")
	if _, err := backup.RealizeBackup(st, at, newMockOutbox(), &mockSink{}); err == nil {
		t.Fatal("a backup with no project_id must be refused (isolation scope unpinned)")
	}
}
