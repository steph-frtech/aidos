// Package backup is the AIDOS DP31 DETERMINISTIC DATA-BACKUP of an emitted app
// (ROADMAP-provisioning-deploy §DP31, EPIC G). It plans + realises a backup of the
// app's STATE — its named bind volumes (${APP_DATA_PATH}) AND its datastore (a Postgres
// dump / a Doltgres snapshot, non-prod) — as an ASYNC, SCHEDULED job, produces a
// content-addressed RESTORABLE artefact scoped to a project_id, and RESTORES it round-
// trip without loss, recording the restoration as an append-only decision.
//
// DISTINCT FROM THE ROLLBACK (DP28). The backup protects the DATA; the rollback-by-phase
// re-emits the CODE. They never overlap: this package never touches a phase/changeset, it
// snapshots and restores bytes.
//
// THE SHAPE (the DP31 done-criteria, all DETERMINISTIC):
//
//   - PLANNED (fixture): RealizeBackup ticks the S73 scheduler on an INJECTED clock
//     (asyncfragments.RealizeScheduled — never time.Now). Before the echeance it fires
//     nothing; at/after it produces a RESTORABLE artefact and dispatches a "backup taken"
//     notification through the S73 transactional outbox (exactly-once relative — a replay
//     after a crash never doubles the event).
//   - ROUND-TRIP (fixture): RestoreBackup(artifact) reconstructs the exact ProjectState
//     that was backed up (StateEqual ⇒ no loss) AND records the restoration as a content-
//     addressed, append-only RestoreDecision.
//   - NO-SECRET-IN-CLEAR (property): the artefact carries NO secret in the clear. The S91
//     secretstore.ScanEmission (gitleaks-style DETERMINISTIC scanner) is the GATE: a state
//     whose bytes carry a clear secret makes RealizeBackup FAIL CLOSED (no leaking
//     artefact is ever minted); a secret-free state scans clean.
//   - ISOLATION (fixture + property): an artefact's StorageKey is namespaced by the DP15
//     per-project isolation token (datafragments.IsolationToken) + the S72 blob StorageKey
//     scoping motif, so a backup of project A is INACCESSIBLE from project B
//     (AccessArtifact refuses cross-project). Two distinct projects backing up the same
//     bytes get distinct keys.
//   - REPRODUCIBILITY (property): same state + same clock ⇒ byte-identical artefact (the
//     same content address), ×N.
//
// REUSE, DON'T FORK (CLAUDE.md §6, ADR 0007). The scheduler / Clock seam / outbox / sink /
// EffectID idempotency are the S73 operation package, driven through the DP16
// asyncfragments.RealizeScheduled glue — this package IMPORTS them, never re-coins them.
// The per-project isolation token is datafragments.IsolationToken (DP15, reused verbatim).
// The no-secret scan is secretstore.ScanEmission (S91, reused verbatim). The content
// address is records.Hash/Canonicalize (S02). DP31 adds only: the backup data model, the
// scheduled-realisation-to-artefact glue, the restore round-trip + decision, and the
// fail-closed secret gate wired to S91.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Every function here is PURE, TOTAL and
// DETERMINISTIC: the clock is INJECTED (operation.Clock), the data selection is a
// deterministic scoped copy, the content address is a hash, the secret scan is regex
// matching, the isolation is a hash. No clock read, no RNG, no map-order leak, no LLM —
// the scheduling is code (the DP16 injected clock), the data selection is a scoped query,
// the secret gate is the S91 scanner.
//
// THE WALL (CLAUDE.md §2). This is Runtime plumbing BELOW the line. It writes NO truth: no
// kernel/mirrors/fitness write. A backup is operational material (bytes), not a truth — a
// restoration is a RECORDED decision (append-only, §9), never a truth edit. The artefact
// bytes never enter the truth-store nor git; they target an object-storage provider (the
// S72 slot) addressed by the project-scoped StorageKey.
package backup

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/asyncfragments"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/secretstore"
)

