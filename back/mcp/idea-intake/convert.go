package main

// convert.go — MK03 INGESTION DOOR. The `convert_to_markdown` MCP tool wires the MK02 DocConverter
// port (back/runtime/markitdown, ADR 0039) to idea-intake's idea_capture: a real document
// (HTML now; PDF/DOCX/OCR/audio behind the same replaceable port later) → markdown → a candidate-
// truth (an idea draft), provenance preserved.
//
// THE WALL (CLAUDE.md §2). This tool stays ABOVE the product but BELOW the freeze: it INSERTs into
// the `ideas` schema (the staging on-ramp), it writes NO kernel/mirrors/fitness. There is
// deliberately no promote path here — promotion is idea → mirror → /goal → human approval. The
// ingested markdown is a PROPOSAL, never a truth.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Everything this tool decides is a pure function:
//   - the conversion is the deterministic DocConverter (same bytes+mime → same markdown);
//   - the draft derivation (title = first H1, intent = the markdown body) is the pure deriveDraft;
//   - the idea id is the content hash of the canonical sketch (ideas.Capture, reused S01/S02).
// No LLM sits in this door. The reproducibility mirror (convert_property_test.go) pins it:
// same (bytes, mime, source) → same captured idea id, byte-for-byte.
//
// PROVENANCE (KRD §117/§119). The provenance set is CLOSED {human, incident}; an ingested document
// is a HUMAN on-ramp (a human drops the file). The verbatim Detail records the source name and the
// frontier it came through, so every truth later frozen from this idea points back to "which
// document, ingested how" — provenance is preserved, never invented.

import (
	"context"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/markitdown"
)

// convertInput is the MK03 ingestion request: the document bytes (as a string — HTML/markdown text
// at the reference frontier), its declared mime (never sniffed by an LLM), the source name kept in
// provenance, and the layer the resulting idea would propose.
type convertInput struct {
	Content  string `json:"content" jsonschema:"the document's raw text (HTML at the reference frontier; declared, never sniffed)"`
	Mime     string `json:"mime" jsonschema:"the declared content type, e.g. text/html"`
	Source   string `json:"source" jsonschema:"the source name (filename/URL) kept verbatim in the idea's provenance"`
	Proposes string `json:"proposes,omitempty" jsonschema:"the layer the idea would become: control|policy|operation|action|entity|product (default product)"`
}

// convertOutput returns BOTH the converted markdown (so the caller/Workbench can show « même fichier
// → même markdown ») AND the captured idea draft (id + provenance + status=draft). The two are
// linked: the idea's intent IS the markdown, its provenance IS the document.
type convertOutput struct {
	Markdown string     `json:"markdown"`
	Idea     ideaOutput `json:"idea"`
}

// deriveDraft is the PURE derivation from converted markdown to the idea sketch (determinism-first:
// a function, never an LLM). The title is the first markdown H1 (the document's own heading); the
// intent is the full markdown body; the provenance is the document, through the markitdown frontier,
// on the human on-ramp (the closed set {human, incident} — a dropped document is a human intention).
func deriveDraft(markdown, sourceName, proposes string) (ideas.Proposes, string, ideas.Provenance) {
	p := ideas.Proposes(proposes)
	if proposes == "" {
		p = ideas.ProposesProduct
	}
	detail := "ingested document: " + sourceName + " (via markitdown frontier)"
	return p, markdown, ideas.Provenance{Source: ideas.ProvenanceHuman, Detail: detail}
}

// firstHeading derives a short human label from the first markdown H1 — kept deterministic and pure
// (it mirrors the TS twin's firstHeading). Used for logs/diagnostics; the idea identity is the hash
// of the full sketch, not this label.
func firstHeading(md string) string {
	for _, l := range strings.Split(md, "\n") {
		t := strings.TrimSpace(l)
		if strings.HasPrefix(t, "# ") {
			return strings.TrimSpace(t[2:])
		}
	}
	return "(untitled ingested document)"
}

// convertToMarkdown is the MK03 tool handler. It runs the DocConverter port, derives the draft
// (pure), captures it through the SAME ideas.Capture the human on-ramp uses (so the id/provenance
// rules are identical), persists it via the ideas Store (above the wall), and returns the markdown +
// the idea. NO kernel write occurs anywhere on this path.
func (s *server) convertToMarkdown(ctx context.Context, _ *mcp.CallToolRequest, in convertInput) (*mcp.CallToolResult, convertOutput, error) {
	md := s.converter.ToMarkdown([]byte(in.Content), markitdown.Mime(in.Mime))

	proposes, intent, prov := deriveDraft(md, in.Source, in.Proposes)
	idea, err := ideas.Capture(proposes, intent, prov)
	if err != nil {
		return nil, convertOutput{}, err
	}
	if err := s.store.Insert(ctx, idea); err != nil {
		return nil, convertOutput{}, err
	}
	return nil, convertOutput{Markdown: md, Idea: toOutput(idea)}, nil
}
