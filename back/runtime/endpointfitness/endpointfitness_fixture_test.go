// endpointfitness_fixture_test.go — the DP08 fixture mirror (concrete canonical
// examples), WRITTEN FIRST and red with the property mirror.
//
// mirror record: reflects=DP08-endpoint-fitness, test_kind=fixture,
// cert_language=go, liveness=live
//
// Pins the EXACT classifier behaviour on the canonical SPEC-stack-2026
// examples, the TS literal extraction (template ${expr} spans are poisoned,
// comments are skipped, inner literals are seen), the arch-fitness.json
// declared-rule parity (above-the-line config never drifts from the code),
// and the Go-authoritative content addresses of the demo sandbox tree (the
// TS twin + the Playwright e2e re-derive them byte-identically).
package endpointfitness

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/buildloop/selfcert"
	"github.com/steph-frtech/aidos/back/runtime/connresolve"
)

// The canonical classifier table — the DP07/SPEC-stack-2026 endpoint forms
// MUST pass; the hardcoded forms MUST be caught with their closed reason.
func TestFixture_ClassifyLiteral(t *testing.T) {
	pass := []string{
		"${APP_NAME}-db:5432",                  // docker_internal container-name convention
		"${APP_NAME}",                          // the server container itself
		"${CRM_MANAGED_URL}",                   // managed secret-store reference (S91)
		"https://${APP_SUBDOMAIN}.${DOMAIN}",   // traefik public exposure
		"postgres://${DB_USER}@${DB_HOST}/app", // fully env-derived URL authority
		"docker_internal",                      // a plain mode word
		"MISSING_ENV_AT_BOOT: ",                // the requireEnv error head
		"APP_NAME",                             // an env-var name
		"./connections.prod",                   // a relative import
	}
	for _, lit := range pass {
		if reason, hard := ClassifyLiteral(lit); hard {
			t.Errorf("ClassifyLiteral(%q) flagged %s — must pass", lit, reason)
		}
	}
	red := map[string]Reason{
		"https://1.2.3.4:5432":          ReasonIPLiteral,
		"10.0.0.7":                      ReasonIPLiteral,
		"localhost:3000":                ReasonLocalhost,
		"postgres://localhost:5432/app": ReasonLocalhost,
		"http://127.0.0.1:8080":         ReasonLocalhost,
		"https://aidos.sagedesk.fr":     ReasonURLConcreteHost,
		"wss://api.example.com/socket":  ReasonURLConcreteHost,
		"db.sagedesk.fr:5432":           ReasonHostPort,
		"alphashop-db:5432":             ReasonHostPort,
	}
	for lit, want := range red {
		reason, hard := ClassifyLiteral(lit)
		if !hard {
			t.Errorf("ClassifyLiteral(%q) passed — must be caught as %s", lit, want)
			continue
		}
		if reason != want {
			t.Errorf("ClassifyLiteral(%q) = %s, want %s", lit, reason, want)
		}
	}
}

// The TS pass sees literals the way the AST does: template ${expr} spans
// poison adjacency (an env-derived host is never concrete), comments are
// skipped, literals INSIDE template expressions are scanned too.
func TestFixture_ScanSource(t *testing.T) {
	src := "// localhost in a comment is not an endpoint: localhost:9999\n" +
		"/* nor in a block comment: https://1.2.3.4:5432 */\n" +
		"const db = `${requireEnv(\"APP_NAME\")}-db:5432`;\n" +
		"const url = `https://${requireEnv(\"APP_SUBDOMAIN\")}.${requireEnv(\"DOMAIN\")}`;\n"
	if findings := ScanSource("gen/app/ok.ts", src); len(findings) != 0 {
		t.Fatalf("clean emitted source tripped the sensor: %+v", findings)
	}

	bad := "const a = 1;\nconst leak = \"https://1.2.3.4:5432\";\nconst alsoBad = `redis://${HOST}:6379@localhost`;\n"
	findings := ScanSource("gen/app/bad.ts", bad)
	if len(findings) != 2 {
		t.Fatalf("want 2 findings, got %+v", findings)
	}
	if findings[0].Line != 2 || findings[0].Reason != ReasonIPLiteral {
		t.Fatalf("finding #1 = %+v, want line 2 ip_literal", findings[0])
	}
	if findings[1].Line != 3 || findings[1].Reason != ReasonLocalhost {
		t.Fatalf("finding #2 = %+v, want line 3 localhost_literal", findings[1])
	}

	// a literal inside a template ${expr} span is still scanned (AST semantics).
	inner := "const x = `${connect(\"localhost:5432\")}`;\n"
	got := ScanSource("gen/app/inner.ts", inner)
	if len(got) != 1 || got[0].Reason != ReasonLocalhost {
		t.Fatalf("inner-expression literal escaped the sensor: %+v", got)
	}
}

