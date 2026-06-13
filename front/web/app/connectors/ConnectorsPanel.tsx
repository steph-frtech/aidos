"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	type ConnectorAction,
	enforceConnectorAction,
} from "@/lib/connector-enforce";
import {
	type Classification,
	type ConnectorSource,
	contentId,
	isDatastoreHost,
	validate,
} from "@/lib/connector-source";

/**
 * RWReadOnlyDemo shows the scope axis the other way round: a read_only connector attempting a
 * WRITE has NO write door at all — the enforcer refuses it CONNECTOR_READ_ONLY before any
 * approval is even consulted (a read_only scope never widens below the line). COMPUTED by the
 * same pure twin; no UI opinion.
 */
function RWReadOnlyDemo() {
	const t = useTranslations("connectors");
	// a read_only source to demonstrate the scope refusal against — the canonical Postgres-RO.
	const roSource: ConnectorSource = {
		layer: "above",
		kind: "connector",
		name: "postgres-ro-truth",
		classification: "internal",
		scope: "read_only",
		egressHosts: ["db.internal.read"],
		target: "postgres_ro",
		dataTruthScope: ["existing_records"],
		authority: null,
		truthScope: { region: "fr", environment: "prod" },
	};
	const decision = enforceConnectorAction(roSource, {
		op: "write",
		host: "db.internal.read",
	});

	return (
		<div
			data-testid="ro-write-demo"
			data-connector={roSource.name}
			data-code={decision.code ?? ""}
			className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-mono text-sm font-medium text-foreground">
					{roSource.name}
				</span>
				<span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-medium uppercase text-muted-foreground">
					{t("scopeRO")}
				</span>
				<code
					data-testid="ro-write-blockreason"
					data-code={decision.code ?? ""}
					className="ml-auto inline-flex items-center rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1 font-mono text-[0.7rem] font-bold text-destructive"
				>
					{decision.code}
				</code>
			</div>
			<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
				{t("roWriteNote")}
			</p>
		</div>
	);
}

/**
 * RWEnforcementInbox is the DP21 interactive enforcement surface (below the line): per
 * read_write connector, a HUMAN-IN-THE-LOOP approval inbox (A2) + a live enforcement readout.
 *
 * The state held here is the set of granted runtime approvals — the disposable, below-the-line
 * authorisations the A2 amendment requires (qui / quand / quel-effet), NEVER authority.Decide.
 * Approving a request feeds a granted ConnectorRuntimeApproval into the PURE twin
 * `enforceConnectorAction`; the verdict shown (permitted / blocked) is COMPUTED by the twin,
 * verdict-for-verdict with the Go runtime/connectorenforce — never an opinion hardcoded in the
 * UI (DETERMINISM-FIRST §6/§8). THE WALL (§2): nothing here writes truth — the declaration of
 * a read_write source is graved above the line (idée → miroir → /goal → approbation, S85/S110);
 * the EXECUTION of a write is a runtime authorisation, below the line.
 */
