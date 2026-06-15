"use client";

import { useMemo, useState } from "react";
import { emitApp } from "@/lib/v2/builder";
import {
	type AppPreview,
	appPreview,
	type EmittedTarget,
	type EmitView,
	ENTITY_CASES,
	type EntityCase,
	emitView,
	isBlockedView,
	type ReEmitReport,
	reEmitStable,
	type Target,
} from "@/lib/v2/emetteurs";
import { useV3Session } from "../V3Session";

/**
 * /v3/emetteurs — LA LENTILLE ÉMETTEURS (la 10e, le portage de /v2/emetteurs) :
 * client-only car TOUT est projeté du TWIN PUR lib/v2/emetteurs.ts (emitView /
 * reEmitStable / appPreview — réexportant emit/project de S35, byte-identiques au Go).
 * Cette lentille ne ré-implémente AUCUNE logique d'émission.
 *
 * ACTION-CAPABLE (§6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on CHOISIT une entité source (un bouton par cas du registre clos ENTITY_CASES) ;
 *   - on voit les TROIS projections (DDL · Go · TS) en ONGLETS — octets + chemin +
 *     output_hash, octet-stables, lisibles ;
 *   - le CONTRAT partagé (les champs que les trois cibles épinglent) + l'aperçu de
 *     l'app émise (la « BDD du résultat codé ») ;
 *   - on RÉ-ÉMET (v3-emetteurs-reemit) → la preuve byte-identique (mêmes octets) ;
 *   - on RÉINITIALISE (v3-emetteurs-reset).
 *
 * EN CONTEXTE : les entités émises par l'app COURANTE de la session (emitApp(state)) —
 * une PROJECTION pure du rejeu. Ces entités-là (issues des kernels proposés) ne
 * portent qu'un nom + une version (pas l'AST d'attributs) ; l'émission DDL/Go/TS
 * complète exige une source d'entité réelle — d'où le registre clos ENTITY_CASES (les
 * mêmes sources que le Go pinne), jamais une entité inventée (honnêteté §8).
 *
 * LE MUR (§2) : l'écran LIT l'AST d'entité et REND ses projections ; il n'écrit AUCUNE
 * vérité. Les artefacts émis et l'aperçu sont des PROJECTIONS. Modifier une source
 * PROPOSE → /goal (idée → miroir → /goal → approbation), jamais une écriture directe.
 */

type Strings = Record<string, string>;

const RE_EMIT_ROUNDS = 16;

/** L'onglet de projection actif : la cible du twin (jeu clos DDL/Go/TS). */
function TargetTab({
	tg,
	active,
	onClick,
}: {
	tg: EmittedTarget;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			role="tab"
			data-testid="v3-emetteurs-tab"
			data-target={tg.target}
			aria-selected={active}
			onClick={onClick}
			className={[
				"rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium transition-colors",
				active
					? "border-primary text-primary"
					: "border-transparent text-muted-foreground hover:text-foreground",
			].join(" ")}
		>
			{tg.label}
		</button>
	);
}

