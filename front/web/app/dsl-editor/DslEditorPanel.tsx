"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { DslKind } from "@/lib/dsl-editor";
import { dslKindsList } from "@/lib/dsl-editor-data";
import type { Source } from "@/lib/gateway-sdk";
import { type ProposeView, proposeAction } from "./actions";

/**
 * DslEditorPanel makes the /dsl-editor route action-capable (ui-completeness law, CLAUDE.md §7): the
 * S77 typed editor has ONE control bound to the REAL engine, reachable AND executable from the screen —
 * PROPOSE: pick a DSL kind (operation/policy/control/action), fill the TYPED body (no free code) and
 * produce a `proposed` (DRAFT) ChangeSet carrying the canonical AST.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/dsl-editor (parse + propose),
 * never an LLM. THE WALL (§2): the screen WRITES NOTHING — propose returns a DRAFT changeset; the
 * `aidos` CLI applies it only after human approval; a reject leaves the kernel intact. Themed on the
 * ADR 0010 tokens; strings via next-intl (0011).
 */

const initial: ProposeView = { ok: false };

// PRESETS — a typed starter body per DSL kind (a FORM, never free code). The user edits them.
const PRESETS: Record<
	DslKind,
	{ name: string; body: string; extra?: Record<string, string> }
> = {
	operation: {
		name: "createOrder",
		body: JSON.stringify(
			{
				input: "CreateOrderInput",
				steps: [
					{ kind: "validate", schema: "CreateOrderInput" },
					{ kind: "authorize", policy: "canPlaceOrder" },
					{ kind: "mutate", entity: "Order", op: "create", as: "$.order" },
					{ kind: "return", ref: "$.order" },
				],
				emits: ["OrderCreated"],
			},
			null,
			2,
		),
	},
	policy: {
		name: "canPlaceOrder",
		body: JSON.stringify(
			{
				kind: "policy",
				scope: "OPERATION",
				target: "createOrder",
				effect: "ALLOW",
				rule: { kind: "exists", sel: "$.auth" },
			},
			null,
			2,
		),
	},
	control: {
		name: "checkout-button",
		body: JSON.stringify(
			{
				kind: "control",
				view: "cart",
				label: "cart.checkout",
				visible_when: { kind: "lit", value: true },
				enabled_when: { kind: "lit", value: true },
				triggers: "checkout-submit",
			},
			null,
			2,
		),
		extra: { knownActions: "checkout-submit" },
	},
	action: {
		name: "checkout-submit",
		body: JSON.stringify(
			{
				kind: "action",
				on: { kind: "click", control: "checkout-button" },
				invoke: "createOrder",
				with: { cart: { kind: "ref", path: "$.cart" } },
				on_success: [],
				on_error: [],
			},
			null,
			2,
		),
		extra: { knownControls: "checkout-button", knownOperations: "createOrder" },
	},
};

/**
 * SourceBadge tags whether the proposal came from the live Go engine (via the passerelle) or the
 * deterministic demo fallback (ADR 0092 flip). `live` = the dispatched dsl_propose read resolved;
 * `demo` = the gateway was unreachable / the payload was rejected (the twin behind source:"demo").
 */
function SourceBadge({ source, testId }: { source: Source; testId: string }) {
	const t = useTranslations("dslEditor");
	const live = source === "live";
	return (
		<span
			data-testid={testId}
			data-source={source}
			title={live ? t("sourceLiveTitle") : t("sourceDemoTitle")}
			className={
				live
					? "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
					: "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
			}
		>
			<span
				aria-hidden="true"
				className={
					live
						? "size-1.5 rounded-full bg-primary"
						: "size-1.5 rounded-full bg-muted-foreground"
				}
			/>
			{live ? t("sourceLive") : t("sourceDemo")}
		</span>
	);
}

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("dslEditor");
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

