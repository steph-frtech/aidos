"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import type { OutboxEntry } from "@/lib/async-operation";
import {
	type AuditedAction,
	buildLedger,
	type Identity,
	type LedgerEntry,
	root as ledgerRoot,
	tamperEntryHash,
	verify as verifyLedger,
} from "@/lib/connector-audit";
import {
	type ConnectorAction,
	enforceConnectorAction,
} from "@/lib/connector-enforce";
import {
	DEMO_INBOUND_WEBHOOK,
	DEMO_REGISTERED_TOOLS,
	DEMO_UNREGISTERED_TOOL,
	DEMO_WEBHOOK_ASYNC,
	DEMO_WEBHOOK_OP,
	hashFragment,
	INFRA_ROLE_NOTE,
	newToolRegistry,
	realizeInboundWebhook,
	routeTool,
	type ServiceFragment,
	substrateConnectorInfraFragments,
} from "@/lib/connector-infra";
import {
	type Classification,
	type ConnectorSource,
	contentId,
	isDatastoreHost,
	validate,
} from "@/lib/connector-source";

/**
 * AUDIT_IDENTITY — the actor every demonstration action is attributed to in the audit trail
 * (WHO reached the connector). A below-the-line fixture; the BOM records it verbatim, never an
 * inference.
 */
const AUDIT_IDENTITY: Identity = { subject: "agent-builder" };

/**
 * auditActionsFor builds the demonstration set of ENFORCED connector actions for a given source —
 * the audited inputs the per-connector timeline folds into a Merkle ledger. It covers the action
 * shapes that APPLY to the source's scope/plane so the timeline shows a mix of admitted + refused
 * effects (each a verifiable entry):
 *
 *  - a read on the source's first declared egress host (RO read / a legal read);
 *  - for a read_write source: an approved write (admitted, A2) AND an un-approved write (refused
 *    CONNECTOR_RW_NEEDS_APPROVAL) — the two A2 doors;
 *  - for a read_only source: a write attempt (refused CONNECTOR_READ_ONLY — no write door);
 *  - for an "ai" source: an attempt to reach a datastore host (refused AI_DIRECT_DB_ACCESS_FORBIDDEN).
 *
 * Each action carries the source's contentId as its @version so the BOM is load-bearing. PURE,
 * TOTAL — the verdict is RE-COMPUTED inside auditConnectorAction by the DP21 enforcer (the audit
 * never re-implements the wall). A below-the-line fixture; it writes NOTHING.
 */
function auditActionsFor(source: ConnectorSource): AuditedAction[] {
	// pin the @version (DP20 content-id) onto the source the audit records.
	const versioned: ConnectorSource = {
		...source,
		version: source.version ?? contentId(source),
	};
	const host = versioned.egressHosts[0] ?? "";
	const actions: AuditedAction[] = [];

	// 1) a read within the declared scope (RO read / legal read).
	actions.push({
		source: versioned,
		identity: AUDIT_IDENTITY,
		action: { op: "read", host },
	});

	if (versioned.scope === "read_write") {
		// 2) an APPROVED write (A2 runtime authorisation) — admitted.
		actions.push({
			source: versioned,
			identity: AUDIT_IDENTITY,
			action: {
				op: "write",
				host,
				approval: {
					connector: versioned.name,
					op: "write",
					granted: true,
					by: "humain",
				},
			},
		});
		// 3) an UN-approved write — refused CONNECTOR_RW_NEEDS_APPROVAL.
		actions.push({
			source: versioned,
			identity: AUDIT_IDENTITY,
			action: { op: "write", host },
		});
	} else {
		// 2') a read_only source attempting a write — refused CONNECTOR_READ_ONLY.
		actions.push({
			source: versioned,
			identity: AUDIT_IDENTITY,
			action: { op: "write", host },
		});
	}

	if (versioned.classification === "ai") {
		// an ai plane attempting a DATASTORE host — refused AI_DIRECT_DB_ACCESS_FORBIDDEN.
		actions.push({
			source: versioned,
			identity: AUDIT_IDENTITY,
			action: { op: "read", host: "postgres://truth-store/direct" },
		});
	}

	return actions;
}

