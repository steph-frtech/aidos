package main

// imagetag_hono_test.go — le MIROIR du TAG D'IMAGE SERVEUR CONTENT-ADRESSÉ sur la SORTIE ÉMISE
// (le vrai fix de la staleness Pulumi `:latest` ET de la staleness d'ÉMETTEUR, S02 content-addressing).
//
// LE DÉFAUT corrigé (deux couches) :
//
//   1. honoServerImageTag taguait `<project>-hono:latest` — un tag MUTABLE. Pulumi clé le conteneur
//      server sur cette chaîne IMMUABLE ; un changement → `up` rapporte "replaced" mais GARDE l'ancienne
//      image (le conteneur ne tourne jamais le nouveau code). (Couche déjà corrigée.)
//
//   2. serverSpecImageTag content-adressait le tag depuis le HASH DE LA SPEC (ServerSourceHash) — il
//      hashait la SPEC, pas la SORTIE. Donc un changement d'ÉMETTEUR (nouveau instrumentation.ts, nouveau
//      Dockerfile, nouvelle vue web — MÊME spec) ne changeait PAS le tag → Pulumi gardait l'ancien digest
//      d'image → il fallait un `pulumi refresh && up` manuel. LE FIX : content-adresser le tag depuis la
//      SORTIE ÉMISE — hasher les BYTES des artefacts que BuildHonoServerImage construit RÉELLEMENT
//      (EmitServerScaffold(server) ⊕ EmitWebApp(web) quand la vue est servie). Ainsi tout changement
//      d'émetteur → nouveaux bytes → nouveau hash → nouveau tag → Pulumi RECRÉE le conteneur.
//
// DÉTERMINISME-FIRST (§6/§8) : honoServerImageTag et honoOutputHash sont des FONCTIONS PURES — même
// entrée → même tag (la reproductibilité), une sortie différente → un tag différent (le content-
// addressing). Le tag DOIT correspondre à ce que le Dockerfile/serverDir buildé contient (la cohérence).