function RWEnforcementInbox({
	rwConnectors,
}: {
	rwConnectors: ConnectorSource[];
}) {
	const t = useTranslations("connectors");
	// the set of connectors whose RW write is currently approved (below-the-line runtime state).
	const [approved, setApproved] = useState<Record<string, boolean>>({});

	if (rwConnectors.length === 0) {
		return null;
	}

	return (
		<section
			data-testid="rw-approval-inbox"
			className="space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("inboxHeading")}
				</h2>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
					{t("inboxBody")}
				</p>
			</div>

			<ul className="space-y-4">
				{rwConnectors.map((c) => {
					const isApproved = approved[c.name] === true;
					// the runtime write attempt enforced against the declared source by the twin.
					const writeAttempt: ConnectorAction = {
						op: "write",
						// the source's first declared egress host — guaranteed on the allow-list.
						host: c.egressHosts[0] ?? "",
						approval: isApproved
							? { connector: c.name, op: "write", granted: true, by: "humain" }
							: null,
					};
					const decision = enforceConnectorAction(c, writeAttempt);

					return (
						<li
							key={c.name}
							data-testid="rw-approval"
							data-connector={c.name}
							data-approved={isApproved ? "true" : "false"}
							className="rounded-lg border border-border bg-background p-4"
						>
							<div className="flex flex-wrap items-center gap-2">
								<span className="font-mono text-sm font-medium text-foreground">
									{c.name}
								</span>
								<span className="inline-flex items-center rounded-full border border-primary/40 px-2 py-0.5 text-[0.65rem] font-medium uppercase text-primary">
									{t("scopeRW")}
								</span>
								<span className="text-xs text-muted-foreground">
									{t("inboxRequestNote")}
								</span>
							</div>

							{/* the live enforcement readout — COMPUTED by the pure twin */}
							<div className="mt-3 text-xs">
								{decision.admitted ? (
									<p
										data-testid="rw-permitted"
										data-connector={c.name}
										className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 font-medium text-primary"
									>
										<span aria-hidden>✓</span>
										{t("rwPermitted")}
									</p>
								) : (
									<p
										data-testid="rw-blockreason"
										data-connector={c.name}
										data-code={decision.code ?? ""}
										className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 font-medium text-destructive"
									>
										<code className="font-mono text-[0.7rem]">
											{decision.code}
										</code>
										<span className="text-destructive/90">
											{t("rwBlocked")}
										</span>
									</p>
								)}
							</div>

							{/* the human-in-the-loop approval controls (A2) */}
							<div className="mt-3 flex flex-wrap gap-2">
								<button
									type="button"
									data-testid="rw-approve"
									data-connector={c.name}
									disabled={isApproved}
									onClick={() => setApproved((s) => ({ ...s, [c.name]: true }))}
									className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
								>
									{t("rwApprove")}
								</button>
								<button
									type="button"
									data-testid="rw-refuse"
									data-connector={c.name}
									disabled={!isApproved}
									onClick={() =>
										setApproved((s) => ({ ...s, [c.name]: false }))
									}
									className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
								>
									{t("rwRefuse")}
								</button>
							</div>
						</li>
					);
				})}
			</ul>

			{/* the read_only counter-demonstration — a RO source has no write door at all */}
			<RWReadOnlyDemo />
		</section>
	);
}

/**
 * ConnectorsPanel renders the DP20 list of DECLARED connector SOURCES (read-only with
 * respect to truth): the active project, a closed-set legend, the per-connector list (each
 * row carrying its kind, classification badge, scope RO/RW, egress allow-list, bind target,
 * content-address and its COMPUTED validation verdict), the DP21 RUNTIME enforcement surface
 * (the RW approval inbox A2 + the RO write refusal), and the load-bearing invariant card that
 * shows — with a counter-fixture — that an "ai" connector carries NO datastore egress
 * (AI-never-direct-to-DB). Every verdict shown is COMPUTED here by the pure `validate` /
 * `enforceConnectorAction` twins, never an opinion hardcoded in the UI.
 *
 * THE WALL (§2): the screen displays a below-the-line SEED/fixture and runs a below-the-line
 * RUNTIME enforcement — it writes NOTHING (no kernel/mirrors/fitness), and the RW approval is a
 * runtime authorisation (qui/quand/quel-effet), never authority.Decide. A real connector is
 * graved through idée → miroir → /goal → approbation. Themed on ADR 0010 tokens; strings via
 * next-intl (ADR 0011, FR first).
 */
