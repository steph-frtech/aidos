"use client";

import { useState } from "react";
import {
	type IdeaDraft,
	MIME_HTML,
	toIdeaDraft,
	toMarkdown,
} from "@/lib/markitdown";

/**
 * IngestionPanel — the action-capable /ingestion panel (MK02). The human RUNS the DocConverter
 * port FROM THE SCREEN, calling the SAME pure twin the Go HTMLConverter runs
 * (back/runtime/markitdown, ADR 0039): paste an HTML document, click CONVERTIR → the markdown
 * appears; click again (or RE-CONVERTIR) → identical bytes, proving idempotence on screen
 * (« même fichier → même markdown »); click PROPOSER UNE IDÉE → the markdown is wrapped as a
 * status="draft" candidate-truth (a preview of what MK03's idea-intake will capture).
 *
 * DETERMINISM-FIRST: the conversion is COMPUTED by lib/markitdown.ts (the deterministic twin),
 * never an LLM, never re-implemented here. THE WALL: pure, below the line — it reads the document,
 * writes NO truth; the idea draft is a PROPOSAL (status="draft"), never a kernel write. Themed
 * (ADR 0010), bilingual (ADR 0011) — labels passed in.
 */

interface Labels {
	sourceLabel: string;
	convertCta: string;
	reconvertCta: string;
	proposeCta: string;
	markdownHeading: string;
	idempotentOk: string;
	idempotentFail: string;
	draftHeading: string;
	draftTitleLabel: string;
	draftStatusLabel: string;
	draftProvenanceLabel: string;
	draftWallNote: string;
	pending: string;
}

const DEFAULT_DOC = `<html>
<head><title>Checkout Service Specification</title><style>body{}</style></head>
<body>
  <nav>Home &gt; Specs &gt; Checkout</nav>
  <h1>Checkout Service Specification</h1>
  <p>The <strong>checkout</strong> behaviour for the storefront.</p>
  <h2>Cart Invariants</h2>
  <ul>
    <li>A cart line quantity is always strictly positive.</li>
    <li>The cart total equals the sum of <code>line.qty * line.unit_price</code>.</li>
  </ul>
  <p>See the <a href="https://example.com/payment-gateway">PaymentGateway contract</a>.</p>
  <footer>(c) 2026 Storefront</footer>
</body>
</html>`;

export function IngestionPanel({ labels }: { labels: Labels }) {
	const [source, setSource] = useState<string>(DEFAULT_DOC);
	const [markdown, setMarkdown] = useState<string | null>(null);
	const [idempotent, setIdempotent] = useState<boolean | null>(null);
	const [draft, setDraft] = useState<IdeaDraft | null>(null);

	const convert = () => {
		const md1 = toMarkdown(source, MIME_HTML);
		const md2 = toMarkdown(source, MIME_HTML);
		setMarkdown(md1);
		setIdempotent(md1 === md2);
		setDraft(null);
	};

	const propose = () => {
		setDraft(toIdeaDraft(source, MIME_HTML, "pasted-document.html"));
	};

	return (
		<div className="space-y-6" data-testid="ingestion-panel">
			<div className="space-y-2">
				<label
					htmlFor="ingestion-source"
					className="block text-sm font-medium text-foreground"
				>
					{labels.sourceLabel}
				</label>
				<textarea
					id="ingestion-source"
					data-testid="ingestion-source"
					value={source}
					onChange={(e) => setSource(e.target.value)}
					rows={12}
					className="w-full rounded-lg border border-border bg-card p-3 font-mono text-xs text-foreground shadow-sm focus:border-primary focus:outline-none"
				/>
			</div>

			<div className="flex flex-wrap gap-3">
				<button
					type="button"
					data-testid="convert-cta"
					onClick={convert}
					className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
				>
					{markdown === null ? labels.convertCta : labels.reconvertCta}
				</button>
				<button
					type="button"
					data-testid="propose-cta"
					onClick={propose}
					disabled={markdown === null}
					className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:opacity-50"
				>
					{labels.proposeCta}
				</button>
			</div>

			{markdown !== null ? (
				<section
					data-testid="markdown-output"
					aria-label={labels.markdownHeading}
					className="space-y-2"
				>
					<div className="flex items-center gap-3">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{labels.markdownHeading}
						</h2>
						<span
							data-testid="idempotent-badge"
							className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
								idempotent
									? "bg-primary/10 text-primary"
									: "bg-destructive/10 text-destructive"
							}`}
						>
							{idempotent ? labels.idempotentOk : labels.idempotentFail}
						</span>
					</div>
					<pre className="max-h-80 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap text-foreground">
						{markdown}
					</pre>
				</section>
			) : (
				<p className="text-sm text-muted-foreground">{labels.pending}</p>
			)}

			{draft !== null ? (
				<section
					data-testid="idea-draft"
					aria-label={labels.draftHeading}
					className="space-y-2 rounded-xl border border-border bg-card p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.draftHeading}
					</h2>
					<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
						<dt className="text-muted-foreground">{labels.draftTitleLabel}</dt>
						<dd className="text-foreground" data-testid="draft-title">
							{draft.title}
						</dd>
						<dt className="text-muted-foreground">{labels.draftStatusLabel}</dt>
						<dd className="text-foreground" data-testid="draft-status">
							{draft.status}
						</dd>
						<dt className="text-muted-foreground">
							{labels.draftProvenanceLabel}
						</dt>
						<dd className="text-foreground" data-testid="draft-provenance">
							{draft.provenance}
						</dd>
					</dl>
					<p className="text-xs text-muted-foreground">
						{labels.draftWallNote}
					</p>
				</section>
			) : null}
		</div>
	);
}
