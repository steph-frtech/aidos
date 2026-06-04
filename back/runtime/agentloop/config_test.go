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