export function ConnectorsPanel({
	activeProjectId,
	connectors,
	aiForbiddenFixture,
}: {
	activeProjectId: string | null;
	connectors: ConnectorSource[];
	aiForbiddenFixture: ConnectorSource;
}) {
	const t = useTranslations("connectors");
	// the read_write connectors — the ones whose execution is gated by an A2 runtime approval.
	const rwConnectors = connectors.filter((c) => c.scope === "read_write");

	const classBadgeClass = (c: Classification): string => {
		switch (c) {
			case "ai":
				return "border-primary/40 bg-primary/10 text-primary";
			case "internal":
				return "border-border bg-muted text-foreground";
			case "external":
				return "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400";
			default:
				return "border-border bg-muted text-muted-foreground";
		}
	};

	const forbiddenVerdict = validate(aiForbiddenFixture);

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

			{/* the closed-set legend — the front reads the single sources from the twin */}
			<section
				data-testid="connectors-legend"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("legendHeading")}
				</h2>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
					{t("legendBody")}
				</p>
			</section>

			{/* the LIST of declared connector sources */}
			<section className="rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("listHeading")}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">{t("listNote")}</p>
				<ul data-testid="connectors-list" className="mt-4 space-y-4">
					{connectors.map((c) => {
						const verdict = validate(c);
						const hasDatastoreEgress = c.egressHosts.some(isDatastoreHost);
						return (
							<li
								key={c.name}
								data-testid="connector-row"
								data-kind={c.kind}
								data-classification={c.classification}
								data-scope={c.scope}
								data-target={c.target}
								data-valid={verdict.ok ? "true" : "false"}
								className="rounded-lg border border-border bg-background p-4"
							>
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-mono text-sm font-medium text-foreground">
										{c.name}
									</span>
									<span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground">
										{c.kind}
									</span>
									<span
										data-testid="connector-classification-badge"
										className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-medium uppercase ${classBadgeClass(
											c.classification,
										)}`}
									>
										{t(`class.${c.classification}`)}
									</span>
									<span
										data-testid="connector-scope-badge"
										className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-medium uppercase ${
											c.scope === "read_write"
												? "border-primary/40 text-primary"
												: "border-border text-muted-foreground"
										}`}
									>
										{c.scope === "read_write" ? t("scopeRW") : t("scopeRO")}
									</span>
									<span
										data-testid="connector-verdict"
										data-ok={verdict.ok ? "true" : "false"}
										className={`ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ${
											verdict.ok
												? "bg-primary text-primary-foreground"
												: "bg-destructive text-destructive-foreground"
										}`}
									>
										{verdict.ok ? t("valid") : (verdict.code ?? t("invalid"))}
									</span>
								</div>

								<dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
									<div className="flex gap-2">
										<dt className="text-muted-foreground">{t("colTarget")}:</dt>
										<dd
											data-testid="connector-target"
											className="font-mono text-foreground"
										>
											{c.target}
										</dd>
									</div>
									<div className="flex gap-2">
										<dt className="text-muted-foreground">
											{t("colAuthority")}:
										</dt>
										<dd className="font-mono text-foreground">
											{c.authority
												? c.authority.approvers.join(", ")
												: t("noAuthority")}
										</dd>
									</div>
									<div className="flex gap-2 sm:col-span-2">
										<dt className="text-muted-foreground">{t("colEgress")}:</dt>
										<dd
											data-testid="connector-egress"
											data-has-datastore={hasDatastoreEgress ? "true" : "false"}
											className="flex flex-wrap gap-1.5"
										>
											{c.egressHosts.length === 0 ? (
												<span className="text-muted-foreground">
													{t("noEgress")}
												</span>
											) : (
												c.egressHosts.map((h) => (
													<code
														key={h}
														className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-foreground"
													>
														{h}
													</code>
												))
											)}
										</dd>
									</div>
									<div className="flex gap-2 sm:col-span-2">
										<dt className="text-muted-foreground">
											{t("colContentId")}:
										</dt>
										<dd className="break-all font-mono text-[0.7rem] text-muted-foreground">
											{contentId(c)}
										</dd>
									</div>
								</dl>
							</li>
						);
					})}
				</ul>
			</section>

			{/* the DP21 RUNTIME enforcement — RW approval inbox (A2) + RO write refusal */}
			<RWEnforcementInbox rwConnectors={rwConnectors} />

			{/* the load-bearing invariant — AI-never-direct-to-DB, made visible at the SOURCE */}
			<section
				data-testid="ai-no-datastore-invariant"
				className="space-y-3 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("invariantHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("invariantBody")}{" "}
					<code
						data-testid="ai-invariant-code"
						className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[0.7rem] text-destructive"
					>
						AI_DIRECT_DB_ACCESS_FORBIDDEN
					</code>
				</p>
				<div
					data-testid="ai-counter-fixture"
					data-refused={forbiddenVerdict.ok ? "false" : "true"}
					data-code={forbiddenVerdict.code ?? ""}
					className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-xs"
				>
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-mono font-medium text-foreground">
							{aiForbiddenFixture.name}
						</span>
						<span
							className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-medium uppercase ${classBadgeClass(
								aiForbiddenFixture.classification,
							)}`}
						>
							{t(`class.${aiForbiddenFixture.classification}`)}
						</span>
						<span className="inline-flex items-center rounded-full bg-destructive px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-destructive-foreground">
							{forbiddenVerdict.code}
						</span>
					</div>
					<p className="mt-2 leading-relaxed text-muted-foreground">
						{t("counterFixtureNote")}{" "}
						<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-foreground">
							{aiForbiddenFixture.egressHosts.join(", ")}
						</code>
					</p>
				</div>
			</section>

			{/* the honest note — a below-the-line seed, never a truth-store write */}
			<section
				data-testid="honest-note"
				className="rounded-xl border border-border bg-muted/40 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("honestHeading")}
				</h2>
				<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
					{t("honestBody")}
				</p>
			</section>
		</div>
	);
}
