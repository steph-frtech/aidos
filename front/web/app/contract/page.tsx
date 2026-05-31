import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

export const metadata: Metadata = {
	title: "Step Execution Contract — AIDOS Workbench",
	description:
		"Per-step loop and granularity rule, versioned and machine-readable.",
};

// ── Types ─────────────────────────────────────────────────────────────────

interface Phase {
	id: string;
	label: string;
	description: string;
	gate: "computational" | "human";
}

interface GranularityProp {
	id: string;
	label: string;
	description: string;
}

interface Contract {
	version: string;
	kind: string;
	description: string;
	phases: Phase[];
	granularity: GranularityProp[];
}

// ── Parser — no runtime dep, just the Node built-ins ─────────────────────
// The front block is a YAML-ish block delimited by --- lines.
// We parse it with targeted regexes since we control the file format.

function parseContractFile(): Contract {
	const contractPath = resolve(
		process.cwd(),
		"../../docs/implementation_contract.md",
	);
	const raw = readFileSync(contractPath, "utf8");

	const frontMatch = raw.match(/^---\n([\s\S]*?)\n---/);
	if (!frontMatch)
		throw new Error("No front block found in implementation_contract.md");
	const yaml = frontMatch[1];

	const versionMatch = yaml.match(/^\s{2}version:\s*"([^"]+)"/m);
	const kindMatch = yaml.match(/^\s{2}kind:\s*(\S+)/m);
	const descMatch = yaml.match(
		/^\s{2}description:\s*>\n([\s\S]*?)(?=\n\s{2}\w)/m,
	);

	const version = versionMatch?.[1] ?? "unknown";
	const kind = kindMatch?.[1] ?? "unknown";
	const description = descMatch
		? descMatch[1]
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean)
				.join(" ")
		: "";

	// Parse phases
	const phasesSection = yaml.match(
		/\s{2}phases:\n([\s\S]*?)\n\s{2}granularity:/,
	);
	const phasesText = phasesSection?.[1] ?? "";
	const phases = parseItems(phasesText) as unknown as Phase[];

	// Parse granularity
	const granularitySection = yaml.match(/\s{2}granularity:\n([\s\S]*)$/);
	const granularityText = granularitySection?.[1] ?? "";
	const granularity = parseItems(
		granularityText,
	) as unknown as GranularityProp[];

	return { version, kind, description, phases, granularity };
}

function parseItems(block: string): Record<string, string>[] {
	// Split on "    - id:" entry points
	const entries = block.split(/(?=\s{4}-\s+id:)/g).filter((s) => s.trim());
	return entries.map((entry) => {
		const fields: Record<string, string> = {};
		const idM = entry.match(/\s{4}-\s+id:\s+(\S+)/);
		const labelM = entry.match(/\s{6}label:\s+"?([^"\n]+)"?/);
		const gateM = entry.match(/\s{6}gate:\s+(\S+)/);
		const descM = entry.match(
			/\s{6}description:\s*>\n([\s\S]*?)(?=\s{6}\w|\s{4}-|\s{2}\w|$)/,
		);
		if (idM) fields.id = idM[1];
		if (labelM) fields.label = labelM[1].trim();
		if (gateM) fields.gate = gateM[1];
		if (descM) {
			fields.description = descM[1]
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean)
				.join(" ");
		}
		return fields;
	});
}

// ── Gate chip styling ────────────────────────────────────────────────────
// computational → the blue primary accent; human → a calm muted surface.

function gateClass(gate: string): string {
	const base =
		"inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";
	return gate === "computational"
		? `${base} bg-primary/10 text-primary`
		: `${base} bg-muted text-muted-foreground`;
}

// ── Page ─────────────────────────────────────────────────────────────────
// /contract — read-only projection of docs/implementation_contract.md: the
// version badge, the per-step loop phases (each with its computational|human
// gate) and the granularity properties. The file parse + checklist render are
// preserved exactly; only the presentation moves to the ADR 0010 design tokens,
// and the static labels are bilingual via next-intl (ADR 0011).

export default async function ContractPage() {
	const contract = parseContractFile();
	const t = await getTranslations("contract");

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<div className="space-y-12">
					{/* Header */}
					<header className="space-y-4">
						<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
							{t("eyebrow")}
						</span>
						<div className="flex flex-wrap items-center gap-3">
							<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
								{t("title")}
							</h1>
							<span
								data-testid="version-badge"
								className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 font-mono text-xs font-semibold text-card-foreground"
							>
								v{contract.version}
							</span>
							<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
								{contract.kind}
							</span>
						</div>
						{contract.description && (
							<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
								{contract.description}
							</p>
						)}
					</header>

					{/* Per-step loop phases */}
					<section aria-label={t("phasesHeading")} className="space-y-4">
						<h2 className="text-lg font-semibold tracking-tight text-foreground">
							{t("phasesHeading", { count: contract.phases.length })}
						</h2>
						<div className="overflow-hidden rounded-xl border border-border bg-card">
							<table className="min-w-full divide-y divide-border">
								<thead className="bg-muted/50">
									<tr>
										<th className="w-8 px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
											#
										</th>
										<th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
											{t("colId")}
										</th>
										<th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
											{t("colPhase")}
										</th>
										<th className="px-4 py-3 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
											{t("colGate")}
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{contract.phases.map((phase, idx) => (
										<tr
											key={phase.id}
											data-testid={`phase-row-${phase.id}`}
											className="transition-colors hover:bg-accent/50"
										>
											<td className="px-4 py-3 text-sm tabular-nums text-muted-foreground">
												{idx + 1}
											</td>
											<td className="px-4 py-3">
												<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
													{phase.id}
												</code>
											</td>
											<td className="px-4 py-3 text-sm text-foreground">
												{phase.label}
												{phase.description && (
													<p className="mt-0.5 text-xs text-muted-foreground">
														{phase.description}
													</p>
												)}
											</td>
											<td className="px-4 py-3">
												<span
													data-testid={`gate-chip-${phase.id}`}
													className={gateClass(phase.gate)}
												>
													{phase.gate}
												</span>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>

					{/* Granularity rule */}
					<section aria-label={t("granularityHeading")} className="space-y-4">
						<h2 className="text-lg font-semibold tracking-tight text-foreground">
							{t("granularityHeading", { count: contract.granularity.length })}
						</h2>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{contract.granularity.map((prop) => (
								<div
									key={prop.id}
									data-testid={`granularity-${prop.id}`}
									className="space-y-1.5 rounded-xl border border-border bg-card px-4 py-3.5"
								>
									<div className="flex items-center gap-2">
										<code className="font-mono text-xs text-muted-foreground">
											{prop.id}
										</code>
										<span className="text-sm font-semibold text-card-foreground">
											{prop.label}
										</span>
									</div>
									{prop.description && (
										<p className="text-xs leading-relaxed text-muted-foreground">
											{prop.description}
										</p>
									)}
								</div>
							))}
						</div>
					</section>

					{/* Footer */}
					<footer className="border-t border-border pt-4 text-xs text-muted-foreground">
						{t.rich("footer", {
							source: (chunks) => (
								<code className="rounded bg-muted px-1 py-0.5 font-mono">
									{chunks}
								</code>
							),
						})}
					</footer>
				</div>
			</main>
		</div>
	);
}
