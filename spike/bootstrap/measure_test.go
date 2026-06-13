// measure_test.go — THROWAWAY (DP10 spike, T0). The spike's executable mirror over
// the PURE core: port resolution is a function of the observed state (never a
// prompt), start order is permutation-stable, the candidate scoring is a feature
// count, the verdict is a conjunction. The REAL docker run is exercised by
// cmd/verdict (kept out of `go test` so the unit mirror stays hermetic).
package bootstrap

import (
	"math/rand"
	"reflect"
	"testing"
)

const ssFixture = `State  Recv-Q Send-Q Local Address:Port  Peer Address:Port
LISTEN 0      4096       127.0.0.1:5433       0.0.0.0:*
LISTEN 0      4096         0.0.0.0:80         0.0.0.0:*
LISTEN 0      4096         0.0.0.0:443        0.0.0.0:*
LISTEN 0      511                *:3000             *:*
LISTEN 0      4096       127.0.0.1:18080      0.0.0.0:*
`

const psFixture = `172.17.0.1:3330->3330/tcp
5432/tcp
0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp
127.0.0.1:18081->5432/tcp
`

func TestPortResolutionIsPureAndPromptless(t *testing.T) {
	state := ObservedState{SSOutput: ssFixture, DockerPSOutput: psFixture}
	occ := Occupied(state)
	for _, want := range []int{5433, 80, 443, 3000, 18080, 3330, 18081} {
		if !occ[want] {
			t.Fatalf("port %d should be observed occupied", want)
		}
	}
	// 18080 listening + 18081 docker-mapped → first free ≥ base is 18082. Twice → same.
	p1 := ResolvePort(occ, BasePort)
	p2 := ResolvePort(Occupied(state), BasePort)
	if p1 != 18082 || p1 != p2 {
		t.Fatalf("resolution must be pure and deterministic: got %d / %d", p1, p2)
	}
}

func TestStartOrderIsPermutationStable(t *testing.T) {
	b := Fixture()
	want := []string{"traefik", "postgres", "server"}
	r := rand.New(rand.NewSource(42)) // seeded — the test itself stays deterministic
	for i := 0; i < 50; i++ {
		shuffled := make([]Service, len(b.Services))
		copy(shuffled, b.Services)
		r.Shuffle(len(shuffled), func(a, c int) { shuffled[a], shuffled[c] = shuffled[c], shuffled[a] })
		if got := StartOrder(shuffled); !reflect.DeepEqual(got, want) {
			t.Fatalf("order must be permutation-stable: got %v want %v", got, want)
		}
	}
}

func TestPlanIsDeterministic(t *testing.T) {
	state := ObservedState{SSOutput: ssFixture, DockerPSOutput: psFixture}
	a, b := BuildPlan(Fixture(), state), BuildPlan(Fixture(), state)
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("same (bundle, snapshot) must yield the same plan")
	}
	if a.Network == "traefik_default" {
		t.Fatalf("the spike must NEVER target the prod traefik_default network")
	}
}

func TestCandidateScoringIsAFeatureCount(t *testing.T) {
	script := ScriptMeasures{PromptCount: 7, DataDockersRefs: 3, ScriptLineCount: 322}
	cs := ScoreCandidates(script)
	if len(cs) != 3 {
		t.Fatalf("≤3 candidates compared, got %d", len(cs))
	}
	scores := map[string]int{}
	for _, c := range cs {
		scores[c.ID] = c.Score
	}
	if scores["native-go"] != 5 || scores["wrapper"] != 1 || scores["deploy-sh"] != 0 {
		t.Fatalf("declared-criteria count broken: %v", scores)
	}
}

func TestMeasureScriptCountsFacts(t *testing.T) {
	script := "select BP in x; do\nread -rp \"port\" p\nread -rp \"go\" g\ncd /data/dockers\n"
	m := MeasureScript(script)
	if m.PromptCount != 3 || m.DataDockersRefs != 1 {
		t.Fatalf("measured facts wrong: %+v", m)
	}
}

func TestVerdictIsAConjunctionAndContentAddressed(t *testing.T) {
	okRun := RunResult{
		ResolvedPort: 18082, OrderedOK: true, HealthyAll: true, URLProbe: true,
		Events: []Event{{1, "network-created", ""}, {2, "traefik-up", ""}, {3, "healthy:traefik", ""},
			{4, "datastore-up", ""}, {5, "healthy:postgres", ""}, {6, "server-up", ""},
			{7, "healthy:server", ""}, {8, "url-probed", ""}, {9, "urls-printed", ""}},
	}
	m := Measurement{
		PlanDeterministic: true, OrderDeterministic: true,
		Run1: okRun, Run2: okRun, RunsReproducible: Reproducible(okRun, okRun),
		Script:     ScriptMeasures{PromptCount: 7, DataDockersRefs: 3},
		Candidates: ScoreCandidates(ScriptMeasures{PromptCount: 7, DataDockersRefs: 3}),
	}
	v1, v2 := Decide(m), Decide(m)
	if !v1.Go || v1.Winner != "native-go" {
		t.Fatalf("all conjuncts true must measure GO for native-go: %+v", v1.Reasons)
	}
	if v1.VerdictHash != v2.VerdictHash || len(v1.VerdictHash) != 64 {
		t.Fatalf("verdict must be content-addressed and reproducible")
	}
	// flip one measured fact → the conjunction goes no-go and the address moves.
	bad := m
	badRun := okRun
	badRun.URLProbe = false
	bad.Run2 = badRun
	v3 := Decide(bad)
	if v3.Go || v3.VerdictHash == v1.VerdictHash {
		t.Fatalf("a flipped measure must flip the verdict and its address")
	}
}

func TestHarvestProposesNeverFreezes(t *testing.T) {
	v := Verdict{Go: true, Winner: "native-go", VerdictHash: "abc"}
	r := Harvest(v)
	if r.Status != "draft" || r.HasMirror || r.HasVersion {
		t.Fatalf("harvest must stay a DRAFT proposal: %+v", r)
	}
	if Harvest(v).RecordHash != r.RecordHash || len(r.RecordHash) != 64 {
		t.Fatalf("record must be content-addressed deterministically")
	}
}
