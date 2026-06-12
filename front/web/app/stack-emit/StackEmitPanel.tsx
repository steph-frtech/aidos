"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ComposeArtifact } from "@/lib/stack-emit";
import type { StackManifest } from "@/lib/stack-manifest";
import { emitAction } from "./actions";
import { EMIT_INITIAL, type EmitView } from "./view";

/**
 * StackEmitPanel renders the DP03 additive emitter target: the seeded
 * StackManifest emitted as a /data/dockers-convention docker-compose.yml —
 * the compose bytes, the double content address (source_hash == the DP02
 * kernel head hash · output_hash == Hash(bytes), the byte-identical
 * re-emission proof) and the below-the-line projection path.
 *
 * ONE control (« émettre le compose », ui-completeness CLAUDE.md §7) re-runs
 * the PURE emitter over the editable JSON — proving from the screen the
 * refusals (UNKNOWN_SERVICE_ROLE / DUPLICATE_INTERNAL_PORT /
 * STACK_HAS_NO_SERVER) and the reproducibility (same manifest → same
 * output_hash). It writes NOTHING (the wall, §2). Themed on ADR 0010 tokens;
 * strings via next-intl (ADR 0011).
 */

function EmitSubmit() {
	const t = useTranslations("stackEmit");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="emit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("emit")}
		</button>
	);
}

export function StackEmitPanel({
	activeProjectId,
	manifest,
	seeded,
}: {
	activeProjectId: string | null;
	manifest: StackManifest;
	seeded: ComposeArtifact;
}) {
	const t = useTranslations("stackEmit");
	const [state, action] = useActionState<EmitView, FormData>(
		emitAction,
		EMIT_INITIAL,
	);
	// CONTROLLED textarea: the screen's editable copy of the manifest JSON —
	// React owns the value so a server-action round-trip never resets the edit.
	const [manifestJson, setManifestJson] = useState(() =>
		JSON.stringify(manifest, null, 2),
	);

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span className="font-medium text-foreground">
					{t("activeProjectLabel")}:
				</span>
				<span
					data-testid="active-project"
					className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono"
				>
					{activeProjectId ?? t("noProject")}
				</span>
			</div>

			{/* the seeded emission — the compose projected from the Example manifest */}
			<section
				data-testid="compose-card"
				className="rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("composeHeading")}
					</h2>
					<span
						data-testid="compose-path"
						className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-mono font-medium text-foreground"
					>
						{seeded.path}
					</span>
				</div>

				<pre
					data-testid="compose-yaml"
					className="mt-4 max-h-96 overflow-auto rounded-lg bg-muted/40 p-4 font-mono text-xs leading-relaxed text-foreground"
				>
					{seeded.yaml}
				</pre>

				<dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
					<div className="rounded-lg bg-muted/40 p-3">
						<dt className="font-medium text-muted-foreground">
							{t("sourceHashLabel")}
						</dt>
						<dd
							data-testid="source-hash"
							className="mt-1 break-all font-mono text-foreground"
						>
							{seeded.sourceHash}
						</dd>
					</div>
					<div className="rounded-lg bg-muted/40 p-3">
						<dt className="font-medium text-muted-foreground">
							{t("outputHashLabel")}
						</dt>
						<dd
							data-testid="output-hash"
							className="mt-1 break-all font-mono text-foreground"
						>
							{seeded.outputHash}
						</dd>
					</div>
				</dl>
			</section>

			{/* the closed kind × target matrix — the target is ADDITIVE, never invented */}
			<section
				data-testid="target-matrix"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("matrixHeading")}
				</h2>
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					{t("matrixBody")}
				</p>
				<p
					data-testid="targets"
					className="mt-3 font-mono text-xs text-foreground"
				>
					entity × (go-sqlc · pg-ddl · ts-types) — S34 · operations ×
					(hono-server · hono-worker) + stack_manifest × pulumi-program —
					S87/ADR 0043 ·{" "}
					<span className="rounded bg-muted px-1.5 py-0.5 font-semibold">
						stack_manifest × docker-compose — DP03
					</span>
				</p>
			</section>

			{/* the control — emit the compose, a pure measure (writes nothing) */}
			<section
				data-testid="emit-card"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("emitHeading")}
				</h2>
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
					{t("emitHint")}
				</p>
				<form action={action} className="mt-4 space-y-4">
					<input
						type="hidden"
						name="seededOutputHash"
						value={seeded.outputHash}
					/>
					<textarea
						name="manifestJson"
						data-testid="manifest-json"
						rows={10}
						value={manifestJson}
						onChange={(e) => setManifestJson(e.target.value)}
						className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
					<EmitSubmit />
				</form>

				{state.ok && state.yaml ? (
					<div
						data-testid="emit-result"
						data-outcome="emitted"
						className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-xs"
					>
						<p className="font-medium text-foreground">{t("emittedVerdict")}</p>
						<p
							data-testid="emitted-output-hash"
							className="mt-1 break-all font-mono text-muted-foreground"
						>
							{state.outputHash}
						</p>
						<p
							data-testid="hash-compare"
							className="mt-1 text-muted-foreground"
						>
							{state.sameAsSeeded ? t("sameHash") : t("newOutput")}
						</p>
						<pre
							data-testid="emitted-yaml"
							className="mt-3 max-h-72 overflow-auto rounded-lg bg-background p-3 font-mono leading-relaxed text-foreground"
						>
							{state.yaml}
						</pre>
					</div>
				) : null}
				{!state.ok && state.refusal ? (
					<div
						data-testid="emit-result"
						data-outcome="refused"
						className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs"
					>
						<p
							data-testid="refusal-code"
							className="font-mono font-semibold text-destructive"
						>
							{state.refusal.code}
						</p>
						<p className="mt-1 text-muted-foreground">
							{state.refusal.message}
						</p>
					</div>
				) : null}
				{!state.ok && state.parseError ? (
					<div
						data-testid="emit-result"
						data-outcome="parse-error"
						className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs"
					>
						<p className="font-mono font-semibold text-destructive">
							INVALID_JSON
						</p>
						<p className="mt-1 text-muted-foreground">{state.parseError}</p>
					</div>
				) : null}
			</section>

			{/* the wall + gen/ protection */}
			<section
				data-testid="wall-note"
				className="rounded-xl border border-border bg-muted/40 p-5 text-xs leading-relaxed text-muted-foreground"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("wallHeading")}
				</h2>
				<p className="mt-2">{t("wallBody")}</p>
			</section>
		</div>
	);
}