// EngineKind is the CLOSED set of datastore engines a backup dumps. Postgres is the prod
// datastore (a logical dump); Doltgres is the non-prod git-for-data store (a snapshot).
// Declared, never learned (§8) — extending it is an addendum + a /goal.
type EngineKind string

const (
	// EnginePostgres — a logical Postgres dump (the prod datastore, DP15).
	EnginePostgres EngineKind = "postgres"
	// EngineDoltgres — a Doltgres snapshot (the non-prod git-for-data store, DP15).
	EngineDoltgres EngineKind = "doltgres"
)

// IsKnownEngine reports whether e is in the closed engine set (fail-closed, never guessed).
func IsKnownEngine(e EngineKind) bool {
	return e == EnginePostgres || e == EngineDoltgres
}

// VolumeSnapshot is one named bind volume captured at backup time: the volume name (the
// ${APP_DATA_PATH} key) + its raw bytes. The order of the Volumes slice in a ProjectState
// is the canonical capture order (a reorder is a different state — like an attribute
// reorder in S35), so the artefact canonicalises the slice as-is.
type VolumeSnapshot struct {
	Name  string `json:"name"`
	Bytes []byte `json:"bytes"`
}

// DatastoreDump is the captured datastore: the engine + the dump/snapshot bytes. A backup
// always carries exactly one datastore dump (the project's single datastore, DP15).
type DatastoreDump struct {
	Engine EngineKind `json:"engine"`
	Rows   []byte     `json:"rows"`
}

// ProjectState is the deterministic, project-scoped SELECTION of data to back up: the
// project's named bind volumes + its datastore dump. It is produced by a deterministic
// scoped query of the live substrate (DP15) — this package consumes it; selecting it is
// the caller's deterministic step (a SELECT scoped by project_id, never an LLM).
type ProjectState struct {
	ProjectID string           `json:"project_id"`
	Volumes   []VolumeSnapshot `json:"volumes"`
	Datastore DatastoreDump    `json:"datastore"`
}

// BackupArtifact is the RESTORABLE, content-addressed product of a backup. It carries the
// captured state (volumes + datastore), the owning project_id, a project-namespaced
// StorageKey (the object-storage address, S72 motif), and the ContentAddress (the S02 hash
// of the canonical artefact body) — the same state ⇒ the same address (reproducibility),
// and a project's address namespace never collides with another's (isolation).
type BackupArtifact struct {
	ProjectID string `json:"project_id"`
	// StorageKey is the project-namespaced object-storage address (the S72 scoping motif:
	// "<isolation-token>/backups/<content-address>"). A key minted for project A cannot be
	// resolved from project B (AccessArtifact refuses it).
	StorageKey string `json:"storage_key"`
	// ContentAddress is the S02 content address of the canonical artefact body — restorable
	// (it identifies exactly these bytes) and reproducible (same state ⇒ same address).
	ContentAddress string `json:"content_address"`
	// Volumes + Datastore are the captured state (the restorable payload).
	Volumes   []VolumeSnapshot `json:"volumes"`
	Datastore DatastoreDump    `json:"datastore"`
}

// RestoreDecision is the append-only RECORD of a restoration (§9: a restore is a recorded
// decision, never a truth edit). It carries the restored project, the artefact it restored
// from, and its own content address (so the decision is itself traceable / content-
// addressed). It is returned for the caller to append to the `restore_decisions` store
// (below the line, never the kernel).
type RestoreDecision struct {
	ProjectID string `json:"project_id"`
	// ArtifactAddress is the content address of the BackupArtifact restored from.
	ArtifactAddress string `json:"artifact_address"`
	// Address is the content address of THIS decision (project + artefact address),
	// deterministic — the same restore recorded twice yields the same address (idempotent
	// append).
	Address string `json:"address"`
}

// BackupResult is the outcome of RealizeBackup: whether the scheduled backup FIRED at the
// injected clock, the produced Artifact (nil before the echeance), and the deterministic
// dispatch Events of the "backup taken" notification (the S73 outbox trace).
type BackupResult struct {
	Fired    bool                           `json:"fired"`
	Artifact *BackupArtifact                `json:"artifact,omitempty"`
	Events   []asyncfragments.DispatchEvent `json:"events"`
}