import (
	"bytes"
	"sort"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// TestHonoServerImageTag_ContentAddressed — le tag est CONTENT-ADRESSÉ : il porte le project + 12 hex
// du hash, et il n'est PAS `:latest` (le tag mutable que combat le content-addressing).
func TestHonoServerImageTag_ContentAddressed(t *testing.T) {
	const hash = "abcdef0123456789aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" // a 64-hex-like hash.

	tag := honoServerImageTag("shop", hash)

	// Shape: <project>-hono:<hash[:12]> — the repo carries the project, the tag the 12-hex content address.
	const want = "shop-hono:abcdef012345"
	if tag != want {
		t.Fatalf("honoServerImageTag(shop, hash) = %q, want %q (project + 12 hex of the hash)", tag, want)
	}
	// It is NOT the mutable :latest tag (the anti-pattern this fix removes).
	if strings.HasSuffix(tag, ":latest") {
		t.Fatalf("the per-project server tag is still :latest (mutable) — content-addressing requires the hash: %q", tag)
	}
	// The tag carries the project and exactly 12 hex of the hash.
	repo, ref, ok := strings.Cut(tag, ":")
	if !ok {
		t.Fatalf("tag %q has no :<ref> separator", tag)
	}
	if repo != "shop-hono" {
		t.Fatalf("tag repo = %q, want %q (the per-project repo)", repo, "shop-hono")
	}
	if len(ref) != 12 {
		t.Fatalf("tag ref = %q (len %d), want exactly 12 hex of the hash", ref, len(ref))
	}
	if ref != hash[:12] {
		t.Fatalf("tag ref = %q, want the first 12 chars of the hash %q", ref, hash[:12])
	}
}

// TestHonoServerImageTag_Deterministic — same (project, hash) → byte-identical tag (the reproducibility
// half of determinism-first: a pure function of its inputs, no clock, no RNG).
func TestHonoServerImageTag_Deterministic(t *testing.T) {
	const hash = "0011223344556677889900aabbccddeeff00112233445566778899aabbccddee"
	a := honoServerImageTag("library", hash)
	b := honoServerImageTag("library", hash)
	if a != b {
		t.Fatalf("honoServerImageTag is not deterministic: %q vs %q", a, b)
	}
}

// TestHonoServerImageTag_DistinctHashesDistinctTags — a DIFFERENT hash yields a DIFFERENT tag (the
// content-addressing frontier: this is what lets Pulumi detect a changed input and RECREATE the
// container instead of keeping the stale image). Distinct projects also keep distinct tags.
func TestHonoServerImageTag_DistinctHashesDistinctTags(t *testing.T) {
	const h1 = "aaaaaaaaaaaa1111111111112222222222223333333333334444444444445555"
	const h2 = "bbbbbbbbbbbb1111111111112222222222223333333333334444444444445555"
	if honoServerImageTag("shop", h1) == honoServerImageTag("shop", h2) {
		t.Fatalf("two distinct hashes produced the SAME tag — Pulumi would keep the stale image")
	}
	if honoServerImageTag("shop", h1) == honoServerImageTag("store", h1) {
		t.Fatalf("two distinct projects produced the SAME tag — the per-project repo must differ")
	}
}

// TestHonoOutputHash_HashesEmittedBytes — LE CŒUR DU FIX. honoOutputHash content-addresses the EMITTED
// OUTPUT (the bytes EmitServerScaffold(server) ⊕ EmitWebApp(web) actually produce — what the docker build
// over serverDir compiles), NOT the spec. A SIMULATED change in the emitted output (one extra byte in one
// artifact) → a DIFFERENT hash; the SAME output → the SAME hash. This is the property that closes the
// emitter-staleness gap: a new instrumentation.ts / Dockerfile / web view → new bytes → new hash → new tag.
func TestHonoOutputHash_HashesEmittedBytes(t *testing.T) {
	server := projectServerSpec("shop")
	web := projectWebSpec("shop")

	base := honoOutputHash(server, web, nil)
	if base == "" {
		t.Fatalf("honoOutputHash returned an empty hash for a well-formed cut")
	}

	// Same emitted output → same hash (reproducibility — a pure function of the emitted bytes).
	if again := honoOutputHash(server, web, nil); again != base {
		t.Fatalf("honoOutputHash is not deterministic: %q vs %q", base, again)
	}

	// It is the hash of the EMITTED OUTPUT, not of the spec. Prove it by collecting the SAME artifacts
	// the materialiser builds (EmitServerScaffold ⊕ EmitWebApp) and SIMULATING an emitter change: append
	// one byte to one artifact's bytes. The output hash MUST move — otherwise a code change to an emitter
	// (same spec) would leave the tag stale (the exact bug this fix removes).
	scaffold, br := honoemit.EmitServerScaffold(server)
	if br != nil {
		t.Fatalf("EmitServerScaffold(shop): %s", br.Explanation)
	}
	webArts, br := honoemit.EmitWebApp(web)
	if br != nil {
		t.Fatalf("EmitWebApp(shop): %s", br.Explanation)
	}
	// The output hash over the UNCHANGED emitted bytes must equal honoOutputHash (it hashes the same bytes).
	if hashed := hashHonoArtifacts(append(append([]honoemit.Artifact(nil), scaffold...), webArts...)); hashed != base {
		t.Fatalf("honoOutputHash %q does not match the hash of the emitted scaffold⊕web bytes %q", base, hashed)
	}
	// SIMULATE an emitter change: one extra byte in the first artifact → the output hash MUST differ.
	mutated := append([]honoemit.Artifact(nil), scaffold...)
	mutated = append(mutated, webArts...)
	mutated[0].Bytes = append(append([]byte(nil), mutated[0].Bytes...), '\n')
	if hashHonoArtifacts(mutated) == base {
		t.Fatalf("a one-byte change in the emitted output left the hash UNCHANGED — the tag would be stale")
	}
}

// TestServerSpecImageTag_TracksEmittedOutput — the per-project tag the materialiser propagates tracks the
// EMITTED OUTPUT hash (honoOutputHash over the server ⊕ web specs): the same emitted output → the same
// tag, and the tag's ref is exactly the first 12 hex of that output hash. This is the end-to-end content
// address on the SORTIE: a change to an EMITTER (same spec) → new output bytes → new hash → new tag →
// a recreated container, NO manual `pulumi refresh` needed.
func TestServerSpecImageTag_TracksEmittedOutput(t *testing.T) {
	server := projectServerSpec("shop")
	web := projectWebSpec("shop")

	got := serverSpecImageTag("shop", server, web, nil)
	outHash := honoOutputHash(server, web, nil)
	want := honoServerImageTag("shop", outHash)
	if got != want {
		t.Fatalf("serverSpecImageTag(shop) = %q, want %q (tracking the emitted output hash)", got, want)
	}
	// The tag's ref is exactly the first 12 hex of the OUTPUT hash (content-addressed on the sortie, not :latest).
	if _, ref, _ := strings.Cut(got, ":"); ref != outHash[:12] {
		t.Fatalf("serverSpecImageTag ref = %q, want the first 12 hex of the output hash %q", ref, outHash[:12])
	}
	if strings.HasSuffix(got, ":latest") {
		t.Fatalf("serverSpecImageTag is still :latest (mutable): %q", got)
	}
}

// TestProjectServerImageTag_MatchesBuiltScaffold — the COHERENCE invariant: the tag the wired Pulumi
// program references (projectServerImageTag, set on opts.HonoImage) is content-addressed over EXACTLY the
// scaffold MaterialiseHono lands in serverDir (EmitServerScaffold(projectServerSpec) ⊕ EmitWebApp(
// projectWebSpec)) — the SAME bytes BuildHonoServerImage docker-builds. So the tag never names a digest
// the build did not produce: tag ≡ built output.
func TestProjectServerImageTag_MatchesBuiltScaffold(t *testing.T) {
	got := projectServerImageTag("shop", nil)

	// The bytes BuildHonoServerImage builds: the server scaffold + the served React view.
	scaffold, br := honoemit.EmitServerScaffold(projectServerSpec("shop"))
	if br != nil {
		t.Fatalf("EmitServerScaffold(shop): %s", br.Explanation)
	}
	webArts, br := honoemit.EmitWebApp(projectWebSpec("shop"))
	if br != nil {
		t.Fatalf("EmitWebApp(shop): %s", br.Explanation)
	}
	builtHash := hashHonoArtifacts(append(append([]honoemit.Artifact(nil), scaffold...), webArts...))
	want := honoServerImageTag("shop", builtHash)
	if got != want {
		t.Fatalf("projectServerImageTag(shop) = %q, but the built scaffold⊕web hashes to %q (tag must equal the built output)", got, want)
	}
	if strings.HasSuffix(got, ":latest") {
		t.Fatalf("projectServerImageTag is still :latest (mutable): %q", got)
	}
	if !strings.HasPrefix(got, "shop-hono:") {
		t.Fatalf("projectServerImageTag is not <project>-hono:<hash>: %q", got)
	}
}

// hashHonoArtifacts is the test-side ORACLE for the output content-address: it reimplements the contract
// honoOutputHash promises (path-sorted; for each artifact, write the path, a NUL separator, then the bytes;
// SHA-256 over the whole stream) INDEPENDENTLY of the function under test — so a drift in either side is
// caught, never masked by sharing code. A path-collision-safe encoding (path⊕\x00⊕bytes) so a byte moving
// between a path and its content can never produce the same digest.
func hashHonoArtifacts(arts []honoemit.Artifact) string {
	sorted := append([]honoemit.Artifact(nil), arts...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].Path < sorted[j].Path })
	var buf bytes.Buffer
	for _, a := range sorted {
		buf.WriteString(a.Path)
		buf.WriteByte(0)
		buf.Write(a.Bytes)
		buf.WriteByte(0)
	}
	return records.Hash(buf.Bytes())
}