/**
 * ConnectorAuditTimeline is the DP22 per-connector AUDIT surface (below the line): it folds the
 * connector's enforced actions into a tamper-evident GV03 Merkle ledger (the pure twin
 * lib/connector-audit) and renders, per entry, WHO / WHAT / scope / target / egress / result,
 * chained by HASH. A global integrity readout shows verify().ok ; a « vérifier l'intégrité »
 * button re-runs verify ; a « démo : altérer une entrée passée » button alters a past entry IN A
 * LOCAL COPY (never the source ledger) so verify goes red with its TamperKind ; a « réinitialiser »
 * button restores the intact ledger.
 *
 * DETERMINISM-FIRST (§6/§8): the ledger, every entry hash, the tip root and the verify verdict are
 * COMPUTED by the pure twin (verdict-for-verdict with the Go connectoraudit), never a UI opinion.
 * THE WALL (§2): the ledger is below-the-line AUDIT telemetry — it writes NO truth; the tamper
 * demonstration mutates a local React-state copy, never a truth-store. Themed on ADR 0010 tokens;
 * strings via next-intl (ADR 0011, FR first).
 */
function ConnectorAuditTimeline({ source }: { source: ConnectorSource }) {
	const t = useTranslations("connectors");

	// the intact ledger of this connector's enforced actions — COMPUTED once from the fixtures.
	const intactLedger = useMemo(
		() => buildLedger(auditActionsFor(source)),
		[source],
	);

	// the rendered ledger: the intact chain, or a locally-tampered COPY for the demonstration.
	const [tampered, setTampered] = useState(false);
	const ledger: LedgerEntry[] = tampered
		? tamperEntryHash(intactLedger, intactLedger.length > 1 ? 1 : 0)
		: intactLedger;

	// the integrity verdict — COMPUTED by the pure twin (the chain decides, never an LLM).
	const result = verifyLedger(ledger);
	const tip = ledgerRoot(ledger);

	if (intactLedger.length === 0) {
		return (
			<p data-testid="audit-empty" className="text-xs text-muted-foreground">
				{t("auditEmpty")}
			</p>
		);
	}

	return (
		<div className="mt-4 space-y-3">
			{/* the global integrity readout + the controls */}
			<div
				data-testid="ledger-verify"
				data-connector={source.name}
				data-ok={result.ok ? "true" : "false"}
				className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${
					result.ok
						? "border-primary/40 bg-primary/10"
						: "border-destructive/40 bg-destructive/10"
				}`}
			>
				<span
					className={`inline-flex items-center gap-2 text-xs font-medium ${
						result.ok ? "text-primary" : "text-destructive"
					}`}
				>
					<span aria-hidden>{result.ok ? "✓" : "✗"}</span>
					{result.ok ? t("auditVerifyOk") : t("auditVerifyTampered")}
				</span>

				{!result.ok && (
					<span className="inline-flex items-center gap-1.5 text-[0.7rem] text-destructive">
						<span className="text-destructive/80">
							{t("auditTamperKindLabel")}:
						</span>
						<code
							data-testid="tamper-kind"
							data-tamper={result.tamper}
							className="rounded bg-destructive/15 px-1.5 py-0.5 font-mono font-bold text-destructive"
						>
							{result.tamper}
						</code>
						<span className="text-destructive/80">
							{t("auditTamperAt")} {result.atIndex}
						</span>
					</span>
				)}

				<div className="ml-auto flex flex-wrap gap-2">
					{/* « vérifier l'intégrité » — re-runs verify (idempotent; the readout already shows it) */}
					<button
						type="button"
						data-testid="audit-verify-button"
						data-connector={source.name}
						onClick={() => setTampered(false)}
						className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
					>
						{t("auditVerifyButton")}
					</button>
					{/* « démo : altérer une entrée passée » — local copy only, never the source ledger */}
					<button
						type="button"
						data-testid="audit-tamper-button"
						data-connector={source.name}
						disabled={tampered}
						onClick={() => setTampered(true)}
						className="inline-flex items-center rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{t("auditTamperButton")}
					</button>
					{tampered && (
						<button
							type="button"
							data-testid="audit-reset-button"
							data-connector={source.name}
							onClick={() => setTampered(false)}
							className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
						>
							{t("auditResetButton")}
						</button>
					)}
				</div>
			</div>

			{/* the tip root — the content-address of the WHOLE ordered ledger */}
			<div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-muted-foreground">
				<span className="font-medium">{t("auditTipRoot")}:</span>
				<code
					data-testid="ledger-tip-root"
					data-connector={source.name}
					className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-foreground"
				>
					{tip}
				</code>
			</div>

			{/* the per-entry timeline — qui / quoi / scope / cible / egress / résultat, chained by hash */}
			<ol
				data-testid="audit-timeline"
				data-connector={source.name}
				className="space-y-2"
			>
				{ledger.map((e) => (
					<li
						key={`${e.index}-${e.entry_hash}`}
						data-testid="audit-entry"
						data-connector={e.bom.connector}
						data-scope={e.bom.scope}
						data-result={e.bom.permitted ? "permitted" : "refused"}
						data-op={e.bom.op}
						className="rounded-lg border border-border bg-background p-3 text-xs"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted font-mono text-[0.65rem] text-muted-foreground">
								{e.index}
							</span>
							<span className="text-muted-foreground">
								{t("auditColIdentity")}:
							</span>
							<span className="font-mono font-medium text-foreground">
								{e.bom.identity}
							</span>
							<span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-foreground">
								{e.bom.op}
							</span>
							<span
								className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-medium uppercase ${
									e.bom.scope === "read_write"
										? "border-primary/40 text-primary"
										: "border-border text-muted-foreground"
								}`}
							>
								{e.bom.scope === "read_write"
									? t("auditScopeRW")
									: t("auditScopeRO")}
							</span>
							<span className="text-muted-foreground">→ {e.bom.target}</span>
							{e.bom.permitted ? (
								<span
									data-testid="audit-result-permitted"
									className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-primary-foreground"
								>
									{t("auditPermitted")}
								</span>
							) : (
								<span
									data-testid="audit-result-refused"
									data-code={e.bom.block_reason_code}
									className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-destructive-foreground"
								>
									{t("auditRefused")}
									<code className="font-mono normal-case">
										{e.bom.block_reason_code}
									</code>
								</span>
							)}
						</div>
						<dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[0.7rem] sm:grid-cols-2">
							<div className="flex gap-2">
								<dt className="text-muted-foreground">{t("auditColHost")}:</dt>
								<dd className="break-all font-mono text-foreground">
									{e.bom.host || "—"}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="text-muted-foreground">
									{t("auditEntryHash")}:
								</dt>
								<dd className="break-all font-mono text-muted-foreground">
									{e.entry_hash}
								</dd>
							</div>
							<div className="flex gap-2 sm:col-span-2">
								<dt className="text-muted-foreground">{t("auditRoot")}:</dt>
								<dd className="break-all font-mono text-muted-foreground">
									{e.root}
								</dd>
							</div>
						</dl>
					</li>
				))}
			</ol>
		</div>
	);
}

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
 * ToolRegistryDemo is the DP23 Tool-Registry routing surface (below the line): the registry of
 * the EMITTED app's EXPOSED MCP tools (a closed set) and a live MCP-Gateway routing readout. A
 * registered tool ROUTES ; an unregistered tool is REFUSED with TOOL_NOT_REGISTERED (set-membership
 * fail-closed, the routing is DETERMINISTIC — zero LLM). A « enregistrer un outil » button adds the
 * unregistered tool to the registry (a below-the-line runtime state copy) so it then routes.
 *
 * DETERMINISM-FIRST (§6/§8): every routing verdict is COMPUTED by the pure twin (lib/connector-infra
 * routeTool), verdict-for-verdict with the Go connectorinfra.RouteTool — never a UI opinion. THE
 * WALL (§2): the registry is the EMITTED app's substrate (its OWN MCP tools, DISTINCT from AIDOS's,
 * ADR 0040) — it writes NO AIDOS truth; the « enregistrer » demo mutates a local React-state copy.
 */