var (
	// ErrNoProject — a backup pinned no project_id (the isolation scope must be set).
	ErrNoProject = errors.New("backup: state pins no project_id (isolation scope unset)")
	// ErrUnknownEngine — the datastore dump carried an engine outside the closed set.
	ErrUnknownEngine = errors.New("backup: unknown datastore engine (want postgres|doltgres)")
	// ErrSecretInClear — the S91 scan found a secret in the clear in the state being
	// backed up; the backup FAILS CLOSED (no leaking artefact is ever minted).
	ErrSecretInClear = errors.New("backup: refused — a secret in the clear was found in the state (S91 ScanEmission)")
	// ErrCrossProject — an artefact was accessed from a project that does not own it.
	ErrCrossProject = errors.New("backup: cross-project access refused — artefact owned by another project")
)

// scheduleAt is the DECLARED echeance of the backup schedule (a cron at the canonical
// daily instant). It is a CONSTANT (the schedule is code, declared above the line — the
// reproducibility mirror pins same-clock ⇒ same firing). A real deploy passes the project's
// declared cron; here the anchor instant matches the DP16 SendReminder anchor so the
// fixture clock is shared and the realisation is deterministic.
const scheduleAt = "2026-06-08T09:00:00Z"

// ScheduleBackup builds the PLANNED async operation for a project's backup: a cron trigger
// at the declared echeance carrying ONE notification effect (the "backup taken" event). It
// is PURE: same (projectID, contentAddress) ⇒ the same Operation/Async (the effect payload
// is the artefact address, NOT a clock read — so the dispatched effect id is reproducible).
//
// The effect's target is a project-scoped backup-notification channel and its payload is
// the artefact's content address — both deterministic functions of the inputs, so the S73
// EffectID (the idempotency key) is stable, and a replay never doubles the event.
func ScheduleBackup(projectID, contentAddress string) (operation.Operation, operation.Async) {
	op := operation.Operation{Name: "backupTaken"}
	async := operation.Async{
		Trigger: operation.AsyncTrigger{Kind: operation.TriggerCron, At: scheduleAt},
		Effects: []operation.Effect{
			{
				Kind:    operation.TriggerNotification,
				Target:  "backup-channel:" + projectID,
				Payload: map[string]any{"artifact": contentAddress},
			},
		},
	}
	return op, async
}

// RealizeBackup plans + realises a project's backup as a SCHEDULED async job on an INJECTED
// clock. It:
//
//  1. validates the state (a pinned project_id, a known engine);
//  2. mints the RESTORABLE artefact (deterministically) — BUT gates it through the S91
//     no-secret scan FIRST: if the state's bytes carry a secret in the clear, it FAILS
//     CLOSED (ErrSecretInClear) and mints NOTHING;
//  3. schedules the "backup taken" notification and realises it through the DP16
//     RealizeScheduled glue (the S73 outbox on the INJECTED clock — never time.Now).
//
// Before the echeance the scheduler fires nothing: Fired=false, Artifact=nil, no event
// (a backup not yet due touches no storage). At/after the echeance it returns the artefact
// + the deterministic dispatch trace. Same (state, clock) ⇒ same artefact + same events.
//
// THE SECRET GATE IS FIRST AND FAIL-CLOSED. The artefact is the SAME for any clock (it is a
// pure function of the state) — so the scan runs once, before scheduling. A leaking state
// can never produce an artefact at any echeance (the gate, not an afterthought).
func RealizeBackup(state ProjectState, clock operation.Clock, outbox operation.Outbox, sink operation.Sink) (BackupResult, error) {
	if state.ProjectID == "" {
		return BackupResult{}, ErrNoProject
	}
	if !IsKnownEngine(state.Datastore.Engine) {
		return BackupResult{}, fmt.Errorf("%w: %q", ErrUnknownEngine, state.Datastore.Engine)
	}

	// Mint the candidate artefact deterministically (a pure function of the state).
	artifact, err := mintArtifact(state)
	if err != nil {
		return BackupResult{}, err
	}

	// THE S91 GATE (fail-closed). Scan the artefact's serialized bytes for a secret in the
	// clear; a non-clean scan refuses the backup (no leaking artefact is ever returned).
	if !secretstore.IsClean(SerializeForScan(artifact), nil) {
		return BackupResult{}, ErrSecretInClear
	}

	// Schedule the "backup taken" notification (the effect payload is the artefact address —
	// deterministic, so the S73 idempotency key is stable) and realise it on the injected
	// clock through the DP16 glue (the S73 outbox — exactly-once relative).
	op, async := ScheduleBackup(state.ProjectID, artifact.ContentAddress)
	events, err := asyncfragments.RealizeScheduled(op, async, clock, outbox, sink)
	if err != nil {
		return BackupResult{}, err
	}

	// Before the echeance the scheduler fired nothing → no artefact is committed (a backup
	// not yet due touches no storage); at/after it commits the artefact + the dispatch trace.
	fired, err := isDue(async, clock)
	if err != nil {
		return BackupResult{}, err
	}
	if !fired {
		return BackupResult{Fired: false, Events: nil}, nil
	}
	return BackupResult{Fired: true, Artifact: &artifact, Events: events}, nil
}

