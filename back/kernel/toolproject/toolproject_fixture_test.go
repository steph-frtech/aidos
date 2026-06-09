package toolproject

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// FK15 fixture mirror (part a) — the tooling projections: CLAUDE.md / AGENTS.md /
// .cursorrules / memory-bank EMITTED from the kernel sources (policy / memory / style
// / architecture / agent-profile), never hand-edited (hash-protected). The judge is a
// deterministic byte comparison + a string-equality on source-hashes, never a prompt.

// aidosTooling is the worked FKE-20 example: the AIDOS tooling kernel, one source per
// closed kind — the legacy content (the wall, biome, the line, a scar, the executor
// persona) KERNELIZED without loss.
func aidosTooling() ToolingKernel {
	return ToolingKernel{
		Project: "AIDOS",
		Sources: []Source{
			{Kind: KindPolicy, ID: "the-wall", Title: "Le mur", Body: "L'agent n'écrit jamais kernel/mirrors/fitness."},
			{Kind: KindPolicy, ID: "anti-overwrite", Title: "Anti-overwrite", Body: "Jamais réécrire un artefact sans ChangeSet."},
			{Kind: KindStyle, ID: "biome", Title: "Biome", Body: "Tabs, double quotes au root du monorepo."},
			{Kind: KindArchitecture, ID: "subsystems", Title: "Cinq sous-systèmes", Body: "Runtime · Kernel · Mirror · Archive · Workbench."},
			{Kind: KindMemory, ID: "report-discipline", Title: "Discipline de report", Body: "Toujours émettre StructuredOutput, même incomplet."},
			{Kind: KindAgentProfile, ID: "step-executor", Title: "step-executor", Body: "Exécute une étape isolée ; model opus, high effort."},
		},
	}
}

// 1. Each closed target is emitted from the kernel and carries only its own source kinds.
func TestEmit_TargetsCarryTheirKinds(t *testing.T) {
	k := aidosTooling()
	files, err := EmitAll(k)
	if err != nil {
		t.Fatalf("EmitAll: %v", err)
	}
	if len(files) != len(Targets()) {
		t.Fatalf("expected %d files, got %d", len(Targets()), len(files))
	}
	// CLAUDE.md carries policies + architecture + style, but not the agent persona.
	claude := files[TargetClaudeMd]
	if !strings.Contains(claude, "Le mur") || !strings.Contains(claude, "Cinq sous-systèmes") || !strings.Contains(claude, "Biome") {
		t.Fatalf("CLAUDE.md missing a policy/architecture/style section:\n%s", claude)
	}
	if strings.Contains(claude, "step-executor") {
		t.Fatal("CLAUDE.md leaked an agent-profile source (double-typing)")
	}
	// AGENTS.md carries the agent persona only.
	if !strings.Contains(files[TargetAgentsMd], "step-executor") {
		t.Fatal("AGENTS.md missing the agent-profile source")
	}
	// memory-bank carries the memory only.
	if !strings.Contains(files[TargetMemoryBank], "Discipline de report") {
		t.Fatal("memory-bank missing the memory source")
	}
	// .cursorrules carries policies + style.
	if !strings.Contains(files[TargetCursorRules], "Anti-overwrite") || !strings.Contains(files[TargetCursorRules], "Biome") {
		t.Fatal(".cursorrules missing policy/style")
	}
}

// 2. The FK15 done-criterion: same kernels → byte-identical files.
func TestEmit_SameKernel_ByteIdentical(t *testing.T) {
	a, err := EmitAll(aidosTooling())
	if err != nil {
		t.Fatalf("EmitAll a: %v", err)
	}
	b, err := EmitAll(aidosTooling())
	if err != nil {
		t.Fatalf("EmitAll b: %v", err)
	}
	for _, tg := range Targets() {
		if a[tg] != b[tg] {
			t.Fatalf("target %q not byte-identical across emissions", tg)
		}
	}
}

// 3. Source map/slice order does not change the emitted bytes (canonical order).
func TestEmit_OrderIndependent(t *testing.T) {
	k1 := aidosTooling()
	k2 := aidosTooling()
	// Reverse the source slice of k2.
	for i, j := 0, len(k2.Sources)-1; i < j; i, j = i+1, j-1 {
		k2.Sources[i], k2.Sources[j] = k2.Sources[j], k2.Sources[i]
	}
	f1, _ := EmitAll(k1)
	f2, _ := EmitAll(k2)
	for _, tg := range Targets() {
		if f1[tg] != f2[tg] {
			t.Fatalf("target %q differs under reordered sources — emission is order-dependent", tg)
		}
	}
}