// The DP07 demo module (the real emitted boot-config) is green for every
// closed environment — the wired stack carries no hardcoded endpoint, ever.
func TestFixture_DemoModuleGreenEveryEnvironment(t *testing.T) {
	for _, env := range scope.Environments() {
		module, err := connresolve.EmitConnectionsModule(connresolve.DemoManifest(), env)
		if err != nil {
			t.Fatalf("EmitConnectionsModule(%s): %v", env, err)
		}
		findings := ScanSource("gen/app/connections."+string(env)+".ts", string(module))
		if len(findings) != 0 {
			t.Fatalf("demo module for %s tripped the sensor: %+v", env, findings)
		}
	}
}

// The Go-authoritative content addresses of the demo sandbox tree — pinned.
// The vitest twin (front/web/lib/endpoint-fitness.test.ts) and the Playwright
// e2e re-derive EXACTLY these; one byte of divergence reds a mirror.
const (
	pinnedGreenAddress = "43f2e914534d162173904514b6e5e0d916584092df50ce47944564a264a52970"
	pinnedRedAddress   = "5164a99a4a7d189cbbe25d0741ffee776720f841328e4c4c80e86e87d5546a0a"
)

func TestFixture_PinnedDemoAddresses(t *testing.T) {
	green, err := Sense(DemoEmittedTree())
	if err != nil {
		t.Fatalf("Sense(green): %v", err)
	}
	if green.State != StateGreen {
		t.Fatalf("the demo sandbox tree must be green, got %+v", green.Findings)
	}
	ga, err := Address(green)
	if err != nil {
		t.Fatalf("Address(green): %v", err)
	}
	if ga != pinnedGreenAddress {
		t.Fatalf("green demo address = %s, pinned %s", ga, pinnedGreenAddress)
	}

	injected := DemoEmittedTree()
	injected[LeakPath] = LeakSource
	red, err := Sense(injected)
	if err != nil {
		t.Fatalf("Sense(red): %v", err)
	}
	if red.State != StateRed {
		t.Fatalf("the injected demo tree must be red")
	}
	ra, err := Address(red)
	if err != nil {
		t.Fatalf("Address(red): %v", err)
	}
	if ra != pinnedRedAddress {
		t.Fatalf("red demo address = %s, pinned %s", ra, pinnedRedAddress)
	}
}

// S84 wiring fixture — the auto-certification: a leak reddens the archfit
// sensor and the battery blocks the cut; the clean tree certifies green.
func TestFixture_S84AutoCertification(t *testing.T) {
	clean := SensorArchFit(DemoEmittedTree())
	if clean.State != selfcert.SensorGreen {
		t.Fatalf("clean demo tree must certify green, got %+v", clean)
	}
	battery := selfcert.Certify(append(otherSixGreen(), clean))
	if !battery.Green {
		t.Fatalf("the battery must be green on the clean tree: %+v", battery)
	}

	injected := DemoEmittedTree()
	injected[LeakPath] = LeakSource
	leaked := SensorArchFit(injected)
	if leaked.State != selfcert.SensorRed {
		t.Fatalf("injected tree must redden the archfit sensor")
	}
	if leaked.Detail == "" {
		t.Fatalf("a red archfit verdict must carry its actionable detail")
	}
	battery = selfcert.Certify(append(otherSixGreen(), leaked))
	if battery.Green {
		t.Fatalf("the S84 battery let the hardcoded endpoint through")
	}
	if battery.BlockReason == nil || battery.BlockReason.Code != selfcert.CodeBuildLoopSensorRed {
		t.Fatalf("the blocked cut must carry BUILD_LOOP_SENSOR_RED, got %+v", battery.BlockReason)
	}
}

// arch-fitness.json parity — the above-the-line declared rule and the
// deterministic code never drift (changing either is idée → miroir → /goal).
func TestFixture_ArchFitnessConfigParity(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "agentloop", "arch-fitness.json"))
	if err != nil {
		t.Fatalf("read arch-fitness.json: %v", err)
	}
	var cfg struct {
		EmittedNoHardcodedEndpoint struct {
			Rule    string   `json:"rule"`
			Sensor  string   `json:"sensor"`
			Reasons []string `json:"reasons"`
		} `json:"emitted_no_hardcoded_endpoint"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatalf("parse arch-fitness.json: %v", err)
	}
	decl := cfg.EmittedNoHardcodedEndpoint
	if decl.Rule != string(CodeEmittedNoHardcodedEndpoint) {
		t.Fatalf("declared rule %q != code %q", decl.Rule, CodeEmittedNoHardcodedEndpoint)
	}
	if decl.Sensor != string(selfcert.SensorArchFit) {
		t.Fatalf("declared sensor %q != archfit", decl.Sensor)
	}
	var want []string
	for _, r := range Reasons() {
		want = append(want, string(r))
	}
	if !reflect.DeepEqual(decl.Reasons, want) {
		t.Fatalf("declared reasons %v != closed set %v", decl.Reasons, want)
	}
}