export function DslEditorPanel() {
	const t = useTranslations("dslEditor");
	const [state, doPropose] = useActionState(proposeAction, initial);
	const [kind, setKind] = useState<DslKind>("policy");
	const [name, setName] = useState(PRESETS.policy.name);
	const [body, setBody] = useState(PRESETS.policy.body);
	const [extra, setExtra] = useState<Record<string, string>>({});

	const dslKinds = dslKindsList();
	const proposed = state.ok && state.proposal?.ok === true;
	const refused =
		state.ok && (state.error !== undefined || state.parseError !== undefined);
	const proposal = state.proposal;
	const source: Source | undefined = state.source;

	function onKind(k: DslKind) {
		setKind(k);
		setName(PRESETS[k].name);
		setBody(PRESETS[k].body);
		setExtra(PRESETS[k].extra ?? {});
	}

	return (
		<div className="space-y-10">
			<form
				action={doPropose}
				className="space-y-5 rounded-xl border border-border bg-card p-6"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("proposeHeading")}
				</h2>

				<div className="grid gap-4 sm:grid-cols-2">
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("kindLabel")}
						</span>
						<select
							name="kind"
							data-testid="kind-select"
							value={kind}
							onChange={(ev) => onKind(ev.target.value as DslKind)}
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						>
							{dslKinds.map((k) => (
								<option key={k} value={k}>
									{k}
								</option>
							))}
						</select>
					</label>
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("nameLabel")}
						</span>
						<input
							name="name"
							data-testid="name-input"
							value={name}
							onChange={(ev) => setName(ev.target.value)}
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
				</div>

				<label className="space-y-1 text-sm">
					<span className="font-medium text-foreground">{t("bodyLabel")}</span>
					<textarea
						name="body"
						data-testid="body-textarea"
						rows={12}
						value={body}
						onChange={(ev) => setBody(ev.target.value)}
						className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs text-foreground"
					/>
				</label>

				{/* The known-refs the control/action validate against (an orphan trigger/bind is a monster). */}
				<input
					type="hidden"
					name="knownActions"
					value={extra.knownActions ?? ""}
				/>
				<input
					type="hidden"
					name="knownControls"
					value={extra.knownControls ?? ""}
				/>
				<input
					type="hidden"
					name="knownOperations"
					value={extra.knownOperations ?? ""}
				/>
				<input type="hidden" name="parentPhase" value="phase-0" />

				<p className="text-xs text-muted-foreground">{t("noFreeCodeNote")}</p>
				<Submit label={t("proposeButton")} testId="propose-button" />
			</form>

			{proposed && proposal ? (
				<div
					data-testid="proposal-result"
					className="space-y-5 rounded-xl border border-border bg-muted/40 p-6"
				>
					<div className="flex flex-wrap items-center gap-2">
						<span
							data-testid="changeset-status"
							className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
						>
							{t("draftBadge")}: {proposal.changesetStatus ?? "DRAFT"}
						</span>
						<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{proposal.kind}: {proposal.name}
						</span>
						{source ? (
							<SourceBadge source={source} testId="propose-source" />
						) : null}
					</div>
					<p className="text-xs text-muted-foreground">{t("wallNote")}</p>
					<dl className="grid gap-2 text-xs sm:grid-cols-1">
						<div>
							<dt className="font-semibold text-foreground">
								{t("targetLabel")}
							</dt>
							<dd
								data-testid="changeset-target"
								className="break-all font-mono text-muted-foreground"
							>
								{proposal.changesetRef}
							</dd>
						</div>
						<div>
							<dt className="font-semibold text-foreground">
								{t("wroteKernelLabel")}
							</dt>
							<dd
								data-testid="wrote-kernel"
								className="font-mono text-muted-foreground"
							>
								{String(proposal.wroteKernel)}
							</dd>
						</div>
					</dl>
				</div>
			) : null}

			{refused ? (
				<div
					data-testid="proposal-error"
					className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive"
				>
					{state.parseError ?? state.error}
				</div>
			) : null}
		</div>
	);
}