// 4. A clean emitted file has no drift (DetectDrift returns nil).
func TestDetectDrift_CleanProjection_NoDrift(t *testing.T) {
	k := aidosTooling()
	claude, _ := Emit(k, TargetClaudeMd)
	d, err := DetectDrift(k, TargetClaudeMd, claude)
	if err != nil {
		t.Fatalf("DetectDrift: %v", err)
	}
	if d != nil {
		t.Fatalf("expected no drift for a clean projection, got %+v", d)
	}
}

// 5. The FK15 fault-injection: hand-edit the emitted file under a valid hash → drift.
func TestDetectDrift_HandEdit_Detected(t *testing.T) {
	k := aidosTooling()
	claude, _ := Emit(k, TargetClaudeMd)
	// A hand-edit: someone weakens the wall in the body, leaving the marker intact.
	edited := strings.Replace(claude, "L'agent n'écrit jamais", "L'agent peut écrire", 1)
	if edited == claude {
		t.Fatal("test setup: hand-edit did not change the file")
	}
	d, err := DetectDrift(k, TargetClaudeMd, edited)
	if err != nil {
		t.Fatalf("DetectDrift: %v", err)
	}
	if d == nil || d.Kind != DriftHandEdited {
		t.Fatalf("expected HAND_EDITED drift, got %+v", d)
	}
}

// 6. A file with no AIDOS marker is MISSING_MARKER.
func TestDetectDrift_NoMarker(t *testing.T) {
	k := aidosTooling()
	d, err := DetectDrift(k, TargetClaudeMd, "# hand-written CLAUDE.md\nno marker here\n")
	if err != nil {
		t.Fatalf("DetectDrift: %v", err)
	}
	if d == nil || d.Kind != DriftMissingMarker {
		t.Fatalf("expected MISSING_MARKER, got %+v", d)
	}
}

// 7. A file emitted from an OLD kernel is STALE_HASH against the new kernel.
func TestDetectDrift_StaleHash(t *testing.T) {
	old := aidosTooling()
	oldFile, _ := Emit(old, TargetClaudeMd)
	// The kernel evolves: add a new policy (a new source-hash).
	next := aidosTooling()
	next.Sources = append(next.Sources, Source{Kind: KindPolicy, ID: "determinism-first", Title: "Determinism-first", Body: "Une fonction pure plutôt qu'un LLM."})
	d, err := DetectDrift(next, TargetClaudeMd, oldFile)
	if err != nil {
		t.Fatalf("DetectDrift: %v", err)
	}
	if d == nil || d.Kind != DriftStaleHash {
		t.Fatalf("expected STALE_HASH, got %+v", d)
	}
}

// 8. Content-addressed round-trip: a ToolingKernel rides inside a kernel.link body and
// recovers losslessly; a changed source yields a NEW version (FK15 storage fork).
func TestRecord_RoundTrip_ContentAddressed(t *testing.T) {
	k := aidosTooling()
	rec, err := Record(k)
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	if err := records.Validate(rec); err != nil {
		t.Fatalf("record fails validation: %v", err)
	}
	if rec.Kind != records.KindLink {
		t.Fatalf("expected kind link, got %q", rec.Kind)
	}
	got, err := ParseBody(rec.Body)
	if err != nil {
		t.Fatalf("ParseBody: %v", err)
	}
	if got.Project != k.Project || len(got.Sources) != len(k.Sources) {
		t.Fatalf("round-trip lost data: %+v", got)
	}
	// A renamed source yields a different version (no in-place mutation).
	k2 := aidosTooling()
	k2.Sources[0].Body = "L'agent n'écrit jamais la vérité — jamais."
	rec2, _ := Record(k2)
	if rec2.Version == rec.Version {
		t.Fatal("a changed source must yield a new version (content-addressed)")
	}
}

// 9. Validate rejects an unknown source kind, an empty id, and an empty project.
func TestValidate_Rejects(t *testing.T) {
	if err := Validate(ToolingKernel{Project: "  "}); err == nil {
		t.Fatal("expected NO_PROJECT")
	}
	if err := Validate(ToolingKernel{Project: "X", Sources: []Source{{Kind: "bogus", ID: "x"}}}); err == nil {
		t.Fatal("expected UNKNOWN_KIND")
	}
	if err := Validate(ToolingKernel{Project: "X", Sources: []Source{{Kind: KindPolicy, ID: " "}}}); err == nil {
		t.Fatal("expected EMPTY_ID")
	}
}
