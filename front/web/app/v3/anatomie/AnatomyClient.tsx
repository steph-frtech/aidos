"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Source } from "@/lib/gateway-sdk";
import type { MirrorPair, PairKind, Voyant } from "@/lib/v2/anatomy";
import { type AnatomyView, loadAnatomyAction } from "./actions";

/**
 * /v3/anatomie — l'ANATOMIE d'un kernel : les SIX paires-miroir autour du MUR, lues EN DIRECT.
 *
 * CHEMIN VIVANT (ADR 0092 — le moteur Go est l'UNIQUE source vivante). L'anatomie est computée
 * par le moteur Go (`anatomy_build` sur le serveur `anatomy` dispatché — back/kernel/mirror/
 * anatomy) et lue par la Server Action loadAnatomyAction (lib/gateway-sdk.readVia). On NE
 * ré-implémente AUCUNE logique du noyau côté client : on N'importe QUE des TYPES de lib/v2/anatomy
 * (import type — aucun runtime tiré), et tout le calcul vient du Go via l'action. Le twin
 * lib/v2/anatomy n'est plus que le repli-démo (derrière la frontière readVia, dans actions.ts).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher — on SAISIT le
 * kernel à inspecter (l'atelier) → la frappe relance la lecture live (anatomy_build) ; CLIQUER une
 * paire-miroir l'OUVRE (descend dans son détail : la face déclarée au-dessus, la face prouvée en
 * dessous, le voyant computé par le moteur). Le MUR est DESSINÉ : au-dessus = DÉCLARÉ (humain), en
 * dessous = PROUVÉ (machine, READ-ONLY — aucun contrôle d'écriture sous le mur). Les voyants
 * 🟢/🔴/🟡 sont COMPUTÉS par le Go, jamais déclarés.
 *
 * UN BADGE source "live"|"demo" (JAMAIS « calcul pur (repli démo) ») : "live" quand le moteur Go a répondu par
 * la passerelle ; "demo" quand la passerelle est injoignable / aucun store dispatché (le repli
 * déterministe, honnête — ADR 0074, pas de faux-live silencieux). DÉTERMINISME-FIRST (§6/§8) : le
 * composant ne fait que rendre ; il ne juge rien. Le mur intact : projection de lecture, aucune
 * écriture-vérité.
 */

type Strings = Record<string, string>;

/** Le kernel d'exemple par défaut (l'ancre canonique du parcours checkout — §93). */
const DEFAULT_KERNEL = "truth-checkout-authz";

const VOYANT_EMOJI: Record<Voyant, string> = {
	green: "🟢",
	red: "🔴",
	amber: "🟡",
};

const VOYANT_RING: Record<Voyant, string> = {
	green: "border-emerald-500/50 bg-emerald-500/5",
	red: "border-red-500/50 bg-red-500/5",
	amber: "border-amber-500/50 bg-amber-500/5",
};

/** Les libellés des DEUX faces de chaque paire (clé i18n above/below). */
const PAIR_FACE_KEYS: Record<PairKind, { above: string; below: string }> = {
	spec_doc: { above: "specDoc.above", below: "specDoc.below" },
	behavior_results: {
		above: "behaviorResults.above",
		below: "behaviorResults.below",
	},
	scenarios_tests: {
		above: "scenariosTests.above",
		below: "scenariosTests.below",
	},
	model_projection: {
		above: "modelProjection.above",
		below: "modelProjection.below",
	},
	contract_code: { above: "contractCode.above", below: "contractCode.below" },
	evidence: { above: "evidence.above", below: "evidence.below" },
};

