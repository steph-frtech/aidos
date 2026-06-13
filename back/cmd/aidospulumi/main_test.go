// main_test.go — the materialisation mirror for the aidospulumi EXECUTOR.
//
// The executor is the GATED SIDE-EFFECT (pulumi up/destroy); we do NOT run pulumi in this test
// (no network, no docker). We test the DETERMINISTIC half: that Materialise writes the emitter's
// three artifacts — Pulumi.yaml + index.ts + package.json — into .deploy-pulumi/<project>-<env>/,
// BYTE-IDENTICAL to honoemit.EmitPulumiStack, twice in a row (idempotent + reproducible). The
// pulumi exec (PulumiUp/PulumiDown) is the side-effecting gesture proven by hand afterwards.
package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// TestMaterialise_WritesEmitterArtifactsByteStable — Materialise writes exactly the three
// emitter files, and their bytes equal the emitter output (the executor adds nothing, drops
// nothing, never re-renders).
func TestMaterialise_WritesEmitterArtifactsByteStable(t *testing.T) {
	root := t.TempDir()
	project, env := "demoshop", "dev"

	mat, err := Materialise(root, project, env)
	if err != nil {
		t.Fatalf("Materialise: %v", err)
	}

	wantDir := filepath.Join(root, ".deploy-pulumi", "demoshop-dev")
	if mat.Dir != wantDir {
		t.Fatalf("dir = %q, want %q", mat.Dir, wantDir)
	}
	if mat.Stack != "demoshop-dev" {
		t.Fatalf("stack = %q, want demoshop-dev", mat.Stack)
	}

	// The three files exist on disk.
	for _, name := range []string{"Pulumi.yaml", "index.ts", "package.json"} {
		if _, err := os.Stat(filepath.Join(wantDir, name)); err != nil {
			t.Fatalf("expected file %s materialised: %v", name, err)
		}
	}

	// Their bytes equal the PURE emitter output (byte-for-byte — the executor only lands them).
	arts, br := honoemit.EmitPulumiStack(project, env, defaultManifest(project))
	if br != nil {
		t.Fatalf("emitter refused: %s", br.Explanation)
	}
	for _, a := range arts {
		name := filepath.Base(a.Path)
		got, err := os.ReadFile(filepath.Join(wantDir, name))
		if err != nil {
			t.Fatalf("read materialised %s: %v", name, err)
		}
		if string(got) != string(a.Bytes) {
			t.Fatalf("materialised %s diverges from the emitter output", name)
		}
	}
}

// TestMaterialise_URLFromProgram — the URL the executor reports is the one the emitter pinned in
// the program (export const url = …), never re-derived. For demoshop-dev it is the gold URL.
func TestMaterialise_URLFromProgram(t *testing.T) {
	root := t.TempDir()
	mat, err := Materialise(root, "demoshop", "dev")
	if err != nil {
		t.Fatalf("Materialise: %v", err)
	}
	if want := "https://demoshop-dev.sagedesk.fr"; mat.URL != want {
		t.Fatalf("url = %q, want %q", mat.URL, want)
	}
}

// TestMaterialise_Idempotent — running Materialise twice yields byte-identical files (the
// reproducibility mirror at the executor boundary: same input → same bytes on disk, no drift).
func TestMaterialise_Idempotent(t *testing.T) {
	root := t.TempDir()
	a, err := Materialise(root, "shop", "prod")
	if err != nil {
		t.Fatalf("Materialise #1: %v", err)
	}
	b, err := Materialise(root, "shop", "prod")
	if err != nil {
		t.Fatalf("Materialise #2: %v", err)
	}
	if len(a.Files) != len(b.Files) || len(a.Files) != 3 {
		t.Fatalf("expected 3 files both runs, got %d then %d", len(a.Files), len(b.Files))
	}
	for name, h1 := range a.Files {
		if h2, ok := b.Files[name]; !ok || h1 != h2 {
			t.Fatalf("file %s hash drifted between runs (%q vs %q)", name, h1, h2)
		}
	}
}

