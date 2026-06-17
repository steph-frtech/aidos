"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type AttachView,
	attachAction,
	type BrowseView,
	searchAction,
} from "./actions";

/**
 * BehaviorsPanel makes the /behaviors route action-capable (ui-completeness law, CLAUDE.md §7): the
 * S79 user-facing behavior LIBRARY has its controls bound to the REAL engine, reachable AND
 * executable from the screen — SEARCH (deterministic `rg`-like match, NEVER an LLM) and ATTACH
 * (preview the scoped policies+fixtures via the ONE S76 Propose, then LAND via an APPROVED ChangeSet).
 *
 * DETERMINISM-FIRST (§6/§8): the controls run the PURE twin lib/behaviors (which consumes the ONE
 * compound expander), never an LLM. THE WALL (§2): the screen WRITES NOTHING — search is read-only;
 * attach lands an APPLIED changeset VALUE, the legal door (propose → approve). Themed on the ADR 0010
 * tokens; strings via next-intl (0011).
 */

const initialBrowse: BrowseView = {
	ok: false,
	entries: [],
	query: "",
	source: "demo",
};
const initialAttach: AttachView = { ok: false };

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("behaviors");
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

function PieceList({ heading, names }: { heading: string; names: string[] }) {
	if (names.length === 0) return null;
	return (
		<div className="space-y-1">
			<p className="text-xs font-semibold tracking-tight text-foreground">
				{heading}
			</p>
			<ul className="space-y-0.5">
				{names.map((n) => (
					<li key={n} className="font-mono text-xs text-muted-foreground">
						{n}
					</li>
				))}
			</ul>
		</div>
	);
}

export function BehaviorsPanel() {
	const t = useTranslations("behaviors");
	const [browseState, doSearch] = useActionState(searchAction, initialBrowse);
	const [attachState, doAttach] = useActionState(attachAction, initialAttach);

	const landed = attachState.ok && attachState.landed;
	const attachRefused = attachState.ok && attachState.error !== undefined;
	const e = attachState.landed?.preview?.expansion;
	const applied = attachState.landed?.applied;

	return (
		<div className="space-y-10">
			{/* SEARCH / BROWSE */}
			<form
				action={doSearch}
				className="space-y-4 rounded-xl border border-border bg-card p-6"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("searchHeading")}
					</h2>
					{browseState.ok ? (
						<span
							data-testid="search-source"
							data-source={browseState.source}
							className={
								browseState.source === "live"
									? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
									: "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
							}
							title={
								browseState.source === "live"
									? t("sourceLiveTitle")
									: t("sourceDemoTitle")
							}
						>
							<span
								aria-hidden="true"
								className={
									browseState.source === "live"
										? "size-1.5 rounded-full bg-primary"
										: "size-1.5 rounded-full bg-muted-foreground"
								}
							/>
							{browseState.source === "live"
								? t("sourceLive")
								: t("sourceDemo")}
						</span>
					) : null}
				</div>
				<div className="flex flex-wrap items-end gap-3">
					<label className="flex-1 space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("queryLabel")}
						</span>
						<input
							name="query"
							data-testid="search-input"
							placeholder={t("queryPlaceholder")}
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<Submit label={t("searchButton")} testId="search-button" />
				</div>
				{browseState.ok ? (
					<ul data-testid="search-results" className="space-y-2">
						{browseState.entries.length === 0 ? (
							<li
								data-testid="search-empty"
								className="text-xs text-muted-foreground"
							>
								{t("noResults")}
							</li>
						) : (
							browseState.entries.map((en) => (
								<li
									key={en.recordId}
									data-testid="search-row"
									className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs"
								>
									<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
										{en.kind}
									</span>
									<span className="font-medium text-foreground">
										{en.labelFr}
									</span>
									<span className="text-muted-foreground">
										{t("ownerTag")}: {en.owner} · v{en.version}
									</span>
									{en.tags.map((tg) => (
										<span
											key={tg}
											className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-muted-foreground"
										>
											#{tg}
										</span>
									))}
								</li>
							))
						)}
					</ul>
				) : null}
			</form>

			{/* ATTACH (preview + land) */}
			<form
				action={doAttach}
				className="space-y-4 rounded-xl border border-border bg-card p-6"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("attachHeading")}
				</h2>
				<p className="text-xs text-muted-foreground">{t("attachIntro")}</p>
				<div className="flex flex-wrap items-end gap-3">
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("entityLabel")}
						</span>
						<input
							name="entity"
							data-testid="entity-input"
							defaultValue="Order"
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<input type="hidden" name="approvedAt" value="2026-06-08T12:00:00Z" />
					<Submit label={t("attachButton")} testId="attach-button" />
				</div>

				{landed && e && applied ? (
					<div
						data-testid="attach-result"
						className="space-y-5 rounded-xl border border-border bg-muted/40 p-6"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span
								data-testid="applied-status"
								className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
							>
								{t("appliedBadge")}: {applied.status}
							</span>
							<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
								{t("appliedAt")}: {applied.applied_at}
							</span>
						</div>
						<p className="text-xs text-muted-foreground">{t("wallNote")}</p>
						<div className="grid gap-4 sm:grid-cols-2">
							<PieceList
								heading={t("policies")}
								names={e.policies.map(
									(x) => `${x.name} (${x.scope}/${x.effect})`,
								)}
							/>
							<PieceList
								heading={t("fixtures")}
								names={e.fixtures.map((x) => x.name)}
							/>
						</div>
						<dl className="grid gap-2 text-xs sm:grid-cols-2">
							<div>
								<dt className="font-semibold text-foreground">{t("target")}</dt>
								<dd
									data-testid="applied-target"
									className="break-all font-mono text-muted-foreground"
								>
									{applied.spec_delta.target}
								</dd>
							</div>
							<div>
								<dt className="font-semibold text-foreground">
									{t("expansionId")}
								</dt>
								<dd className="break-all font-mono text-muted-foreground">
									{e.expansionId}
								</dd>
							</div>
						</dl>
					</div>
				) : null}

				{attachRefused ? (
					<div
						data-testid="attach-error"
						className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 text-sm text-destructive"
					>
						{attachState.error}
					</div>
				) : null}
			</form>
		</div>
	);
}
