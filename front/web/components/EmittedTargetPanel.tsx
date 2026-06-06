"use client";

import { useState } from "react";
import {
	type EmittedTarget,
	type ParityVerdict,
	verifyParity,
} from "@/lib/emitted-target";

/**
 * EmittedTargetPanel — the action-capable /emitted-target panel (EL00, ADR 0040). The human RUNS
 * the parity check FROM THE SCREEN: the panel shows the declared EL00 target (constructrice≠
 * construite frontier) and the enforced arch-fitness.json `emitted_target` block side by side, and
 * the "Vérifier la parité" button runs verifyParity (the SAME pure verdict the Go parity test
 * runs — lib/emitted-target.ts is the byte-identical twin of agentloop.EmittedTargetEL00). No I/O,
 * no clock, no LLM. THE WALL (CLAUDE.md §2): EL00 is ADR-only, above-the-line — this panel writes
 * NO truth; it reads/renders a decision and computes a deterministic verdict. Themed (ADR 0010),
 * bilingual (ADR 0011).
 */

interface Labels {
	declaredTitle: string;
	enforcedTitle: string;
	verifyCta: string;
	parityOk: string;
	parityFail: string;
	fieldCol: string;
	declaredCol: string;
	enforcedCol: string;
	constructrice: string;
	construite: string;
	frontier: string;
	wall: string;
}

export function EmittedTargetPanel({
	declared,
	enforced,
	labels,
}: {
	declared: EmittedTarget;
	enforced: EmittedTarget;
	labels: Labels;
}) {
	const [verdict, setVerdict] = useState<ParityVerdict | null>(null);

	return (
		<div className="space-y-8" data-testid="emitted-target-panel">
			{/* The trenched frontier, rendered as two cards (constructrice / construite). */}
			<section className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2 rounded-xl border border-border bg-card p-4">
					<h3 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.constructrice}
					</h3>
					<dl className="space-y-1 text-sm">
						<div className="flex items-center justify-between gap-2">
							<dt className="text-muted-foreground">language</dt>
							<dd className="font-mono text-foreground">
								{declared.constructrice.language}
							</dd>
						</div>
						<div className="flex items-center justify-between gap-2">
							<dt className="text-muted-foreground">rewritten_in_ts</dt>
							<dd className="font-mono text-foreground">
								{String(declared.constructrice.rewritten_in_ts)}
							</dd>
						</div>
						<div className="flex items-center justify-between gap-2">
							<dt className="text-muted-foreground">emits_go_for_user_app</dt>
							<dd className="font-mono text-foreground">
								{String(declared.constructrice.emits_go_for_user_app)}
							</dd>
						</div>
					</dl>
				</div>
				<div className="space-y-2 rounded-xl border border-border bg-card p-4">
					<h3 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.construite}
					</h3>
					<dl className="space-y-1 text-sm">
						<div className="flex items-center justify-between gap-2">
							<dt className="text-muted-foreground">backend / frontend</dt>
							<dd className="font-mono text-foreground">
								{declared.construite.backend} / {declared.construite.frontend}
							</dd>
						</div>
						<div className="flex items-center justify-between gap-2">
							<dt className="text-muted-foreground">language</dt>
							<dd className="font-mono text-foreground">
								{declared.construite.language}
							</dd>
						</div>
						<div className="flex items-center justify-between gap-2">
							<dt className="text-muted-foreground">datastore_dialect</dt>
							<dd className="font-mono text-foreground">
								{declared.construite.datastore_dialect}
							</dd>
						</div>
						<div className="flex items-center justify-between gap-2">
							<dt className="text-muted-foreground">operation_interpreter</dt>
							<dd className="font-mono text-foreground">
								{declared.construite.operation_interpreter}
							</dd>
						</div>
						<div className="flex items-center justify-between gap-2">
							<dt className="text-muted-foreground">own_mcp / own_skills</dt>
							<dd className="font-mono text-foreground">
								{String(declared.construite.own_mcp)} /{" "}
								{String(declared.construite.own_skills)}
							</dd>
						</div>
					</dl>
				</div>
			</section>

			<p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
				{labels.wall}
			</p>

			{/* The action: run the parity verdict from the screen. */}
			<section className="space-y-3">
				<button
					type="button"
					data-testid="verify-parity"
					onClick={() => setVerdict(verifyParity(declared, enforced))}
					className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
				>
					{labels.verifyCta}
				</button>

				{verdict && (
					<div className="space-y-3" data-testid="parity-result">
						<span
							data-testid="parity-badge"
							className={
								verdict.ok
									? "inline-flex items-center rounded-full bg-primary/15 px-3 py-1 text-sm font-medium text-primary"
									: "inline-flex items-center rounded-full bg-destructive/15 px-3 py-1 text-sm font-medium text-destructive"
							}
						>
							{verdict.ok ? labels.parityOk : labels.parityFail}
						</span>
						<div className="overflow-hidden rounded-xl border border-border">
							<table className="w-full text-left text-sm">
								<thead className="bg-muted/50 text-xs text-muted-foreground">
									<tr>
										<th className="px-3 py-2 font-medium">{labels.fieldCol}</th>
										<th className="px-3 py-2 font-medium">
											{labels.declaredCol}
										</th>
										<th className="px-3 py-2 font-medium">
											{labels.enforcedCol}
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border">
									{verdict.checks.map((c) => (
										<tr key={c.label} className="bg-card">
											<td className="px-3 py-1.5 font-mono text-xs text-foreground">
												{c.label}
											</td>
											<td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
												{c.declared}
											</td>
											<td
												className={
													c.ok
														? "px-3 py-1.5 font-mono text-xs text-muted-foreground"
														: "px-3 py-1.5 font-mono text-xs text-destructive"
												}
											>
												{c.enforced}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</section>
		</div>
	);
}
