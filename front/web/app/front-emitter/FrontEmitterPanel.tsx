"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { frontAction } from "./actions";
import { FRONT_INITIAL, type FrontView } from "./view";

/**
 * FrontEmitterPanel makes the /front-emitter route action-capable (ui-completeness law,
 * CLAUDE.md §7): the S93 front emitter has controls bound to the REAL pure twin
 * (lib/front-emitter), reachable AND executable from the screen.
 *
 * TWO action-capable surfaces, per the done-criteria:
 *  1. EMIT — toggle whether the order entity carries its blob + relation, then EMIT the front
 *     deterministically (the screen shows the bundle hash, the emitted form source, and the
 *     control buttons each carrying its control-spec sensor).
 *  2. SUBMIT — a REAL, rendered create-order form (text + checkbox + file upload + relation
 *     select) that POSTS a real operation (incl. a blob upload) to the emitted-submit datastore
 *     endpoint, proving the generated form is submittable (the Playwright done-criterion).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): emission runs the PURE twin, never an LLM. THE WALL
 * (§2): emission WRITES NO TRUTH — the front is a projection. The submit endpoint writes to a
 * BELOW-THE-LINE datastore stand-in (the emitted app's live datastore is a forward dependency,
 * an OpenQuestion), never the kernel. Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

function Submit({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("frontEmitter");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testid}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function FrontEmitterPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("frontEmitter");
	const [state, action] = useActionState<FrontView, FormData>(
		frontAction,
		FRONT_INITIAL,
	);
	const [submitResult, setSubmitResult] = useState<string | null>(null);

	async function onSubmitOrder(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = e.currentTarget;
		const data = new FormData(form);
		// The submission is a REAL operation against the datastore stand-in (a blob included).
		const res = await fetch("/api/emitted-submit", {
			method: "POST",
			body: data,
		});
		const json = (await res.json()) as {
			ok: boolean;
			id?: number;
			blob?: { name: string; size: number } | null;
			error?: string;
		};
		if (json.ok) {
			setSubmitResult(
				`#${json.id}` +
					(json.blob ? ` · ${json.blob.name} (${json.blob.size}B)` : ""),
			);
		} else {
			setSubmitResult(`ERR: ${json.error}`);
		}
	}

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

			{/* Control 1 — EMIT the front deterministically. */}
			<form
				action={action}
				className="space-y-5 rounded-xl border border-border p-5"
			>
				<div className="space-y-2">
					<label
						htmlFor="project"
						className="text-sm font-medium text-foreground"
					>
						{t("projectLabel")}
					</label>
					<input
						id="project"
						name="project"
						defaultValue="shop"
						data-testid="project-input"
						className="block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						name="withBlob"
						data-testid="withblob-toggle"
						defaultChecked
						className="size-4 rounded border-input"
					/>
					{t("withBlobLabel")}
				</label>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						name="withRelation"
						data-testid="withrelation-toggle"
						defaultChecked
						className="size-4 rounded border-input"
					/>
					{t("withRelationLabel")}
				</label>
				<Submit label={t("emitLabel")} testid="emit-button" />
			</form>

			{state.blockExplanation && (
				<section
					data-testid="block-reason"
					className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
				>
					<h2 className="text-sm font-semibold text-destructive">
						{t("blockedHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{state.blockExplanation}
					</p>
				</section>
			)}

			{state.ok && (
				<div className="space-y-6" data-testid="front-result">
					{/* The bundle — byte-identity surface. */}
					<section className="space-y-2 rounded-xl border border-border p-5">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-semibold text-foreground">
								{t("bundleHeading")}
							</h2>
							<span
								data-testid="bundle-hash"
								className="font-mono text-xs text-muted-foreground"
							>
								{state.bundleHash}
							</span>
						</div>
						<pre
							data-testid="bundle-bytes"
							className="max-h-72 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground"
						>
							{state.bundle}
						</pre>
					</section>

					{/* The control+action verticale rendered to REAL buttons with their sensors. */}
					<section className="space-y-3 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("controlsHeading")}
						</h2>
						<div className="flex flex-wrap gap-3">
							{state.controls?.map((c) => (
								<button
									key={c.name}
									type="button"
									data-testid="emitted-control"
									data-aidos-control={c.name}
									data-aidos-invoke={c.operation}
									data-aidos-fixture={JSON.stringify({
										name: c.name,
										op: c.operation,
										rows: c.fixtures,
									})}
									className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
								>
									{c.label}
								</button>
							))}
						</div>
					</section>

					{/* The emitted form SOURCE (proves blob → file input, relation → select). */}
					<section className="space-y-2 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("formSourceHeading")}
						</h2>
						<pre
							data-testid="form-source"
							className="max-h-72 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs text-foreground"
						>
							{state.orderFormBytes}
						</pre>
					</section>

					{/* The LIVE, submittable create-order form (the Playwright done-criterion:
					    a real operation submitted against the datastore, incl. a blob upload). */}
					<section className="space-y-3 rounded-xl border border-border p-5">
						<h2 className="text-sm font-semibold text-foreground">
							{t("liveFormHeading")}
						</h2>
						<form
							onSubmit={onSubmitOrder}
							data-testid="live-order-form"
							className="space-y-3"
							encType="multipart/form-data"
						>
							<input type="hidden" name="entity" value="order" />
							<label className="block text-sm text-foreground">
								total
								<input
									name="total"
									type="text"
									defaultValue="42.50"
									required
									data-testid="field-total"
									className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm"
								/>
							</label>
							<label className="flex items-center gap-2 text-sm text-foreground">
								<input
									name="paid"
									type="checkbox"
									data-testid="field-paid"
									className="size-4 rounded border-input"
								/>
								paid
							</label>
							<label className="block text-sm text-foreground">
								customer_id
								<input
									name="customer_id"
									type="text"
									defaultValue="7"
									data-testid="field-customer"
									className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm"
								/>
							</label>
							<label className="block text-sm text-foreground">
								receipt (blob)
								<input
									name="receipt"
									type="file"
									accept="image/png,application/pdf"
									data-testid="field-receipt"
									className="mt-1 block w-full text-sm"
								/>
							</label>
							<button
								type="submit"
								data-testid="submit-order"
								className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
							>
								{t("submitOrderLabel")}
							</button>
						</form>
						{submitResult && (
							<p
								data-testid="submit-result"
								className="font-mono text-xs text-emerald-600"
							>
								{submitResult}
							</p>
						)}
					</section>
				</div>
			)}
		</div>
	);
}
