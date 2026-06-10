"use client";

import { useMemo, useState } from "react";
import {
	type Anatomy,
	buildAnatomy,
	type MirrorPair,
	type PairKind,
	syntheticPairStates,
	type Voyant,
} from "@/lib/v2/anatomy";

/**
 * WB2-06 — l'ANATOMIE d'un kernel : les SIX paires-miroir autour du MUR, client-only.
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher — CLIQUER une
 * paire-miroir l'OUVRE (descend dans son détail : la face déclarée au-dessus, la face prouvée en
 * dessous, et le voyant computé). Le MUR est DESSINÉ : au-dessus = DÉCLARÉ (humain), en dessous =
 * PROUVÉ (machine, READ-ONLY — aucun contrôle d'écriture sous le mur). Les voyants 🟢/🔴/🟡 sont
 * COMPUTÉS par le twin pur (lib/v2/anatomy), jamais déclarés.
 *
 * DÉTERMINISME-FIRST : l'état des paires est figé par syntheticPairStates(kernelId) tant que le store
 * de kernels n'expose pas ses voyants réels (OpenQuestion documentée). Le composant ne fait que
 * rendre ; il ne juge rien. Le mur intact : projection de lecture, aucune écriture-vérité.
 */

type Strings = Record<string, string>;

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
	kernelId,
	t,
}: {
	kernelId: string;
	t: Strings;
}) {
	const anatomy: Anatomy | null = useMemo(() => {
		const r = buildAnatomy(kernelId, syntheticPairStates(kernelId));
		return r.ok ? r.anatomy : null;
	}, [kernelId]);

	const [openKind, setOpenKind] = useState<PairKind | null>(null);

	if (!anatomy) return null;

	const openPair: MirrorPair | null = openKind
		? (anatomy.pairs.find((p) => p.kind === openKind) ?? null)
		: null;

	return (
		<div data-testid="v2-anatomie-wall" className="space-y-5">
			{/* Le résumé global : compte par voyant + l'overall (le pire des six), computé. */}
			<div
				data-testid="v2-anatomie-overall"
				data-overall={anatomy.overall}
				className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
			>
				<span className="font-medium text-foreground">
					{VOYANT_EMOJI[anatomy.overall]} {t.overall}
				</span>
				<span
					data-testid="v2-anatomie-count-green"
					className="font-mono text-xs text-emerald-600 dark:text-emerald-400"
				>
					🟢 {anatomy.counts.green}
				</span>
				<span
					data-testid="v2-anatomie-count-red"
					className="font-mono text-xs text-red-600 dark:text-red-400"
				>
					🔴 {anatomy.counts.red}
				</span>
				<span
					data-testid="v2-anatomie-count-amber"
					className="font-mono text-xs text-amber-600 dark:text-amber-400"
				>
					🟡 {anatomy.counts.amber}
				</span>
			</div>

			{/* LE MUR DESSINÉ : six colonnes (les six paires) ; au-dessus = déclaré, en dessous = prouvé. */}
			<div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{anatomy.pairs.map((pair) => {
						const faceKeys = PAIR_FACE_KEYS[pair.kind];
						const active = openKind === pair.kind;
						return (
							<button
								key={pair.kind}
								type="button"
								data-testid={`v2-anatomie-pair-${pair.kind}`}
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
										data-testid={`v2-anatomie-voyant-${pair.kind}`}
										title={t[`voyant.${pair.voyant}`]}
									>
										{VOYANT_EMOJI[pair.voyant]}
									</span>
								</div>
								{/* AU-DESSUS du mur : la face DÉCLARÉE (humain). */}
								<div
									data-testid={`v2-anatomie-above-${pair.kind}`}
									className="px-3 pt-2 text-xs"
								>
									<span className="font-medium text-muted-foreground">
										{t.aboveWall} ·{" "}
									</span>
									<span className="text-foreground">{t[faceKeys.above]}</span>
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
									data-testid={`v2-anatomie-below-${pair.kind}`}
									className="px-3 pb-3 text-xs"
								>
									<span className="font-medium text-muted-foreground">
										{t.belowWall} ·{" "}
									</span>
									<span className="text-foreground">{t[faceKeys.below]}</span>
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
					data-testid="v2-anatomie-pair-detail"
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
							data-testid="v2-anatomie-detail-declared"
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
						<span data-testid="v2-anatomie-detail-proven" className="font-mono">
							{t[`proven.${openPair.proven.state}`]}
						</span>
					</p>
					<p
						data-testid="v2-anatomie-detail-readonly"
						className="text-[0.7rem] text-muted-foreground"
					>
						{t.readOnlyNote}
					</p>
				</div>
			)}
		</div>
	);
}
