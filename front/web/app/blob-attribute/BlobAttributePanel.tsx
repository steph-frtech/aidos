"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	DEMO_BLOB,
	DEMO_PROJECT_A,
	DEMO_PROJECT_B,
} from "@/lib/blob-attribute";
import { checkUploadAction, type UploadCheckView } from "./actions";

/**
 * BlobAttributePanel makes the /blob-attribute route action-capable (ui-completeness law,
 * CLAUDE.md §7): the S72 blob node has ONE control bound to the REAL engine, reachable AND
 * executable from the screen — pin an upload (MIME + size) against the declared blob node
 * and validate it. A conforming upload mints the PROJECT-SCOPED storage key, runs the
 * cross-project probe (A reaches it, B refused) and emits the deterministic handler; a bad
 * upload yields BLOB_MIME_REFUSED / BLOB_SIZE_REFUSED (never coerced).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/blob-attribute
 * (validateUpload + storageKey + emitHandler), never an LLM. THE WALL (§2): it WRITES
 * NOTHING — the bytes never enter the truth-store nor git. Themed (ADR 0010); next-intl (0011).
 */

const initial: UploadCheckView = {
	ok: false,
	upload: null,
	blobId: "",
	blobBody: "",
	allowedMime: DEMO_BLOB.allowed_mime,
	maxBytes: DEMO_BLOB.max_bytes,
};

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("blobAttribute");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testId}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function BlobAttributePanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("blobAttribute");
	const [state, action] = useActionState(checkUploadAction, initial);
	const refused = state.ok && state.block !== undefined;
	const accepted = state.ok && state.key !== undefined;
	const blockCode = state.block?.explanation.includes("BLOB_MIME_REFUSED")
		? "BLOB_MIME_REFUSED"
		: state.block?.explanation.includes("BLOB_SIZE_REFUSED")
			? "BLOB_SIZE_REFUSED"
			: "BLOB_INVALID";

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

			{/* The declared blob node: allow-list + size ceiling. */}
			<section
				data-testid="declared-node"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-4"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("declaredHeading")}
				</h2>
				<p className="font-mono text-xs text-foreground">
					{t("nodeLabel")}:{" "}
					<span data-testid="node-name">{DEMO_BLOB.name}</span>
				</p>
				<div className="flex flex-wrap gap-2">
					{DEMO_BLOB.allowed_mime.map((m) => (
						<span
							key={m}
							data-mime={m}
							className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-foreground"
						>
							{m}
						</span>
					))}
					<span
						data-testid="max-bytes"
						className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-xs text-muted-foreground"
					>
						≤ {DEMO_BLOB.max_bytes} B
					</span>
				</div>
			</section>

			{/* Pin an upload + validate / scope / emit (action-capable). */}
			<form
				action={action}
				className="space-y-4 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("runHeading")}
				</h2>
				<div className="grid gap-4 sm:grid-cols-2">
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("mimeLabel")}
						</span>
						<input
							name="mime"
							data-testid="upload-mime"
							defaultValue="image/png"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="space-y-1.5 text-sm">
						<span className="font-medium text-foreground">
							{t("sizeLabel")}
						</span>
						<input
							name="size"
							type="number"
							data-testid="upload-size"
							defaultValue="50000"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<Submit label={t("runButton")} testId="upload-submit" />
					<span className="text-xs text-muted-foreground">{t("wallNote")}</span>
				</div>

				{accepted && (
					<section
						data-testid="upload-result"
						data-verdict="accepted"
						className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span
								data-testid="verdict-badge"
								className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground"
							>
								{t("acceptedBadge")}
							</span>
							<p className="text-sm font-medium text-primary">
								{t("messages.accepted")}
							</p>
						</div>
						<dl className="space-y-1 font-mono text-xs">
							<div className="flex gap-2">
								<dt className="text-muted-foreground">{t("blobIdLabel")}:</dt>
								<dd data-testid="blob-id" className="break-all text-foreground">
									{state.blobId}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="text-muted-foreground">{t("keyLabel")}:</dt>
								<dd
									data-testid="storage-key"
									className="break-all text-foreground"
								>
									{state.key}
								</dd>
							</div>
						</dl>
						{/* The cross-project isolation probe: A reaches, B refused. */}
						<div
							data-testid="cross-project"
							className="flex flex-wrap gap-2 text-xs"
						>
							<span
								data-testid="cross-a"
								data-reachable={String(state.crossA)}
								className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-foreground"
							>
								{DEMO_PROJECT_A}: {state.crossA ? t("reachable") : t("refused")}
							</span>
							<span
								data-testid="cross-b"
								data-reachable={String(state.crossB)}
								className="inline-flex items-center rounded-full bg-card px-2.5 py-0.5 font-mono text-foreground"
							>
								{DEMO_PROJECT_B}: {state.crossB ? t("reachable") : t("refused")}
							</span>
						</div>
						{/* Proof it EMITS a deterministic handler. */}
						<pre
							data-testid="handler-head"
							className="overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-[11px] leading-relaxed text-foreground"
						>
							{state.handlerHead}
						</pre>
					</section>
				)}

				{refused && state.block && (
					<section
						data-testid="upload-result"
						data-verdict="refused"
						className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span
								data-testid="verdict-badge"
								className="inline-flex items-center rounded-full bg-destructive px-2.5 py-0.5 text-xs font-medium text-destructive-foreground"
							>
								{t("refusedBadge")}
							</span>
							<span
								data-testid="block-code"
								data-code={blockCode}
								className="font-mono text-sm font-semibold text-destructive"
							>
								{blockCode}
							</span>
						</div>
						<p className="text-xs leading-relaxed text-destructive">
							{state.block.explanation}
						</p>
						<ul
							data-testid="how-to-fix"
							className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs"
						>
							{state.block.how_to_fix.map((fix) => (
								<li key={fix} className="font-mono text-destructive">
									{fix}
								</li>
							))}
						</ul>
					</section>
				)}
			</form>
		</div>
	);
}
