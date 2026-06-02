// Package memory is the AIDOS Archive `/brain` memory adapter (KRD §136, §119.1) — write a
// MemoryItem and RECALL it by similarity over pgvector embeddings, across the four *indexable*
// KRD memories: episodic / semantic / procedural / structural.
//
// THE `/brain` STORE IS CONTEXT FUEL, NEVER TRUTH (back/archive/CONTEXT.md). A MemoryItem carries
// content + provenance + validity_scope + expires_at + confidence + taint, is branch-aware, and
// has — by construction — NO mirror and NO version/freeze. This adapter ships ONLY write +
// similarity-recall; it reaches NOTHING above the wall. The MemoryFirewall promotion flow
// (Memory → ContextPack → Idea → Mirror → Goal → Kernel, §119.1) is a SEPARATE concern (S30
// firewall package + later steps); "recall" here is retrieving the nearest items by similarity,
// not a truth lookup and not a RAG that decides.
//
// TWO BACKENDS, ONE PORT (ADR 0025). The Store interface (Write / Recall) has two injectable
// implementations: MockStore (in-memory, deterministic — exact cosine over a seeded HashEmbedder,
// so a test never needs a model) and PgxStore (real, over brain.memory_item via pgx, HNSW cosine
// ANN). Injection is by constructor — no global. The Embedder is itself an injected port so the
// mock needs no model and the runtime can name its model in provenance.
//
// REUSE, DON'T REINVENT (CLAUDE.md §3, ADR 0007): the MemoryItem id reuses S01/S02's
// records.Hash/Canonicalize content-addressing — the SAME body always lands at the same address;
// it is NEVER forked here. Evolutionary memory (the S24 version DAG) and working memory (the live
// context window) are OUT of this adapter — only the four indexable kinds.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): similarity scoring, ordering, filtering and hashing are pure
// deterministic functions; the HashEmbedder is seeded so "recall is deterministic under a fixed
// seed" holds by construction (the reproducibility mirror pins it). No agent/LLM sits in the recall
// loop — recall is cosine arithmetic over declared vectors.
package memory

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// EmbeddingDim is the fixed embedding dimension pinned by ADR 0025 (vector(384)). It is set at
// column-creation; changing it later is an expand-contract reindex of the append-only table.
const EmbeddingDim = 384

// Kind is the discriminator of the four INDEXABLE KRD memories (KRD §136). The set is CLOSED —
// working memory (the live context window) and evolutionary memory (the S24 version DAG) are NOT
// here. Nothing is invented at runtime.
type Kind string

const (
	// KindEpisodic — runs / incidents (what happened, when).
	KindEpisodic Kind = "episodic"
	// KindSemantic — ubiquitous language / glossary / patterns (what words mean).
	KindSemantic Kind = "semantic"
	// KindProcedural — reusable gestures / skills (how to do something).
	KindProcedural Kind = "procedural"
	// KindStructural — context map / dependency graphs (how things relate).
	KindStructural Kind = "structural"
)

// Kinds returns the closed kind enum in canonical order. The Workbench renders exactly these.
func Kinds() []Kind {
	return []Kind{KindEpisodic, KindSemantic, KindProcedural, KindStructural}
}

// IsKnownKind reports whether k is a member of the closed enum.
func IsKnownKind(k Kind) bool {
	for _, x := range Kinds() {
		if x == k {
			return true
		}
	}
	return false
}

// Taint is a provenance-quality marker on a MemoryItem (KRD §119.1). The set is CLOSED. Taint
// travels with a memory and round-trips through write/recall intact — it is never silently dropped.
type Taint string

const (
	// TaintUnverified — the claim has not been checked against any source.
	TaintUnverified Taint = "unverified"
	// TaintStale — the claim is past its validity.
	TaintStale Taint = "stale"
	// TaintUserClaim — a human asserted it.
	TaintUserClaim Taint = "user_claim"
	// TaintIncidentDerived — extracted from an incident signal.
	TaintIncidentDerived Taint = "incident_derived"
	// TaintExternalSource — drawn from an external document/source.
	TaintExternalSource Taint = "external_source"
)

