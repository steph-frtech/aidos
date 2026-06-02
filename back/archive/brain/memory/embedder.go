package memory

import (
	"crypto/sha256"
	"encoding/binary"
	"math"
	"strings"
)

// HashEmbedder is the DETERMINISTIC, model-free embedder (ADR 0025). It maps text to a fixed
// EmbeddingDim vector by a seeded, content-only scheme: same text ⇒ same vector, always. It needs
// no network model, so a test never depends on one and the reproducibility mirror holds by
// construction ("recall is deterministic under a fixed seed").
//
// The scheme is a hashed bag-of-tokens: each whitespace-split token is hashed to a bucket index in
// [0, EmbeddingDim) and added with a sign also drawn from the hash. The vector is L2-normalized so
// cosine similarity is a clean dot product. Semantically similar texts (sharing tokens) land near
// each other; this is sufficient FUEL-level recall for the fixture/property — it is NOT a learned
// model and makes no truth claim.
type HashEmbedder struct {
	// seed namespaces the hash so the embedding space is reproducible and explicitly seeded.
	seed uint64
}

// NewHashEmbedder builds the deterministic embedder with the given seed. The seed is fixed in
// tests so recall is reproducible; the runtime would inject a real model instead.
func NewHashEmbedder(seed uint64) *HashEmbedder { return &HashEmbedder{seed: seed} }

// Name identifies the embedder; recorded in provenance so a swap is a recorded reindex.
func (e *HashEmbedder) Name() string { return "hash-embedder/v1" }

// Embed maps text to its deterministic EmbeddingDim-vector. Pure: same text ⇒ same vector.
func (e *HashEmbedder) Embed(text string) []float32 {
	vec := make([]float32, EmbeddingDim)
	tokens := strings.Fields(strings.ToLower(text))
	for _, tok := range tokens {
		idx, sign := e.bucket(tok)
		vec[idx] += sign
	}
	normalize(vec)
	return vec
}

// bucket hashes a token (with the seed) to a (index, sign) pair. Deterministic.
func (e *HashEmbedder) bucket(token string) (int, float32) {
	var seedBuf [8]byte
	binary.BigEndian.PutUint64(seedBuf[:], e.seed)
	sum := sha256.Sum256(append(seedBuf[:], []byte(token)...))
	idx := int(binary.BigEndian.Uint32(sum[0:4]) % uint32(EmbeddingDim))
	sign := float32(1)
	if sum[4]&1 == 1 {
		sign = -1
	}
	return idx, sign
}

// normalize scales vec to unit L2 length in place (no-op for the zero vector).
func normalize(vec []float32) {
	var sumSq float64
	for _, v := range vec {
		sumSq += float64(v) * float64(v)
	}
	if sumSq == 0 {
		return
	}
	norm := float32(math.Sqrt(sumSq))
	for i := range vec {
		vec[i] /= norm
	}
}

// cosineSimilarity returns the cosine similarity of a and b in [-1, 1] (1 = identical direction).
// Score = cosine similarity = 1 - cosine_distance (ADR 0025). Returns 0 for a zero vector. Pure.
func cosineSimilarity(a, b []float32) float64 {
	if len(a) != len(b) {
		return 0
	}
	var dot, na, nb float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		na += float64(a[i]) * float64(a[i])
		nb += float64(b[i]) * float64(b[i])
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}
