"use client";

import { useTranslations } from "next-intl";
import type { PaletteCounts, SubstrateService } from "@/lib/substrate-palette";

/**
 * SubstrateSpikePanel renders the DP14 MEASURED palette (read-only with respect
 * to truth): the MATRICE of 12 substrate services × verdict (each row carries
 * name, verdict badge — green `go` / red `no-go`, proof, slot, alternative), the
 * go/total counter, and the honest note (spike T0, ratchet OFF, throwaway
 * measure). The source is the spike-graven palette file (lib/substrate-palette),
 * never an opinion hardcoded here.
 *
 * THE WALL (§2): the screen displays a measurement — it writes NOTHING (no
 * kernel/mirrors/fitness, ratchet OFF, /spike zone). Themed on ADR 0010 tokens;
 * strings via next-intl (ADR 0011, FR first).
 */
export function SubstrateSpikePanel({
	activeProjectId,
	palette,
	counts,
}: {
	activeProjectId: string | null;
	palette: readonly SubstrateService[];
	counts: PaletteCounts;
}) {
	const t = useTranslations("substrateSpike");

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

			{/* the go/total counter — a deterministic count over the graven matrice */}
			<section
				data-testid="palette-counts"
				className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("countsHeading")}
				</h2>
				<span
					data-testid="count-go-total"
					className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-foreground"
				>
					{counts.go}/{counts.total} {t("go")}
				</span>
				<span className="inline-flex items-center rounded-full bg-destructive px-3 py-1 text-xs font-bold uppercase tracking-wide text-destructive-foreground">
					{counts.noGo} {t("noGo")}
				</span>
				<span className="text-xs text-muted-foreground">
					{t("slotSplit", {
						mandatory: counts.mandatory,
						replaceable: counts.replaceable,
					})}
				</span>
			</section>

			{/* the MATRICE — service × verdict, sourced from the spike-graven palette */}
			<section className="rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("matrixHeading")}
				</h2>
				<p className="mt-1 text-xs text-muted-foreground">{t("matrixNote")}</p>
				<div className="mt-3 overflow-x-auto">
					<table
						data-testid="substrate-matrix"
						className="w-full text-left text-xs"
					>
						<thead>
							<tr className="border-b border-border text-muted-foreground">
								<th className="py-1 pr-3 font-medium">{t("colService")}</th>
								<th className="py-1 pr-3 font-medium">{t("colLayer")}</th>
								<th className="py-1 pr-3 font-medium">{t("colVerdict")}</th>
								<th className="py-1 pr-3 font-medium">{t("colSlot")}</th>
								<th className="py-1 pr-3 font-medium">{t("colProof")}</th>
								<th className="py-1 font-medium">{t("colAlternative")}</th>
							</tr>
						</thead>
						<tbody>
							{palette.map((s) => {
								const isGo = s.verdict === "go";
								return (
									<tr
										key={s.key}
										data-testid="substrate-row"
										data-service={s.key}
										data-verdict={isGo ? "go" : "nogo"}
										className="border-b border-border/50 align-top"
									>
										<td className="py-2 pr-3">
											<span className="font-medium text-foreground">
												{s.name}
											</span>
											<span className="ml-1.5 inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] text-muted-foreground">
												L{s.level}
											</span>
										</td>
										<td className="py-2 pr-3 font-mono text-muted-foreground">
											{s.layer}
										</td>
										<td className="py-2 pr-3">
											<span
												className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide ${
													isGo
														? "bg-primary text-primary-foreground"
														: "bg-destructive text-destructive-foreground"
												}`}
											>
												{isGo ? t("go") : t("noGo")}
											</span>
										</td>
										<td className="py-2 pr-3">
											<span
												className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-medium ${
													s.slot === "mandatory"
														? "border-primary/40 text-primary"
														: "border-border text-muted-foreground"
												}`}
											>
												{s.slot === "mandatory"
													? t("slotMandatory")
													: t("slotReplaceable")}
											</span>
										</td>
										<td className="py-2 pr-3 leading-relaxed text-muted-foreground">
											{s.proof}
										</td>
										<td className="py-2 leading-relaxed text-muted-foreground">
											{s.alternative || "—"}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
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
