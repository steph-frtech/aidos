import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
// Determinism-first: the command set is a static, declared registry in lib/cli.ts
// (mirroring back/cmd/aidos/contract.go), covered by lib/cli.test.ts. This Server
// Component only renders it — no I/O, no clock, no rng — so /cli shows exactly
// what `aidos <cmd>` prints, identically across runs.
import { cliContracts, heading } from "@/lib/cli";
import { CliTeach } from "./CliTeach";

export const metadata: Metadata = {
	title: "CLI aidos — AIDOS Workbench",
	description:
		"Read-only panel of the five core `aidos` CLI commands (check/impact/stable/diff/explain) and the contract each prints — a print-only stub at S03, no truth written.",
};

/**
 * /cli — the `aidos` CLI panel (S03). One card per core command showing the exact
 * contract the binary prints: heading, purpose, future inputs/outputs, owning
 * step, and a "stub" badge.
 *
 * THE WALL (CLAUDE.md §2). The CLI is a print-only stub: it writes no truth, it
 * touches no Postgres. This screen is correspondingly read-only — it declares the
 * contract, it executes nothing yet (the commands gain real behaviour at their
 * owning steps: explain→S13, impact→S22, stable→S23, diff→S24, check→S45). The
 * action-capable clause of ui-completeness is vacuously satisfied: there is no
 * backend capability to bind here, so no headless capability is hidden — there is
 * none. Themed on ADR 0010 tokens; bilingual via next-intl (ADR 0011).
 */
export default async function CliPage() {
	const contracts = cliContracts();
	const t = await getTranslations("cli");

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							{t("title")}
						</h1>
						<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("stubBadge")}
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<div className="mt-10">
					<CliTeach />
				</div>

				<section aria-label={t("commandsAria")} className="mt-10 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("commandsHeading", { count: contracts.length })}
					</h2>
					<div className="grid gap-4 sm:grid-cols-2">
						{contracts.map((c) => (
							<article
								key={c.verb}
								data-testid={`cli-command-${c.verb}`}
								className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
							>
								<div className="flex items-center justify-between gap-2">
									<code
										data-testid={`cli-heading-${c.verb}`}
										className="rounded bg-muted px-2 py-1 font-mono text-sm font-semibold text-card-foreground"
									>
										{heading(c.verb)}
									</code>
									<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-primary">
										{c.status}
									</span>
								</div>
								<p className="text-sm leading-relaxed text-card-foreground">
									{c.purpose}
								</p>
								<dl className="mt-1 space-y-2 text-xs">
									<div className="flex flex-col gap-0.5">
										<dt className="font-medium uppercase tracking-wider text-muted-foreground">
											{t("inputsLabel")}
										</dt>
										<dd className="text-muted-foreground">{c.futureInputs}</dd>
									</div>
									<div className="flex flex-col gap-0.5">
										<dt className="font-medium uppercase tracking-wider text-muted-foreground">
											{t("outputsLabel")}
										</dt>
										<dd className="text-muted-foreground">{c.futureOutputs}</dd>
									</div>
								</dl>
								<p className="mt-auto pt-1 text-xs text-muted-foreground">
									{t("ownedBy")}{" "}
									<span className="font-medium text-card-foreground">
										{c.ownedBy}
									</span>
								</p>
							</article>
						))}
					</div>
				</section>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t.rich("footer", {
						code: (chunks) => (
							<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
								{chunks}
							</code>
						),
					})}
				</footer>
			</main>
		</div>
	);
}