export function AnatomyClient({
	t,
	initial,
}: {
	t: Strings;
	initial: AnatomyView;
}) {
	// L'atelier : le kernel à inspecter (saisi par l'utilisateur — action-capable).
	const [kernelId, setKernelId] = useState(DEFAULT_KERNEL);
	const [view, setView] = useState<AnatomyView>(initial);
	const [openKind, setOpenKind] = useState<PairKind | null>(null);
	const [, startTransition] = useTransition();

	const trimmed = kernelId.trim();

	// La frappe relance la lecture LIVE (anatomy_build) — l'écran reste action-capable. Le premier
	// rendu réutilise `initial` (SSR) pour le kernel par défaut ; toute frappe re-lit le moteur.
	useEffect(() => {
		let cancelled = false;
		startTransition(async () => {
			const next = await loadAnatomyAction(trimmed);
			if (!cancelled) {
				setView(next);
				setOpenKind(null);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [trimmed]);

	const anatomy = view.anatomy;
	const source: Source = view.source;

	const openPair: MirrorPair | null = useMemo(
		() =>
			anatomy && openKind
				? (anatomy.pairs.find((p) => p.kind === openKind) ?? null)
				: null,
		[anatomy, openKind],
	);

	return (
		<div className="space-y-5">
			{/* L'ATELIER : saisir le kernel à inspecter (action-capable, ui-completeness §6). */}
			<div className="space-y-2 rounded-xl border border-border bg-card p-4">
				<label
					htmlFor="v3-anatomie-kernel-input"
					className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
				>
					{t.kernelLabel}
				</label>
				<input
					id="v3-anatomie-kernel-input"
					data-testid="v3-anatomie-kernel-input"
					value={kernelId}
					onChange={(e) => setKernelId(e.target.value)}
					placeholder={t.kernelPlaceholder}
					className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
				/>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-2">
				<div
					data-testid="v3-anatomie-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t.wallNote}
				</div>
				{/* LE BADGE source (live|demo) — jamais « calcul pur (repli démo) » (ADR 0092/0074). */}
				<span
					data-testid="v3-anatomie-source"
					data-source={source}
					title={source === "live" ? t.sourceLiveTitle : t.sourceDemoTitle}
					className={[
						"shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-xs",
						source === "live"
							? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
							: "border-border bg-muted text-muted-foreground",
					].join(" ")}
				>
					{source === "live" ? t.sourceLive : t.sourceDemo}
				</span>
			</div>

			{!anatomy && (
				<p
					data-testid="v3-anatomie-empty"
					className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground"
				>
					{t.emptyHint}
				</p>
			)}

			{anatomy && (
				<div data-testid="v3-anatomie-wall" className="space-y-5">
					{/* Le résumé global : compte par voyant + l'overall (le pire des six), computé. */}
					<div
						data-testid="v3-anatomie-overall"
						data-overall={anatomy.overall}
						className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
					>
						<span className="font-medium text-foreground">
							{VOYANT_EMOJI[anatomy.overall]} {t.overall}
						</span>
						<span
							data-testid="v3-anatomie-count-green"
							className="font-mono text-xs text-emerald-600 dark:text-emerald-400"
						>
							🟢 {anatomy.counts.green}
						</span>
						<span
							data-testid="v3-anatomie-count-red"
							className="font-mono text-xs text-red-600 dark:text-red-400"
						>
							🔴 {anatomy.counts.red}
						</span>
						<span
							data-testid="v3-anatomie-count-amber"
							className="font-mono text-xs text-amber-600 dark:text-amber-400"
						>
							🟡 {anatomy.counts.amber}
						</span>
					</div>

					{/* LE MUR DESSINÉ : six paires ; au-dessus = déclaré, en dessous = prouvé. */}
					<div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{anatomy.pairs.map((pair) => {
								const faceKeys = PAIR_FACE_KEYS[pair.kind];
								const active = openKind === pair.kind;
								return (
									<button
										key={pair.kind}
										type="button"
										data-testid={`v3-anatomie-pair-${pair.kind}`}
										data-voyant={pair.voyant}
										data-declared={pair.declared.state}
										data-proven={pair.proven.state}
										onClick={() => setOpenKind(active ? null : pair.kind)}
										className={[
											"flex flex-col rounded-lg border text-left transition-colors",
											VOYANT_RING[pair.voyant],
											active ? "ring-2 ring-primary" : "hover:bg-muted/40",
										].join(" ")}
									>
										{/* Le titre de la paire + son voyant computé. */}
										<div className="flex items-center justify-between gap-2 px-3 pt-3">
											<span className="text-sm font-semibold text-foreground">
												{t[`pair.${pair.kind}`]}
											</span>
											<span
												data-testid={`v3-anatomie-voyant-${pair.kind}`}
												title={t[`voyant.${pair.voyant}`]}
											>
												{VOYANT_EMOJI[pair.voyant]}
											</span>
										</div>
										{/* AU-DESSUS du mur : la face DÉCLARÉE (humain). */}
										<div
											data-testid={`v3-anatomie-above-${pair.kind}`}
											className="px-3 pt-2 text-xs"
										>
											<span className="font-medium text-muted-foreground">
												{t.aboveWall} ·{" "}
											</span>
											<span className="text-foreground">
												{t[faceKeys.above]}
											</span>
											<span className="ml-1 font-mono text-muted-foreground">
												[{t[`declared.${pair.declared.state}`]}]
											</span>
										</div>
										{/* LE MUR (la ligne) : la frontière déclaré / prouvé. */}
										<div className="my-2 flex items-center gap-2 px-3">
											<span className="h-px flex-1 bg-primary/40" />
											<span className="font-mono text-[0.65rem] tracking-widest text-primary uppercase">
												{t.wall}
											</span>
											<span className="h-px flex-1 bg-primary/40" />
										</div>
										{/* EN DESSOUS du mur : la face PROUVÉE (machine, READ-ONLY). */}
										<div
											data-testid={`v3-anatomie-below-${pair.kind}`}
											className="px-3 pb-3 text-xs"
										>
											<span className="font-medium text-muted-foreground">
												{t.belowWall} ·{" "}
											</span>
											<span className="text-foreground">
												{t[faceKeys.below]}
											</span>
											<span className="ml-1 font-mono text-muted-foreground">
												[{t[`proven.${pair.proven.state}`]}]
											</span>
										</div>
									</button>
								);
							})}
						</div>
					</div>

					{/* Le DÉTAIL d'une paire ouverte (le clic descend) — read-only, le mur intact. */}
					{openPair && (
						<div
							data-testid="v3-anatomie-pair-detail"
							className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
						>
							<p className="font-semibold text-foreground">
								{VOYANT_EMOJI[openPair.voyant]} {t[`pair.${openPair.kind}`]}
							</p>
							<p className="text-xs text-foreground">
								<span className="font-medium text-muted-foreground">
									{t.aboveWall} ({t.declaredSide}) :{" "}
								</span>
								{t[PAIR_FACE_KEYS[openPair.kind].above]} —{" "}
								<span
									data-testid="v3-anatomie-detail-declared"
									className="font-mono"
								>
									{t[`declared.${openPair.declared.state}`]}
								</span>
							</p>
							<p className="text-xs text-foreground">
								<span className="font-medium text-muted-foreground">
									{t.belowWall} ({t.provenSide}) :{" "}
								</span>
								{t[PAIR_FACE_KEYS[openPair.kind].below]} —{" "}
								<span
									data-testid="v3-anatomie-detail-proven"
									className="font-mono"
								>
									{t[`proven.${openPair.proven.state}`]}
								</span>
							</p>
							<p
								data-testid="v3-anatomie-detail-readonly"
								className="text-[0.7rem] text-muted-foreground"
							>
								{t.readOnlyNote}
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
