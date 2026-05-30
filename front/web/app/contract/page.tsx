import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Metadata } from "next";

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

function gateClass(gate: string): string {
	return gate === "computational"
		? "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
		: "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function ContractPage() {
	const contract = parseContractFile();

	return (
		<div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-12 sm:px-8">
			<div className="mx-auto max-w-4xl space-y-10">
				{/* Header */}
				<header className="space-y-2">
					<div className="flex items-center gap-3 flex-wrap">
						<h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
							Step Execution Contract
						</h1>
						<span
							data-testid="version-badge"
							className="inline-flex items-center rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900"
						>
							v{contract.version}
						</span>
						<span className="inline-flex items-center rounded-full bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
							{contract.kind}
						</span>
					</div>
					{contract.description && (
						<p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl">
							{contract.description}
						</p>
					)}
				</header>

				{/* Per-step loop phases */}
				<section aria-label="Per-step loop phases">
					<h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-4">
						Per-step loop — {contract.phases.length} phases
					</h2>
					<div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
						<table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800">
							<thead className="bg-zinc-50 dark:bg-zinc-800">
								<tr>
									<th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider w-8">
										#
									</th>
									<th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
										id
									</th>
									<th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
										Phase
									</th>
									<th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
										Gate
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
								{contract.phases.map((phase, idx) => (
									<tr
										key={phase.id}
										data-testid={`phase-row-${phase.id}`}
										className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
									>
										<td className="px-4 py-3 text-sm text-zinc-400 dark:text-zinc-500 tabular-nums">
											{idx + 1}
										</td>
										<td className="px-4 py-3">
											<code className="text-xs font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
												{phase.id}
											</code>
										</td>
										<td className="px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200">
											{phase.label}
											{phase.description && (
												<p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">
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
				<section aria-label="Granularity rule">
					<h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-4">
						Granularity rule — {contract.granularity.length} properties
					</h2>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{contract.granularity.map((prop) => (
							<div
								key={prop.id}
								data-testid={`granularity-${prop.id}`}
								className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 space-y-1"
							>
								<div className="flex items-center gap-2">
									<code className="text-xs font-mono text-zinc-500 dark:text-zinc-500">
										{prop.id}
									</code>
									<span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
										{prop.label}
									</span>
								</div>
								{prop.description && (
									<p className="text-xs text-zinc-500 dark:text-zinc-500">
										{prop.description}
									</p>
								)}
							</div>
						))}
					</div>
				</section>

				{/* Footer */}
				<footer className="text-xs text-zinc-400 dark:text-zinc-600 border-t border-zinc-200 dark:border-zinc-800 pt-4">
					Source: <code>docs/implementation_contract.md</code> — read-only
					projection. Changes require a ChangeSet (DRAFT → APPLIED) and a semver
					bump.
				</footer>
			</div>
		</div>
	);
}