// TestMaterialise_PerProjectEnvIsolation — distinct project×env land in distinct dirs with
// distinct stack names (no cross-leak). The naming is <project>-<env>.
func TestMaterialise_PerProjectEnvIsolation(t *testing.T) {
	root := t.TempDir()
	a, _ := Materialise(root, "alpha", "dev")
	b, _ := Materialise(root, "beta", "staging")
	if a.Dir == b.Dir {
		t.Fatalf("two project×env share a dir: %q", a.Dir)
	}
	if a.Stack != "alpha-dev" || b.Stack != "beta-staging" {
		t.Fatalf("stack names wrong: %q / %q", a.Stack, b.Stack)
	}
}

// TestMaterialise_MissingArgs — an empty project or env is refused (actionable), never a partial
// materialisation.
func TestMaterialise_MissingArgs(t *testing.T) {
	root := t.TempDir()
	if _, err := Materialise(root, "", "dev"); err == nil {
		t.Fatal("expected refusal for empty project")
	}
	if _, err := Materialise(root, "p", ""); err == nil {
		t.Fatal("expected refusal for empty env")
	}
}

// TestEmitOnly_ReadOnlyProgramByteStable — EmitOnly returns the emitted program text + URL +
// container names WITHOUT running pulumi and WITHOUT writing to disk (the READ-ONLY twin of
// Materialise). The program equals the emitter's index.ts byte-for-byte, the URL is the pinned
// one, the containers are <stack>-app/<stack>-db, and a second call is byte-identical.
func TestEmitOnly_ReadOnlyProgramByteStable(t *testing.T) {
	project, env := "demoshop", "dev"

	res, err := EmitOnly(project, env)
	if err != nil {
		t.Fatalf("EmitOnly: %v", err)
	}
	if res.Stack != "demoshop-dev" {
		t.Fatalf("stack = %q, want demoshop-dev", res.Stack)
	}
	if want := "https://demoshop-dev.sagedesk.fr"; res.URL != want {
		t.Fatalf("url = %q, want %q", res.URL, want)
	}
	if res.Path != "gen/demoshop/infra/index.ts" {
		t.Fatalf("path = %q, want gen/demoshop/infra/index.ts", res.Path)
	}
	wantC := []string{"demoshop-dev-app", "demoshop-dev-db"}
	if len(res.Containers) != 2 || res.Containers[0] != wantC[0] || res.Containers[1] != wantC[1] {
		t.Fatalf("containers = %v, want %v", res.Containers, wantC)
	}

	// The program equals the emitter's index.ts byte-for-byte (no re-render).
	arts, br := honoemit.EmitPulumiStack(project, env, defaultManifest(project))
	if br != nil {
		t.Fatalf("emitter refused: %s", br.Explanation)
	}
	var wantProg string
	for _, a := range arts {
		if a.Target == honoemit.TargetPulumiProgram {
			wantProg = string(a.Bytes)
		}
	}
	if res.Program != wantProg {
		t.Fatal("EmitOnly program diverges from the emitter index.ts")
	}
	// the program carries the gold-form anchors the front preview lists.
	for _, anchor := range []string{"priority", "tls.certresolver", "demoshop-dev-db", "demoshop-dev-app"} {
		if !contains(res.Program, anchor) {
			t.Fatalf("emitted program missing anchor %q", anchor)
		}
	}

	// A second emit is byte-identical (reproducibility — pure projection).
	res2, err := EmitOnly(project, env)
	if err != nil {
		t.Fatalf("EmitOnly #2: %v", err)
	}
	if res2.Program != res.Program || res2.URL != res.URL {
		t.Fatal("EmitOnly drifted between calls (not byte-stable)")
	}
}

// TestEmitOnly_MissingArgs — an empty project or env is refused (actionable), never a partial emit.
func TestEmitOnly_MissingArgs(t *testing.T) {
	if _, err := EmitOnly("", "dev"); err == nil {
		t.Fatal("expected refusal for empty project")
	}
	if _, err := EmitOnly("p", ""); err == nil {
		t.Fatal("expected refusal for empty env")
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}

// TestURLFromProgram_Robust — the URL parser tolerates a program without the marker (returns "")
// and reads a quoted literal correctly.
func TestURLFromProgram_Robust(t *testing.T) {
	if got := urlFromProgram([]byte("no marker here")); got != "" {
		t.Fatalf("expected empty url for marker-less program, got %q", got)
	}
	if got := urlFromProgram([]byte("export const url = \"https://x.example\";\n")); got != "https://x.example" {
		t.Fatalf("url parse = %q", got)
	}
}
