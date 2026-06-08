"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	checkCallAction,
	proposeAction,
	verifyAllAction,
	verifyPairAction,
} from "./actions";
import {
	CHECK_CALL_INITIAL,
	type CheckCallView,
	PROPOSE_INITIAL,
	type ProposeView,
	VERIFY_ALL_INITIAL,
	VERIFY_PAIR_INITIAL,
	type VerifyAllView,
	type VerifyPairView,
} from "./view";

/**
 * ContextMapPanel makes the /context-map route action-capable (ui-completeness, CLAUDE.md §7):
 * the S101 Context-Map plane has controls bound to the REAL pure twin (lib/context-map),
 * reachable AND executable from the screen.
 *
 * Action-capable surfaces (the done-criteria + §46):
 *  1. VERIFY PAIR — pact-verify one consumer/provider pair: HONORED iff the provider publishes a
 *     superset of the consumer's expectation (done-criterion 1).
 *  2. VERIFY ALL — verify every designed pair in the Context-Map.
 *  3. CHECK CALL — a cross-cell call that VIOLATES the contract (unhonored/absent pair) is
 *     REFUSED CROSS_CELL_NO_CONTRACT (done-criterion 2); the refusal names the fix path.
 *  4. PROPOSE — persist the Context-Map THE ONLY LEGAL WAY: a DRAFT ChangeSet (propose →
 *     ChangeSet → approval). The screen NEVER writes truth directly (the wall).
 *
 * DETERMINISM-FIRST (§6/§8): the twin is PURE, never an LLM. THE WALL (§2/§9): /context-map
 * designs + verifies + proposes. Themed (ADR 0010), bilingual (ADR 0011).
 */

