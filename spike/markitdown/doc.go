// Package markitdown is the THROWAWAY MK01 spike (KRD §84: ratchet OFF, rigor T0, throwaway).
// Zone /spike/markitdown/ — nothing here graduates: /harvest will PROPOSE, /goal will FREEZE, and
// the real code is REWRITTEN at MK02+. The wall is intact (no kernel/mirrors/fitness write). The
// module is isolated (it does not import back/). See cmd/verdict for the printed result, and
// Decide().Rationale for the COMPUTED go/no-go decision (never declared).
//
// FALSIFIABILITY QUESTION
//
//	Does converting a REAL document (a checkout functional spec) to markdown preserve its CARRIER
//	FACTS (the substance a human ingests the doc FOR) AND is that conversion IDEMPOTENT — so it can
//	become an idempotence property-mirror at MK02 and feed idea-intake at MK03 without silent loss?
//
// WHAT IS MEASURED (deterministic, no LLM — determinism-first mandate; TestReproducible replays
// 100x, same source bytes -> same markdown, same hashes, same verdict):
//
//   - FIDELITY (measure.go): the share of 13 DECLARED carrier facts (title, 3 cart invariants, the
//     code span line.qty*line.unit_price, 2 workflow steps, 2 emitted events OrderPlaced /
//     PaymentDeclined, 2 pricing-table data, the PaymentGateway cross-reference WITH its link
//     target) found in the markdown. Floor = 1.0: a dropped fact is silent data loss, the worst
//     ingestion failure. Measured 13/13 = 100.0%.
//
//   - IDEMPOTENCE (measure.go), two senses, both asserted:
//     (a) determinism: ToMarkdown(bytes) == ToMarkdown(bytes) byte-for-byte (md-hash dfac5f53…).
//     (b) re-ingestion stability: feeding the produced markdown back through the frontier keeps
//     100% of carriers — no progressive erosion (the property MK02's mirror will pin).
//
//   - THE WALL (verdict.go): the conversion maps to an IDEA-DRAFT (status="draft", provenance kept,
//     source+markdown content-hashed) — a CANDIDATE-truth, never a mirror, never a kernel write.
//     Ingestion proposes; idea -> mirror -> /goal -> human freezes. WallRespected=true.
//
// MEASURES (on testdata/checkout-spec.html, a real HTML functional spec with chrome to strip):
//
//	property            value           gate
//	fidelity            13/13 (100.0%)  >= 100.0% floor   PASS
//	deterministic       true            byte-for-byte     PASS
//	reingest-stable     true (100.0%)   >= 100.0% floor   PASS
//	wall-respected      true            status=draft      PASS
//	reproducible        true            100x, no drift    PASS
//
// VERDICT: GO. The deterministic HTML->markdown frontier converts a real document preserving ALL
// carrier facts (headings, invariants, workflow steps, emitted events, table data, code spans, the
// cross-reference + its target), is idempotent in both senses, and yields a clean idea-draft that
// honours the wall. A deterministic, idempotent ingestion path EXISTS -> proceed to MK02 (skill +
// DocConverter port `ToMarkdown(bytes,mime)->md` + the idempotence property-mirror; ADR « frontière
// d'ingestion replaceable »).
//
// OPENQUESTIONS (unresolved gaps — recorded as provenance, NEVER silently filled):
//
//	OQ-MK01-1 (real adapter) — this probe MODELS the frontier with a stdlib-only, deterministic
//	  HTML->markdown converter; it does NOT call microsoft/markitdown (a Python lib, and this
//	  environment is OFFLINE: `pip install markitdown` times out / is externally-managed). markitdown
//	  itself is NOT guaranteed byte-idempotent across versions/OCR/audio. MK02 wires the real adapter
//	  behind the DocConverter port and RE-MEASURES idempotence; if markitdown is non-deterministic on
//	  a format, the port pins a deterministic normalization pass (or that format is gated out). This
//	  is the load-bearing gap: the GO is on the SHAPE of the capability, proven idempotent; the
//	  concrete tool's idempotence is re-proven at MK02 by the property-mirror.
//
//	OQ-MK01-2 (formats beyond HTML) — the spike proves HTML, the one format purely parseable in Go
//	  stdlib offline. PDF/DOCX/PPTX/XLSX/img(OCR)/audio/YouTube are markitdown's job and are NOT
//	  exercised here (a PDF spec needs markitdown's binary path). Fidelity carriers for those formats
//	  (tables in XLSX, OCR confidence on scans) are unproven until MK02 runs the real adapter on real
//	  fixtures of each kind.
//
//	OQ-MK01-3 (carrier extraction is declared, not learned) — fidelity is measured against 13 carriers
//	  hand-declared for THIS document (above the line, honest). A general ingestion cannot enumerate a
//	  doc's carriers; MK02's mirror tests IDEMPOTENCE (same in -> same out), which needs no carrier
//	  list, while fidelity-to-substance stays a per-fixture acceptance check, never an auto-judge.
//
//	OQ-MK01-4 (frontier only, never the code path) — this is INGESTION only: doc -> idea draft. It is
//	  NOT a path into the kernel and NOT the emitter/AST path (those own code). The wall is asserted
//	  in the SHAPE here; MK03 enforces it for real by routing through idea-intake's idea_capture with
//	  no kernel GRANT.
//
// REPRODUCE: `cd spike/markitdown && go test ./... && go run ./cmd/verdict`.
package markitdown
