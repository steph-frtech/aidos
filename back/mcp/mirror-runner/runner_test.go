package mirrorrunner

// Runner-shell mirror (workflow/fixture): the cliquet orchestration over fake
// seams — read mirrors, replay, record append-only, compare baseline, decide.
// mirror record: reflects=S05-ci-ratchet-runner, test_kind=workflow, liveness=live
//
// This proves the two /goal scenarios end-to-end at the shell level WITHOUT
// spawning real test processes: the Replayer is a deterministic fake, the RunLog
// is in-memory and append-only.

import (
	"context"
	"testing"
)

// fakeSource yields a fixed mirror set.
type fakeSource struct{ mirrors []Mirror }

func (f fakeSource) LivingMirrors(context.Context) ([]Mirror, error) { return f.mirrors, nil }

// fakeReplayer returns a pre-set status per mirror id.
type fakeReplayer struct{ status map[string]Status }

func (f fakeReplayer) Replay(_ context.Context, m Mirror) (Status, error) {
	return f.status[m.ID], nil
}

// memLog is an in-memory append-only run-log. Record never mutates a prior row;
// Baseline returns the latest status per mirror across all appended rows.
type memLog struct{ rows []RunRecord }

func (l *memLog) Record(_ context.Context, r RunRecord) error {
	l.rows = append(l.rows, r) // append-only: never updates an existing row
	return nil
}
func (l *memLog) Baseline(context.Context) (map[string]Status, error) {
	out := map[string]Status{}
	for _, r := range l.rows {
		out[r.MirrorID] = r.Status // later rows win → latest status
	}
	return out, nil
}

func threeMirrors() []Mirror {
	return []Mirror{
		{ID: "a", Version: "v1", ContentHash: "ha"},
		{ID: "b", Version: "v1", ContentHash: "hb"},
		{ID: "c", Version: "v1", ContentHash: "hc"},
	}
}

// Seed a green baseline by running the cliquet once with everything green.
func seedGreenBaseline(t *testing.T, log *memLog) *Ratchet {
	t.Helper()
	r := &Ratchet{
		Source:   fakeSource{mirrors: threeMirrors()},
		Replayer: fakeReplayer{status: map[string]Status{"a": StatusGreen, "b": StatusGreen, "c": StatusGreen}},
		Log:      log,
	}
	res, err := r.Check(context.Background(), "run-base", "merge-base")
	if err != nil {
		t.Fatalf("seed baseline: %v", err)
	}
	if res.Verdict != VerdictAllowed {
		t.Fatalf("baseline run should be ALLOWED, got %s", res.Verdict)
	}
	return r
}

// Scenario: a step that reddens a prior mirror is rejected before merge.
func TestRatchetRejectsRedRegression(t *testing.T) {
	log := &memLog{}
	seedGreenBaseline(t, log)

	// Candidate: b regressed green→red.
	cand := &Ratchet{
		Source:   fakeSource{mirrors: threeMirrors()},
		Replayer: fakeReplayer{status: map[string]Status{"a": StatusGreen, "b": StatusRed, "c": StatusGreen}},
		Log:      log,
	}
	res, err := cand.Check(context.Background(), "run-cand", "candidate")
	if err != nil {
		t.Fatalf("candidate check: %v", err)
	}

	if res.Verdict != VerdictRejected {
		t.Fatalf("expected REJECTED, got %s", res.Verdict)
	}
	if len(res.Regressed) != 1 || res.Regressed[0].MirrorID != "b" {
		t.Fatalf("expected b regressed, got %+v", res.Regressed)
	}
	if res.BlockReason == nil || res.BlockReason.Code != CodeRedRegression {
		t.Fatalf("expected RED_REGRESSION, got %v", res.BlockReason)
	}

	// mirror_runs recorded a new red run for b flagged regressed=true.
	var found bool
	for _, row := range log.rows {
		if row.RunID == "run-cand" && row.MirrorID == "b" {
			found = true
			if row.Status != StatusRed || !row.Regressed {
				t.Fatalf("expected b candidate run red+regressed, got %+v", row)
			}
		}
	}
	if !found {
		t.Fatalf("no candidate run recorded for b")
	}
	// Append-only: baseline rows (3) + candidate rows (3) = 6, none mutated.
	if len(log.rows) != 6 {
		t.Fatalf("expected 6 append-only rows, got %d", len(log.rows))
	}
}

// Scenario: a candidate that keeps every prior mirror green is allowed.
func TestRatchetAllowsAllGreen(t *testing.T) {
	log := &memLog{}
	seedGreenBaseline(t, log)

	cand := &Ratchet{
		Source:   fakeSource{mirrors: threeMirrors()},
		Replayer: fakeReplayer{status: map[string]Status{"a": StatusGreen, "b": StatusGreen, "c": StatusGreen}},
		Log:      log,
	}
	res, err := cand.Check(context.Background(), "run-cand", "candidate")
	if err != nil {
		t.Fatalf("candidate check: %v", err)
	}
	if res.Verdict != VerdictAllowed {
		t.Fatalf("expected ALLOWED, got %s", res.Verdict)
	}
	if len(res.Regressed) != 0 {
		t.Fatalf("expected no regression, got %+v", res.Regressed)
	}
	if res.BlockReason != nil {
		t.Fatalf("expected no BlockReason, got %v", res.BlockReason)
	}
	for _, row := range log.rows {
		if row.RunID == "run-cand" && (row.Status != StatusGreen || row.Regressed) {
			t.Fatalf("candidate rows must be green+not-regressed, got %+v", row)
		}
	}
}
