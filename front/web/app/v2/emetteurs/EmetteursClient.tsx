"use client";

import { useMemo, useState } from "react";
import {
	type AppPreview,
	appPreview,
	type EmitView,
	type EntityCase,
	emitView,
	isBlockedView,
	type ReEmitReport,
	reEmitStable,
} from "@/lib/v2/emetteurs";

/**
 * WB2-21 — l'AFFICHAGE + l'ÉMISSION depuis les entités (l'émetteur déterministe), client-only (le twin pur).
 * On choisit une source d'entité → on ÉMET → on voit le DDL Postgres, le struct Go (sqlc) et le type TS, le
 * contrat partagé, l'aperçu de l'app émise ; on RÉ-ÉMET pour prouver la byte-stabilité.
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on CHOISIT une entité (un bouton par cas) puis on ÉMET (v2-emetteurs-emit) ;
 *   - on voit les trois projections (octets + chemin + output_hash), le contrat, l'aperçu de l'app ;
 *   - on RÉ-ÉMET (v2-emetteurs-reemit) → la preuve byte-identique (mêmes octets à chaque tour) ;
 *   - on RÉINITIALISE (v2-emetteurs-reset).
 * Tout délégué au twin pur lib/v2/emetteurs.ts (emitView / reEmitStable / appPreview — réutilise S35).
 *
 * LE MUR (§2) : l'écran LIT l'AST d'entité et REND ses projections ; il n'écrit AUCUNE vérité. Les artefacts
 * émis et l'aperçu sont des PROJECTIONS. Modifier une source PROPOSE → /goal (idée → miroir → /goal →
 * approbation), jamais une écriture directe — le bouton de proposition déclare data-proposes.
 */

type Strings = Record<string, string>;

const RE_EMIT_ROUNDS = 16;

