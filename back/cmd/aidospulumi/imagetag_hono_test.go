package main

// imagetag_hono_test.go — le MIROIR du TAG D'IMAGE SERVEUR CONTENT-ADRESSÉ (le vrai fix de la
// staleness Pulumi `:latest`, S02 content-addressing).
//
// LE DÉFAUT corrigé : honoServerImageTag taguait `<project>-hono:latest` — un tag MUTABLE. Pulumi clé
// le conteneur server sur cette chaîne IMMUABLE ; un changement de code → `up` rapporte "replaced"
// mais GARDE l'ancienne image (le conteneur ne tourne jamais le nouveau code). LE FIX : taguer
// l'image par le HASH DE SA SOURCE (`<project>-hono:<hash[:12]>`), un tag IMMUABLE content-adressé —
// un changement de code → nouveau hash → nouveau tag → Pulumi détecte un input changé → RECRÉE le
// conteneur. C'est l'anti-pattern exact que combat le content-addressing.
//
// DÉTERMINISME-FIRST (§6/§8) : honoServerImageTag est une FONCTION PURE — même (project, hash) →
// même tag (la reproductibilité), un hash différent → un tag différent (le content-addressing).

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// TestHonoServerImageTag_ContentAddressed — le tag est CONTENT-ADRESSÉ : il porte le project + 12 hex
// du hash de la source, et il n'est PAS `:latest` (le tag mutable que combat le content-addressing).
func TestHonoServerImageTag_ContentAddressed(t *testing.T) {
	const hash = "abcdef0123456789aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" // a 64-hex-like hash.

	tag := honoServerImageTag("shop", hash)

	// Shape: <project>-hono:<hash[:12]> — the repo carries the project, the tag the 12-hex content address.
	const want = "shop-hono:abcdef012345"
	if tag != want {
		t.Fatalf("honoServerImageTag(shop, hash) = %q, want %q (project + 12 hex of the source hash)", tag, want)
	}
	// It is NOT the mutable :latest tag (the anti-pattern this fix removes).
	if strings.HasSuffix(tag, ":latest") {
		t.Fatalf("the per-project server tag is still :latest (mutable) — content-addressing requires the source hash: %q", tag)
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
		t.Fatalf("tag ref = %q (len %d), want exactly 12 hex of the source hash", ref, len(ref))
	}
	if ref != hash[:12] {
		t.Fatalf("tag ref = %q, want the first 12 chars of the source hash %q", ref, hash[:12])
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

// TestHonoServerImageTag_DistinctHashesDistinctTags — a DIFFERENT source hash yields a DIFFERENT tag
// (the content-addressing frontier: this is what lets Pulumi detect a changed input and RECREATE the
// container instead of keeping the stale image). Distinct projects also keep distinct tags.
func TestHonoServerImageTag_DistinctHashesDistinctTags(t *testing.T) {
	const h1 = "aaaaaaaaaaaa1111111111112222222222223333333333334444444444445555"
	const h2 = "bbbbbbbbbbbb1111111111112222222222223333333333334444444444445555"
	if honoServerImageTag("shop", h1) == honoServerImageTag("shop", h2) {
		t.Fatalf("two distinct source hashes produced the SAME tag — Pulumi would keep the stale image")
	}
	if honoServerImageTag("shop", h1) == honoServerImageTag("store", h1) {
		t.Fatalf("two distinct projects produced the SAME tag — the per-project repo must differ")
	}
}

// TestProjectServerImageTag_TracksSourceHash — the per-project tag the materialiser propagates tracks
// the project's SERVER SOURCE hash (ServerSourceHash over projectServerSpec): the same spec → the same
// tag, and the tag's ref is exactly the first 12 hex of that source hash. This is the end-to-end content
// address: a change to the project's server source → a new hash → a new tag → a recreated container.
func TestProjectServerImageTag_TracksSourceHash(t *testing.T) {
	hash, err := honoemit.ServerSourceHash(projectServerSpec("shop"))
	if err != nil {
		t.Fatalf("ServerSourceHash(projectServerSpec(shop)): %v", err)
	}
	got := projectServerImageTag("shop")
	want := honoServerImageTag("shop", hash)
	if got != want {
		t.Fatalf("projectServerImageTag(shop) = %q, want %q (tracking the server source hash)", got, want)
	}
	// The tag's ref is exactly the first 12 hex of the server source hash (content-addressed, not :latest).
	if _, ref, _ := strings.Cut(got, ":"); ref != hash[:12] {
		t.Fatalf("projectServerImageTag ref = %q, want the first 12 hex of the source hash %q", ref, hash[:12])
	}
	if strings.HasSuffix(got, ":latest") {
		t.Fatalf("projectServerImageTag is still :latest (mutable): %q", got)
	}
}