// Taints returns the closed taint enum in canonical order.
func Taints() []Taint {
	return []Taint{TaintUnverified, TaintStale, TaintUserClaim, TaintIncidentDerived, TaintExternalSource}
}

// MemoryItem is one entry of the `/brain` store (KRD §136, §119.1) — context fuel, never truth. It
// is content-addressed: the ID is the SHA-256 hex hash of the canonical body (S01/S02 reused), so
// the same body always lands at the same address. It has NO version and NO mirror field — those
// two absences are what make it memory and not a truth (the type makes them unrepresentable).
type MemoryItem struct {
	// ID is the content hash of the canonical body (set by Build / Write; never hand-assigned).
	ID string `json:"id"`
	// Kind is one of the four indexable memories.
	Kind Kind `json:"kind"`
	// Content is the remembered claim (free-form text — the embedding source + the fuel).
	Content string `json:"content"`
	// Provenance is who/what engendered the memory, incl. the embedder model name at write time.
	Provenance string `json:"provenance"`
	// ValidityScope bounds where the memory holds (e.g. "EU"). Empty = unscoped.
	ValidityScope string `json:"validity_scope"`
	// ExpiresAt bounds when the memory holds (ISO date string; empty = no declared expiry).
	ExpiresAt string `json:"expires_at"`
	// Confidence is the recalled certainty (0..1). It NEVER buys a path to the kernel.
	Confidence float64 `json:"confidence"`
	// Taint is the closed-enum provenance-quality marker set. Travels with the memory.
	Taint []Taint `json:"taint"`
	// Branch is the DAG branch the memory was captured on — memory is branch-aware.
	Branch string `json:"branch"`
}

// canonicalBody is the content-addressed JSONB shape whose hash is the memory id. There is — by
// construction — NO "version" and NO "mirror" key: a memory cannot carry the thing that would make
// it a truth. The kind discriminator is "memory_item" (namespacing the hash, matching the S30
// brain.memory_item body shape) plus the indexable memory `kind`. The ID is EXCLUDED (it IS the
// address) and so is the embedding (a projection of content, not part of the identity).
type canonicalBody struct {
	Kind          string  `json:"kind"` // always "memory_item" — body discriminator
	MemoryKind    Kind    `json:"memory_kind"`
	Content       string  `json:"content"`
	Provenance    string  `json:"provenance"`
	ValidityScope string  `json:"validity_scope"`
	ExpiresAt     string  `json:"expires_at"`
	Confidence    float64 `json:"confidence"`
	Taint         []Taint `json:"taint"`
	Branch        string  `json:"branch"`
}

// CanonicalBody returns the canonical JSON bytes whose hash is the memory id. It REUSES
// records.Canonicalize (key-sorted, deterministic) — never a forked hashing path.
func (m MemoryItem) CanonicalBody() ([]byte, error) {
	taint := m.Taint
	if taint == nil {
		taint = []Taint{}
	}
	raw, err := json.Marshal(canonicalBody{
		Kind:          "memory_item",
		MemoryKind:    m.Kind,
		Content:       m.Content,
		Provenance:    m.Provenance,
		ValidityScope: m.ValidityScope,
		ExpiresAt:     m.ExpiresAt,
		Confidence:    m.Confidence,
		Taint:         taint,
		Branch:        m.Branch,
	})
	if err != nil {
		return nil, fmt.Errorf("memory: marshal canonical body: %w", err)
	}
	return records.Canonicalize(raw)
}

