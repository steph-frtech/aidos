"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
	type AttachView,
	attachAction,
	type CheckView,
	checkAccessAction,
} from "./actions";

/**
 * AppAuthPanel makes the /app-auth route action-capable (ui-completeness law, CLAUDE.md §7): the S80
 * `app-auth` behavior-macro has its controls bound to the REAL deterministic engine, reachable AND
 * executable from the screen — CHECK ACCESS (the EMITTED app's runtime authz gate, refusing an
 * insufficient role) and ATTACH (preview the auth subsystem + land via the legal changeset door).
 *
 * DETERMINISM-FIRST (§6/§8): both controls run the PURE twin lib/app-auth (the byte-twin of the Go
 * ExpandAppAuth/CheckAccess), never an LLM. THE WALL (§2): the screen WRITES NOTHING — check-access is
 * a read-only runtime simulation; attach lands a changeset VALUE, the legal door (propose → approve).
 * Themed on the ADR 0010 tokens; strings via next-intl (0011).
 */

const initialCheck: CheckView = { ok: false };
const initialAttach: AttachView = { ok: false };

function Submit({ label, testId }: { label: string; testId: string }) {
	const t = useTranslations("appAuth");
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

export function AppAuthPanel() {
	const t = useTranslations("appAuth");
	const [checkState, doCheck] = useActionState(checkAccessAction, initialCheck);
	const [attachState, doAttach] = useActionState(attachAction, initialAttach);

	const decision = checkState.ok ? checkState.decision : undefined;
	const checkError = checkState.ok ? checkState.error : undefined;

	return (
		<div className="space-y-10">
			{/* CHECK ACCESS — the emitted app's runtime authz gate */}
			<form
				action={doCheck}
				className="space-y-4 rounded-xl border border-border bg-card p-6"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("checkHeading")}
				</h2>
				<p className="text-xs text-muted-foreground">{t("checkIntro")}</p>
				<div className="flex flex-wrap items-end gap-3">
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("roleLabel")}
						</span>
						<select
							name="role"
							data-testid="role-select"
							defaultValue="viewer"
							className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						>
							<option value="viewer">viewer</option>
							<option value="editor">editor</option>
							<option value="admin">admin</option>
						</select>
					</label>
					<label className="space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("operationLabel")}
						</span>
						<select
							name="operation"
							data-testid="operation-select"
							defaultValue="logout"
							className="w-44 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						>
							<option value="login">login</option>
							<option value="logout">logout</option>
							<option value="manageRoles">manageRoles</option>
						</select>
					</label>
					<Submit label={t("checkButton")} testId="check-submit" />
				</div>

				{checkError ? (
					<p data-testid="check-error" className="text-sm text-destructive">
						{checkError}
					</p>
				) : null}

				{decision ? (
					<div
						data-testid="check-result"
						data-allowed={decision.allowed ? "true" : "false"}
						className={`rounded-lg border p-4 text-sm ${
							decision.allowed
								? "border-border bg-muted text-foreground"
								: "border-destructive/40 bg-destructive/5 text-foreground"
						}`}
					>
						<p className="font-semibold">
							{decision.allowed ? t("allowed") : t("denied")}
						</p>
						<p className="mt-1 font-mono text-xs text-muted-foreground">
							{`role=${decision.role} required=${decision.required} → ${
								decision.allowed ? "ALLOW" : "DENY"
							}`}
						</p>
					</div>
				) : null}
			</form>

			{/* ATTACH — preview the auth subsystem + land via the legal changeset door */}
			<form
				action={doAttach}
				className="space-y-4 rounded-xl border border-border bg-card p-6"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("attachHeading")}
				</h2>
				<p className="text-xs text-muted-foreground">{t("attachIntro")}</p>
				<div className="flex flex-wrap items-end gap-3">
					<label className="flex-1 space-y-1 text-sm">
						<span className="font-medium text-foreground">
							{t("targetLabel")}
						</span>
						<input
							name="target"
							data-testid="target-input"
							defaultValue="shop-app"
							placeholder="shop-app"
							className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
						/>
					</label>
					<Submit label={t("attachButton")} testId="attach-submit" />
				</div>

				{attachState.ok && attachState.error ? (
					<p data-testid="attach-error" className="text-sm text-destructive">
						{attachState.error}
					</p>
				) : null}

				{attachState.ok && attachState.landed && attachState.subsystem ? (
					<div
						data-testid="attach-result"
						className="space-y-4 rounded-lg border border-border bg-muted p-4"
					>
						<p className="text-sm font-semibold text-foreground">
							{t("landedHeading")}
						</p>
						<p className="font-mono text-xs text-muted-foreground">
							{`app-auth@${attachState.target} · expansion=${attachState.subsystem.expansionId.slice(
								0,
								12,
							)}… · APPLIED`}
						</p>
						<PieceList
							heading={t("piecesHeading")}
							names={attachState.pieces ?? []}
						/>
						<div className="space-y-1">
							<p className="text-xs font-semibold tracking-tight text-foreground">
								{t("policiesHeading")}
							</p>
							<ul className="space-y-0.5">
								{(attachState.policies ?? []).map((p) => (
									<li
										key={p.name}
										className="font-mono text-xs text-muted-foreground"
									>
										{`${p.name}: ${p.operation} ${p.effect}<${p.min_role}`}
									</li>
								))}
							</ul>
						</div>
					</div>
				) : null}
			</form>
		</div>
	);
}
