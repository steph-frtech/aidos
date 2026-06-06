---
name: markitdown
description: Convert a real document (PDF/DOCX/PPTX/XLSX/HTML/img/audio) to markdown through the DocConverter ingestion frontier, deterministically and idempotently — the door by which a doc becomes a candidate-truth (an idea draft), never a kernel write. Use when ingesting a document into AIDOS, when someone says "convert this doc/spec/PDF to markdown", "ingest this file", "turn this document into an idea", or when a markdown frontier is needed before idea-intake. NEVER for code (the emitters/AST own that), NEVER into the kernel.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# markitdown (KRD ingestion-frontier gesture)

The **ingestion frontier**: turn a real document into markdown so it can become a **candidate-truth** (an idea draft) for the human to grill, mirror and freeze. It is the door `document → markdown → idée draft`, never a path into the kernel and never the emitter/AST path (those own *code*).

> **The wall (CLAUDE.md §2):** this gesture **never** writes the `kernel` / `mirrors` / `fitness` schemas. Conversion **proposes** (markdown wrapped as an idea draft at MK03 via `idea-intake`); the human **freezes** later via `idea → mirror → /goal → human approval`. Ingestion yields a candidate-truth, never a truth.

## Purpose

Convert a document (PDF/DOCX/PPTX/XLSX/HTML/img(OCR)/audio/YouTube — `microsoft/markitdown`'s remit) into markdown through the **`DocConverter` port** (`ToMarkdown(bytes, mime) → md`), **deterministically** and **idempotently** — « même fichier → même markdown », byte-for-byte. The markdown is then handed to `idea-intake` (MK03) as an idea draft with provenance.

## When to use

- A real document must enter AIDOS as raw material: a spec, a PDF, a slide deck, a spreadsheet.
- The user says "convert this doc to markdown", "ingest this file", "turn this document into an idea", "markitdown this".
- A markdown frontier is needed **before** the idea-intake / grill / mirror loop runs on a document's substance.

## When NOT to use

- **Never for code** — the deterministic emitters and the kernel AST own code generation; ingestion is for *documents*, not source.
- **Never into the kernel** — the output is an idea draft, never a mirror, never a truth write.

## Inputs

- **source bytes** — the document's raw bytes (read from disk or supplied).
- **mime** — the document's content type (`text/html` is handled by the default reference; PDF/DOCX/… dispatch to the real adapter at MK03). Declared, never sniffed by an LLM.
- The source **name / provenance** — kept, never invented (it becomes the idea draft's provenance).

## Outputs

- The **markdown** (deterministic, idempotent — the same bytes+mime always yield the same markdown).
- At MK03: an **idea draft** (`status="draft"`, source+markdown content-hashed, provenance kept) fed to `idea-intake` — a candidate-truth, never a kernel write.

## Determinism-first (CLAUDE.md §6/§8)

A converter is a **deterministic transform** (parse → walk → render): it **MUST** be code, never an LLM. Same `(bytes, mime)` → same markdown, byte-for-byte. The reproducibility mirror (`back/runtime/markitdown/markitdown_property_test.go::TestReproducible`) replays it 100×, no drift. The LLM has **no place** in this frontier.

## Replaceable port (ADR 0039)

The concrete converter is an **adapter behind the `DocConverter` interface** — the default `HTMLConverter` is the in-process deterministic reference; the real `microsoft/markitdown` (and the PDF/DOCX/OCR/audio paths) is wired behind the **same port** at MK03 (over its MCP) without touching the caller. The adapter is **replaceable** by an ADR; what is **graven** is the idempotence contract (« même fichier → même markdown »), and any adapter is held to it.

## Procedure

1. **Read** the document bytes and determine its `mime` (declared).
2. **Convert** via the `DocConverter` port: `md := conv.ToMarkdown(raw, mime)` (`back/runtime/markitdown`). For HTML the default `HTMLConverter` runs offline; other formats dispatch to the MK03 adapter.
3. **Verify idempotence** — re-run `ToMarkdown` and assert byte-equality (the contract); the property mirror already pins it.
4. **Hand off, never freeze** — at MK03, wrap the markdown as an **idea draft** (provenance kept, source+markdown content-hashed) and feed `idea-intake`'s `idea_capture`. **Stop at the wall**: never write the kernel/mirrors.
5. Any unsupported format / non-determinism is an **OpenQuestion** (provenance), never silently filled.

## Guardrails

- **Total & pure:** an unsupported mime yields empty markdown, never a panic; no clock, no rng, no I/O, no LLM in the contract.
- **Wall:** zero `kernel`/`mirrors`/`fitness` writes; the output is a *proposal*.
- **Idempotent:** if conversion is not byte-deterministic for a format, pin a deterministic normalization pass or gate that format out — never a frontier that drifts.

## See also

- `back/runtime/markitdown/markitdown.go` — the `DocConverter` port + `HTMLConverter` reference.
- `back/runtime/markitdown/markitdown_property_test.go` — the idempotence property mirror.
- `docs/adr/0039-mk02-ingestion-frontier-replaceable-port.md` — the replaceable-port decision.
- ROADMAP-markitdown (MK01 spike-gate → MK02 port → MK03 MCP + idea-intake).
