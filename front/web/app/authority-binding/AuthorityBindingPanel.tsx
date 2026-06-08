"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type OverrideResult,
	overrideAction,
	type ProposeResult,
	proposeAction,
} from "./actions";

/**
 * AuthorityBindingPanel makes the /authority-binding route action-capable
 * (ui-completeness law, CLAUDE.md §7): every op S63 develops has a control bound to it,
 * reachable AND executable from the screen.
 *
 *   - Propose — decide a truth-write proposal (admitted | INSUFFICIENT_AUTHORITY | VETOED |
 *               PLACEHOLDER_ACTOR | escalated). The decision is DETERMINISTIC (the TS twin
 *               of back/runtime/authoritybinding); READ-ONLY against truth (the wall, §2).
 *   - Override — record an override decision (ChangeSet + ADR + provenance). An override is
 *               a RECORDED decision (CLAUDE.md §8), never a silent bypass.
 *
 * No truth (kernel/mirrors/fitness) is ever written from the screen. Themed on ADR 0010
 * tokens; strings via next-intl (ADR 0011).
 */

const proposeInitial: ProposeResult = { ran: false };
const overrideInitial: OverrideResult = { ran: false, ok: false };

function Submit({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("authorityBinding");
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

export function AuthorityBindingPanel() {
	const t = useTranslations("authorityBinding");
	const [proposeRes, propose] = useActionState(proposeAction, proposeInitial);
	const [overrideRes, override] = useActionState(
		overrideAction,
		overrideInitial,
	);

	const dec = proposeRes.decision;
	const decisionLabel = dec
		? dec.decision === "admitted"
			? t("decisionAdmitted")
			: dec.decision === "escalated"
				? t("decisionEscalated")
				: t("decisionBlocked")
		: "";

	return (
		<section className="space-y-8">
			{/* Propose flow */}
			<div className="rounded-xl border border-border bg-card p-6">
				<h2 className="text-lg font-semibold text-foreground">
					{t("proposeHeading")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("proposeHint")}</p>
				<form
					action={propose}
					className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
				>
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">
							{t("actorIdentityLabel")}
						</span>
						<input
							name="actorIdentity"
							data-testid="ab-actor-identity"
							defaultValue="user-alice"
							placeholder={t("actorIdentityPlaceholder")}
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">
							{t("actorDisplayLabel")}
						</span>
						<input
							name="actorDisplay"
							data-testid="ab-actor-display"
							defaultValue="Alice"
							placeholder={t("actorDisplayPlaceholder")}
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">
							{t("memberRoleLabel")}
						</span>
						<select
							name="memberRole"
							data-testid="ab-member-role"
							defaultValue="owner"
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<option value="owner">{t("memberRole.owner")}</option>
							<option value="editor">{t("memberRole.editor")}</option>
							<option value="viewer">{t("memberRole.viewer")}</option>
							<option value="none">{t("memberRole.none")}</option>
						</select>
					</label>
					<label className="flex flex-col gap-1 text-sm sm:col-span-2">
						<span className="text-muted-foreground">{t("intentLabel")}</span>
						<input
							name="intent"
							data-testid="ab-intent"
							defaultValue="je veux une remise checkout"
							placeholder={t("intentPlaceholder")}
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							name="vetoHolder"
							data-testid="ab-veto-holder"
							className="size-4 rounded border-input"
						/>
						<span className="text-muted-foreground">security (veto)</span>
					</label>
					<div className="flex items-end">
						<Submit label={t("proposeSubmit")} testid="ab-propose-submit" />
					</div>
				</form>
			</div>

			{/* Verdict */}
			{dec ? (
				<div
					className="rounded-xl border border-border bg-card p-6"
					data-testid="ab-verdict"
					data-decision={dec.decision}
					data-code={dec.blockReason?.code ?? ""}
				>
					<div className="flex items-center gap-3">
						<h2 className="text-lg font-semibold text-foreground">
							{t("verdictHeading")}
						</h2>
						<span
							className={
								dec.decision === "admitted"
									? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
									: "inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive"
							}
						>
							{decisionLabel}
						</span>
						{dec.blockReason ? (
							<code
								data-testid="ab-block-code"
								className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
							>
								{dec.blockReason.code}
							</code>
						) : null}
					</div>
					<p className="mt-3 text-sm text-muted-foreground">
						{t("grantedRoles")}:{" "}
						<span
							data-testid="ab-granted"
							className="font-medium text-foreground"
						>
							{dec.grantedRoles.length > 0
								? dec.grantedRoles.join(", ")
								: t("noRoles")}
						</span>
					</p>
					{dec.blockReason ? (
						<div className="mt-3 space-y-2">
							<p className="text-sm text-destructive">
								{dec.blockReason.explanation}
							</p>
							<div>
								<p className="text-xs font-semibold text-muted-foreground uppercase">
									{t("howToFix")}
								</p>
								<ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
									{dec.blockReason.howToFix.map((h) => (
										<li key={h}>{h}</li>
									))}
								</ul>
							</div>
						</div>
					) : null}
					{proposeRes.provenance ? (
						<div className="mt-4 border-t border-border pt-3">
							<p className="text-xs font-semibold text-muted-foreground uppercase">
								{t("provenanceHeading")}
							</p>
							<code
								data-testid="ab-provenance"
								className="mt-1 block font-mono text-xs text-foreground"
							>
								{proposeRes.provenance}
							</code>
						</div>
					) : null}
				</div>
			) : null}

			{/* Override flow */}
			<div className="rounded-xl border border-border bg-card p-6">
				<h2 className="text-lg font-semibold text-foreground">
					{t("overrideHeading")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("overrideHint")}
				</p>
				<form
					action={override}
					className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
				>
					<input type="hidden" name="actorIdentity" value="user-owner" />
					<input type="hidden" name="actorDisplay" value="Olga (owner)" />
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">{t("changesetLabel")}</span>
						<input
							name="changesetRef"
							data-testid="ab-changeset-ref"
							defaultValue="cs-123"
							placeholder={t("changesetPlaceholder")}
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">{t("adrLabel")}</span>
						<input
							name="adrRef"
							data-testid="ab-adr-ref"
							defaultValue="ADR 0042"
							placeholder={t("adrPlaceholder")}
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="flex flex-col gap-1 text-sm">
						<span className="text-muted-foreground">{t("reasonLabel")}</span>
						<input
							name="reason"
							data-testid="ab-reason"
							defaultValue="exception réglementaire validée"
							placeholder={t("reasonPlaceholder")}
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<div className="flex items-end">
						<Submit label={t("overrideSubmit")} testid="ab-override-submit" />
					</div>
				</form>
				{overrideRes.ran ? (
					<p
						data-testid="ab-override-result"
						data-ok={overrideRes.ok ? "true" : "false"}
						data-code={overrideRes.code ?? ""}
						className={
							overrideRes.ok
								? "mt-4 text-sm font-medium text-primary"
								: "mt-4 text-sm font-medium text-destructive"
						}
					>
						{overrideRes.ok
							? t("overrideRecorded", {
									id: (overrideRes.id ?? "").slice(0, 16),
								})
							: (overrideRes.explanation ?? "")}
					</p>
				) : null}
			</div>
		</section>
	);
}