function ToolRegistryDemo({ projectId }: { projectId: string }) {
	const t = useTranslations("connectors");
	// the below-the-line runtime set of registered tool names (the EMITTED app's exposure).
	const [extraTools, setExtraTools] = useState<string[]>([]);
	const registeredNames = useMemo(
		() => [...DEMO_REGISTERED_TOOLS, ...extraTools],
		[extraTools],
	);
	const registry = useMemo(
		() => newToolRegistry(projectId, registeredNames),
		[projectId, registeredNames],
	);

	// the demonstration rows: the seeded registered tools + the unregistered probe tool.
	const rows = useMemo(() => {
		const names = [...DEMO_REGISTERED_TOOLS, DEMO_UNREGISTERED_TOOL];
		return names.map((name) => ({ name, ...routeTool(registry, name) }));
	}, [registry]);

	const unregisteredRouted = registry.tools.has(DEMO_UNREGISTERED_TOOL);

	return (
		<section
			data-testid="tool-registry"
			className="space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div>
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{t("toolRegistryHeading")}
				</h3>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
					{t("toolRegistryBody")}
				</p>
			</div>

			<ul className="space-y-2">
				{rows.map((row) => (
					<li
						key={row.name}
						data-testid="tool-row"
						data-tool={row.name}
						data-registered={row.decision.admitted ? "true" : "false"}
						className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-3 text-xs"
					>
						<code className="font-mono font-medium text-foreground">
							{row.name}
						</code>
						{row.decision.admitted ? (
							<span
								data-testid="tool-routed"
								className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-primary-foreground"
							>
								<span aria-hidden>→</span>
								{t("toolRouted")}
							</span>
						) : (
							<span
								data-testid="tool-blockreason"
								data-code={row.decision.code}
								className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-destructive px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-destructive-foreground"
							>
								{t("toolRefused")}
								<code className="font-mono normal-case">
									{row.decision.code}
								</code>
							</span>
						)}
					</li>
				))}
			</ul>

			{/* the actionable demo: register the unregistered tool ⇒ it then routes */}
			<div className="flex flex-wrap items-center gap-3">
				<button
					type="button"
					data-testid="register-tool"
					data-tool={DEMO_UNREGISTERED_TOOL}
					disabled={unregisteredRouted}
					onClick={() => setExtraTools((s) => [...s, DEMO_UNREGISTERED_TOOL])}
					className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{t("registerToolButton", { tool: DEMO_UNREGISTERED_TOOL })}
				</button>
				{unregisteredRouted && (
					<span className="text-xs text-primary">
						{t("registerToolDone", { tool: DEMO_UNREGISTERED_TOOL })}
					</span>
				)}
				{unregisteredRouted && (
					<button
						type="button"
						data-testid="reset-tool-registry"
						onClick={() => setExtraTools([])}
						className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
					>
						{t("resetToolRegistry")}
					</button>
				)}
			</div>
		</section>
	);
}

