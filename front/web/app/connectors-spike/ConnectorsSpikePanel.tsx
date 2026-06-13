"use client";

import { useTranslations } from "next-intl";
import type { Matrix } from "@/lib/connector-governance";

/**
 * ConnectorsSpikePanel renders the DP19 MEASURED connector-governance matrice
 * (read-only with respect to truth): the global go/no-go VERDICT, the note of the
 * three proven invariants (RW needs runtime approval, AI-never-direct-to-DB, every
 * action ledgered), the per-case MATRICE (each row carrying its case label, the
 * connector + scope/plane, the op, whether a runtime approval is required, the
 * expected vs measured admission, the disposable refusal code, and its Merkle
 * ledger entry), and the verifiable ledger summary (root + length + Verify().OK).
 * The source is the spike-graven matrice (lib/connector-governance MEASURED_MATRIX),
 * never an opinion hardcoded here.
 *
 * THE WALL (§2): the screen displays a measurement — it writes NOTHING (no
 * kernel/mirrors/fitness, ratchet OFF, /spike zone). Themed on ADR 0010 tokens;
 * strings via next-intl (ADR 0011, FR first).
 */
export function ConnectorsSpikePanel({
	activeProjectId,
	matrix,
}: {
	activeProjectId: string | null;
	matrix: Matrix;
}) {
	const t = useTranslations("connectorsSpike");
	const isGo = matrix.verdict === "go";
	const passCount = matrix.rows.filter((r) => r.pass).length;

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

			{/* the GLOBAL verdict — the deterministic conjunction computed at the spike */}
			<section
				data-testid="gov-verdict-card"
				data-verdict={matrix.verdict}
				className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("verdictHeading")}
				</h2>
				<span
					data-testid="gov-verdict"
					className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
						isGo
							? "bg-primary text-primary-foreground"
							: "bg-destructive text-destructive-foreground"
					}`}
				>
					{matrix.verdict}
				</span>
				<span className="text-xs text-muted-foreground">
					{t("verdictCounts", {
						pass: passCount,
						total: matrix.rows.length,
					})}
				</span>
			</section>

			{/* the three proven invariants — the load-bearing answer to the gate */}
			<section
				data-testid="gov-invariants"
				className="rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("invariantsHeading")}
				</h2>
				<ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
					<li data-testid="gov-invariant" data-invariant="rw-approval">
						<span className="font-medium text-foreground">
							{t("invariantApprovalTitle")}
						</span>{" "}
						— {t("invariantApprovalBody")}{" "}
						<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-foreground">
							CONNECTOR_WRITE_NOT_APPROVED
						</code>
					</li>
					<li data-testid="gov-invariant" data-invariant="ai-never-direct-db">
						<span className="font-medium text-foreground">
							{t("invariantAiDbTitle")}
						</span>{" "}
						— {t("invariantAiDbBody")}{" "}
						<code
							data-testid="gov-invariant-ai-db-code"
							className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[0.7rem] text-destructive"
						>
							AI_DIRECT_DB_ACCESS_FORBIDDEN
						</code>
					</li>
					<li
						data-testid="gov-invariant"
						data-invariant="every-action-ledgered"
					>
						<span className="font-medium text-foreground">
							{t("invariantLedgerTitle")}
						</span>{" "}
						— {t("invariantLedgerBody")}
					</li>
				</ul>
			</section>

			{/* the MATRICE — case × verdict, sourced from the spike-graven matrice */}
			<section className="rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("matrixHeading")}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">{t("matrixNote")}</p>
				<div className="mt-3 overflow-x-auto">
					<table
						data-testid="connectors-gov-matrix"
						className="w-full text-left text-xs"
					>
						<thead>
							<tr className="border-b border-border text-muted-foreground">
								<th className="py-1 pr-3 font-medium">{t("colCase")}</th>
								<th className="py-1 pr-3 font-medium">{t("colConnector")}</th>
								<th className="py-1 pr-3 font-medium">{t("colScope")}</th>
								<th className="py-1 pr-3 font-medium">{t("colOp")}</th>
								<th className="py-1 pr-3 font-medium">{t("colApproval")}</th>
								<th className="py-1 pr-3 font-medium">{t("colMeasured")}</th>
								<th className="py-1 pr-3 font-medium">{t("colCode")}</th>
								<th className="py-1 font-medium">{t("colLedger")}</th>
							</tr>
						</thead>
						<tbody>
							{matrix.rows.map((r) => {
								const admitted = r.measuredAdmitted;
								return (
									<tr
										key={r.case}
										data-testid="gov-row"
										data-case={r.case}
										data-connector={r.connector}
										data-scope={r.scope}
										data-op={r.op}
										data-verdict={admitted ? "admitted" : "refused"}
										data-code={r.measuredCode}
										data-pass={r.pass ? "true" : "false"}
										className="border-b border-border/50 align-top"
									>
										<td className="py-2 pr-3 leading-relaxed text-foreground">
											{r.case}
										</td>
										<td className="py-2 pr-3">
											<span className="font-mono text-foreground">
												{r.connector}
											</span>
											<span className="ml-1.5 inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground">
												{r.plane}
											</span>
										</td>
										<td className="py-2 pr-3">
											<span
												className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-medium uppercase ${
													r.scope === "rw"
														? "border-primary/40 text-primary"
														: "border-border text-muted-foreground"
												}`}
											>
												{r.scope}
											</span>
										</td>
										<td className="py-2 pr-3 font-mono text-muted-foreground">
											{r.op}
										</td>
										<td className="py-2 pr-3 text-muted-foreground">
											{r.approvalRequired ? t("approvalYes") : t("approvalNo")}
										</td>
										<td className="py-2 pr-3">
											<span
												className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide ${
													admitted
														? "bg-primary text-primary-foreground"
														: "bg-destructive text-destructive-foreground"
												}`}
											>
												{admitted ? t("admitted") : t("refused")}
											</span>
										</td>
										<td className="py-2 pr-3">
											{r.measuredCode ? (
												<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-foreground">
													{r.measuredCode}
												</code>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</td>
										<td className="py-2">
											<span
												className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
													r.ledgerEntry
														? "bg-muted text-foreground"
														: "bg-destructive text-destructive-foreground"
												}`}
											>
												{r.ledgerEntry ? t("ledgerYes") : t("ledgerNo")}
											</span>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>

			{/* the verifiable Merkle ledger summary — root + length + Verify().OK */}
			<section
				data-testid="gov-ledger"
				className="space-y-2 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("ledgerHeading")}
				</h2>
				<div className="flex flex-wrap items-center gap-3 text-xs">
					<span
						data-testid="gov-ledger-ok"
						data-ok={matrix.ledgerOK ? "true" : "false"}
						className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-bold uppercase tracking-wide ${
							matrix.ledgerOK
								? "bg-primary text-primary-foreground"
								: "bg-destructive text-destructive-foreground"
						}`}
					>
						{matrix.ledgerOK ? t("ledgerVerified") : t("ledgerTampered")}
					</span>
					<span className="text-muted-foreground">
						{t("ledgerLengthLabel", { length: matrix.ledgerLength })}
					</span>
				</div>
				<p className="break-all font-mono text-[0.7rem] text-muted-foreground">
					<span className="text-foreground">{t("ledgerRootLabel")}:</span>{" "}
					<span data-testid="gov-ledger-root">{matrix.ledgerRoot}</span>
				</p>
			</section>

			{/* the honest note — a throwaway spike measurement, never a freeze */}
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
