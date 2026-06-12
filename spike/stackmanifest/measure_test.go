// measure_test.go — THROWAWAY (DP01 spike). The spike's fixture mirror, WRITTEN FIRST (red):
// StackManifest → throwaway emitter → compose that round-trips; re-emission N times = identical
// bytes; a one-byte hand-edit is detected by hash on the source path and undetectable on the
// static-template path; the verdict is a reproducible measurement (same fixture → same verdict,
// same harvest record hash). T0: ratchet OFF, but the mirror still precedes the code.
package stackmanifest

import (
	"strings"
	"testing"
)

// Mirror 1 — byte-identity: re-emitting the same manifest N times yields identical bytes
// (the reproducibility measure; 100 %, not 99 %).
func TestReEmissionByteIdentical(t *testing.T) {
	m := Fixture()
	first := Emit(m)
	if first == "" {
		t.Fatal("Emit produced no bytes")
	}
	for i := 0; i < 100; i++ {
		if Emit(m) != first {
			t.Fatalf("re-emission %d diverged — emitter is not pure", i)
		}
	}
	if OutputHash(Emit(m)) != OutputHash(first) {
		t.Fatal("output hash unstable across re-emissions")
	}
}

// Mirror 2 — /data/dockers conventions: the emitted compose carries the exact conventions
// (container_name ${APP_NAME}, env_file .env, external traefik network, HTTPS router + HTTP→HTTPS
// redirect middleware for the server role, named bind volume on an env-var device, restart
// unless-stopped) and NO hardcoded URL/host/secret.
func TestEmittedComposeHonoursConventions(t *testing.T) {
	c := Emit(Fixture())
	for _, want := range []string{
		"container_name: ${APP_NAME}-app",
		"env_file:",
		"traefik.http.routers.${APP_NAME}.entrypoints=websecure",
		"traefik.http.routers.${APP_NAME}.tls.certresolver=${CERT_RESOLVER_NAME}",
		"traefik.http.middlewares.${APP_NAME}-https-redirect.redirectscheme.scheme=https",
		"loadbalancer.server.port=3571",
		"restart: unless-stopped",
		"device: ${APP_DATA_PATH}",
		"external: true",
		"name: ${TRAEFIK_NETWORK_NAME}",
	} {
		if !strings.Contains(c, want) {
			t.Errorf("emitted compose misses convention %q", want)
		}
	}
	if strings.Contains(c, "ports:") {
		t.Error("a reverse-proxied service must publish NO ports (Traefik labels only)")
	}
	if strings.Contains(c, "sagedesk.fr") || strings.Contains(c, "password") {
		t.Error("emitted compose hardcodes a host/secret — everything goes through env vars")
	}
}

// Mirror 3 — round-trip: the emitted compose parses back to the manifest's topology
// (service names, images, internal ports, volume names, network) — nothing invented, nothing lost.
func TestComposeRoundTrip(t *testing.T) {
	m := Fixture()
	got, err := ParseCompose(Emit(m))
	if err != nil {
		t.Fatalf("ParseCompose: %v", err)
	}
	if !TopologyEqual(m, got) {
		t.Fatalf("round-trip lost or invented topology:\nwant %+v\ngot  %+v", Topology(m), got)
	}
}

// Mirror 4 — drift detection: on the SOURCE path a one-byte hand-edit of the emitted artifact
// is detected (recorded output-hash ≠ hash of edited bytes); on the static-template path there
// is no recorded hash, so the same edit is undetectable. This asymmetry IS the measured payoff.
func TestDriftDetectionBySourceHash(t *testing.T) {
	m := Fixture()
	emitted := Emit(m)
	recorded := OutputHash(emitted)

	edited := strings.Replace(emitted, "unless-stopped", "always", 1)
	if edited == emitted {
		t.Fatal("fixture edit did not change the bytes")
	}
	if !DriftDetected(recorded, edited) {
		t.Error("source path: a hand-edit must be detected by output-hash")
	}
	if DriftDetected(recorded, emitted) {
		t.Error("source path: pristine bytes must NOT be flagged as drift")
	}
	// the static template has no recorded hash — detection is impossible by construction.
	if TemplateCanDetectDrift() {
		t.Error("static-template path must measure as drift-blind (no recorded hash)")
	}
}

// Mirror 5 — source-hash stability and sensitivity: same manifest → same source hash;
// any field change → a different source hash (the content-address the wall would govern).
func TestSourceHashStableAndSensitive(t *testing.T) {
	a, b := Fixture(), Fixture()
	if SourceHash(a) != SourceHash(b) {
		t.Fatal("same manifest must give the same source hash")
	}
	b.Services[0].InternalPort = 4000
	if SourceHash(a) == SourceHash(b) {
		t.Fatal("a changed manifest must give a different source hash")
	}
}

// Mirror 6 — the verdict is computed and reproducible: Decide() twice → identical verdicts;
// the harvest record is content-addressed (same verdict → same record hash) and is a RECORD,
// never a declaration (HasMirror/HasVersion always false — it proposes, it does not freeze).
func TestVerdictComputedAndReproducible(t *testing.T) {
	v1, v2 := Decide(), Decide()
	if v1 != v2 {
		t.Fatalf("verdict not reproducible:\n%+v\n%+v", v1, v2)
	}
	if !v1.Go {
		t.Logf("verdict is NO-GO — rationale: %s", v1.Rationale)
	}
	r1, r2 := Harvest(v1), Harvest(v2)
	if r1.RecordHash != r2.RecordHash {
		t.Fatal("harvest record must be content-addressed: same verdict → same hash")
	}
	if r1.HasMirror || r1.HasVersion {
		t.Fatal("a harvested record proposes — it never carries a mirror or a frozen version")
	}
}

// Mirror 7 — form fit is a feature COUNT against declared criteria, never an opinion:
// exactly three candidate forms, the chosen one maximizes the count deterministically.
func TestFormFitIsDeterministicCount(t *testing.T) {
	v := Decide()
	if len(v.Forms) != 3 {
		t.Fatalf("expected exactly 3 candidate forms, got %d", len(v.Forms))
	}
	best := v.Forms[0]
	for _, f := range v.Forms[1:] {
		if f.Fit > best.Fit {
			best = f
		}
	}
	if v.ChosenForm != best.Form {
		t.Fatalf("chosen form %q is not the max-fit form %q", v.ChosenForm, best.Form)
	}
}