export function EmetteursClient() {
	const { state, strings } = useV3Session();
	const t = strings as Strings;

	// le cas SÉLECTIONNÉ (l'entité choisie) ; null = rien émis encore.
	const [selectedId, setSelectedId] = useState<string | null>(null);
	// l'onglet de projection actif (la cible affichée) ; null → la première émise.
	const [activeTarget, setActiveTarget] = useState<Target | null>(null);
	// vrai dès qu'on a lancé la re-émission (la preuve byte-stable).
	const [reEmitted, setReEmitted] = useState(false);

	// Le registre clos des sources d'entité (le twin — stable, jamais inventé).
	const cases: readonly EntityCase[] = ENTITY_CASES;

	const selected = useMemo(
		() => ENTITY_CASES.find((c) => c.id === selectedId) ?? null,
		[selectedId],
	);

	// LA PROJECTION PURE (le twin) — émission groupée des trois cibles.
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

	// LA CIBLE AFFICHÉE : l'onglet choisi, sinon la première projection émise.
	const shown: EmittedTarget | null = useMemo(() => {
		if (view === null) return null;
		const wanted = view.targets.find((tg) => tg.target === activeTarget);
		return wanted ?? view.targets[0] ?? null;
	}, [view, activeTarget]);

	// EN CONTEXTE : les entités émises par l'app COURANTE de la session — une
	// projection pure du rejeu (emitApp), montrée pour situer la lentille dans le projet.
	const app = useMemo(() => emitApp(state), [state]);

	return (
		<div data-testid="v3-emetteurs-view" className="space-y-6">
			{/* CHOISIR une entité source + ÉMETTRE (l'action de l'écran) */}
			<div className="space-y-3 rounded-xl border border-border bg-card p-6">
				<h2 className="text-sm font-semibold text-foreground">
					{t.emetteursSamplesHeading}
				</h2>
				<p className="text-xs text-muted-foreground">
					{t.emetteursSamplesHint}
				</p>
				<div data-testid="v3-emetteurs-samples" className="flex flex-col gap-2">
					{cases.map((c) => (
						<button
							key={c.id}
							type="button"
							data-testid="v3-emetteurs-sample"
							data-id={c.id}
							onClick={() => {
								setSelectedId(c.id);
								setActiveTarget(null);
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
						data-testid="v3-emetteurs-emit"
						aria-disabled={selected === null}
						className={[
							"inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium",
							selected === null
								? "bg-muted text-muted-foreground"
								: "bg-primary text-primary-foreground",
						].join(" ")}
					>
						{t.emetteursEmitBtn}
					</span>
					<button
						type="button"
						data-testid="v3-emetteurs-reemit"
						onClick={() => setReEmitted(true)}
						disabled={selected === null}
						className="inline-flex items-center rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
					>
						{t.emetteursReEmitBtn}
					</button>
					<button
						type="button"
						data-testid="v3-emetteurs-reset"
						onClick={() => {
							setSelectedId(null);
							setActiveTarget(null);
							setReEmitted(false);
						}}
						disabled={selected === null}
						className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
					>
						{t.emetteursResetBtn}
					</button>
				</div>
			</div>

			{/* EN CONTEXTE : les entités émises par l'app courante de la session */}
			<div
				data-testid="v3-emetteurs-app"
				className="space-y-2 rounded-xl border border-border bg-muted/30 px-4 py-3"
			>
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-xs font-semibold text-foreground">
						{t.emetteursAppHeading}
					</h2>
					<span className="rounded border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
						{app.version}
					</span>
				</div>
				<p className="text-[11px] leading-relaxed text-muted-foreground">
					{t.emetteursAppHint}
				</p>
				{app.entities.length === 0 ? (
					<p
						data-testid="v3-emetteurs-app-empty"
						className="text-[11px] text-muted-foreground"
					>
						{t.emetteursAppEmpty}
					</p>
				) : (
					<div className="flex flex-wrap gap-1.5 pt-0.5">
						{app.entities.map((e) => (
							<span
								key={e.version}
								data-testid="v3-emetteurs-app-entity"
								className="rounded-md border border-border bg-card px-2 py-0.5 font-mono text-[11px] text-foreground"
							>
								{e.name}
							</span>
						))}
					</div>
				)}
			</div>

			{view === null ? (
				<p
					data-testid="v3-emetteurs-empty"
					className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground"
				>
					{t.emetteursEmpty}
				</p>
			) : (
				<div data-testid="v3-emetteurs-result" className="space-y-6">
					{/* l'EMPREINTE SOURCE + le CONTRAT partagé */}
					<div className="space-y-3 rounded-xl border border-border bg-card px-6 py-4">
						<div className="flex flex-wrap items-center gap-3">
							<span className="text-xs text-muted-foreground">
								{t.emetteursSourceHashLabel}
							</span>
							<span
								data-testid="v3-emetteurs-source-hash"
								className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground"
							>
								{view.sourceHash.slice(0, 16)}…
							</span>
						</div>
						<div className="space-y-1.5">
							<h3 className="text-sm font-semibold text-foreground">
								{t.emetteursContractHeading}
							</h3>
							<p className="text-[11px] text-muted-foreground">
								{t.emetteursContractHint}
							</p>
							<div
								data-testid="v3-emetteurs-contract"
								className="flex flex-wrap gap-2 pt-1"
							>
								{view.contract.map((name) => (
									<span
										key={name}
										data-testid="v3-emetteurs-contract-field"
										data-field={name}
										className="rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-foreground"
									>
										{name}
									</span>
								))}
							</div>
						</div>
					</div>

					{/* les TROIS PROJECTIONS : DDL · Go · TS en ONGLETS (octets byte-stables) */}
					<div className="space-y-3">
						<h3 className="text-sm font-semibold text-foreground">
							{t.emetteursTargetsHeading}
						</h3>
						<div
							data-testid="v3-emetteurs-targets"
							className="overflow-hidden rounded-xl border border-border bg-card"
						>
							{/* la barre d'onglets — une par cible émise (DDL, Go, TS) */}
							<div
								role="tablist"
								className="flex flex-wrap gap-1 border-b border-border bg-muted/40 px-3 pt-2"
							>
								{view.targets.map((tg) => (
									<TargetTab
										key={tg.target}
										tg={tg}
										active={shown?.target === tg.target}
										onClick={() => setActiveTarget(tg.target)}
									/>
								))}
							</div>
							{/* le contenu de l'onglet actif : chemin + output_hash + octets émis */}
							{shown !== null && (
								<div
									data-testid="v3-emetteurs-target"
									data-target={shown.target}
								>
									<div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted/20 px-4 py-2">
										<span className="font-mono text-[10px] text-muted-foreground">
											{t.emetteursColPath}: {shown.path}
										</span>
										<span
											data-testid="v3-emetteurs-output-hash"
											className="ml-auto rounded border border-border bg-card px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
										>
											{t.emetteursColOutputHash}:{" "}
											{shown.outputHash.slice(0, 12)}…
										</span>
									</div>
									<pre
										data-testid="v3-emetteurs-bytes"
										data-target={shown.target}
										className="overflow-x-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-foreground"
									>
										<code>{shown.bytes}</code>
									</pre>
								</div>
							)}
						</div>
					</div>

					{/* la PREUVE de re-émission byte-identique (l'action de re-émission) */}
					<div className="space-y-2">
						<h3 className="text-sm font-semibold text-foreground">
							{t.emetteursReEmitHeading}
						</h3>
						<p className="text-[11px] text-muted-foreground">
							{t.emetteursReEmitHint}
						</p>
						{report === null ? (
							<p
								data-testid="v3-emetteurs-reemit-prompt"
								className="rounded-xl border border-dashed border-border bg-card px-4 py-3 text-xs text-muted-foreground"
							>
								{t.emetteursReEmitBtn} →
							</p>
						) : (
							<div
								data-testid="v3-emetteurs-reemit-report"
								data-all-stable={report.allStable ? "true" : "false"}
								className="space-y-2"
							>
								<div className="flex flex-wrap gap-2">
									{report.targets.map((rt) => (
										<span
											key={rt.target}
											data-testid="v3-emetteurs-reemit-target"
											data-target={rt.target}
											data-stable={rt.byteStable ? "true" : "false"}
											className={[
												"inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium",
												rt.byteStable
													? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600"
													: "border-destructive/40 bg-destructive/5 text-destructive",
											].join(" ")}
										>
											{rt.byteStable ? "🟢" : "🔴"} {rt.label} —{" "}
											{rt.byteStable
												? t.emetteursReEmitStable
												: t.emetteursReEmitDrift}
										</span>
									))}
								</div>
								{report.allStable && (
									<p
										data-testid="v3-emetteurs-all-stable"
										className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-4 py-2 text-xs text-emerald-600"
									>
										✓ {t.emetteursReEmitAllStable} ({report.rounds}{" "}
										{t.emetteursReEmitRounds})
									</p>
								)}
							</div>
						)}
					</div>

					{/* l'APERÇU de l'app émise (la « BDD du résultat codé ») */}
					{preview && (
						<div className="space-y-2">
							<h3 className="text-sm font-semibold text-foreground">
								{t.emetteursPreviewHeading}
							</h3>
							<p className="text-[11px] text-muted-foreground">
								{t.emetteursPreviewHint}
							</p>
							<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
								<span>
									{t.emetteursPreviewTable}:{" "}
									<span className="font-mono text-foreground">
										{preview.table}
									</span>
								</span>
								{preview.primaryKey && (
									<span>
										{t.emetteursPreviewPrimaryKey}:{" "}
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
											<th className="px-3 py-2 font-medium">
												{t.emetteursColColumn}
											</th>
											<th className="px-3 py-2 font-medium">
												{t.emetteursColSqlType}
											</th>
											<th className="px-3 py-2 font-medium">
												{t.emetteursColTsType}
											</th>
											<th className="px-3 py-2 font-medium">
												{t.emetteursColNullable}
											</th>
											<th className="px-3 py-2 font-medium">
												{t.emetteursColPrimaryKey}
											</th>
										</tr>
									</thead>
									<tbody data-testid="v3-emetteurs-preview">
										{preview.columns.map((col) => (
											<tr
												key={col.name}
												data-testid="v3-emetteurs-preview-row"
												data-column={col.name}
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
													{col.nullable ? t.emetteursYes : t.emetteursNo}
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
							data-testid="v3-emetteurs-propose"
							data-proposes="goal"
							className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
						>
							{t.emetteursProposeNote.split(".")[0]} →
						</button>
						<p
							data-testid="v3-emetteurs-propose-note"
							className="text-[11px] leading-relaxed text-muted-foreground"
						>
							{t.emetteursProposeNote}
						</p>
					</div>
				</div>
			)}

			<p className="text-[11px] leading-relaxed text-muted-foreground">
				{t.emetteursDeterminismNote}
			</p>
		</div>
	);
}