// isDue reports whether the scheduled backup's cron echeance has arrived at the injected
// clock — reusing the S73 scheduler verbatim (operation.Tick over the single scheduled op).
func isDue(async operation.Async, clock operation.Clock) (bool, error) {
	scheduled := []operation.ScheduledOp{{Name: "backupTaken", Trigger: async.Trigger}}
	fired, err := operation.Tick(scheduled, clock)
	if err != nil {
		return false, err
	}
	return len(fired) > 0, nil
}

// mintArtifact builds the content-addressed, project-namespaced artefact from a state. It
// is PURE: the content address is records.Hash(canonical body), the StorageKey namespaces
// it under the DP15 per-project isolation token (the S72 scoping motif). Same state ⇒ same
// address; distinct projects (even with identical bytes) ⇒ distinct keys (isolation).
func mintArtifact(state ProjectState) (BackupArtifact, error) {
	canon, err := canonicalBody(state)
	if err != nil {
		return BackupArtifact{}, err
	}
	addr := records.Hash(canon)
	// The StorageKey is namespaced by the DP15 isolation token (reused verbatim, never a
	// forked scheme): "<token>/backups/<content-address>". Project A's token differs from
	// B's, so A's key namespace never collides with B's — the isolation done-criterion.
	token := datafragments.IsolationToken(state.ProjectID)
	key := token + "/backups/" + addr
	return BackupArtifact{
		ProjectID:      state.ProjectID,
		StorageKey:     key,
		ContentAddress: addr,
		Volumes:        cloneVolumes(state.Volumes),
		Datastore:      cloneDump(state.Datastore),
	}, nil
}

// artifactBody is the canonical record body the content address hashes over — the project
// id + the captured state. The volume order is semantic (kept as-is); records.Canonicalize
// sorts object keys so an incidental field-order never leaks into the address.
type artifactBody struct {
	ProjectID string           `json:"project_id"`
	Volumes   []VolumeSnapshot `json:"volumes"`
	Datastore DatastoreDump    `json:"datastore"`
}

