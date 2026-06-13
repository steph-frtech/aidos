"use client";

import { useTranslations } from "next-intl";
import {
	type Classification,
	type ConnectorSource,
	contentId,
	isDatastoreHost,
	validate,
} from "@/lib/connector-source";

/**
 * ConnectorsPanel renders the DP20 list of DECLARED connector SOURCES (read-only with
 * respect to truth): the active project, a closed-set legend, the per-connector list (each
 * row carrying its kind, classification badge, scope RO/RW, egress allow-list, bind target,
 * content-address and its COMPUTED validation verdict), and the load-bearing invariant card
 * that shows — with a counter-fixture — that an "ai" connector carries NO datastore egress
 * (AI-never-direct-to-DB). Every verdict shown is COMPUTED here by the pure `validate`
 * twin, never an opinion hardcoded in the UI.
 *
 * THE WALL (§2): the screen displays a below-the-line SEED/fixture — it writes NOTHING (no
 * kernel/mirrors/fitness). A real connector is graved through idée → miroir → /goal →
 * approbation. Themed on ADR 0010 tokens; strings via next-intl (ADR 0011, FR first).
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
