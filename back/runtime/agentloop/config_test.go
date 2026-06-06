// config_test.go — the arch-fitness.json config (the declared depguard-equivalent policy)
// and agentloop.DefaultPolicy() are ONE declared truth, never double-typed (CLAUDE.md
// §9 shared-source-schema spirit). This guards against drift: if the config and the code
// disagree, the rule could be enforced under a different policy than the one documented.
package agentloop

import (
	"encoding/json"
	"os"
	"reflect"
	"sort"
	"testing"
)

func TestArchFitnessConfig_MatchesDefaultPolicy(t *testing.T) {
	raw, err := os.ReadFile("arch-fitness.json")
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	var cfg struct {
		LLMSDKPrefixes   []string `json:"llm_sdk_prefixes"`
		AllowedImporters []string `json:"allowed_importers"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatalf("parse config: %v", err)
	}
	want := DefaultPolicy()
	a, b := append([]string(nil), cfg.LLMSDKPrefixes...), append([]string(nil), want.LLMSDKPrefixes...)
	sort.Strings(a)
	sort.Strings(b)
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("config llm_sdk_prefixes %v != DefaultPolicy %v", a, b)
	}
	c, d := append([]string(nil), cfg.AllowedImporters...), append([]string(nil), want.AllowedImporters...)
	sort.Strings(c)
	sort.Strings(d)
	if !reflect.DeepEqual(c, d) {
		t.Fatalf("config allowed_importers %v != DefaultPolicy %v", c, d)
	}
}

// FN04 — the EMITTED invariant list in arch-fitness.json and EmittedInvariantCodes() are
// ONE declared truth (ADR 0036 §5). Drift would enforce a different set than documented.
func TestArchFitnessConfig_MatchesEmittedInvariants(t *testing.T) {
	raw, err := os.ReadFile("arch-fitness.json")
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	var cfg struct {
		EmittedFunctional struct {
			ScopePath  string   `json:"scope_path"`
			Marker     string   `json:"marker"`
			Invariants []string `json:"invariants"`
		} `json:"emitted_functional"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatalf("parse config: %v", err)
	}
	want := EmittedInvariantCodes()
	if len(cfg.EmittedFunctional.Invariants) != len(want) {
		t.Fatalf("config emitted invariants %v != declared %v", cfg.EmittedFunctional.Invariants, want)
	}
	for i := range want {
		if cfg.EmittedFunctional.Invariants[i] != string(want[i]) {
			t.Fatalf("emitted invariant %d: config %q != declared %q", i, cfg.EmittedFunctional.Invariants[i], want[i])
		}
	}
	if cfg.EmittedFunctional.ScopePath != "back/gen" {
		t.Fatalf("emitted scope_path must be back/gen (ADR 0036 §3), got %q", cfg.EmittedFunctional.ScopePath)
	}
	if cfg.EmittedFunctional.Marker != aidosEmittedMarker {
		t.Fatalf("emitted marker %q != %q", cfg.EmittedFunctional.Marker, aidosEmittedMarker)
	}
}