// canonicalBody returns the S02-canonical bytes of a state (records.Canonicalize over the
// body — keys sorted, no insignificant whitespace). Same state ⇒ same bytes, always.
func canonicalBody(state ProjectState) ([]byte, error) {
	raw, err := json.Marshal(artifactBody{
		ProjectID: state.ProjectID,
		Volumes:   state.Volumes,
		Datastore: state.Datastore,
	})
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// RestoreBackup round-trips an artefact back into the exact ProjectState it captured (no
// loss) AND records the restoration as an append-only, content-addressed RestoreDecision.
// It is PURE: the restored state is a copy of the artefact's payload; the decision address
// is a deterministic hash of (project, artefact address). A restore changes no truth — it
// is a recorded decision (§9), returned for the caller to append below the line.
func RestoreBackup(artifact BackupArtifact) (ProjectState, RestoreDecision, error) {
	if artifact.ProjectID == "" {
		return ProjectState{}, RestoreDecision{}, ErrNoProject
	}
	if !IsKnownEngine(artifact.Datastore.Engine) {
		return ProjectState{}, RestoreDecision{}, fmt.Errorf("%w: %q", ErrUnknownEngine, artifact.Datastore.Engine)
	}
	restored := ProjectState{
		ProjectID: artifact.ProjectID,
		Volumes:   cloneVolumes(artifact.Volumes),
		Datastore: cloneDump(artifact.Datastore),
	}
	decisionAddr := records.Hash([]byte("backup/restore/v1:" + artifact.ProjectID + ":" + artifact.ContentAddress))
	decision := RestoreDecision{
		ProjectID:       artifact.ProjectID,
		ArtifactAddress: artifact.ContentAddress,
		Address:         decisionAddr,
	}
	return restored, decision, nil
}

// AccessArtifact is the deterministic project-scope membership check (the wall §2 / S55
// isolation): it returns nil iff projectID OWNS the artefact, else ErrCrossProject. The
// owning project is the one whose DP15 isolation token namespaces the artefact's StorageKey
// — a backup of project A is inaccessible from project B. Never an LLM, never a guess.
func AccessArtifact(artifact BackupArtifact, projectID string) error {
	if projectID == "" {
		return ErrNoProject
	}
	if artifact.ProjectID != projectID {
		return fmt.Errorf("%w: owned by %q, accessed from %q", ErrCrossProject, artifact.ProjectID, projectID)
	}
	// Defence in depth: the StorageKey must also be namespaced by THIS project's token
	// (a tampered artefact whose project_id was rewritten without re-keying is refused).
	wantPrefix := datafragments.IsolationToken(projectID) + "/backups/"
	if !hasPrefix(artifact.StorageKey, wantPrefix) {
		return fmt.Errorf("%w: storage key %q not namespaced by project %q", ErrCrossProject, artifact.StorageKey, projectID)
	}
	return nil
}

// StateEqual reports whether two project states are byte-equal (the round-trip mirror: a
// restored state must equal the backed-up state — no loss). It compares the canonical
// bodies, so an incidental field-order never produces a false inequality.
func StateEqual(a, b ProjectState) bool {
	ca, err := canonicalBody(a)
	if err != nil {
		return false
	}
	cb, err := canonicalBody(b)
	if err != nil {
		return false
	}
	return string(ca) == string(cb)
}

// SerializeForScan renders the artefact's payload bytes as a single string the S91 scanner
// reads (the no-secret gate). It is DETERMINISTIC: it lays out every volume's bytes + the
// datastore rows line by line so a clear secret anywhere in the payload is on a scannable
// line. It is NOT a content address — it is the scanner's input view (the actual bytes
// that would land in the artefact), so a leak in any captured byte is caught.
func SerializeForScan(artifact BackupArtifact) string {
	var b []byte
	for _, v := range artifact.Volumes {
		b = append(b, []byte(v.Name)...)
		b = append(b, '\n')
		b = append(b, v.Bytes...)
		b = append(b, '\n')
	}
	b = append(b, artifact.Datastore.Rows...)
	b = append(b, '\n')
	return string(b)
}

// ── tiny pure helpers (no external dep, deterministic) ───────────────────────────────

func cloneVolumes(vs []VolumeSnapshot) []VolumeSnapshot {
	if vs == nil {
		return nil
	}
	out := make([]VolumeSnapshot, len(vs))
	for i, v := range vs {
		out[i] = VolumeSnapshot{Name: v.Name, Bytes: append([]byte(nil), v.Bytes...)}
	}
	return out
}

func cloneDump(d DatastoreDump) DatastoreDump {
	return DatastoreDump{Engine: d.Engine, Rows: append([]byte(nil), d.Rows...)}
}

func hasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}