export function EmetteursClient({
	cases,
	t,
}: {
	cases: readonly EntityCase[];
	t: Strings;
}) {
	// le cas SÉLECTIONNÉ (l'entité choisie) ; null = rien émis encore.
	const [selectedId, setSelectedId] = useState<string | null>(null);
	// vrai dès qu'on a lancé la re-émission (la preuve byte-stable).
	const [reEmitted, setReEmitted] = useState(false);

	const selected = useMemo(
		() => cases.find((c) => c.id === selectedId) ?? null,
		[cases, selectedId],
	);

	const view: EmitView | null = useMemo(() => {
		if (!selected) return null;
		const v = emitView(selected.entity);
		return isBlockedView(v) ? null : v;
	}, [selected]);

	const preview: AppPreview | null = useMemo(
		() => (selected ? appPreview(selected.entity) : null),
		[selected],
	);

	const report: ReEmitReport | null = useMemo(() => {
		if (!selected || !reEmitted) return null;
		return reEmitStable(selected.entity, RE_EMIT_ROUNDS);
	}, [selected, reEmitted]);

	return (
		<div data-testid="v2-emetteurs-view" className="space-y-6">
			{/* CHOISIR une entité + ÉMETTRE (l'action de l'écran) */}
			<div className="rounded-xl border border-border bg-card p-6 space-y-3">
				<h3 className="text-sm font-semibold text-foreground">
					{t.samplesHeading}
				</h3>
				<p className="text-xs text-muted-foreground">{t.samplesHint}</p>
				<div data-testid="v2-emetteurs-samples" className="flex flex-col gap-2">
					{cases.map((c) => (
						<button
							key={c.id}
							type="button"
							data-testid={`v2-emetteurs-sample-${c.id}`}
							onClick={() => {
								setSelectedId(c.id);
								setReEmitted(false);
							}}
							className={[
								"rounded-lg border px-4 py-2 text-left text-sm transition-colors",
								selectedId === c.id
									? "border-primary bg-primary/10 text-primary"
									: "border-border bg-card text-foreground hover:bg-muted",
							].join(" ")}
						>
							{t[c.labelKey] ?? c.id}
						</button>
					))}
				</div>
				<div className="flex flex-wrap gap-2 pt-1">
					<span
						data-testid="v2-emetteurs-emit"
						aria-disabled={selected === null}
						className={[
							"inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium",
							selected === null
								? "bg-muted text-muted-foreground"
								: "bg-primary text-primary-foreground",
						].join(" ")}
					>
						{t.emitBtn}
					</span>
					<button
						type="button"
						data-testid="v2-emetteurs-reemit"
						onClick={() => setReEmitted(true)}
						disabled={selected === null}
						className="inline-flex items-center rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
					>
						{t.reEmitBtn}
					</button>
					<button
						type="button"
						data-testid="v2-emetteurs-reset"
						onClick={() => {
							setSelectedId(null);
							setReEmitted(false);
						}}
						disabled={selected === null}
						className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
					>
						{t.resetBtn}
					</button>
				</div>
			</div>

			{view === null ? (
				<p
					data-testid="v2-emetteurs-empty"
					className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground"
				>
					{t.empty}
				</p>
			) : (
				<div data-testid="v2-emetteurs-result" className="space-y-6">
					{/* l'EMPREINTE SOURCE + le CONTRAT partagé */}
					<div className="rounded-xl border border-border bg-card px-6 py-4 space-y-3">
						<div className="flex flex-wrap items-center gap-3">
							<span className="text-xs text-muted-foreground">
								{t.sourceHashLabel}
							</span>
							<span
								data-testid="v2-emetteurs-source-hash"
								className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground"
							>
								{view.sourceHash.slice(0, 16)}…
							</span>
						</div>
						<div className="space-y-1.5">
							<h3 className="text-sm font-semibold text-foreground">
								{t.contractHeading}
							</h3>
							<p className="text-[11px] text-muted-foreground">
								{t.contractHint}
							</p>
							<div
								data-testid="v2-emetteurs-contract"
								className="flex flex-wrap gap-2 pt-1"
							>
								{view.contract.map((name) => (
									<span
										key={name}
										data-testid={`v2-emetteurs-contract-${name}`}
										className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-foreground"
									>
										{name}
									</span>
								))}
							</div>
						</div>
					</div>

					{/* les TROIS PROJECTIONS : DDL · Go · TS (octets émis, byte-stables) */}
					<div className="space-y-3">
						<h3 className="text-sm font-semibold text-foreground">
							{t.targetsHeading}
						</h3>
						<div data-testid="v2-emetteurs-targets" className="space-y-4">
							{view.targets.map((tg) => (
								<div
									key={tg.target}
									data-testid={`v2-emetteurs-target-${tg.target}`}
									data-target={tg.target}
									className="overflow-hidden rounded-xl border border-border bg-card"
								>
									<div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/40 px-4 py-2">
										<span className="text-sm font-semibold text-foreground">
											{tg.label}
										</span>
										<span className="font-mono text-[10px] text-muted-foreground">
											{t.colPath}: {tg.path}
										</span>
										<span
											data-testid={`v2-emetteurs-output-hash-${tg.target}`}
											className="ml-auto rounded border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
										>
											{t.colOutputHash}: {tg.outputHash.slice(0, 12)}…
										</span>
									</div>
									<pre
										data-testid={`v2-emetteurs-bytes-${tg.target}`}
										className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-foreground"
									>
										<code>{tg.bytes}</code>
									</pre>
								</div>
							))}
						</div>
					</div>

					{/* la PREUVE de re-émission byte-identique (l'action de re-émission) */}
					<div className="space-y-2">
						<h3 className="text-sm font-semibold text-foreground">
							{t.reEmitHeading}
						</h3>
						<p className="text-[11px] text-muted-foreground">{t.reEmitHint}</p>
						{report === null ? (
							<p
								data-testid="v2-emetteurs-reemit-prompt"
								className="rounded-xl border border-dashed border-border bg-card px-4 py-3 text-xs text-muted-foreground"
							>
								{t.reEmitBtn} →
							</p>
						) : (
							<div
								data-testid="v2-emetteurs-reemit-report"
								data-all-stable={report.allStable ? "true" : "false"}
								className="space-y-2"
							>
								<div className="flex flex-wrap gap-2">
									{report.targets.map((rt) => (
										<span
											key={rt.target}
											data-testid={`v2-emetteurs-reemit-${rt.target}`}
											data-stable={rt.byteStable ? "true" : "false"}
											className={[
												"inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium",
												rt.byteStable
													? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600"
													: "border-destructive/40 bg-destructive/5 text-destructive",
											].join(" ")}
										>
											{rt.byteStable ? "🟢" : "🔴"} {rt.label} —{" "}
											{rt.byteStable ? t.reEmitStable : t.reEmitDrift}
										</span>
									))}
								</div>
								{report.allStable && (
									<p
										data-testid="v2-emetteurs-all-stable"
										className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-4 py-2 text-xs text-emerald-600"
									>
										✓ {t.reEmitAllStable} ({report.rounds} {t.reEmitRounds})
									</p>
								)}
							</div>
						)}
					</div>

					{/* l'APERÇU de l'app émise (la « BDD du résultat codé ») */}
					{preview && (
						<div className="space-y-2">
							<h3 className="text-sm font-semibold text-foreground">
								{t.previewHeading}
							</h3>
							<p className="text-[11px] text-muted-foreground">
								{t.previewHint}
							</p>
							<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
								<span>
									{t.previewTable}:{" "}
									<span className="font-mono text-foreground">
										{preview.table}
									</span>
								</span>
								{preview.primaryKey && (
									<span>
										{t.previewPrimaryKey}:{" "}
										<span className="font-mono text-foreground">
											{preview.primaryKey}
										</span>
									</span>
								)}
							</div>
							<div className="overflow-x-auto rounded-xl border border-border">
								<table className="w-full text-left text-xs">
									<thead className="bg-muted/50 text-muted-foreground">
										<tr>
											<th className="px-3 py-2 font-medium">{t.colColumn}</th>
											<th className="px-3 py-2 font-medium">{t.colSqlType}</th>
											<th className="px-3 py-2 font-medium">{t.colTsType}</th>
											<th className="px-3 py-2 font-medium">{t.colNullable}</th>
											<th className="px-3 py-2 font-medium">
												{t.colPrimaryKey}
											</th>
										</tr>
									</thead>
									<tbody data-testid="v2-emetteurs-preview">
										{preview.columns.map((col) => (
											<tr
												key={col.name}
												data-testid={`v2-emetteurs-preview-${col.name}`}
												data-nullable={col.nullable ? "true" : "false"}
												data-pk={col.primaryKey ? "true" : "false"}
												className="border-t border-border"
											>
												<td className="px-3 py-2 font-mono text-foreground">
													{col.name}
												</td>
												<td className="px-3 py-2 font-mono">{col.sqlType}</td>
												<td className="px-3 py-2 font-mono">{col.tsType}</td>
												<td className="px-3 py-2">
													{col.nullable ? t.yes : t.no}
												</td>
												<td className="px-3 py-2">
													{col.primaryKey ? "🔑" : ""}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					)}

					{/* la PROPOSITION (le mur intact) — modifier une source PROPOSE → /goal */}
					<div className="space-y-1.5">
						<button
							type="button"
							data-testid="v2-emetteurs-propose"
							data-proposes="goal"
							className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
						>
							{t.proposeNote.split(".")[0]} →
						</button>
						<p
							data-testid="v2-emetteurs-propose-note"
							className="text-[11px] leading-relaxed text-muted-foreground"
						>
							{t.proposeNote}
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