/**
 * WebhookGatewayDemo is the DP23 Webhook-Gateway surface (below the line): an INBOUND webhook
 * (received at the Webhook-Gateway) is realised into an ASYNC operation (S73/DP16, reused verbatim
 * — the worker EMITTED for the app is a TS worker, ADR 0040/S74). A « recevoir le webhook » button
 * realises the inbound webhook ⇒ the target async op's effect is DISPATCHED through the S73 outbox;
 * the processed readout shows the delivered effect. A replay delivers the effect ONCE (exactly-once
 * relative).
 *
 * DETERMINISM-FIRST (§6/§8): the realisation REUSES the pure S73 twin (lib/async-operation dispatch
 * + effectId), verdict-for-verdict with connectorinfra.RealizeInboundWebhook. THE WALL (§2): the
 * webhook is a runtime command on the EMITTED app's substrate — it writes NO AIDOS truth; the outbox
 * is a local React-state seam.
 */
function WebhookGatewayDemo() {
	const t = useTranslations("connectors");
	// the below-the-line outbox seam + the already-dispatched id set (a runtime state copy).
	const [received, setReceived] = useState(false);
	// the dispatch events of the LAST realisation — COMPUTED by the pure twin.
	const [events, setEvents] = useState<
		{ operation: string; kind: string; target: string }[]
	>([]);
	const [replayed, setReplayed] = useState(false);
	// the persistent outbox + dispatched set (kept across the two realisations of the demo).
	const outboxRef = useMemo(
		() => ({ entries: [] as OutboxEntry[], dispatched: new Set<string>() }),
		[],
	);

	function receive() {
		const { events: ev } = realizeInboundWebhook(
			DEMO_INBOUND_WEBHOOK,
			DEMO_WEBHOOK_OP,
			DEMO_WEBHOOK_ASYNC,
			outboxRef.entries,
			outboxRef.dispatched,
		);
		setEvents(
			ev.map((e) => ({
				operation: e.operation,
				kind: e.kind,
				target: e.target,
			})),
		);
		setReceived(true);
	}

	function replay() {
		const { events: ev } = realizeInboundWebhook(
			DEMO_INBOUND_WEBHOOK,
			DEMO_WEBHOOK_OP,
			DEMO_WEBHOOK_ASYNC,
			outboxRef.entries,
			outboxRef.dispatched,
		);
		// the redelivery is suppressed ⇒ no new event (exactly-once relative).
		setReplayed(ev.length === 0);
	}

	function reset() {
		outboxRef.entries.length = 0;
		outboxRef.dispatched.clear();
		setReceived(false);
		setEvents([]);
		setReplayed(false);
	}

	return (
		<section
			data-testid="webhook-gateway-demo"
			className="space-y-4 rounded-xl border border-border bg-card p-5"
		>
			<div>
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{t("webhookHeading")}
				</h3>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
					{t("webhookBody")}
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<button
					type="button"
					data-testid="receive-webhook"
					data-source={DEMO_INBOUND_WEBHOOK.source}
					data-operation={DEMO_WEBHOOK_OP}
					disabled={received}
					onClick={receive}
					className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{t("receiveWebhookButton", {
						source: DEMO_INBOUND_WEBHOOK.source,
					})}
				</button>
				{received && (
					<>
						<button
							type="button"
							data-testid="replay-webhook"
							onClick={replay}
							className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
						>
							{t("replayWebhookButton")}
						</button>
						<button
							type="button"
							data-testid="reset-webhook"
							onClick={reset}
							className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
						>
							{t("resetWebhook")}
						</button>
					</>
				)}
			</div>

			{received && (
				<div
					data-testid="webhook-processed"
					data-operation={DEMO_WEBHOOK_OP}
					data-events={events.length}
					className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-xs"
				>
					<p className="font-medium text-primary">
						<span aria-hidden>✓</span> {t("webhookProcessed")}
					</p>
					<dl className="mt-2 space-y-1 text-[0.7rem] text-muted-foreground">
						{events.map((e) => (
							<div
								key={`${e.operation}-${e.target}`}
								data-testid="webhook-effect"
								data-kind={e.kind}
								className="flex flex-wrap gap-2"
							>
								<dt className="text-muted-foreground">
									{t("webhookEffectOp")}:
								</dt>
								<dd className="font-mono text-foreground">{e.operation}</dd>
								<dt className="ml-2 text-muted-foreground">
									{t("webhookEffectKind")}:
								</dt>
								<dd className="font-mono text-foreground">{e.kind}</dd>
								<dt className="ml-2 text-muted-foreground">→</dt>
								<dd className="font-mono text-foreground">{e.target}</dd>
							</div>
						))}
					</dl>
				</div>
			)}

			{replayed && (
				<p
					data-testid="webhook-replay-once"
					className="text-xs text-muted-foreground"
				>
					{t("webhookReplayOnce")}
				</p>
			)}
		</section>
	);
}

