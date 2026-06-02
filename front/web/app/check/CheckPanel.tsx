"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	type Breach,
	checkDemo,
	checkRed,
	type LawId,
	registry,
} from "@/lib/law-coverage";

// CheckPanel — the ACTION-CAPABLE /check panel (S45, ui-completeness). It does not
// only DISPLAY the law-coverage matrix: it lets the user EXECUTE the `aidos check`
// op from the screen — run the demo project (all-green), or run any law's red /
// green fixture — and see the verdict the harness computes. The verdict is the TS
// mirror (lib/law-coverage.ts), the SAME contract as the Go binary, so the screen
// agrees with the CLI byte-for-byte. Read-only against truth: the op computes and
// reports; correcting a law goes through a /goal (the wall), never a write here.

type Run =
	| { kind: "idle" }
	| { kind: "demo"; breaches: Breach[] }
	| { kind: "law"; law: LawId; fixture: "red" | "green"; breaches: Breach[] };

export function CheckPanel() {
	const t = useTranslations("check");
	const [run, setRun] = useState<Run>({ kind: "idle" });

	function runDemo() {
		setRun({ kind: "demo", breaches: checkDemo() });
	}
	function runLaw(law: LawId, fixture: "red" | "green") {
		const breaches = fixture === "red" ? checkRed(law) : [];
		setRun({ kind: "law", law, fixture, breaches });
	}

	const breaches = run.kind === "idle" ? null : run.breaches;

	return (
		<div className="space-y-8">
			{/* The verb control — execute aidos check on the demo project. */}
			<div className="flex flex-wrap items-center gap-3">
				<button
					type="button"
					onClick={runDemo}
					aria-label={t("runDemoAria")}
					className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					{t("runDemo")}
				</button>
			</div>

			{/* The live verdict block. */}
			{breaches !== null && (
				<section
					data-testid="check-verdict"
					data-verdict={breaches.length === 0 ? "green" : "invalid"}
					className="rounded-lg border border-border bg-card p-5"
				>
					{breaches.length === 0 ? (
						<p className="text-sm font-medium text-foreground">
							{t("verdictGreen")}
						</p>
					) : (
						<div className="space-y-4">
							<p className="text-sm font-medium text-foreground">
								{t("verdictInvalid", { count: breaches.length })}
							</p>
							<ul className="space-y-3">
								{breaches.map((b) => (
									<li
										key={b.code}
										data-testid="breach"
										className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
									>
										<p className="text-sm font-semibold text-foreground">
											<span className="font-mono">{b.code}</span>
											<span className="ml-2 text-xs font-normal text-muted-foreground">
												({b.law} · {b.severity})
											</span>
										</p>
										<p className="mt-1 text-sm text-muted-foreground">
											{b.explanation}
										</p>
										<p className="mt-2 text-xs font-medium text-muted-foreground uppercase">
											{t("howToFix")}
										</p>
										<ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
											{b.howToFix.map((fix) => (
												<li key={fix}>{fix}</li>
											))}
										</ul>
									</li>
								))}
							</ul>
						</div>
					)}
				</section>
			)}

			{/* The law-coverage matrix — one row per law with both red and green runnable. */}
			<section>
				<h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
					{t("matrixHeading", { count: registry.length })}
				</h2>
				<div className="overflow-x-auto rounded-lg border border-border">
					<table
						className="w-full text-left text-sm"
						aria-label={t("matrixAria")}
					>
						<thead className="bg-muted text-xs text-muted-foreground uppercase">
							<tr>
								<th className="px-3 py-2 font-medium">{t("colLaw")}</th>
								<th className="px-3 py-2 font-medium">{t("colKrdRef")}</th>
								<th className="px-3 py-2 font-medium">{t("colVerb")}</th>
								<th className="px-3 py-2 font-medium">{t("colRed")}</th>
								<th className="px-3 py-2 font-medium">{t("colGreen")}</th>
								<th className="px-3 py-2 font-medium">{t("colDetector")}</th>
							</tr>
						</thead>
						<tbody>
							{registry.map((law) => {
								const active = run.kind === "law" && run.law === law.id;
								return (
									<tr
										key={law.id}
										data-testid="law-row"
										data-law={law.id}
										data-verb={law.owningVerb}
										className="border-t border-border"
									>
										<td className="px-3 py-2 font-mono text-xs text-foreground">
											{law.id}
										</td>
										<td className="px-3 py-2 text-xs text-muted-foreground">
											{law.krdRef}
										</td>
										<td className="px-3 py-2 text-xs">
											<span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-mono text-muted-foreground">
												{law.owningVerb}
											</span>
										</td>
										<td className="px-3 py-2">
											<button
												type="button"
												data-testid="run-red"
												onClick={() => runLaw(law.id, "red")}
												aria-label={t("runRedAria", { law: law.id })}
												className="inline-flex items-center gap-1 rounded-md border border-destructive/50 px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
											>
												<span aria-hidden="true">✓</span>
												{t("runRed")}
											</button>
											{active && run.fixture === "red" && (
												<span
													data-testid="red-result"
													className="ml-2 text-xs font-medium text-destructive"
												>
													{t("resultBreach")}
												</span>
											)}
										</td>
										<td className="px-3 py-2">
											<button
												type="button"
												data-testid="run-green"
												onClick={() => runLaw(law.id, "green")}
												aria-label={t("runGreenAria", { law: law.id })}
												className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
											>
												<span aria-hidden="true">✓</span>
												{t("runGreen")}
											</button>
											{active && run.fixture === "green" && (
												<span
													data-testid="green-result"
													className="ml-2 text-xs font-medium text-foreground"
												>
													{t("resultPass")}
												</span>
											)}
										</td>
										<td className="px-3 py-2 font-mono text-xs text-muted-foreground">
											{law.detectorRef}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}
