"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionResult, putAction, setHeadAction } from "./actions";

/**
 * StoreActions makes the /store panel action-capable (ui-completeness law):
 * two controls that DO the Archive content-store write ops, below the wall.
 *
 *   1. Put      — a textarea + submit that stores bytes by SHA-256 hash and
 *                 shows the resulting hash.
 *   2. Set head — key + hash (or "use last put") that points a head key at a
 *                 hash and appends a history row.
 *
 * Both call Server Actions (app/store/actions.ts) which write the archive
 * tables directly (append-only, below the line). After a write the action calls
 * revalidatePath("/store") so the new object/head/history re-render. On a
 * DB-unreachable situation the action returns a friendly error instead of
 * crashing. Themed on the ADR 0010 tokens; strings via next-intl (ADR 0011).
 */

const initial: ActionResult = { ok: false, messageKey: "" };

function SubmitButton({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("store");
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

function ResultLine({
	result,
	testid,
}: {
	result: ActionResult;
	testid: string;
}) {
	const t = useTranslations("store");
	if (!result.messageKey) return null;
	const values: Record<string, string> = {};
	if (result.hash) values.hash = result.hash;
	if (result.key) values.key = result.key;
	return (
		<p
			data-testid={testid}
			data-ok={result.ok ? "true" : "false"}
			className={
				result.ok
					? "mt-3 break-all rounded-md bg-primary/10 px-3 py-2 text-xs text-primary"
					: "mt-3 break-all rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive"
			}
		>
			<span className="font-semibold">{t("resultLabel")}: </span>
			{t(`${result.messageKey}`, values)}
		</p>
	);
}

export function StoreActions() {
	const t = useTranslations("store");

	const [putResult, putFormAction] = useActionState(putAction, initial);
	const [headResult, headFormAction] = useActionState(setHeadAction, initial);

	// The hash field of the set-head form; "use last put" copies the last
	// successful put hash into it so the two controls chain naturally.
	const [hashField, setHashField] = useState("");
	const [lastPutHash, setLastPutHash] = useState<string | null>(null);

	useEffect(() => {
		if (putResult.ok && putResult.hash) {
			setLastPutHash(putResult.hash);
		}
	}, [putResult]);

	return (
		<section
			aria-label={t("actionsHeading")}
			className="mt-10 border-t border-border pt-8"
			data-testid="store-actions"
		>
			<h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{t("actionsHeading")}
			</h2>

			<div className="grid gap-6 lg:grid-cols-2">
				{/* Put */}
				<form
					action={putFormAction}
					data-testid="put-form"
					className="space-y-3 rounded-xl border border-border bg-card p-4"
				>
					<div>
						<h3 className="text-sm font-semibold text-card-foreground">
							{t("putHeading")}
						</h3>
						<p className="mt-1 text-xs text-muted-foreground">{t("putHint")}</p>
					</div>
					<label
						htmlFor="put-content"
						className="block text-xs font-medium text-muted-foreground"
					>
						{t("putContentLabel")}
					</label>
					<textarea
						id="put-content"
						name="content"
						data-testid="put-content"
						rows={4}
						placeholder={t("putContentPlaceholder")}
						className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
					<SubmitButton label={t("putSubmit")} testid="put-submit" />
					<ResultLine result={putResult} testid="put-result" />
				</form>

				{/* Set head */}
				<form
					action={headFormAction}
					data-testid="set-head-form"
					className="space-y-3 rounded-xl border border-border bg-card p-4"
				>
					<div>
						<h3 className="text-sm font-semibold text-card-foreground">
							{t("setHeadHeading")}
						</h3>
						<p className="mt-1 text-xs text-muted-foreground">
							{t("setHeadHint")}
						</p>
					</div>
					<div className="space-y-1">
						<label
							htmlFor="set-head-key"
							className="block text-xs font-medium text-muted-foreground"
						>
							{t("setHeadKeyLabel")}
						</label>
						<input
							id="set-head-key"
							name="key"
							type="text"
							data-testid="set-head-key"
							placeholder={t("setHeadKeyPlaceholder")}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<div className="space-y-1">
						<div className="flex items-center justify-between gap-2">
							<label
								htmlFor="set-head-hash"
								className="block text-xs font-medium text-muted-foreground"
							>
								{t("setHeadHashLabel")}
							</label>
							<button
								type="button"
								data-testid="use-last-put"
								disabled={!lastPutHash}
								onClick={() => {
									if (lastPutHash) setHashField(lastPutHash);
								}}
								className="rounded-md border border-border bg-card px-2 py-1 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
							>
								{t("setHeadUseLastPut")}
							</button>
						</div>
						<input
							id="set-head-hash"
							name="hash"
							type="text"
							data-testid="set-head-hash"
							value={hashField}
							onChange={(e) => setHashField(e.target.value)}
							placeholder={t("setHeadHashPlaceholder")}
							className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</div>
					<SubmitButton label={t("setHeadSubmit")} testid="set-head-submit" />
					<ResultLine result={headResult} testid="set-head-result" />
				</form>
			</div>
		</section>
	);
}