/**
 * ConnectorInfraSection is the DP23 « Infra des connecteurs (app émise) » surface (below the
 * line): the FOUR services-substrat profile connectors EMITTED for the app — MCP-Gateway,
 * Connector-Registry, Tool-Registry, Webhook-Gateway — each with its image/port/volume; the
 * Connector-Registry lists the DECLARED connectors (DP20); the Tool-Registry routing demo; and
 * the Webhook-Gateway inbound demo.
 *
 * DETERMINISM-FIRST (§6/§8): the four fragments are RENDERED by the pure twin
 * (substrateConnectorInfraFragments), byte-identical re-emission, verdict-for-verdict with the Go
 * connectorinfra. THE WALL (§2): infra ÉMISE below the line ; the MCP of the emitted app are
 * DISTINCT from AIDOS's (ADR 0040) ; no GRANT de vérité — writesTruth is false on every fragment.
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011, FR first).
 */
function ConnectorInfraSection({
	projectId,
	connectors,
}: {
	projectId: string;
	connectors: ConnectorSource[];
}) {
	const t = useTranslations("connectors");
	// the four connector-infra fragments — RENDERED by the pure twin (byte-stable, project-isolated).
	const fragments: ServiceFragment[] = useMemo(
		() => substrateConnectorInfraFragments(projectId),
		[projectId],
	);

	return (
		<section
			data-testid="connector-infra"
			className="space-y-6 rounded-xl border border-border bg-card p-5"
		>
			<div>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("infraHeading")}
				</h2>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
					{t("infraBody")}
				</p>
			</div>

			{/* the four services-substrat profile connectors (MCP-Gateway / Connector-Registry / … ) */}
			<ul data-testid="infra-services" className="grid gap-3 sm:grid-cols-2">
				{fragments.map((f) => (
					<li
						key={f.key}
						data-testid="infra-service"
						data-key={f.key}
						data-profile={f.service.profile}
						data-port={f.service.internalPort}
						className="rounded-lg border border-border bg-background p-4 text-xs"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span className="font-mono text-sm font-medium text-foreground">
								{f.key}
							</span>
							<span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium uppercase text-primary">
								{f.service.profile}
							</span>
							<span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground">
								:{f.service.internalPort}
							</span>
						</div>
						<p className="mt-1.5 leading-relaxed text-muted-foreground">
							{INFRA_ROLE_NOTE[f.key]}
						</p>
						<dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[0.7rem]">
							<div className="flex gap-2">
								<dt className="text-muted-foreground">{t("infraColImage")}:</dt>
								<dd className="font-mono text-foreground">
									{f.service.image === "" ? t("infraEmitted") : f.service.image}
								</dd>
							</div>
							<div className="flex gap-2">
								<dt className="text-muted-foreground">
									{t("infraColVolume")}:
								</dt>
								<dd
									data-testid="infra-volume"
									className="break-all font-mono text-foreground"
								>
									{f.volumes[0]?.name ?? "—"}
								</dd>
							</div>
							{f.service.dependsOn.length > 0 && (
								<div className="flex gap-2">
									<dt className="text-muted-foreground">
										{t("infraColDependsOn")}:
									</dt>
									<dd className="font-mono text-foreground">
										{f.service.dependsOn.join(", ")}
									</dd>
								</div>
							)}
							<div className="flex gap-2 sm:col-span-1">
								<dt className="text-muted-foreground">
									{t("infraColContentId")}:
								</dt>
								<dd className="break-all font-mono text-[0.65rem] text-muted-foreground">
									{hashFragment(f)}
								</dd>
							</div>
						</dl>
					</li>
				))}
			</ul>

			{/* the Connector-Registry — the list of DECLARED connectors (DP20) */}
			<div
				data-testid="connector-registry"
				className="rounded-lg border border-border bg-background p-4"
			>
				<h3 className="text-sm font-semibold tracking-tight text-foreground">
					{t("connectorRegistryHeading")}
				</h3>
				<p className="mt-1 text-xs text-muted-foreground">
					{t("connectorRegistryBody")}
				</p>
				<ul className="mt-3 flex flex-wrap gap-2">
					{connectors.map((c) => (
						<li
							key={c.name}
							data-testid="registry-connector"
							data-connector={c.name}
							className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[0.7rem]"
						>
							<code className="font-mono text-foreground">{c.name}</code>
							<span className="text-muted-foreground">
								{t(`class.${c.classification}`)}
							</span>
						</li>
					))}
				</ul>
			</div>

			{/* the Tool-Registry routing demo (MCP-Gateway set-membership) */}
			<ToolRegistryDemo projectId={projectId} />

			{/* the Webhook-Gateway inbound demo (⇒ async op, S73/DP16) */}
			<WebhookGatewayDemo />
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

								{/* DP22 — the per-connector tamper-evident audit timeline + Verify status */}
								<div className="mt-4 border-t border-border pt-3">
									<h3 className="text-xs font-semibold tracking-tight text-foreground">
										{t("auditTimelineHeading")}
									</h3>
									<ConnectorAuditTimeline source={c} />
								</div>
							</li>
						);
					})}
				</ul>
			</section>

			{/* the DP21 RUNTIME enforcement — RW approval inbox (A2) + RO write refusal */}
			<RWEnforcementInbox rwConnectors={rwConnectors} />

			{/* the DP23 « Infra des connecteurs (app émise) » — the four services-substrat
			    profile connectors + the Tool-Registry routing + the Webhook-Gateway inbound demo */}
			<ConnectorInfraSection
				projectId={activeProjectId ?? "demo-project"}
				connectors={connectors}
			/>

			{/* the DP22 audit explainer — what the per-connector tamper-evident ledger proves */}
			<section
				data-testid="audit-explainer"
				className="space-y-2 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("auditHeading")}
				</h2>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("auditBody")}
				</p>
			</section>

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
