package main

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/mirror/completeness"
	"github.com/steph-frtech/aidos/back/kernel/mirror/records"
)

// Fault-injection mirror (the CLAUDE.md §5 / KRD §32 mandatory hook-honesty test):
// a Stop hook that never fires is governance theatre. Starting from a COMPLETE
// (green) cut, we inject one real monster per reason — delete a layer's only living
// mirror (→ no_truth_without_mirror) and re-point a mirror at a vanished @version
// (→ no_orphan_mirror) — and assert the Stop hook BLOCKS each time with the right
// reason; then we restore the cut and assert it PASSES. We drive the full binary
// entrypoint (Run over stdin/stdout) so the proof is "the hook blocks", not merely
// "the aggregator math holds".

// greenCut is the baseline complete cut: a control layer with its living fixture.
func greenCut() completeness.Cut {
	return completeness.Cut{
		Layers: []records.Layer{{LayerID: "checkout-button", Version: "v1", Kind: "control"}},
		Mirrors: []records.Mirror{
			{MirrorID: "live-1", Reflects: records.LayerRef{LayerID: "checkout-button", Version: "v1"}, TestKind: records.TestKindFixture, CertLanguage: records.CertFixture, Authority: records.AuthorityAbove, Liveness: records.LivenessAlive},
		},
	}
}

// runBinary drives the hook entrypoint over a fixed cut and returns its exit code +
// the BlockReason it wrote (if any).
func runBinary(t *testing.T, cut completeness.Cut) (int, *completeness.BlockReason) {
	t.Helper()
	var out bytes.Buffer
	code := Run(context.Background(), strings.NewReader(`{"ref":"fault-injection"}`), &out, fixedCut{cut: cut}, &memRunLog{})
	var br *completeness.BlockReason
	if out.Len() > 0 {
		var parsed completeness.BlockReason
		if err := json.Unmarshal(out.Bytes(), &parsed); err != nil {
			t.Fatalf("BlockReason JSON unreadable: %v (raw=%q)", err, out.String())
		}
		br = &parsed
	}
	return code, br
}

func TestFaultInjection_GreenCutPasses(t *testing.T) {
	code, br := runBinary(t, greenCut())
	if code != exitAllow {
		t.Fatalf("a complete cut must let Stop through (exit %d), got %d (br=%+v)", exitAllow, code, br)
	}
	if br != nil {
		t.Fatalf("a pass must not emit a BlockReason, got %+v", br)
	}
}

func TestFaultInjection_DeleteOnlyLivingMirror_Blocks(t *testing.T) {
	cut := greenCut()
	// Inject: delete the layer's only living mirror → no_truth_without_mirror.
	cut.Mirrors = nil

	code, br := runBinary(t, cut)
	if code != exitBlock {
		t.Fatalf("a layer with no living mirror must BLOCK Stop (exit %d), got %d", exitBlock, code)
	}
	if br == nil || br.Code != completeness.CodeMonster {
		t.Fatalf("expected BlockReason code MONSTER, got %+v", br)
	}
	if !strings.Contains(strings.Join(br.HowToFix, " "), "no_truth_without_mirror") {
		t.Fatalf("how_to_fix must name no_truth_without_mirror: %+v", br.HowToFix)
	}

	// Restore: re-add the living mirror → PASS.
	code, _ = runBinary(t, greenCut())
	if code != exitAllow {
		t.Fatalf("restoring the living mirror must let Stop through, got exit %d", code)
	}
}

func TestFaultInjection_RepointMirrorAtVanishedVersion_Blocks(t *testing.T) {
	cut := greenCut()
	// Inject: re-point the only mirror at a vanished @version → no_orphan_mirror,
	// AND the layer @v1 now has no living mirror → no_truth_without_mirror.
	cut.Mirrors = []records.Mirror{
		{MirrorID: "orphan-1", Reflects: records.LayerRef{LayerID: "checkout-button", Version: "v0"}, TestKind: records.TestKindFixture, CertLanguage: records.CertFixture, Authority: records.AuthorityAbove, Liveness: records.LivenessDead},
	}

	code, br := runBinary(t, cut)
	if code != exitBlock {
		t.Fatalf("an orphan mirror must BLOCK Stop (exit %d), got %d", exitBlock, code)
	}
	if br == nil || br.Code != completeness.CodeMonster {
		t.Fatalf("expected BlockReason code MONSTER, got %+v", br)
	}
	if !strings.Contains(strings.Join(br.HowToFix, " "), "no_orphan_mirror") {
		t.Fatalf("how_to_fix must name no_orphan_mirror: %+v", br.HowToFix)
	}

	// Restore: point it back at the live @version → PASS.
	code, _ = runBinary(t, greenCut())
	if code != exitAllow {
		t.Fatalf("restoring the reflects target must let Stop through, got exit %d", code)
	}
}

// TestFaultInjection_UnreadableEventFailsClosed: a malformed Stop event must BLOCK
// (fail-closed) with INCOMPLETE — a Stop that cannot be verified does not pass.
func TestFaultInjection_UnreadableEventFailsClosed(t *testing.T) {
	var out bytes.Buffer
	code := Run(context.Background(), strings.NewReader(`{ not json`), &out, fixedCut{cut: greenCut()}, &memRunLog{})
	if code != exitBlock {
		t.Fatalf("an unreadable Stop event must fail closed (block), got exit %d", code)
	}
	var br completeness.BlockReason
	if err := json.Unmarshal(out.Bytes(), &br); err != nil {
		t.Fatalf("BlockReason JSON unreadable: %v", err)
	}
	if br.Code != completeness.CodeIncomplete {
		t.Fatalf("fail-closed must emit INCOMPLETE, got %s", br.Code)
	}
}

// erroringCutSource always fails to load — the anti-passthrough path.
type erroringCutSource struct{}

func (erroringCutSource) Load(context.Context) (completeness.Cut, error) {
	return completeness.Cut{}, errLoad{}
}

type errLoad struct{}

func (errLoad) Error() string { return "cut load failed" }

// TestFaultInjection_CutLoadErrorBlocks: if the cut cannot be loaded, the gate
// BLOCKS with INCOMPLETE (KRD §82) — never a silent pass.
func TestFaultInjection_CutLoadErrorBlocks(t *testing.T) {
	var out bytes.Buffer
	code := Run(context.Background(), strings.NewReader(``), &out, erroringCutSource{}, &memRunLog{})
	if code != exitBlock {
		t.Fatalf("a cut-load error must block, got exit %d", code)
	}
	var br completeness.BlockReason
	_ = json.Unmarshal(out.Bytes(), &br)
	if br.Code != completeness.CodeIncomplete {
		t.Fatalf("cut-load error must emit INCOMPLETE, got %s", br.Code)
	}
}
