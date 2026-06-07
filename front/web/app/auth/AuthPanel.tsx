"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { AUTH_PROVIDERS } from "@/lib/authn";
import {
	type AttemptView,
	attemptUnauthenticatedAction,
	type SignInView,
	signInAction,
} from "./actions";

const TRUTH_WRITE_TOOLS = ["kernel_write", "mirror_write", "fitness_write"];

/**
 * AuthPanel — the action-capable client surface of /auth (S61). It does three things:
 *   1. LOGIN: pick a provider + email, sign in → resolves a verified principal whose
 *      identity propagates to BOTH walls (gateway scope + RLS GUC). A blank subject yields
 *      UNAUTHENTICATED (no anonymous door);
 *   2. SESSION: shows the resolved identity, email and provider (the accounts.users model);
 *   3. UNAUTHENTICATED PROOF: EXECUTES an unauthenticated call to a truth-write endpoint
 *      through the same gate the live server applies — refused with the REAL UNAUTHENTICATED
 *      BlockReason, reaching no data (the property done-criterion), shown as an inline toast.
 * Writes NO truth — auth lives outside the Kernel (CLAUDE.md §2). Themed (ADR 0010) +
 * bilingual (ADR 0011).
 */
export function AuthPanel() {
	const t = useTranslations("auth");
	const [subject, setSubject] = useState("user-alice");
	const [email, setEmail] = useState("alice@example.com");
	const [provider, setProvider] = useState(AUTH_PROVIDERS[0].id);
	const [session, setSession] = useState<SignInView | null>(null);
	const [signingIn, setSigningIn] = useState(false);

	const [project, setProject] = useState("proj-a");
	const [tool, setTool] = useState(TRUTH_WRITE_TOOLS[0]);
	const [attempt, setAttempt] = useState<AttemptView | null>(null);
	const [attempting, setAttempting] = useState(false);

	async function onSignIn() {
		setSigningIn(true);
		try {
			setSession(await signInAction(subject, email, provider));
		} finally {
			setSigningIn(false);
		}
	}

	async function onSignOut() {
		setSession(null);
	}

	async function onAttempt() {
		setAttempting(true);
		try {
			setAttempt(await attemptUnauthenticatedAction(project, tool));
		} finally {
			setAttempting(false);
		}
	}

	return (
		<div className="space-y-10">
			{/* 1+2. Login + session. */}
			<section
				aria-labelledby="session-heading"
				className="rounded-lg border border-border bg-card p-6"
			>
				<h2
					id="session-heading"
					className="text-lg font-semibold tracking-tight text-foreground"
				>
					{t("sessionHeading")}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					{t("sessionIntro")}
				</p>

				<div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
					<Field
						id="subject"
						label={t("fieldSubject")}
						value={subject}
						onChange={setSubject}
					/>
					<Field
						id="email"
						label={t("fieldEmail")}
						value={email}
						onChange={setEmail}
					/>
					<div>
						<label
							htmlFor="provider"
							className="text-xs uppercase tracking-wide text-muted-foreground"
						>
							{t("fieldProvider")}
						</label>
						<select
							id="provider"
							data-testid="field-provider"
							value={provider}
							onChange={(e) => setProvider(e.target.value)}
							className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
						>
							{AUTH_PROVIDERS.map((p) => (
								<option key={p.id} value={p.id}>
									{p.label}
								</option>
							))}
						</select>
					</div>
				</div>

				<div className="mt-4 flex gap-3">
					<button
						type="button"
						data-testid="signin-button"
						onClick={onSignIn}
						disabled={signingIn}
						className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
					>
						{signingIn ? t("signingIn") : t("signInButton")}
					</button>
					{session?.authenticated && (
						<button
							type="button"
							data-testid="signout-button"
							onClick={onSignOut}
							className="inline-flex items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
						>
							{t("signOutButton")}
						</button>
					)}
				</div>

				{session?.authenticated && session.principal && (
					<div
						data-testid="session-card"
						className="mt-4 rounded-md border border-primary/30 bg-primary/10 p-4 text-sm"
					>
						<p className="font-semibold text-foreground">
							{t("sessionOpenTitle")}
						</p>
						<dl className="mt-2 grid grid-cols-1 gap-1 text-xs sm:grid-cols-3">
							<Row
								label={t("labelIdentity")}
								value={session.principal.identity}
								testid="session-identity"
							/>
							<Row label={t("labelEmail")} value={session.principal.email} />
							<Row
								label={t("labelProvider")}
								value={session.principal.provider}
							/>
						</dl>
						<p className="mt-3 text-xs text-muted-foreground">
							{t("propagationNote")}
						</p>
					</div>
				)}

				{session && !session.authenticated && session.blockReason && (
					<div
						data-testid="signin-block"
						role="alert"
						className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
					>
						<p
							className="font-mono text-xs font-semibold"
							data-testid="signin-block-code"
						>
							{session.blockReason.code}
						</p>
						<p className="mt-2 text-foreground">
							{session.blockReason.explanation}
						</p>
					</div>
				)}
			</section>

			{/* 3. UNAUTHENTICATED proof. */}
			<section aria-labelledby="attempt-heading" className="space-y-4">
				<div>
					<h2
						id="attempt-heading"
						className="text-lg font-semibold tracking-tight text-foreground"
					>
						{t("attemptHeading")}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("attemptIntro")}
					</p>
				</div>

				<div className="rounded-lg border border-border bg-card p-6">
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<Field
							id="attempt-project"
							label={t("fieldProject")}
							value={project}
							onChange={setProject}
						/>
						<div>
							<label
								htmlFor="attempt-tool"
								className="text-xs uppercase tracking-wide text-muted-foreground"
							>
								{t("fieldTool")}
							</label>
							<select
								id="attempt-tool"
								data-testid="field-tool"
								value={tool}
								onChange={(e) => setTool(e.target.value)}
								className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
							>
								{TRUTH_WRITE_TOOLS.map((tw) => (
									<option key={tw} value={tw}>
										{tw}
									</option>
								))}
							</select>
						</div>
					</div>

					<div className="mt-4">
						<button
							type="button"
							data-testid="attempt-button"
							onClick={onAttempt}
							disabled={attempting}
							className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
						>
							{attempting ? t("attempting") : t("attemptButton")}
						</button>
					</div>

					{attempt &&
						(attempt.reason ? (
							<div
								data-testid="attempt-toast"
								role="alert"
								className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
							>
								<p className="font-semibold">{t("toastTitle")}</p>
								<p
									className="mt-1 font-mono text-xs font-semibold"
									data-testid="attempt-code"
								>
									{attempt.reason.code}
								</p>
								<p className="mt-1 text-xs text-muted-foreground">
									{t("severityLabel")}: {attempt.reason.severity}
								</p>
								<p className="mt-2 text-foreground">
									{attempt.reason.explanation}
								</p>
								<p className="mt-3 text-xs font-semibold text-foreground">
									{t("howToFixLabel")}
								</p>
								<ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
									{attempt.reason.howToFix.map((h) => (
										<li key={h}>{h}</li>
									))}
								</ul>
							</div>
						) : (
							<div
								data-testid="attempt-routed"
								className="mt-4 rounded-md bg-primary/10 p-4 text-sm text-foreground"
							>
								{t("routedUnexpected")}
							</div>
						))}
				</div>
			</section>
		</div>
	);
}

function Field({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div>
			<label
				htmlFor={id}
				className="text-xs uppercase tracking-wide text-muted-foreground"
			>
				{label}
			</label>
			<input
				id={id}
				data-testid={`field-${id}`}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
			/>
		</div>
	);
}

function Row({
	label,
	value,
	testid,
}: {
	label: string;
	value: string;
	testid?: string;
}) {
	return (
		<div className="flex flex-col">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="break-all font-mono text-foreground" data-testid={testid}>
				{value}
			</dd>
		</div>
	);
}
