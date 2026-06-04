package agentimpl_test

// Fixture mirror (N2-style: value → golden) for the DETERMINISTIC SystemPrompt
// assembly (BA04). reflects=runtime.agent_system_prompt · test_kind=fixture ·
// cert_language=go · liveness=live · authority=below.
//
// BA04: the SystemPrompt is a PURE TEMPLATE over the ONLY declared fields — Role,
// Objectif, StopConditions, the wall boundary in prose, ForbiddenPaths verbatim,
// AllowedPaths verbatim. A hand-authored agent prompt is a determinism gap that
// blocks the step. This fixture pins ONE projection → ONE exact golden file: the
// assembled prompt is regenerable and byte-for-byte stable.

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/agentimpl"
)

// goldenPromptImpl is a fully-resolved projection carrying the declared fields the
// prompt template reads. It is the BA03 emitter's output shape, extended with the
// declared Role/Objectif/StopConditions copied down from the SOURCE.
func goldenPromptImpl() agentimpl.AgentImplementation {
	impl := goldenImpl()
	impl.Role = "executor"
	impl.Objectif = "drive a red work item to green"
	impl.StopConditions = []string{
		"red set still red",
		"budget exceeded",
	}
	return impl
}

const goldenPromptFile = "testdata/systemprompt_golden.txt"

// A given projection yields an EXACT golden file (regenerate with -update).
func TestFixture_SystemPrompt_MatchesGolden(t *testing.T) {
	got := agentimpl.AssembleSystemPrompt(goldenPromptImpl())

	if os.Getenv("UPDATE_GOLDEN") == "1" {
		if err := os.MkdirAll(filepath.Dir(goldenPromptFile), 0o755); err != nil {
			t.Fatalf("mkdir golden dir: %v", err)
		}
		if err := os.WriteFile(goldenPromptFile, []byte(got), 0o644); err != nil {
			t.Fatalf("write golden: %v", err)
		}
		t.Logf("golden updated: %s", goldenPromptFile)
		return
	}

	want, err := os.ReadFile(goldenPromptFile)
	if err != nil {
		t.Fatalf("read golden (run with UPDATE_GOLDEN=1 to seed): %v", err)
	}
	if got != string(want) {
		t.Fatalf("assembled SystemPrompt does not match golden.\n--- got ---\n%s\n--- want ---\n%s", got, string(want))
	}
}

// The wall is ALWAYS in the prompt (defence in depth, level 3): the kernel/mirror
// zones must appear verbatim regardless of the layer.
func TestFixture_SystemPrompt_AlwaysCarriesWall(t *testing.T) {
	prompt := agentimpl.AssembleSystemPrompt(goldenPromptImpl())
	for _, w := range agentimpl.WallForbiddenPaths() {
		if !containsLine(prompt, w) {
			t.Fatalf("the assembled prompt must carry the wall zone %q verbatim", w)
		}
	}
}

func containsLine(haystack, needle string) bool {
	// substring is enough — the template emits each forbidden path verbatim.
	return len(needle) > 0 && (len(haystack) >= len(needle)) && indexOf(haystack, needle) >= 0
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