// ComputeID computes the content-addressed id of m (reusing S01/S02 hashing). Pure.
func (m MemoryItem) ComputeID() (string, error) {
	canon, err := m.CanonicalBody()
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// WriteInput is the pure input to a Store.Write — a MemoryItem minus its id (the store computes it
// as the content hash) and minus its embedding (the store derives it via the injected Embedder).
type WriteInput struct {
	Kind          Kind
	Content       string
	Provenance    string
	ValidityScope string
	ExpiresAt     string
	Confidence    float64
	Taint         []Taint
	Branch        string
}

// itemFromInput builds the content-addressed MemoryItem from a WriteInput. Pure.
func itemFromInput(in WriteInput) (MemoryItem, error) {
	m := MemoryItem{
		Kind:          in.Kind,
		Content:       in.Content,
		Provenance:    in.Provenance,
		ValidityScope: in.ValidityScope,
		ExpiresAt:     in.ExpiresAt,
		Confidence:    in.Confidence,
		Taint:         append([]Taint(nil), in.Taint...),
		Branch:        in.Branch,
	}
	id, err := m.ComputeID()
	if err != nil {
		return MemoryItem{}, err
	}
	m.ID = id
	return m, nil
}

// RecallQuery asks the store for the nearest memories by similarity. QueryText is embedded via the
// store's Embedder; Kind/Branch are OPTIONAL filters (empty = no filter); K bounds the hits.
type RecallQuery struct {
	QueryText string
	Kind      Kind   // optional; "" = any kind
	Branch    string // optional; "" = any branch
	K         int
}

// Hit is one recalled memory plus its similarity score (higher = nearer; score = 1 - cosine_dist).
type Hit struct {
	Item  MemoryItem `json:"item"`
	Score float64    `json:"score"`
}

// Store is the memory adapter PORT: write a MemoryItem (content-addressed, append-only) and recall
// the nearest by similarity. Two implementations (MockStore, PgxStore) are interchangeable behind
// it (ADR 0025). Write is append-only — a superseding write is a NEW row, never an in-place edit.
type Store interface {
	// Write appends a MemoryItem (embedding derived via the store's Embedder) and returns the
	// content-addressed id. Append-only: re-writing the same body is idempotent (same id), a
	// changed body is a new row.
	Write(ctx context.Context, in WriteInput) (string, error)
	// Recall returns at most q.K hits ordered by score descending (nearest first), honouring the
	// optional kind/branch filters. It touches only the memory store, never the truth schemas.
	Recall(ctx context.Context, q RecallQuery) ([]Hit, error)
	// Get reads a single MemoryItem by id (for rendering). Returns ErrNotFound if absent.
	Get(ctx context.Context, id string) (MemoryItem, error)
}

// ErrNotFound is returned by Get when no memory has the given id.
var ErrNotFound = errors.New("memory: not found")

// Embedder is the injected embedding PORT (ADR 0025): map text to a fixed EmbeddingDim vector. The
// mock backend uses the deterministic HashEmbedder (no model); the runtime backend names its model
// in MemoryItem provenance.
type Embedder interface {
	// Embed returns the EmbeddingDim-length embedding of text. Deterministic for the mock.
	Embed(text string) []float32
	// Name identifies the embedder (recorded in provenance so a model swap is a recorded reindex).
	Name() string
}

// rankHits embeds the query, scores every candidate by cosine similarity to it, applies the
// kind/branch filters, orders by score descending (ties broken by id ascending for determinism),
// and truncates to k. It is the SHARED pure recall core both backends agree on (so mock ≡ pgx on
// ordering for the fixture vectors). Pure: same inputs ⇒ same hits.
func rankHits(emb Embedder, q RecallQuery, candidates []MemoryItem) []Hit {
	queryVec := emb.Embed(q.QueryText)
	hits := make([]Hit, 0, len(candidates))
	for _, c := range candidates {
		if q.Kind != "" && c.Kind != q.Kind {
			continue
		}
		if q.Branch != "" && c.Branch != q.Branch {
			continue
		}
		hits = append(hits, Hit{Item: c, Score: cosineSimilarity(queryVec, emb.Embed(c.Content))})
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].Score != hits[j].Score {
			return hits[i].Score > hits[j].Score
		}
		return hits[i].Item.ID < hits[j].Item.ID
	})
	if q.K >= 0 && len(hits) > q.K {
		hits = hits[:q.K]
	}
	return hits
}
