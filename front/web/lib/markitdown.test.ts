/**
 * Reproducibility mirror for the DocConverter twin (lib/markitdown.ts), AIDOS step MK02.
 * fast-check (∀) — the SAME idempotence property the Go rapid property pins (ADR 0039):
 *   1. DETERMINISM: same (bytes, mime) ⇒ same markdown, byte-for-byte (« même fichier → même
 *      markdown »). A converter is a pure deterministic transform, never an LLM.
 *   2. REPRODUCIBILITY: determinism holds across 50 replays, no drift.
 *   3. TOTALITY: an unsupported mime yields "" (never throws).
 *   4. RE-INGESTION is a stable transform (re-converting the produced markdown is deterministic).
 *   5. THE WALL: toIdeaDraft yields a status="draft" candidate-truth, never a kernel write.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MIME_HTML, toIdeaDraft, toMarkdown } from "./markitdown";

// arbHtml builds an arbitrary HTML document with structure-bearing blocks + chrome to strip, so
// the idempotence property is non-trivial (the converter does real work).
const blocks = [
	"<h1>Title</h1>",
	"<h2>Section</h2>",
	"<p>Some <strong>bold</strong> and <em>italic</em> text.</p>",
	"<p>A <code>line.qty * line.unit_price</code> code span.</p>",
	"<ul><li>first</li><li>second</li></ul>",
	"<ol><li>step one</li><li>step two</li></ol>",
	"<table><tr><th>SKU</th><th>Price</th></tr><tr><td>SKU-001</td><td>19.90</td></tr></table>",
	'<p>See the <a href="https://example.com/x">contract</a>.</p>',
	"<nav>Home &gt; Specs</nav>",
	"<script>analytics()</script>",
	"<footer>(c) 2026</footer>",
];

const arbHtml = fc
	.array(fc.integer({ min: 0, max: blocks.length - 1 }), {
		minLength: 1,
		maxLength: 8,
	})
	.map(
		(idxs) =>
			`<html><head><title>T</title></head><body>${idxs
				.map((i) => blocks[i])
				.join("")}</body></html>`,
	);

describe("DocConverter twin (MK02) — idempotence", () => {
	it("is deterministic: same file → same markdown, byte-for-byte", () => {
		fc.assert(
			fc.property(arbHtml, (doc) => {
				expect(toMarkdown(doc, MIME_HTML)).toBe(toMarkdown(doc, MIME_HTML));
			}),
		);
	});

	it("is reproducible across 50 replays (no drift)", () => {
		fc.assert(
			fc.property(arbHtml, (doc) => {
				const first = toMarkdown(doc, MIME_HTML);
				for (let i = 0; i < 50; i++) {
					expect(toMarkdown(doc, MIME_HTML)).toBe(first);
				}
			}),
		);
	});

	it("is total: an unsupported mime yields empty markdown", () => {
		fc.assert(
			fc.property(arbHtml, (doc) => {
				expect(toMarkdown(doc, "application/x-unknown")).toBe("");
			}),
		);
	});

	it("re-ingestion is a stable transform", () => {
		fc.assert(
			fc.property(arbHtml, (doc) => {
				const md = toMarkdown(doc, MIME_HTML);
				const rewrapped = `<html><body><pre>${md}</pre></body></html>`;
				expect(toMarkdown(rewrapped, MIME_HTML)).toBe(
					toMarkdown(rewrapped, MIME_HTML),
				);
			}),
		);
	});

	it("converts the real shape: title heading survives", () => {
		const doc =
			"<html><head><title>T</title></head><body><h1>Checkout Service Specification</h1><p>x</p></body></html>";
		expect(toMarkdown(doc, MIME_HTML)).toContain(
			"# Checkout Service Specification",
		);
	});

	it("the wall: toIdeaDraft yields a status=draft candidate-truth, never a kernel write", () => {
		fc.assert(
			fc.property(arbHtml, (doc) => {
				const draft = toIdeaDraft(doc, MIME_HTML, "spec.html");
				expect(draft.status).toBe("draft");
				expect(draft.provenance).toContain("spec.html");
			}),
		);
	});
});