function Submit({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("contextMap");
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

function CellSelect({
	name,
	testid,
	value,
	label,
}: {
	name: string;
	testid: string;
	value: string;
	label: string;
}) {
	return (
		<div className="space-y-1 text-sm">
			<label htmlFor={testid} className="block text-muted-foreground">
				{label}
			</label>
			<select
				id={testid}
				name={name}
				data-testid={testid}
				defaultValue={value}
				className="block rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<option value="checkout">checkout</option>
				<option value="billing">billing</option>
				<option value="catalog">catalog</option>
			</select>
		</div>
	);
}

function VerdictRow({
	verdict,
}: {
	verdict: {
		consumer: string;
		provider: string;
		honored: boolean;
		reason: string;
		detail?: string;
	};
}) {
	const t = useTranslations("contextMap");
	return (
		<li
			data-testid={`verdict-${verdict.consumer}-${verdict.provider}`}
			data-honored={String(verdict.honored)}
			className="flex flex-wrap items-center gap-3 text-sm"
		>
			<span className="font-mono text-foreground">
				{verdict.consumer} → {verdict.provider}
			</span>
			<span
				className={`rounded-md px-2 py-0.5 text-xs ${
					verdict.honored
						? "bg-primary/10 text-primary"
						: "bg-destructive/10 text-destructive"
				}`}
			>
				{verdict.honored ? t("honored") : t("unhonored")} · {verdict.reason}
			</span>
			{verdict.detail ? (
				<span className="text-xs text-muted-foreground">{verdict.detail}</span>
			) : null}
		</li>
	);
}

export function ContextMapPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("contextMap");
	const project = activeProjectId ?? "shop";

	const [pairState, pairFormAction] = useActionState<VerifyPairView, FormData>(
		verifyPairAction,
		VERIFY_PAIR_INITIAL,
	);
	const [allState, allFormAction] = useActionState<VerifyAllView, FormData>(
		verifyAllAction,
		VERIFY_ALL_INITIAL,
	);
	const [callState, callFormAction] = useActionState<CheckCallView, FormData>(
		checkCallAction,
		CHECK_CALL_INITIAL,
	);
	const [proposeState, proposeFormAction] = useActionState<
		ProposeView,
		FormData
	>(proposeAction, PROPOSE_INITIAL);

	return (
		<div className="space-y-10">
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span>{t("activeProjectLabel")}:</span>
				<span
					data-testid="active-project"
					className="rounded-md bg-muted px-2 py-0.5 font-mono text-foreground"
				>
					{activeProjectId ?? t("noProject")}
				</span>
			</div>

			<section
				data-testid="scenario"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("scenarioHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("scenarioBody")}
				</p>
			</section>

			{/* 1 · Verify one consumer/provider pair (done-criterion 1) */}
			<form
				action={pairFormAction}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("verifyPairHeading")}
				</h2>
				<input type="hidden" name="projectId" value={project} />
				<CellSelect
					name="provider"
					testid="pair-provider"
					value="billing"
					label={t("providerLabel")}
				/>
				<Submit label={t("verifyPairLabel")} testid="verify-pair-submit" />

				{pairState.ok && pairState.verdict ? (
					<div
						data-testid="pair-verdict"
						data-honored={String(pairState.verdict.honored)}
					>
						<ul className="space-y-1 pt-1">
							<VerdictRow verdict={pairState.verdict} />
						</ul>
					</div>
				) : null}
			</form>

			{/* 2 · Verify all designed pairs */}
			<form
				action={allFormAction}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("verifyAllHeading")}
				</h2>
				<input type="hidden" name="projectId" value={project} />
				<Submit label={t("verifyAllLabel")} testid="verify-all-submit" />

				{allState.ok && allState.verdicts ? (
					<ul data-testid="all-verdicts" className="space-y-1 pt-1">
						{allState.verdicts.map((v) => (
							<VerdictRow key={`${v.consumer}-${v.provider}`} verdict={v} />
						))}
					</ul>
				) : null}
			</form>

			{/* 3 · Check a cross-cell call (done-criterion 2) */}
			<form
				action={callFormAction}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("checkCallHeading")}
				</h2>
				<input type="hidden" name="projectId" value={project} />
				<div className="flex flex-wrap gap-4">
					<CellSelect
						name="from"
						testid="call-from"
						value="checkout"
						label={t("fromLabel")}
					/>
					<CellSelect
						name="to"
						testid="call-to"
						value="catalog"
						label={t("toLabel")}
					/>
				</div>
				<Submit label={t("checkCallLabel")} testid="check-call-submit" />

				{callState.ok ? (
					callState.allowed ? (
						<p data-testid="call-allowed" className="text-sm text-primary">
							{t("callAllowed")}
						</p>
					) : (
						<section
							data-testid="call-refused"
							data-code={callState.block?.code}
							className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
						>
							<h3 className="text-sm font-semibold text-destructive">
								{t("callRefused")} · {callState.block?.code}
							</h3>
							<p className="text-sm leading-relaxed text-muted-foreground">
								{callState.block?.message}
							</p>
							<div className="pt-1">
								<h4 className="text-xs font-semibold text-muted-foreground uppercase">
									{t("howToFixLabel")}
								</h4>
								<ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
									{(callState.block?.howToFix ?? []).map((h) => (
										<li key={h}>{h}</li>
									))}
								</ul>
							</div>
						</section>
					)
				) : null}
			</form>

			{/* 4 · Propose the Context-Map as a DRAFT ChangeSet (the wall) */}
			<form
				action={proposeFormAction}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("proposeHeading")}
				</h2>
				<input type="hidden" name="projectId" value={project} />
				<Submit label={t("proposeLabel")} testid="propose-submit" />

				{proposeState.ok && proposeState.changeset ? (
					<section
						data-testid="proposed-changeset"
						data-status={proposeState.changeset.status}
						className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-5"
					>
						<h3 className="text-sm font-semibold text-primary">
							{t("proposedHeading")} · {proposeState.changeset.status}
						</h3>
						<p className="text-sm text-muted-foreground">
							{proposeState.changeset.label}
						</p>
						<p
							data-testid="proposed-target"
							className="break-all font-mono text-xs text-muted-foreground"
						>
							{proposeState.changeset.specTarget}
						</p>
						<p className="text-xs text-muted-foreground">{t("wallNote")}</p>
					</section>
				) : null}
			</form>
		</div>
	);
}
