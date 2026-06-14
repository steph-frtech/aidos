package backup_test

// Property mirror (N1: ∀) — WRITTEN FIRST (RED→GREEN). reflects=dp31-backup-invariants ·
// test_kind=invariant · cert_language=rapid · liveness=live · authority=below.
//
// Three invariants over the DP31 backup:
//
//   (3) NO-SECRET-IN-CLEAR (∀): whatever a project's data contains, the produced
//       artefact carries NO secret in the clear — the S91 secretstore.ScanEmission
//       (gitleaks-style DETERMINISTIC scanner) over the artefact's serialized bytes
//       returns clean for any secret-free state, AND when a secret VALUE is present
//       in the state, the backup REFUSES to mint a leaking artefact (fail-closed) —
//       the scan is the gate, not an afterthought.
//
//   (R) REPRODUCIBILITY (∀): same state + same clock ⇒ byte-identical artefact (the
//       same content address), ×N — the determinism-first reproducibility mirror.
//
//   (I) PROJECT-NAMESPACED ADDRESS (∀): two distinct projects backing up the SAME
//       bytes get DISTINCT storage keys (the isolation token namespaces the address).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/backup"
	"github.com/steph-frtech/aidos/back/runtime/secretstore"
	"pgregory.net/rapid"
)

var clk = operation.FixedClock{At: "2026-06-08T09:00:00Z"}

// genSafeState generates a secret-FREE project state (alphanumeric blobs + benign rows).
func genSafeState(t *rapid.T) backup.ProjectState {
	pid := "p-" + rapid.StringMatching(`[a-z]{1,8}`).Draw(t, "pid")
	n := rapid.IntRange(1, 3).Draw(t, "nvol")
	vols := make([]backup.VolumeSnapshot, 0, n)
	for i := 0; i < n; i++ {
		name := rapid.StringMatching(`[a-z]{1,6}`).Draw(t, "vname")
		body := rapid.StringMatching(`[a-z0-9 ,.\n]{0,40}`).Draw(t, "vbody")
		vols = append(vols, backup.VolumeSnapshot{Name: name, Bytes: []byte(body)})
	}
	rows := rapid.StringMatching(`[a-z0-9 ,.\n]{0,60}`).Draw(t, "rows")
	return backup.ProjectState{
		ProjectID: pid,
		Volumes:   vols,
		Datastore: backup.DatastoreDump{Engine: backup.EnginePostgres, Rows: []byte(rows)},
	}
}

// (3) ∀ secret-free state ⇒ the artefact's bytes scan CLEAN (no leak).
func TestProperty_NoSecretInClearArtifact(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		st := genSafeState(t)
		res, err := backup.RealizeBackup(st, clk, newMockOutbox(), &mockSink{})
		if err != nil {
			t.Fatalf("RealizeBackup: %v", err)
		}
		if res.Artifact == nil {
			t.Fatalf("safe state produced no artefact")
		}
		// The artefact serialization scanned by the SAME S91 scanner the gate uses.
		body := backup.SerializeForScan(*res.Artifact)
		if !secretstore.IsClean(body, nil) {
			t.Fatalf("a secret-free state produced a flagged artefact:\n%v", secretstore.ScanEmission(body, nil))
		}
	})
}

// (3) ∀ state carrying a known secret VALUE ⇒ the backup REFUSES to mint a leaking
// artefact (fail-closed via the S91 scan as the gate). The artefact is never returned.
func TestProperty_BackupRefusesLeakingState(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		st := genSafeState(t)
		// Inject a real AWS-key-shaped secret into one volume — the gitleaks rule fires.
		secret := "AKIA" + rapid.StringMatching(`[0-9A-Z]{16}`).Draw(t, "akia")
		st.Volumes = append(st.Volumes, backup.VolumeSnapshot{Name: "creds", Bytes: []byte("aws_key=" + secret)})

		res, err := backup.RealizeBackup(st, clk, newMockOutbox(), &mockSink{})
		if err == nil {
			t.Fatalf("a state carrying a clear secret minted an artefact, want a fail-closed refusal")
		}
		if res.Artifact != nil {
			t.Fatalf("a leaking artefact was returned, want none")
		}
		if !strings.Contains(err.Error(), "secret") {
			t.Fatalf("the refusal must name the leak, got %v", err)
		}
	})
}

// (R) ∀ state ⇒ same state + same clock ⇒ byte-identical artefact (reproducibility).
func TestProperty_ReproducibleArtifact(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		st := genSafeState(t)
		var first string
		for i := 0; i < 5; i++ {
			res, err := backup.RealizeBackup(st, clk, newMockOutbox(), &mockSink{})
			if err != nil || res.Artifact == nil {
				t.Fatalf("realisation %d: err=%v artefact=%v", i, err, res.Artifact)
			}
			if i == 0 {
				first = res.Artifact.ContentAddress
				continue
			}
			if res.Artifact.ContentAddress != first {
				t.Fatalf("artefact address drifted: run %d = %q, run 0 = %q (non-reproducible)", i, res.Artifact.ContentAddress, first)
			}
		}
	})
}

// (I) ∀ identical bytes under two distinct projects ⇒ distinct storage keys (isolation).
func TestProperty_ProjectNamespacedKeys(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		st := genSafeState(t)
		pidB := st.ProjectID + "x" // a guaranteed-distinct second project, same bytes
		stB := st
		stB.ProjectID = pidB

		resA, err := backup.RealizeBackup(st, clk, newMockOutbox(), &mockSink{})
		if err != nil || resA.Artifact == nil {
			t.Fatalf("A: err=%v artefact=%v", err, resA.Artifact)
		}
		resB, err := backup.RealizeBackup(stB, clk, newMockOutbox(), &mockSink{})
		if err != nil || resB.Artifact == nil {
			t.Fatalf("B: err=%v artefact=%v", err, resB.Artifact)
		}
		if resA.Artifact.StorageKey == resB.Artifact.StorageKey {
			t.Fatalf("two distinct projects with the same bytes share a key %q (isolation broken)", resA.Artifact.StorageKey)
		}
		// Cross-project access is refused both ways.
		if backup.AccessArtifact(*resA.Artifact, pidB) == nil {
			t.Fatalf("B reached A's artefact (isolation broken)")
		}
	})
}
