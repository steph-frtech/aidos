// measure.go — THROWAWAY (MK01 spike). The deterministic measurement harness + the computed
// go/no-go verdict. ALL pure functions (determinism-first): same fixture bytes -> same numbers, so
// the verdict is reproducible. The verdict is COMPUTED against declared thresholds, never declared.
//
// Two properties decide MK01:
//   - FIDELITY: do the document's CARRIER FACTS (the load-bearing statements a human dropped the
//     doc in to capture) survive into the markdown? Measured as carriers-found / carriers-total.
//   - IDEMPOTENCE: is the conversion a stable transform? Two senses, both asserted:
//     (a) determinism: ToMarkdown(bytes) == ToMarkdown(bytes) byte-for-byte;
//     (b) re-ingestion stability: ToMarkdown(<rewrap md as html>) leaves the carriers intact, i.e.
//     a second pass through the frontier does not erode the substance (no progressive loss).
package markitdown

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// Carriers are the document's load-bearing facts — the substance a human ingests the doc FOR. They
// are declared (above-the-line, never learned): a faithful conversion MUST preserve every one.
func Carriers() []string {
	return []string{
		"Checkout Service Specification",                 // the title/heading
		"cart line quantity is always strictly positive", // invariant 1
		"cart total equals the sum of",                   // invariant 2
		"empty cart cannot be checked out",               // invariant 3
		"line.qty * line.unit_price",                     // the code fact (must keep code span)
		"Reserve stock for every line",                   // workflow step
		"Authorise payment for the cart total",           // workflow step
		"OrderPlaced",                                    // emitted event
		"PaymentDeclined",                                // emitted event
		"SKU-001",                                        // table datum
		"19.90",                                          // table datum
		"PaymentGateway contract",                        // the cross-reference (link text)
		"https://example.com/payment-gateway",            // the link target (provenance of the ref)
	}
}

// FidelityFloor is the DECLARED go-threshold: a faithful ingestion must preserve ALL carriers (a
// dropped fact is silent data loss — the worst failure for ingestion). 1.0 == every carrier kept.
const FidelityFloor = 1.0

// Fidelity is the share of declared carrier facts found in the markdown.
type Fidelity struct {
	Total   int
	Found   int
	Missing []string
	Frac    float64
}

func MeasureFidelity(md string) Fidelity {
	cs := Carriers()
	f := Fidelity{Total: len(cs)}
	for _, c := range cs {
		if strings.Contains(md, c) {
			f.Found++
		} else {
			f.Missing = append(f.Missing, c)
		}
	}
	if f.Total > 0 {
		f.Frac = float64(f.Found) / float64(f.Total)
	}
	return f
}

// Idempotence captures both senses of "stable conversion".
type Idempotence struct {
	Deterministic    bool   // ToMarkdown(b) == ToMarkdown(b)
	Hash             string // content-addressed id of the produced markdown
	ReingestStable   bool   // a 2nd pass through the frontier keeps every carrier (no erosion)
	ReingestFidelity Fidelity
}

// MeasureIdempotence runs both senses. Re-ingestion models "what if the markdown is itself fed back
// to the converter" (e.g. an md doc dropped into the frontier): the carriers must not erode.
func MeasureIdempotence(raw []byte) (string, Idempotence) {
	md1 := ToMarkdown(raw)
	md2 := ToMarkdown(raw)
	id := Idempotence{Deterministic: md1 == md2}
	sum := sha256.Sum256([]byte(md1))
	id.Hash = hex.EncodeToString(sum[:])[:16]

	// Second pass: wrap the markdown as a minimal HTML body and re-convert. A faithful frontier
	// must not lose carriers on re-ingestion (idempotent w.r.t. the document's substance).
	rewrapped := "<html><body><pre>" + escapeForHTML(md1) + "</pre></body></html>"
	md3 := ToMarkdown([]byte(rewrapped))
	id.ReingestFidelity = MeasureFidelity(md3)
	id.ReingestStable = id.ReingestFidelity.Frac >= FidelityFloor
	return md1, id
}

func escapeForHTML(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;")
	return r.Replace(s)
}

// IdeaDraft is the SHAPE the markitdown frontier produces — NOT a kernel truth. It is exactly what
// the MK03 `convert_to_markdown` MCP tool will feed into idea-intake's `idea_capture`. The wall:
// ingestion yields a candidate-truth (an IDEA with provenance), never a mirror, never the kernel.
type IdeaDraft struct {
	Title        string // derived from the first heading (deterministic)
	Body         string // the markdown
	Provenance   string // where it came from (the source doc) — kept, never invented
	SourceHash   string // content hash of the SOURCE bytes (audit trail)
	MarkdownHash string // content hash of the produced markdown
	Status       string // always "draft": ideas freeze nothing
}

// ToIdeaDraft maps a converted document to the idea-draft shape. Deterministic.
func ToIdeaDraft(raw []byte, sourceName string) IdeaDraft {
	md := ToMarkdown(raw)
	srcSum := sha256.Sum256(raw)
	mdSum := sha256.Sum256([]byte(md))
	return IdeaDraft{
		Title:        firstHeading(md),
		Body:         md,
		Provenance:   "ingested document: " + sourceName + " (via markitdown frontier)",
		SourceHash:   hex.EncodeToString(srcSum[:])[:16],
		MarkdownHash: hex.EncodeToString(mdSum[:])[:16],
		Status:       "draft",
	}
}

func firstHeading(md string) string {
	for _, l := range strings.Split(md, "\n") {
		t := strings.TrimSpace(l)
		if strings.HasPrefix(t, "# ") {
			return strings.TrimSpace(strings.TrimPrefix(t, "# "))
		}
	}
	return "(untitled ingested document)"
}
